/**
 * The Watch House: what the game master sees and may do. Read-mostly, and every write is one the
 * Curfew service or the auth tables already understand; nothing here invents new state.
 */
import { desc, eq, gt, sql } from 'drizzle-orm';
import { db } from '../db/client.ts';
import { cryerDispatches, curfewLedgers, curfewRuns, session, user } from '../db/schema.ts';
import { pendingResets } from '../account/service.ts';
import { env } from '../env.ts';
import { LOCATIONS, locationForNight, moonForNight, omenForNight, titleFor, dateForNight, type Location, type Omen, type Moon } from '../../curfew/engine.ts';
import { coerceState, freshState, waitingCrossroads, type WarbandState } from '../../curfew/ledger.ts';
import { warbands } from '../../data/warbands.ts';
import { LedgerError, THE_WATCH, campaignMoves, dispatchSource, moveCampaign, reconcileAll, recentDispatches, type CampaignMove, type PrintedDispatch, type RunResult } from '../curfew/service.ts';

export { moveCampaign };

export { LedgerError };

export interface LedgerRow {
  warbandId: string; name: string; sigil: string; type: string;
  keeper?: { id: string; name: string; email: string };
  state?: WarbandState;
  /** Nights whose dawn is still unwritten as of today, not counting tonight. Zero when the ledger is current. */
  behind: number;
  tonight: 'given' | 'barred' | 'standing' | 'nothing';
  /** A crossroads from last night still waits on the player. */
  waiting: boolean;
  title: string;
  updatedAt?: Date;
}

export interface PlayerRow {
  id: string; name: string; email: string; image: string | null; createdAt: Date;
  sessions: number; lastSeen: Date | null; warband?: { id: string; name: string };
  admin: boolean;
  /** When an unspent reset word issued for them runs out, if there is one. */
  resetUntil?: Date;
}

export interface Overview {
  today: number;
  date: string;
  omen: Omen; moon: Moon;
  /** Where the campaign is tonight, the places it could be, and every move so far, newest first. */
  location: Location; locations: Location[]; moves: CampaignMove[];
  ledgers: LedgerRow[];
  players: PlayerRow[];
  dispatches: PrintedDispatch[];
  runs: (typeof curfewRuns.$inferSelect)[];
  counts: { players: number; ledgers: number; warbands: number; dispatches: number; sessions: number };
  health: HealthItem[];
}

export interface HealthItem { label: string; ok: boolean | null; detail: string }

export async function overview(today: number): Promise<Overview> {
  const d = db();
  const [ledgerRows, players, dispatches, runs, dispatchCount, sessionCount, moves] = await Promise.all([
    d.select({ ledger: curfewLedgers, keeper: { id: user.id, name: user.name, email: user.email } }).from(curfewLedgers).innerJoin(user, eq(user.id, curfewLedgers.ownerId)),
    listPlayers(),
    recentDispatches(today, 12),
    d.select().from(curfewRuns).orderBy(desc(curfewRuns.ranAt)).limit(8),
    d.select({ n: sql<number>`count(*)::int` }).from(cryerDispatches),
    d.select({ n: sql<number>`count(*)::int` }).from(session).where(gt(session.expiresAt, new Date())),
    campaignMoves(),
  ]);

  const ledgers: LedgerRow[] = warbands.map((w) => {
    const row = ledgerRows.find((r) => r.ledger.warbandId === w.id);
    if (!row) return { warbandId: w.id, name: w.name, sigil: w.sigil, type: w.type, behind: 0, tonight: 'nothing', waiting: false, title: titleFor(0) };
    const state = coerceState(row.ledger.state, w, today);
    const given = state.orders[today];
    const tonight: LedgerRow['tonight'] = today < 1 ? 'nothing' : given ? (given.length ? 'given' : 'barred') : 'standing';
    return {
      warbandId: w.id, name: w.name, sigil: w.sigil, type: w.type, keeper: row.keeper, state,
      behind: Math.max(0, today - 1 - state.lastResolved), tonight, waiting: !!waitingCrossroads(state), title: titleFor(state.renown), updatedAt: row.ledger.updatedAt,
    };
  });

  return {
    today, date: dateForNight(today), omen: omenForNight(today), moon: moonForNight(today),
    location: locationForNight(today, moves), locations: LOCATIONS, moves: moves.slice().reverse(),
    ledgers, players, dispatches, runs,
    counts: { players: players.length, ledgers: ledgerRows.length, warbands: warbands.length, dispatches: dispatchCount[0]?.n ?? 0, sessions: sessionCount[0]?.n ?? 0 },
    health: health(runs[0]),
  };
}

function health(lastRun?: typeof curfewRuns.$inferSelect): HealthItem[] {
  const items: HealthItem[] = [
    { label: 'Database', ok: true, detail: env.DATABASE_URL ? 'Neon Postgres' : env.LOCAL_DB ? 'PGlite under .pglite/ (local)' : 'none' },
    { label: 'Auth secret', ok: Boolean(env.BETTER_AUTH_SECRET) && !env.BETTER_AUTH_SECRET?.includes('do-not-deploy'), detail: env.BETTER_AUTH_SECRET?.includes('do-not-deploy') ? 'development default' : env.BETTER_AUTH_SECRET ? 'set' : 'missing' },
    { label: 'Sign-up', ok: env.INVITE_CODE ? true : env.ON_VERCEL ? false : null, detail: env.INVITE_CODE ? 'needs the word at the gate' : env.DEV_LOGIN ? 'open, with the dev sign-in' : 'open to anyone with the URL: set CURFEW_INVITE_CODE' },
    { label: 'Cron secret', ok: Boolean(env.CRON_SECRET), detail: env.CRON_SECRET ? 'set' : 'missing: the nightly cron will be refused' },
    { label: 'Last midnight', ok: lastRun ? Date.now() - lastRun.ranAt.getTime() < 36 * 3600 * 1000 : null, detail: lastRun ? `${lastRun.source}, night ${lastRun.night}, ${lastRun.nights} nights written` : 'never run' },
    { label: 'Admins', ok: env.ADMIN_EMAILS.length > 0 || env.DEV_LOGIN, detail: env.ADMIN_EMAILS.length ? `${env.ADMIN_EMAILS.length} on the allowlist` : env.DEV_LOGIN ? 'everyone, under the dev sign-in' : 'nobody: set ADMIN_EMAILS' },
    { label: 'Debug', ok: env.CURFEW_DEBUG ? (env.ON_VERCEL ? false : null) : true, detail: env.CURFEW_DEBUG ? '?date= overrides are on' : 'off' },
    { label: 'Origin', ok: true, detail: env.BASE_URL + (env.ON_VERCEL ? ' on Vercel' : ' locally') },
  ];
  return items;
}

export async function listPlayers(): Promise<PlayerRow[]> {
  const d = db();
  const [users, sessions, claims, resets] = await Promise.all([
    d.select().from(user).orderBy(user.createdAt),
    d.select({ userId: session.userId, updatedAt: session.updatedAt, expiresAt: session.expiresAt }).from(session),
    d.select({ warbandId: curfewLedgers.warbandId, ownerId: curfewLedgers.ownerId }).from(curfewLedgers),
    pendingResets(),
  ]);
  const now = Date.now();
  return users.map((u) => {
    const mine = sessions.filter((s) => s.userId === u.id);
    const claim = claims.find((c) => c.ownerId === u.id);
    const warband = claim && warbands.find((w) => w.id === claim.warbandId);
    return {
      id: u.id, name: u.name, email: u.email, image: u.image, createdAt: u.createdAt,
      sessions: mine.filter((s) => s.expiresAt.getTime() > now).length,
      lastSeen: mine.length ? new Date(Math.max(...mine.map((s) => s.updatedAt.getTime()))) : null,
      warband: warband ? { id: warband.id, name: warband.name } : undefined,
      admin: env.ADMIN_EMAILS.includes(u.email.toLowerCase()),
      resetUntil: resets.get(u.id),
    };
  });
}

// ───────────────────────── actions ─────────────────────────

/** Burn a warband's ledger: a fresh start tonight, the keeper unchanged. */
export async function burnLedger(warbandId: string, today: number): Promise<void> {
  const warband = warbands.find((w) => w.id === warbandId);
  if (!warband) throw new LedgerError('No such warband.', 404);
  const updated = await db().update(curfewLedgers).set({ state: freshState(warband, today), version: sql`${curfewLedgers.version} + 1`, updatedAt: new Date() }).where(eq(curfewLedgers.warbandId, warbandId)).returning({ id: curfewLedgers.warbandId });
  if (!updated.length) throw new LedgerError('Nobody keeps that ledger.', 404);
}

/** Take the warband from its keeper. The ledger goes with it; anyone may take the warband up again. */
export async function releaseLedger(warbandId: string): Promise<void> {
  const deleted = await db().delete(curfewLedgers).where(eq(curfewLedgers.warbandId, warbandId)).returning({ id: curfewLedgers.warbandId });
  if (!deleted.length) throw new LedgerError('Nobody keeps that ledger.', 404);
}

/** Sign a player out everywhere. */
export async function revokeSessions(userId: string): Promise<number> {
  const deleted = await db().delete(session).where(eq(session.userId, userId)).returning({ id: session.id });
  return deleted.length;
}

export async function deleteDispatch(id: number): Promise<void> {
  const deleted = await db().delete(cryerDispatches).where(eq(cryerDispatches.id, id)).returning({ id: cryerDispatches.id });
  if (!deleted.length) throw new LedgerError('That dispatch is already gone.', 404);
}

/** A notice from the Watch, printed in the Town Cryer tonight. */
export async function postNotice(text: string, today: number): Promise<PrintedDispatch> {
  const headline = text.trim().replace(/\s+/g, ' ');
  if (!headline) throw new LedgerError('The notice needs words.');
  if (headline.length > 200) throw new LedgerError('The notice is too long for the broadsheet.');
  const key = `${THE_WATCH}:${today}:${Date.now().toString(36)}`;
  const [row] = await db().insert(cryerDispatches).values({ key, warbandId: THE_WATCH, night: Math.max(1, today), kind: 'notice', headline }).returning();
  return { id: row.id, key: row.key, warbandId: row.warbandId, night: row.night, kind: row.kind, headline: row.headline, warbandName: dispatchSource(row.warbandId) };
}

export async function runMidnight(today: number): Promise<RunResult> {
  return reconcileAll(today, 'admin');
}

/** Everything the console needs to show one ledger up close. */
export async function ledgerDetail(warbandId: string, today: number): Promise<{ state: WarbandState; keeper: { name: string; email: string } } | null> {
  const rows = await db().select({ ledger: curfewLedgers, keeper: { name: user.name, email: user.email } }).from(curfewLedgers).innerJoin(user, eq(user.id, curfewLedgers.ownerId)).where(eq(curfewLedgers.warbandId, warbandId)).limit(1);
  const warband = warbands.find((w) => w.id === warbandId);
  if (!rows.length || !warband) return null;
  return { state: coerceState(rows[0].ledger.state, warband, today), keeper: rows[0].keeper };
}
