/**
 * The Fountain Post, as the database keeps it: each location's board of jobs, and the jobs each warband took before
 * a game. The rule (the match, the draw, the pay and its limits) is pure in `campaign/jobs.ts`; this loads the record
 * into its `Standing`s, reckons, and writes what was paid into the roster.
 *
 * A draft, open to game masters alone and only as a dry run: the board is kept, and every warband's offer reckoned,
 * in the Watch House at `/admin/jobs/`, and nothing there writes to a warband. A game master may reckon with figures of
 * their own for any warband's rating and treasury (`Books`, `withBooks`), since nobody logs them yet. `takeJobs` and
 * `undoJobs` are the paying side, tested and waiting for the day the players run the post themselves; no route calls
 * them yet. Every reckoning reads the record as it stands, against the warbands on the game's muster.
 */
import { and, asc, eq, sql } from 'drizzle-orm';
import { db } from '../db/client.ts';
import { locationJobs, locationPoints, locations, members, warbandJobs, warbands as warbandTable } from '../db/schema.ts';
import { LedgerError } from '../../curfew/ledger.ts';
import { leaderOf, type Scenario, type Warband } from '../../campaign/model.ts';
import { DICE_HIGH, DICE_LOW, JOB_LEANS, isD6, isD66, isDiceTotal, jobSeed, reckon, shutBecause, type Grant, type Job, type JobLean, type Reckoning, type Standing, type TableRolls } from '../../campaign/jobs.ts';
import { proseSource } from '../../campaign/prose.ts';
import { isGm, type Actor } from '../roles.ts';
import { listWarbands } from './roster.ts';
import { listScenarios, upcomingOnly } from './scenarios.ts';
import { ensureJobsSeeded } from './seed.ts';

export { LedgerError };

const clean = (s: string | undefined | null, max: number) => (s ?? '').trim().slice(0, max);
function gmOnly(actor: Actor): void { if (!isGm(actor)) throw new LedgerError('The fountain post is the Watch’s to read, for now.', 403); }

// ───────────────────────── the board ─────────────────────────

type JobRow = typeof locationJobs.$inferSelect;
const jobOf = (r: JobRow): Job => ({ id: r.id, locationId: r.locationId, pointId: r.pointId, title: r.title, text: r.text, lean: r.lean, withheld: r.withheld, sort: r.sort });

/** Every job on every board, or on one location's, in the game master's order. */
export async function listJobs(locationId?: string): Promise<Job[]> {
  await ensureJobsSeeded();
  const rows = await db().select().from(locationJobs).where(locationId ? eq(locationJobs.locationId, locationId) : undefined).orderBy(asc(locationJobs.locationId), asc(locationJobs.sort), asc(locationJobs.id));
  return rows.map(jobOf);
}

export interface JobInput { title: string; text?: string; lean?: JobLean; pointId?: number | null; withheld?: boolean }

async function pointIn(locationId: string, pointId: number | null | undefined): Promise<number | null> {
  if (pointId == null) return null;
  const rows = await db().select({ id: locationPoints.id }).from(locationPoints).where(and(eq(locationPoints.id, pointId), eq(locationPoints.locationId, locationId))).limit(1);
  if (!rows.length) throw new LedgerError('That point of interest is not in this place.', 404);
  return pointId;
}
const leanOf = (given: string | undefined, fallback: JobLean): JobLean => (given && (JOB_LEANS as readonly string[]).includes(given) ? (given as JobLean) : fallback);
/** A title is its own on its board; the seed relies on it. */
async function titleFree(locationId: string, title: string, except?: number): Promise<void> {
  const rows = await db().select({ id: locationJobs.id }).from(locationJobs).where(and(eq(locationJobs.locationId, locationId), eq(locationJobs.title, title))).limit(1);
  if (rows.length && rows[0].id !== except) throw new LedgerError('There is a job of that name on the post already.', 409);
}

export async function addJob(actor: Actor, locationId: string, input: JobInput): Promise<Job[]> {
  gmOnly(actor);
  await ensureJobsSeeded();
  const place = await db().select({ id: locations.id }).from(locations).where(eq(locations.id, locationId)).limit(1);
  if (!place.length) throw new LedgerError('No such place is on the map.', 404);
  const title = clean(input.title, 80);
  if (!title) throw new LedgerError('The job needs a name.');
  await titleFree(locationId, title);
  const [{ n }] = await db().select({ n: sql<number>`coalesce(max(${locationJobs.sort}), 0)::int` }).from(locationJobs).where(eq(locationJobs.locationId, locationId));
  await db().insert(locationJobs).values({ locationId, title, text: proseSource(input.text, 1000), lean: leanOf(input.lean, 'even'), pointId: await pointIn(locationId, input.pointId), withheld: !!input.withheld, sort: n + 1 });
  return listJobs(locationId);
}

async function jobRow(jobId: number): Promise<JobRow> {
  const rows = await db().select().from(locationJobs).where(eq(locationJobs.id, jobId)).limit(1);
  if (!rows.length) throw new LedgerError('That job is not on the post.', 404);
  return rows[0];
}

export async function updateJob(actor: Actor, jobId: number, patch: Partial<JobInput>): Promise<Job[]> {
  gmOnly(actor);
  const j = await jobRow(jobId);
  const set: Partial<typeof locationJobs.$inferInsert> = { updatedAt: new Date() };
  if (patch.title !== undefined) { const title = clean(patch.title, 80); if (!title) throw new LedgerError('The job needs a name.'); await titleFree(j.locationId, title, j.id); set.title = title; }
  if (patch.text !== undefined) set.text = proseSource(patch.text, 1000);
  if (patch.lean !== undefined) set.lean = leanOf(patch.lean, j.lean);
  if (patch.pointId !== undefined) set.pointId = await pointIn(j.locationId, patch.pointId);
  if (patch.withheld !== undefined) set.withheld = !!patch.withheld;
  await db().update(locationJobs).set(set).where(eq(locationJobs.id, jobId));
  return listJobs(j.locationId);
}

/** Take a job off the board for good. What was taken from it stays in the warbands' records, in its own words. */
export async function removeJob(actor: Actor, jobId: number): Promise<Job[]> {
  gmOnly(actor);
  const j = await jobRow(jobId);
  await db().delete(locationJobs).where(eq(locationJobs.id, jobId));
  return listJobs(j.locationId);
}

// ───────────────────────── the warbands as the rule sees them ─────────────────────────

export interface TakenJob { id: number; warbandId: string; scenarioId: string | null; seq: number; jobId: number | null; locationId: string | null; pointId: number | null; title: string; text: string; lean: string; owed: boolean; pick: number | null; pickByHand: boolean; dice: number | null; byHand: boolean; experienceDie: number | null; experienceByHand: boolean; gold: number; grants: Grant[]; takenBy: string | null; takenAt: Date }
type TakenRow = typeof warbandJobs.$inferSelect;
const takenOf = (r: TakenRow): TakenJob => ({ ...r, grants: (r.grants as Grant[]) ?? [] });

/** Every job taken, oldest first, or one warband's. */
export async function jobsTaken(warbandId?: string): Promise<TakenJob[]> {
  const rows = await db().select().from(warbandJobs).where(warbandId ? eq(warbandJobs.warbandId, warbandId) : undefined).orderBy(asc(warbandJobs.id));
  return rows.map(takenOf);
}

/** Everything the rule needs from the record: each warband's standing, with the roster and the jobs behind it. */
export interface PostRecord { warbands: Warband[]; standings: Standing[]; taken: TakenJob[]; scenarios: Scenario[] }

export async function loadRecord(): Promise<PostRecord> {
  const [list, books, taken, scenarios] = await Promise.all([
    listWarbands(),
    db().select({ id: warbandTable.id, rating: warbandTable.rating, gold: warbandTable.gold }).from(warbandTable),
    jobsTaken(),
    listScenarios(),
  ]);
  const standings = list.map((w): Standing => {
    const book = books.find((b) => b.id === w.id);
    const leader = leaderOf(w)?.id;
    return {
      warbandId: w.id, name: w.name, played: w.battles, rating: book?.rating ?? 0, gold: book?.gold ?? 0,
      warriors: w.members.filter((m) => !m.dead).map((m) => ({ id: m.id, name: m.name, rank: m.rank, experience: m.experience ?? 0, leader: m.id === leader })),
    };
  });
  return { warbands: list, standings, taken, scenarios };
}

// ───────────────────────── the offer ─────────────────────────

export interface Offer {
  warbandId: string;
  name: string;
  /** The game it is reckoned before, or null for a dry run with no game scheduled. */
  scenario: { id: string; title: string; playedOn: string } | null;
  locationId: string | null;
  /** Why the jobs cannot be taken now, or null when they can. A dry run always says why. */
  shut: string | null;
  /** The jobs already taken before this game, if they were. */
  taken: TakenJob[];
  standing: Standing;
  reckoning: Reckoning;
}

export interface OfferQuery {
  warbandId: string;
  /** The scheduled game; its location is the board. */
  scenarioId?: string | null;
  /** The board to reckon a dry run on, with no game; or where the campaign is, when the game names no location. */
  locationId?: string | null;
  /** For a dry run with no game, the warbands it would meet. A scheduled game brings its own muster. */
  against?: string[];
  /** The table's own rolls, place by place in the return (owed first, then the usual work): a D66 for which notice, 2D6 for the gold, a D6 for the experience; null where the post rolls. */
  rolls?: TableRolls;
}

/** The key a warband's rolls are kept under for one game, or for its dry run with none. */
export const diceKey = (warbandId: string, scenarioId?: string | null) => `${warbandId}:${scenarioId ?? 'dry'}`;

/** What the post would pay this warband now. Saves nothing: the dry run and the real thing reckon alike. */
export async function offer(actor: Actor, q: OfferQuery, record?: PostRecord): Promise<Offer> {
  gmOnly(actor);
  const r = record ?? (await loadRecord());
  const standing = r.standings.find((s) => s.warbandId === q.warbandId);
  if (!standing) throw new LedgerError('No such warband has entered the gates.', 404);
  const scenario = q.scenarioId ? r.scenarios.find((s) => s.id === q.scenarioId) : undefined;
  if (q.scenarioId && !scenario) throw new LedgerError('No such scenario is in the archives.', 404);
  const locationId = scenario?.locationId ?? q.locationId ?? null;
  const board = locationId ? await listJobs(locationId) : [];
  // nobody scouts the next field: no job at a point where a game is scheduled
  const barredPoints = upcomingOnly(r.scenarios).map((s) => s.pointId).filter((p): p is number => p != null);
  const mine = r.taken.filter((t) => t.warbandId === q.warbandId);
  const lastTaken = Object.fromEntries(mine.filter((t) => t.jobId != null).map((t) => [t.jobId!, t.id]));
  const seed = jobSeed(q.warbandId, scenario?.id ?? `dry:${locationId ?? 'nowhere'}`);
  const taken = scenario ? mine.filter((t) => t.scenarioId === scenario.id) : [];
  // the match: the game's muster, or for a dry run the warbands it would meet
  const facing = scenario ? scenario.warbands.map((w) => w.warbandId) : (q.against ?? []);
  const others = r.standings.filter((o) => o.warbandId !== standing.warbandId && facing.includes(o.warbandId));
  const shut = !scenario ? (others.length ? 'As if a game were scheduled here today.' : 'As if a game were scheduled here today, against nobody: the usual work alone.') : taken.length ? 'They took their jobs before this game already.' : shutBecause(scenario, q.warbandId) ?? (!locationId ? 'The game names no place, so there is no post to read.' : null);
  return {
    warbandId: standing.warbandId, name: standing.name,
    scenario: scenario ? { id: scenario.id, title: scenario.title, playedOn: scenario.playedOn } : null,
    locationId, shut, taken, standing,
    reckoning: reckon(standing, others, board, seed, { barredPoints, lastTaken, ...q.rolls }),
  };
}

/** A game master's own figures for a warband's rating and treasury, to reckon with in place of the logged ones. */
export type Books = Record<string, { rating?: number; gold?: number }>;

/** The record with the given books in place of the logged ones. Nothing is written; the record itself is not changed. */
export function withBooks(record: PostRecord, books: Books = {}): PostRecord {
  const whole = (n: number | undefined) => (n === undefined || !Number.isFinite(n) ? undefined : Math.max(0, Math.round(n)));
  return {
    ...record,
    standings: record.standings.map((s) => {
      const b = books[s.warbandId];
      return b ? { ...s, rating: whole(b.rating) ?? s.rating, gold: whole(b.gold) ?? s.gold } : s;
    }),
  };
}

/** Every warband's offer for every scheduled game it is on, for the Watch House, with the record (books applied) to reckon dry runs on. */
export async function postOverview(actor: Actor, here: string, books: Books = {}, rolls: Record<string, TableRolls> = {}): Promise<{ record: PostRecord; logged: Standing[]; offers: Offer[] }> {
  gmOnly(actor);
  const loaded = await loadRecord();
  const record = withBooks(loaded, books);
  const offers: Offer[] = [];
  for (const s of upcomingOnly(record.scenarios)) for (const w of s.warbands) offers.push(await offer(actor, { warbandId: w.warbandId, scenarioId: s.id, locationId: here, rolls: rolls[diceKey(w.warbandId, s.id)] }, record));
  return { record, logged: loaded.standings, offers };
}

// ───────────────────────── taking the jobs ─────────────────────────

/**
 * Not routed yet: the post is a dry run until the players run it themselves.
 *
 * Take the jobs the post offers this warband before this game, the usual work and any owed on top, and pay them into
 * the roster, with the table's rolls where they rolled them (which notice, the gold, the experience): experience to the warriors, gold to the treasury, and the logged rating moved with the experience (a
 * rating nobody logged is reckoned from the roster anyway). Refused when the post is shut, when they were taken
 * already, or when the board has nothing open to them.
 *
 * Neon's HTTP driver has no transactions, so the once-only guard is the unique index on (warband, game, seq): the first
 * row is written first, and a second taker finds it there. Two warbands taking at the very same moment may each be
 * reckoned without the other; the next offer reads them both.
 */
export async function takeJobs(actor: Actor, scenarioId: string, warbandId: string, here?: string, rolls: TableRolls = {}): Promise<Offer> {
  gmOnly(actor);
  if (rolls.dice?.some((n) => n != null && !isDiceTotal(n))) throw new LedgerError(`Two dice show ${DICE_LOW} to ${DICE_HIGH}. Roll again, or let the post roll.`);
  if (rolls.experience?.some((n) => n != null && !isD6(n))) throw new LedgerError('A die shows 1 to 6. Roll again, or let the post roll.');
  if (rolls.picks?.some((n) => n != null && !isD66(n))) throw new LedgerError('A notice is rolled on D66: 11 to 66, each die 1 to 6.');
  const o = await offer(actor, { warbandId, scenarioId, locationId: here, rolls });
  const refused = o.reckoning.payout?.jobs.find((p) => p.slot?.refused);
  if (refused) throw new LedgerError(`${refused.slot!.refused} Roll again for that notice, or let the post draw it.`, 409);
  if (o.shut) throw new LedgerError(o.shut, 409);
  const pay = o.reckoning.payout;
  if (!pay || !pay.jobs.length) throw new LedgerError('The post is bare: no job there is open to them.', 409);
  const d = db();
  const rows = pay.jobs.map((p, i) => ({
    warbandId, scenarioId, seq: i + 1, jobId: p.job.id, locationId: p.job.locationId, pointId: p.job.pointId, title: p.job.title, text: p.job.text, lean: p.job.lean, owed: p.owed, pick: p.slot?.number ?? null, pickByHand: !!p.slot?.byHand, dice: p.dice, byHand: p.byHand, experienceDie: p.experienceDie, experienceByHand: p.experienceByHand, gold: p.gold, grants: p.grants, takenBy: actor.name,
  }));
  const first = await d.insert(warbandJobs).values(rows[0]).onConflictDoNothing().returning({ id: warbandJobs.id });
  if (!first.length) throw new LedgerError('They took their jobs before this game already.', 409);
  if (rows.length > 1) await d.insert(warbandJobs).values(rows.slice(1)).onConflictDoNothing();
  const xp = new Map<string, number>();
  for (const g of pay.jobs.flatMap((p) => p.grants)) xp.set(g.memberId, (xp.get(g.memberId) ?? 0) + g.experience);
  for (const [memberId, n] of xp) await d.update(members).set({ experience: sql`coalesce(${members.experience}, 0) + ${n}`, updatedAt: new Date() }).where(eq(members.id, memberId));
  await d.update(warbandTable).set({
    gold: sql`${warbandTable.gold} + ${pay.gold}`,
    rating: sql`case when ${warbandTable.rating} > 0 then ${warbandTable.rating} + ${pay.experience} else 0 end`,
    version: sql`${warbandTable.version} + 1`, updatedAt: new Date(),
  }).where(eq(warbandTable.id, warbandId));
  return offer(actor, { warbandId, scenarioId, locationId: here });
}

/** Strike the jobs taken before a game and take their pay back out of the roster, for a mistake. Not routed yet, as `takeJobs`. */
export async function undoJobs(actor: Actor, scenarioId: string, warbandId: string): Promise<void> {
  gmOnly(actor);
  const d = db();
  const gone = await d.delete(warbandJobs).where(and(eq(warbandJobs.warbandId, warbandId), eq(warbandJobs.scenarioId, scenarioId))).returning();
  if (!gone.length) throw new LedgerError('They took no jobs before that game.', 404);
  const taken = gone.map(takenOf);
  const xp = new Map<string, number>();
  for (const g of taken.flatMap((t) => t.grants)) xp.set(g.memberId, (xp.get(g.memberId) ?? 0) + g.experience);
  for (const [memberId, n] of xp) await d.update(members).set({ experience: sql`greatest(0, coalesce(${members.experience}, 0) - ${n})`, updatedAt: new Date() }).where(eq(members.id, memberId));
  const gold = taken.reduce((n, t) => n + t.gold, 0), experience = [...xp.values()].reduce((a, b) => a + b, 0);
  await d.update(warbandTable).set({
    gold: sql`greatest(0, ${warbandTable.gold} - ${gold})`,
    rating: sql`case when ${warbandTable.rating} > 0 then greatest(0, ${warbandTable.rating} - ${experience}) else 0 end`,
    version: sql`${warbandTable.version} + 1`, updatedAt: new Date(),
  }).where(eq(warbandTable.id, warbandId));
}
