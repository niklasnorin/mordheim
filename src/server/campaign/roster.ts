/**
 * The warbands and their warriors, as the database keeps them.
 *
 * A player owns at most one warband and edits only that one; a game master edits any and may hand a warband to a
 * player or take it back. The Curfew's ledger follows the owner (see curfew/service.ts): releasing the warband
 * releases the ledger. Battles and victories are counted from the played scenarios rather than stored.
 */
import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { db } from '../db/client.ts';
import { curfewLedgers, members, scenarioMembers, scenarioWarbands, scenarios, user, warbands } from '../db/schema.ts';
import { LedgerError } from '../../curfew/ledger.ts';
import { type Roster } from '../../curfew/roster.ts';
import { STAT_KEYS, slugify, type Death, type Member, type Statline, type Warband } from '../../campaign/model.ts';
import { isGm, type Actor } from '../roles.ts';
import { ensureSeeded } from './seed.ts';

export { LedgerError };

type WarbandRow = typeof warbands.$inferSelect;
type MemberRow = typeof members.$inferSelect;

function memberOf(r: MemberRow): Member {
  return {
    id: r.id, warbandId: r.warbandId, name: r.name, role: r.role, rank: r.rank, portrait: r.portrait, epithet: r.epithet, dead: r.dead,
    death: (r.death as Death | null) ?? undefined, stats: r.stats as Statline, experience: r.experience ?? undefined,
    skills: (r.skills as string[]) ?? [], injuries: (r.injuries as string[]) ?? [], lore: r.lore, sort: r.sort,
  };
}

/** Every warband with its members, home-page order, plus the tallies from the played scenarios. */
export async function listWarbands(): Promise<Warband[]> {
  await ensureSeeded();
  const d = db();
  const [rows, memberRows, tallies] = await Promise.all([
    d.select({ w: warbands, ownerName: user.name }).from(warbands).leftJoin(user, eq(user.id, warbands.ownerId)).orderBy(asc(warbands.sort), asc(warbands.createdAt)),
    d.select().from(members).orderBy(asc(members.sort), asc(members.createdAt)),
    d.select({ warbandId: scenarioWarbands.warbandId, battles: sql<number>`count(*)::int`, victories: sql<number>`count(*) filter (where ${scenarioWarbands.result} = 'victory')::int` })
      .from(scenarioWarbands).innerJoin(scenarios, eq(scenarios.id, scenarioWarbands.scenarioId)).where(eq(scenarios.status, 'played')).groupBy(scenarioWarbands.warbandId),
  ]);
  return rows.map(({ w, ownerName }) => {
    const t = tallies.find((x) => x.warbandId === w.id);
    return warbandOf(w, ownerName, memberRows.filter((m) => m.warbandId === w.id), t?.battles ?? 0, t?.victories ?? 0);
  });
}

function warbandOf(w: WarbandRow, ownerName: string | null, memberRows: MemberRow[], battles: number, victories: number): Warband {
  return {
    id: w.id, name: w.name, type: w.type, sigil: w.sigil, crest: w.crest ?? undefined, ownerId: w.ownerId, player: ownerName ?? w.player,
    rating: w.rating, battles, victories, wyrdstone: w.wyrdstone, gold: w.gold, lore: w.lore, sort: w.sort, version: w.version,
    members: memberRows.map(memberOf),
  };
}

export async function getWarband(id: string): Promise<Warband | undefined> {
  return (await listWarbands()).find((w) => w.id === id);
}

/** The warband a player keeps, if any. */
export async function ownWarband(userId: string): Promise<Warband | undefined> {
  return (await listWarbands()).find((w) => w.ownerId === userId);
}

/** The roster as the Night engine wants it: every warband, and who is still hurt from the last played scenario. */
export async function loadRoster(): Promise<Roster> {
  const list = await listWarbands();
  const last = await db().select({ id: scenarios.id }).from(scenarios).where(eq(scenarios.status, 'played')).orderBy(sql`${scenarios.sequence} desc`).limit(1);
  const injured: Record<string, string[]> = {};
  if (last.length) {
    const rows = await db().select({ warbandId: scenarioMembers.warbandId, memberId: scenarioMembers.memberId }).from(scenarioMembers).where(and(eq(scenarioMembers.scenarioId, last[0].id), eq(scenarioMembers.status, 'injured')));
    for (const r of rows) (injured[r.warbandId] ??= []).push(r.memberId);
  }
  return { warbands: list, injured };
}

// ───────────────────────── who may ─────────────────────────

async function warbandRow(id: string): Promise<WarbandRow> {
  const rows = await db().select().from(warbands).where(eq(warbands.id, id)).limit(1);
  if (!rows.length) throw new LedgerError('No such warband has entered the gates.', 404);
  return rows[0];
}
/** The owner, or a game master, may edit a warband. */
function mayEdit(actor: Actor, w: WarbandRow): void {
  if (isGm(actor) || w.ownerId === actor.id) return;
  throw new LedgerError('That warband is not yours to keep.', 403);
}

// ───────────────────────── the warband ─────────────────────────

export interface WarbandInput { name: string; type: string; sigil?: string; lore?: string; rating?: number; wyrdstone?: number; gold?: number; player?: string }

const clean = (s: string | undefined, max: number) => (s ?? '').trim().slice(0, max);
function sigilFor(name: string, given?: string): string {
  const s = clean(given, 3).toUpperCase();
  if (s) return s;
  const words = name.replace(/^the\s+/i, '').split(/\s+/).filter(Boolean);
  return (words.length > 1 ? words[0][0] + words[1][0] : name.slice(0, 2)).toUpperCase();
}
function unique(base: string, taken: Set<string>): string {
  let id = base || 'warband', n = 2;
  while (taken.has(id)) id = `${base}-${n++}`;
  return id;
}

/** A new warband. A player may create one when they keep none; it is theirs. A game master may create any, unowned. */
export async function createWarband(actor: Actor, input: WarbandInput): Promise<Warband> {
  await ensureSeeded();
  const name = clean(input.name, 80), type = clean(input.type, 60);
  if (!name) throw new LedgerError('The warband needs a name.');
  if (!type) throw new LedgerError('Say what kind of warband they are.');
  if (!isGm(actor) && (await ownWarband(actor.id))) throw new LedgerError('You already keep a warband. Give it up before founding another.', 409);
  const d = db();
  const taken = new Set((await d.select({ id: warbands.id }).from(warbands)).map((r) => r.id));
  const id = unique(slugify(name.replace(/^the\s+/i, '')), taken);
  const [{ n }] = await d.select({ n: sql<number>`coalesce(max(${warbands.sort}), 0)::int` }).from(warbands);
  await d.insert(warbands).values({
    id, name, type, sigil: sigilFor(name, input.sigil), ownerId: isGm(actor) ? null : actor.id, player: isGm(actor) ? clean(input.player, 40) : actor.name,
    lore: clean(input.lore, 4000), rating: input.rating ?? 0, wyrdstone: input.wyrdstone ?? 0, gold: input.gold ?? 0, sort: n + 1,
  });
  return (await getWarband(id))!;
}

export type WarbandPatch = Partial<WarbandInput & { crest: string }>;

export async function updateWarband(actor: Actor, id: string, patch: WarbandPatch): Promise<Warband> {
  const w = await warbandRow(id);
  mayEdit(actor, w);
  const set: Partial<typeof warbands.$inferInsert> = { updatedAt: new Date(), version: w.version + 1 };
  if (patch.name !== undefined) { const name = clean(patch.name, 80); if (!name) throw new LedgerError('The warband needs a name.'); set.name = name; }
  if (patch.type !== undefined) { const type = clean(patch.type, 60); if (!type) throw new LedgerError('Say what kind of warband they are.'); set.type = type; }
  if (patch.sigil !== undefined) set.sigil = sigilFor(patch.name ?? w.name, patch.sigil);
  if (patch.lore !== undefined) set.lore = clean(patch.lore, 4000);
  if (patch.player !== undefined && isGm(actor)) set.player = clean(patch.player, 40);
  if (patch.crest !== undefined && isGm(actor)) set.crest = clean(patch.crest, 120) || null;
  for (const k of ['rating', 'wyrdstone', 'gold'] as const) if (patch[k] !== undefined) set[k] = bounded(patch[k]!, 0, 99999, k);
  await db().update(warbands).set(set).where(eq(warbands.id, id));
  return (await getWarband(id))!;
}

function bounded(n: number, min: number, max: number, what: string): number {
  if (!Number.isInteger(n) || n < min || n > max) throw new LedgerError(`${what} must be a whole number between ${min} and ${max}.`);
  return n;
}

/** Take up an unowned warband. One player, one warband. */
export async function claimWarband(actor: Actor, id: string): Promise<Warband> {
  await ensureSeeded();
  const w = await warbandRow(id);
  if (w.ownerId === actor.id) return (await getWarband(id))!;
  if (w.ownerId) throw new LedgerError(`${w.name} already have a keeper.`, 409);
  if (await ownWarband(actor.id)) throw new LedgerError('You already keep a warband. Give it up before taking another.', 409);
  const updated = await db().update(warbands).set({ ownerId: actor.id, player: actor.name, updatedAt: new Date() }).where(and(eq(warbands.id, id), isNull(warbands.ownerId))).returning({ id: warbands.id });
  if (!updated.length) throw new LedgerError(`${w.name} already have a keeper.`, 409);
  return (await getWarband(id))!;
}

/** Give a warband up, ledger and all, so someone else may take it. The owner may; so may a game master. */
export async function releaseWarband(actor: Actor, id: string): Promise<void> {
  const w = await warbandRow(id);
  mayEdit(actor, w);
  await db().delete(curfewLedgers).where(eq(curfewLedgers.warbandId, id));
  await db().update(warbands).set({ ownerId: null, updatedAt: new Date() }).where(eq(warbands.id, id));
}

/**
 * Hand a warband to a player, or to nobody. Game masters only. The ledger goes with the warband: it is kept for the new
 * owner, so the nights already written stay theirs. Refused when the player keeps another warband already.
 */
export async function assignWarband(actor: Actor, id: string, userId: string | null): Promise<Warband> {
  if (!isGm(actor)) throw new LedgerError('Only a game master hands out warbands.', 403);
  const w = await warbandRow(id);
  const d = db();
  if (userId) {
    const rows = await d.select({ id: user.id, name: user.name }).from(user).where(eq(user.id, userId)).limit(1);
    if (!rows.length) throw new LedgerError('No such player.', 404);
    const other = await d.select({ id: warbands.id, name: warbands.name }).from(warbands).where(and(eq(warbands.ownerId, userId), sql`${warbands.id} <> ${id}`)).limit(1);
    if (other.length) throw new LedgerError(`${rows[0].name} already keep ${other[0].name}. Release that first.`, 409);
    await d.update(warbands).set({ ownerId: userId, player: rows[0].name, updatedAt: new Date() }).where(eq(warbands.id, id));
    await d.update(curfewLedgers).set({ ownerId: userId, updatedAt: new Date() }).where(eq(curfewLedgers.warbandId, id));
  } else {
    await d.delete(curfewLedgers).where(eq(curfewLedgers.warbandId, id));
    await d.update(warbands).set({ ownerId: null, updatedAt: new Date() }).where(eq(warbands.id, id));
  }
  void w;
  return (await getWarband(id))!;
}

/** Strike a warband from the record. Game masters only, and only one that fought in no played scenario. */
export async function deleteWarband(actor: Actor, id: string): Promise<void> {
  if (!isGm(actor)) throw new LedgerError('Only a game master strikes a warband from the record.', 403);
  await warbandRow(id);
  const fought = await db().select({ id: scenarioWarbands.scenarioId }).from(scenarioWarbands).innerJoin(scenarios, eq(scenarios.id, scenarioWarbands.scenarioId)).where(and(eq(scenarioWarbands.warbandId, id), eq(scenarios.status, 'played'))).limit(1);
  if (fought.length) throw new LedgerError('They have fought in a recorded battle; the archives keep them.', 409);
  await db().delete(curfewLedgers).where(eq(curfewLedgers.warbandId, id));
  await db().delete(scenarioWarbands).where(eq(scenarioWarbands.warbandId, id));
  await db().delete(warbands).where(eq(warbands.id, id));
}

// ───────────────────────── the warriors ─────────────────────────

export interface MemberInput {
  name: string; role?: string; rank?: 'hero' | 'henchman'; epithet?: string; stats?: Partial<Statline>; experience?: number | null;
  skills?: string[]; injuries?: string[]; lore?: string; dead?: boolean; death?: Partial<Death> | null;
}

export function statlineOf(given: Partial<Statline> | undefined, base?: Statline): Statline {
  const out = { ...(base ?? { M: 4, WS: 3, BS: 3, S: 3, T: 3, W: 1, I: 3, A: 1, Ld: 7 }) } as Statline;
  for (const k of STAT_KEYS) if (given && given[k] !== undefined) out[k] = bounded(Number(given[k]), 0, 10, k);
  return out;
}
const lines = (list: string[] | undefined, max = 30) => (list ?? []).map((s) => String(s).trim()).filter(Boolean).slice(0, max).map((s) => s.slice(0, 200));

export async function addMember(actor: Actor, warbandId: string, input: MemberInput): Promise<Warband> {
  const w = await warbandRow(warbandId);
  mayEdit(actor, w);
  const name = clean(input.name, 80);
  if (!name) throw new LedgerError('The warrior needs a name.');
  const d = db();
  const taken = new Set((await d.select({ id: members.id }).from(members)).map((r) => r.id));
  const id = unique(slugify(name.split(/\s+/)[0]), taken);
  const [{ n }] = await d.select({ n: sql<number>`coalesce(max(${members.sort}), 0)::int` }).from(members).where(eq(members.warbandId, warbandId));
  await d.insert(members).values({
    id, warbandId, name, role: clean(input.role, 60), rank: input.rank === 'hero' ? 'hero' : 'henchman', portrait: portraitFor(name), epithet: clean(input.epithet, 120),
    stats: statlineOf(input.stats), experience: input.experience == null ? null : bounded(input.experience, 0, 999, 'Experience'),
    skills: lines(input.skills), injuries: lines(input.injuries), lore: clean(input.lore, 4000), sort: n + 1,
    dead: !!input.dead, death: input.dead ? deathOf(input.death, null) : null,
  });
  await touch(warbandId);
  return (await getWarband(warbandId))!;
}

function portraitFor(name: string): string {
  const words = name.split(/\s+/).filter(Boolean);
  return ((words[0]?.[0] ?? '') + (words[1]?.[0] ?? words[0]?.[1] ?? '')).toUpperCase();
}
function deathOf(given: Partial<Death> | null | undefined, previous: Death | null): Death {
  return { date: clean(given?.date ?? previous?.date, 80), order: given?.order ?? previous?.order ?? Date.now(), epitaph: clean(given?.epitaph ?? previous?.epitaph, 200) };
}
async function touch(warbandId: string) { await db().update(warbands).set({ updatedAt: new Date(), version: sql`${warbands.version} + 1` }).where(eq(warbands.id, warbandId)); }

export async function updateMember(actor: Actor, memberId: string, patch: Partial<MemberInput>): Promise<Warband> {
  const rows = await db().select().from(members).where(eq(members.id, memberId)).limit(1);
  if (!rows.length) throw new LedgerError('No such warrior is on the roster.', 404);
  const m = rows[0];
  const w = await warbandRow(m.warbandId);
  mayEdit(actor, w);
  const set: Partial<typeof members.$inferInsert> = { updatedAt: new Date() };
  if (patch.name !== undefined) { const name = clean(patch.name, 80); if (!name) throw new LedgerError('The warrior needs a name.'); set.name = name; set.portrait = portraitFor(name); }
  if (patch.role !== undefined) set.role = clean(patch.role, 60);
  if (patch.rank !== undefined) set.rank = patch.rank === 'hero' ? 'hero' : 'henchman';
  if (patch.epithet !== undefined) set.epithet = clean(patch.epithet, 120);
  if (patch.stats !== undefined) set.stats = statlineOf(patch.stats, m.stats as Statline);
  if (patch.experience !== undefined) set.experience = patch.experience == null ? null : bounded(patch.experience, 0, 999, 'Experience');
  if (patch.skills !== undefined) set.skills = lines(patch.skills);
  if (patch.injuries !== undefined) set.injuries = lines(patch.injuries);
  if (patch.lore !== undefined) set.lore = clean(patch.lore, 4000);
  if (patch.dead !== undefined) { set.dead = patch.dead; set.death = patch.dead ? deathOf(patch.death, m.death as Death | null) : null; }
  else if (patch.death !== undefined && m.dead) set.death = deathOf(patch.death, m.death as Death | null);
  await db().update(members).set(set).where(eq(members.id, memberId));
  await touch(m.warbandId);
  return (await getWarband(m.warbandId))!;
}

/** Strike a warrior from the roster. One who fought in a played scenario stays; mark them dead instead. */
export async function removeMember(actor: Actor, memberId: string): Promise<Warband> {
  const rows = await db().select().from(members).where(eq(members.id, memberId)).limit(1);
  if (!rows.length) throw new LedgerError('No such warrior is on the roster.', 404);
  const m = rows[0];
  const w = await warbandRow(m.warbandId);
  mayEdit(actor, w);
  const fought = await db().select({ id: scenarioMembers.scenarioId }).from(scenarioMembers).innerJoin(scenarios, eq(scenarios.id, scenarioMembers.scenarioId)).where(and(eq(scenarioMembers.memberId, memberId), eq(scenarios.status, 'played'))).limit(1);
  if (fought.length) throw new LedgerError(`${m.name} fought in a recorded battle; the archives keep them. Mark them dead instead.`, 409);
  await db().delete(scenarioMembers).where(eq(scenarioMembers.memberId, memberId));
  await db().delete(members).where(eq(members.id, memberId));
  await touch(m.warbandId);
  return (await getWarband(m.warbandId))!;
}

/** Members in a given order; ids not named keep their place after the named ones. */
export async function reorderMembers(actor: Actor, warbandId: string, order: string[]): Promise<Warband> {
  const w = await warbandRow(warbandId);
  mayEdit(actor, w);
  const rows = await db().select({ id: members.id }).from(members).where(and(eq(members.warbandId, warbandId), inArray(members.id, order.length ? order : ['']))); 
  const known = new Set(rows.map((r) => r.id));
  let i = 1;
  for (const id of order) if (known.has(id)) await db().update(members).set({ sort: i++ }).where(eq(members.id, id));
  return (await getWarband(warbandId))!;
}
