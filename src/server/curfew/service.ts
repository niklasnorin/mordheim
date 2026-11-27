/**
 * The Curfew service: ledgers in Postgres, resolved by the pure engine.
 *
 * Every read of a ledger first writes any dawn that is due, so a player who opens the page after three
 * nights away finds them written; the midnight cron does the same for every ledger so the Town Cryer has
 * last night's happenings even before anyone looks in. Writes are guarded by a version number: two tabs,
 * or a visit racing the cron, cannot overwrite each other's night.
 *
 * Everything here is in one campaign, named first: its ledgers, its moves, its dispatches, its clock, and its own
 * engine, ledger and Cryer from `worldFor`. A finished or archived campaign has no more nights and its ledgers are
 * closed; a draft's ledgers are written only when a game master looks in, never by the cron.
 */
import { and, desc, eq, gte, isNull, lte } from 'drizzle-orm';
import { db } from '../db/client.ts';
import { cryerDispatches, curfewLedgers, curfewMoves, curfewRuns, user, warbands as warbandTable } from '../db/schema.ts';
import { env, isAdminEmail } from '../env.ts';
import type { Viewer } from '../session.ts';
import type { Location, Move, NightResult, Order, TokenOffer } from '../../curfew/engine.ts';
import { LedgerError, coerceState, freshState, heal, isDate, putBack, recoveringMembers, type Flourish, type WarbandState } from '../../curfew/ledger.ts';
import type { Dispatch } from '../../curfew/cryer.ts';
import { injuredInLastBattle, rivalsOf, warbandById, type Roster } from '../../curfew/roster.ts';
import { memberNights, warbandStandings, type Ledger, type MemberNights, type WarbandStanding } from '../../curfew/story.ts';
import type { Warband } from '../../campaign/model.ts';
import { loadRoster } from '../campaign/roster.ts';
import { getCampaign, listCampaigns } from '../campaign/campaigns.ts';
import { worldFor, type CampaignWorld } from '../content/curfew.ts';
import { isFrozen, nightNow, nightOn, runsNights, type CampaignConfig } from '../../campaign/campaign.ts';

export { LedgerError };

/** A campaign's rules and roster, fresh from the database. Every entry point below starts here. */
async function ready(campaignId: string): Promise<{ world: CampaignWorld; roster: Roster }> {
  const world = await worldFor(campaignId);
  return { world, roster: await loadRoster(campaignId) };
}

/** What a page or the API hands the browser. */
export interface LedgerView {
  warbandId: string;
  state: WarbandState;
  today: number;
  recovering: string[];
  /** Nights written by this very request: the dawn is fresh, so the report inks in. */
  fresh: boolean;
  /** Where the campaign is tonight. */
  locationId: string;
  /** A dry run: computed in memory, nothing saved. `wouldPrint` is what the Cryer would have been handed. */
  dry?: boolean;
  wouldPrint?: Dispatch[];
}

/**
 * A dry run. `base` is the sandbox the browser carries from the last dry answer, so stepped nights build on
 * each other; without it the real ledger is the base. Nothing a dry run computes is saved or published.
 */
export interface DryRun { base?: unknown }

export interface Claim { warbandId: string; ownerId: string; ownerName: string; ledger: boolean }

// ───────────────────────── the clock ─────────────────────────

/**
 * Tonight's number. A `?date=` override is honoured only where CURFEW_DEBUG is on and the viewer is a game master;
 * a player always gets the real night, whatever the URL says. Pass `null` for the URL where the clock must never be
 * steered: the cron, the prerendered pages, and everything the Watch House does to other players' ledgers.
 */
export function todayFor(campaign: Pick<CampaignConfig, 'start' | 'timezone'>, url: URL | null, viewer: Viewer | null = null, now = new Date()): number {
  if (env.CURFEW_DEBUG && url && viewer && isAdminEmail(viewer.email)) {
    const date = url.searchParams.get('date');
    if (isDate(date)) return nightOn(campaign, date);
  }
  return nightNow(campaign, now);
}

// ───────────────────────── where the campaign is ─────────────────────────

export interface CampaignMove extends Move { id: number; movedAt: Date }

/** Every move the game master has made in a campaign, oldest first. Empty means it has always been in Mordheim. */
export async function campaignMoves(campaignId: string): Promise<CampaignMove[]> {
  const rows = await db().select().from(curfewMoves).where(eq(curfewMoves.campaignId, campaignId)).orderBy(curfewMoves.fromNight, curfewMoves.id);
  return rows.map((r) => ({ id: r.id, locationId: r.locationId, fromNight: r.fromNight, movedAt: r.movedAt }));
}
export async function currentLocation(campaignId: string, today: number): Promise<Location> {
  const [world, moves] = await Promise.all([worldFor(campaignId), campaignMoves(campaignId)]);
  return world.engine.locationForNight(today, moves);
}

/**
 * Move the campaign, from tonight. Nights already written keep their place; tonight and after resolve in the
 * new one, and the Curfew and the Cryer change with it. Refused when the campaign is already there.
 */
export async function moveCampaign(campaignId: string, locationId: string, today: number): Promise<Location> {
  const { engine } = await worldFor(campaignId);
  const location = engine.locationById(locationId);
  if (location.id !== locationId) throw new LedgerError('No such place is on the map.', 404);
  const moves = await campaignMoves(campaignId);
  if (engine.locationForNight(today, moves).id === location.id) throw new LedgerError(`The campaign is already in ${location.name}.`, 409);
  await db().insert(curfewMoves).values({ campaignId, locationId: location.id, fromNight: Math.max(1, today) });
  return location;
}

// ───────────────────────── claims ─────────────────────────

/** Who keeps which warband in a campaign. A warband with an owner but no ledger yet is still spoken for. */
export async function listClaims(campaignId: string): Promise<Claim[]> {
  const [owned, ledgers] = await Promise.all([
    db().select({ warbandId: warbandTable.id, ownerId: warbandTable.ownerId, ownerName: user.name }).from(warbandTable).innerJoin(user, eq(user.id, warbandTable.ownerId)).where(eq(warbandTable.campaignId, campaignId)),
    db().select({ warbandId: curfewLedgers.warbandId }).from(curfewLedgers).where(eq(curfewLedgers.campaignId, campaignId)),
  ]);
  return owned.map((o) => ({ warbandId: o.warbandId, ownerId: o.ownerId!, ownerName: o.ownerName, ledger: ledgers.some((l) => l.warbandId === o.warbandId) }));
}

async function ownRow(campaignId: string, userId: string) {
  const rows = await db().select().from(curfewLedgers).where(and(eq(curfewLedgers.campaignId, campaignId), eq(curfewLedgers.ownerId, userId))).limit(1);
  return rows[0];
}

/** A campaign that must exist; its ledgers refuse every change once it is over. */
async function campaignOf(campaignId: string): Promise<CampaignConfig> {
  const c = await getCampaign(campaignId);
  if (!c) throw new LedgerError('No such campaign.', 404);
  return c;
}
const CLOSED = 'The campaign is over; its ledgers are closed.';

/**
 * Take up a warband and open its ledger. The warband becomes the player's if nobody keeps it; one already theirs
 * simply gets its ledger. One player, one warband; one warband, one keeper.
 */
export async function claimWarband(campaignId: string, userId: string, warbandId: string, today: number): Promise<LedgerView> {
  if (isFrozen((await campaignOf(campaignId)).status)) throw new LedgerError(CLOSED, 409);
  const { roster } = await ready(campaignId);
  const warband = warbandById(roster, warbandId);
  if (!warband) throw new LedgerError('No such warband has entered the gates.', 404);
  if (warband.ownerId && warband.ownerId !== userId) throw new LedgerError(`${warband.name} already have a keeper.`, 409);
  const mine = roster.warbands.find((w) => w.ownerId === userId);
  if (mine && mine.id !== warbandId) throw new LedgerError(`You already keep ${mine.name}. Give them up before taking another.`, 409);
  if (await ownRow(campaignId, userId)) throw new LedgerError('You already keep a ledger. Give it up before taking another.', 409);
  if (!warband.ownerId) {
    const claimed = await db().update(warbandTable).set({ ownerId: userId, updatedAt: new Date() }).where(and(eq(warbandTable.id, warbandId), isNull(warbandTable.ownerId))).returning({ id: warbandTable.id });
    if (!claimed.length) throw new LedgerError(`${warband.name} already have a keeper.`, 409);
  }
  const state = freshState(warband, today);
  const inserted = await db().insert(curfewLedgers).values({ campaignId, warbandId, ownerId: userId, state }).onConflictDoNothing().returning({ warbandId: curfewLedgers.warbandId });
  if (!inserted.length) throw new LedgerError(`${warband.name} already have a keeper.`, 409);
  return { warbandId, state, today, recovering: recoveringMembers(state, injuredInLastBattle(roster, warbandId)), fresh: false, locationId: (await currentLocation(campaignId, today)).id };
}

/** Give up the warband in a campaign entirely, ledger and all, so someone else may take it. Everything in the ledger is lost. */
export async function releaseWarband(campaignId: string, userId: string): Promise<void> {
  await db().delete(curfewLedgers).where(and(eq(curfewLedgers.campaignId, campaignId), eq(curfewLedgers.ownerId, userId)));
  await db().update(warbandTable).set({ ownerId: null, updatedAt: new Date() }).where(and(eq(warbandTable.campaignId, campaignId), eq(warbandTable.ownerId, userId)));
}

// ───────────────────────── the ledger ─────────────────────────

/** The signed-in player's ledger, with every due dawn written. Null if they keep none. */
export async function loadOwnLedger(campaignId: string, userId: string, today: number, dry?: DryRun): Promise<LedgerView | null> {
  const row = await ownRow(campaignId, userId);
  if (!row) return null;
  return withLedger(campaignId, userId, today, () => {}, dry);
}

/** What a change to a ledger is handed: the state, the warband, who is recovering, where the campaign is tonight, and the campaign's rules. */
export type LedgerChange = (state: WarbandState, warband: Warband, recovering: string[], location: Location, world: CampaignWorld, roster: Roster) => void;

/**
 * Load, reconcile, apply a change, save. On a version clash the whole thing is redone on the fresh row.
 * The change may throw a LedgerError to refuse; nothing is saved then. It is told where the campaign is tonight.
 */
export async function withLedger(campaignId: string, userId: string, today: number, change: LedgerChange, dry?: DryRun): Promise<LedgerView> {
  const { world, roster } = await ready(campaignId);
  const { engine, ledger } = world;
  const frozen = isFrozen(world.campaign.status);
  for (let attempt = 0; attempt < 3; attempt++) {
    const [row, moves] = await Promise.all([ownRow(campaignId, userId), campaignMoves(campaignId)]);
    if (!row) throw new LedgerError('You keep no ledger yet.', 404);
    const warband = warbandById(roster, row.warbandId);
    if (!warband) throw new LedgerError('That warband has left the city.', 410);
    const location = engine.locationForNight(today, moves);
    const hurt = injuredInLastBattle(roster, warband.id);
    // a dry run builds on the sandbox the browser carries, if it is this warband's; else on the real ledger
    const base = dry && (dry.base as { warbandId?: string } | undefined)?.warbandId === row.warbandId ? dry.base : row.state;
    const state = coerceState(base, warband, today);
    const recovering = recoveringMembers(state, hurt);
    // a closed campaign writes no more nights
    const written = frozen ? [] : ledger.reconcile(state, warband, today, recovering, rivalsOf(roster, warband.id), moves);
    const before = JSON.stringify(base);
    change(state, warband, recoveringMembers(state, hurt), location, world, roster);
    const after = JSON.stringify(state);
    const view: LedgerView = { warbandId: warband.id, state, today, recovering: recoveringMembers(state, hurt), fresh: written.length > 0, locationId: location.id };
    if (dry) return { ...view, dry: true, wouldPrint: dispatchesDue(world, warband, state, written, today) };
    if (after !== before) {
      if (frozen) throw new LedgerError(CLOSED, 409);
      const saved = await save(row.warbandId, row.version, state);
      if (!saved) continue;
      await publish(world, warband, state, written, today);
    }
    return view;
  }
  throw new LedgerError('The ledger was being written elsewhere. Try again.', 409);
}

async function save(warbandId: string, version: number, state: WarbandState): Promise<boolean> {
  const updated = await db().update(curfewLedgers)
    .set({ state, version: version + 1, updatedAt: new Date() })
    .where(and(eq(curfewLedgers.warbandId, warbandId), eq(curfewLedgers.version, version)))
    .returning({ version: curfewLedgers.version });
  return updated.length > 0;
}

/** The dispatches a ledger owes the Cryer now: the nights just written, and any night whose crossroads was decided today. */
function dispatchesDue(world: CampaignWorld, warband: Warband, state: WarbandState, written: NightResult[], today: number): Dispatch[] {
  const out: Dispatch[] = [];
  const nights = [...written, ...state.nights.filter((n) => n.crossroads?.decided?.on === today && !written.includes(n))];
  for (const n of nights) out.push(...world.cryer.dispatchesForNight(warband, n, state.headlines));
  return out;
}

/** Dispatch rows for a campaign. */
const dispatchRows = (campaignId: string, out: Dispatch[]) => out.map((d) => ({ campaignId, key: d.key, warbandId: d.warbandId, night: d.night, kind: d.kind, headline: d.headline, body: d.body ?? null }));

/** Hand the Town Cryer what these nights gave it, plus anything planted today. Idempotent by key. */
async function publish(world: CampaignWorld, warband: Warband, state: WarbandState, written: NightResult[], today: number): Promise<void> {
  const out: Dispatch[] = dispatchesDue(world, warband, state, written, today);
  // planted at the Eve tonight: the same key scheme as a resolved night's headlines
  state.headlines.filter((h) => h.night === today).forEach((h, i) => {
    out.push({ key: `${warband.id}:${today}:h${i}`, warbandId: warband.id, night: today, kind: 'headline', headline: h.text });
  });
  if (!out.length) return;
  await db().insert(cryerDispatches).values(dispatchRows(world.campaign.id, out)).onConflictDoNothing();
}

// ───────────────────────── the actions ─────────────────────────

export const actions = {
  /** Look at the ledger as of tonight, writing what is due. Mostly for dry runs, which have to ask for every night. */
  look: (campaignId: string, userId: string, today: number, dry?: DryRun) => withLedger(campaignId, userId, today, () => {}, dry),
  orders: (campaignId: string, userId: string, today: number, orders: Order[], dry?: DryRun) => withLedger(campaignId, userId, today, (s, w, rec, loc, world) => world.ledger.giveOrders(s, w, today, orders, rec, loc), dry),
  heal: (campaignId: string, userId: string, today: number, memberId: string, dry?: DryRun) => withLedger(campaignId, userId, today, (s, w) => heal(s, w, memberId), dry),
  offer: (campaignId: string, userId: string, today: number, offer: TokenOffer, keep: 'incoming' | 'held', dry?: DryRun) => withLedger(campaignId, userId, today, (s, _w, _r, _l, world) => world.ledger.settleOffer(s, offer, keep), dry),
  /** Take a road at the crossroads last night met. */
  decide: (campaignId: string, userId: string, today: number, night: number, roadId: string, dry?: DryRun) => withLedger(campaignId, userId, today, (s, w, _r, _l, world, roster) => { world.ledger.decide(s, w, night, roadId, { on: today, rival: rivalsOf(roster, w.id) }); }, dry),
  /** Opening the Eve with an empty Hand: the City Provides one charm. */
  eveOpen: (campaignId: string, userId: string, today: number, dry?: DryRun) => withLedger(campaignId, userId, today, (s, _w, _rec, loc, world) => { if (!s.eve && today >= 1) world.ledger.provideIfEmpty(s, today, loc); }, dry),
  eveLay: (campaignId: string, userId: string, today: number, bring: string[], flourish?: Flourish, dry?: DryRun) => withLedger(campaignId, userId, today, (s, w, _r, _l, world) => world.ledger.layTable(s, w, today, bring, flourish), dry),
  eveDone: (campaignId: string, userId: string, today: number, dry?: DryRun) => withLedger(campaignId, userId, today, (s, _w, _r, _l, world) => world.ledger.fightDone(s, today), dry),
  eveUndo: (campaignId: string, userId: string, today: number, dry?: DryRun) => withLedger(campaignId, userId, today, (s) => putBack(s), dry),
  /** Burn the ledger: start afresh tonight, keeping the warband. */
  reset: (campaignId: string, userId: string, today: number, dry?: DryRun) => withLedger(campaignId, userId, today, (s, w) => Object.assign(s, freshState(w, today)), dry),
};

// ───────────────────────── midnight ─────────────────────────

export interface RunResult { ledgers: number; nights: number; dispatches: number; durationMs: number }
export interface CampaignRun extends RunResult { campaignId: string; night: number }

/**
 * Midnight for every campaign whose nights run (live, with the Curfew on), each by its own clock. The cron calls this
 * once a night; a campaign whose midnight falls after the cron catches up on the next visit or the next run.
 */
export async function reconcileAll(source: 'cron' | 'admin' = 'cron', now = new Date()): Promise<CampaignRun[]> {
  const out: CampaignRun[] = [];
  for (const c of (await listCampaigns()).filter(runsNights)) {
    const night = nightNow(c, now);
    out.push({ campaignId: c.id, night, ...(await reconcileCampaign(c.id, night, source)) });
  }
  return out;
}

/** Write every ledger's due dawns in one campaign and record the run. By the cron, or by hand from the console; harmless to run again. */
export async function reconcileCampaign(campaignId: string, today: number, source: 'cron' | 'admin' = 'cron'): Promise<RunResult> {
  const started = Date.now();
  const { world, roster } = await ready(campaignId);
  if (isFrozen(world.campaign.status)) throw new LedgerError(CLOSED, 409);
  const [rows, moves] = await Promise.all([db().select().from(curfewLedgers).where(eq(curfewLedgers.campaignId, campaignId)), campaignMoves(campaignId)]);
  let nights = 0, dispatches = 0;
  for (const row of rows) {
    const warband = warbandById(roster, row.warbandId);
    if (!warband) continue;
    const state = coerceState(row.state, warband, today);
    const written = world.ledger.reconcile(state, warband, today, recoveringMembers(state, injuredInLastBattle(roster, warband.id)), rivalsOf(roster, warband.id), moves);
    if (!written.length) continue;
    if (!(await save(row.warbandId, row.version, state))) continue; // someone else wrote it first; their dawn is the same dawn
    const out = dispatchesDue(world, warband, state, written, today);
    if (out.length) await db().insert(cryerDispatches).values(dispatchRows(campaignId, out)).onConflictDoNothing();
    nights += written.length; dispatches += out.length;
  }
  const durationMs = Date.now() - started;
  await db().insert(curfewRuns).values({ campaignId, source, night: today, ledgers: rows.length, nights, dispatches, durationMs });
  return { ledgers: rows.length, nights, dispatches, durationMs };
}

// ───────────────────────── the campaign site ─────────────────────────

export interface CurfewStory { members: Record<string, MemberNights>; warbands: Record<string, WarbandStanding> }

/** What the nights have added to every warrior's and warband's story, for the roster pages. */
export async function curfewStory(campaignId: string, today: number): Promise<CurfewStory> {
  const [roster, world] = await Promise.all([loadRoster(campaignId), worldFor(campaignId)]);
  const rows = await db().select({ warbandId: curfewLedgers.warbandId, state: curfewLedgers.state }).from(curfewLedgers).where(eq(curfewLedgers.campaignId, campaignId));
  const ledgers: Ledger[] = [];
  for (const r of rows) {
    const warband = warbandById(roster, r.warbandId);
    if (warband) ledgers.push({ warband, state: coerceState(r.state, warband, today) });
  }
  return { members: memberNights(ledgers), warbands: warbandStandings(ledgers, world.engine.titleFor) };
}

// ───────────────────────── the Town Cryer ─────────────────────────

export interface PrintedDispatch extends Dispatch { id: number; warbandName: string }

/** Notices from the console carry this in place of a warband. */
export const THE_WATCH = 'the-watch';
export function dispatchSource(roster: Roster, warbandId: string): string { return warbandId === THE_WATCH ? 'The Watch' : warbandById(roster, warbandId)?.name ?? warbandId; }

/** The freshest dispatches, newest night first, at most `limit`. Nothing from nights that have not happened. */
export async function recentDispatches(campaignId: string, today: number, limit = 8): Promise<PrintedDispatch[]> {
  const roster = await loadRoster(campaignId);
  const rows = await db().select().from(cryerDispatches)
    .where(and(eq(cryerDispatches.campaignId, campaignId), gte(cryerDispatches.night, Math.max(1, today - 30)), lte(cryerDispatches.night, today)))
    .orderBy(desc(cryerDispatches.night), desc(cryerDispatches.id)).limit(limit);
  return rows.map((r) => ({ id: r.id, key: r.key, warbandId: r.warbandId, night: r.night, kind: r.kind, headline: r.headline, body: r.body ?? undefined, warbandName: dispatchSource(roster, r.warbandId) }));
}
