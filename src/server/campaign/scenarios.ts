/**
 * The scenarios: set up ahead of a game by a game master, told afterwards by everyone who was there.
 *
 * A game master creates the scenario, says when it is played, which warbands attend, which rulebook scenario it is
 * (or that it is custom, with the rules written out), and writes the prologue. After the game they write the battle,
 * mark it played with each warband's result, and may open the battle narrative to the attending players; every earlier
 * telling is kept as a revision. Each attending player writes their own prologue and epilogue, says which warriors
 * they brought and how each came out of it, and records who put whom out of action. A game master may do any of
 * that for any warband.
 */
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../db/client.ts';
import { members, scenarioMembers, scenarioOutOfAction, scenarioRevisions, scenarioWarbands, scenarios, warbands } from '../db/schema.ts';
import { LedgerError } from '../../curfew/ledger.ts';
import { MEMBER_STATUSES, SCENARIO_RESULTS, slugify, type MemberStatus, type NarrativeRevision, type OutOfAction, type Puzzle, type Scenario, type ScenarioMember, type ScenarioResult, type ScenarioWarband, type Statline } from '../../campaign/model.ts';
import { RULEBOOK_SCENARIOS } from '../../campaign/rulebook.ts';
import { isGm, type Actor } from '../roles.ts';
import { ensureSeeded } from './seed.ts';

export { LedgerError };

const clean = (s: string | undefined | null, max: number) => (s ?? '').trim().slice(0, max);
const paragraphs = (list: string[] | undefined, max = 60) => (list ?? []).map((s) => String(s).trim()).filter(Boolean).slice(0, max).map((s) => s.slice(0, 4000));
const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + 'T00:00:00Z'));

// ───────────────────────── reading ─────────────────────────

type Row = typeof scenarios.$inferSelect;

function scenarioOf(r: Row, parts: (typeof scenarioWarbands.$inferSelect)[], mems: (typeof scenarioMembers.$inferSelect)[], ooa: (typeof scenarioOutOfAction.$inferSelect)[]): Scenario {
  return {
    id: r.id, sequence: r.sequence, status: r.status, title: r.title, playedOn: r.playedOn, rulebookScenario: r.rulebookScenario, customRules: r.customRules,
    winCondition: r.winCondition, summary: r.summary, chronicle: r.chronicle, outcome: r.outcome, prologue: r.prologue, prologueAsSummary: r.prologueAsSummary, battle: (r.battle as string[]) ?? [], epilogue: r.epilogue,
    battleOpen: r.battleOpen, loot: (r.loot as string[]) ?? [], campaignNotes: (r.campaignNotes as string[]) ?? [], puzzle: (r.puzzle as Puzzle | null) ?? null,
    warbands: parts.filter((p) => p.scenarioId === r.id).map((p): ScenarioWarband => ({
      scenarioId: p.scenarioId, warbandId: p.warbandId, result: p.result, prologue: p.prologue, epilogue: p.epilogue, accomplishments: p.accomplishments,
      highlights: (p.highlights as string[]) ?? [], lowlights: (p.lowlights as string[]) ?? [], rating: p.rating, wyrdstone: p.wyrdstone, gold: p.gold,
      members: mems.filter((m) => m.scenarioId === r.id && m.warbandId === p.warbandId).map((m): ScenarioMember => ({
        scenarioId: m.scenarioId, warbandId: m.warbandId, memberId: m.memberId, status: m.status, highlight: m.highlight, lowlight: m.lowlight, stats: m.stats as Statline | null, experience: m.experience,
      })),
    })),
    outOfAction: ooa.filter((o) => o.scenarioId === r.id).map((o): OutOfAction => ({ id: o.id, scenarioId: o.scenarioId, attackerId: o.attackerId, targetId: o.targetId, target: o.target, detail: o.detail })),
    createdBy: r.createdBy, createdAt: r.createdAt, updatedAt: r.updatedAt,
  };
}

/** Every scenario: the played ones in play order, then the upcoming ones by date. */
export async function listScenarios(): Promise<Scenario[]> {
  await ensureSeeded();
  const d = db();
  const [rows, parts, mems, ooa] = await Promise.all([
    d.select().from(scenarios), d.select().from(scenarioWarbands), d.select().from(scenarioMembers), d.select().from(scenarioOutOfAction).orderBy(asc(scenarioOutOfAction.id)),
  ]);
  const list = rows.map((r) => scenarioOf(r, parts, mems, ooa));
  return list.sort((a, b) => {
    if (a.status !== b.status) return a.status === 'played' ? -1 : 1;
    if (a.status === 'played') return a.sequence - b.sequence;
    return a.playedOn.localeCompare(b.playedOn) || a.createdAt.getTime() - b.createdAt.getTime();
  });
}

export async function getScenario(id: string): Promise<Scenario | undefined> { return (await listScenarios()).find((s) => s.id === id); }

export const playedOnly = (list: Scenario[]) => list.filter((s) => s.status === 'played');
export const upcomingOnly = (list: Scenario[]) => list.filter((s) => s.status === 'upcoming');

/** One chapter in a warrior's story: their record in a played scenario. */
export interface MemberChapter { scenario: Scenario; warband: ScenarioWarband; snapshot: ScenarioMember }
/** Every warrior's chapters, oldest first, from the played scenarios. */
export function memberStories(list: Scenario[]): Record<string, MemberChapter[]> {
  const out: Record<string, MemberChapter[]> = {};
  for (const scenario of playedOnly(list)) for (const warband of scenario.warbands) for (const snapshot of warband.members) (out[snapshot.memberId] ??= []).push({ scenario, warband, snapshot });
  return out;
}

export async function revisionsOf(scenarioId: string): Promise<NarrativeRevision[]> {
  const rows = await db().select().from(scenarioRevisions).where(eq(scenarioRevisions.scenarioId, scenarioId)).orderBy(desc(scenarioRevisions.savedAt), desc(scenarioRevisions.id));
  return rows.map((r) => ({ id: r.id, scenarioId: r.scenarioId, battle: r.battle as string[], authorId: r.authorId, authorName: r.authorName, savedAt: r.savedAt }));
}

// ───────────────────────── who may ─────────────────────────

async function row(id: string): Promise<Row> {
  const rows = await db().select().from(scenarios).where(eq(scenarios.id, id)).limit(1);
  if (!rows.length) throw new LedgerError('No such scenario is in the archives.', 404);
  return rows[0];
}
function gmOnly(actor: Actor): void { if (!isGm(actor)) throw new LedgerError('Only a game master does that.', 403); }
/** The warbands the actor speaks for at this scenario: their own if it attends; every attending one for a game master. */
async function speaksFor(actor: Actor, scenarioId: string, warbandId: string): Promise<void> {
  const part = await db().select({ warbandId: scenarioWarbands.warbandId, ownerId: warbands.ownerId }).from(scenarioWarbands).innerJoin(warbands, eq(warbands.id, scenarioWarbands.warbandId)).where(and(eq(scenarioWarbands.scenarioId, scenarioId), eq(scenarioWarbands.warbandId, warbandId))).limit(1);
  if (!part.length) throw new LedgerError('That warband is not at this scenario.', 404);
  if (isGm(actor) || part[0].ownerId === actor.id) return;
  throw new LedgerError('That warband is not yours to speak for.', 403);
}

// ───────────────────────── the game master's part ─────────────────────────

export interface ScenarioInput {
  title: string; playedOn: string; rulebookScenario?: string | null; customRules?: string; prologue?: string; prologueAsSummary?: boolean; summary?: string; warbandIds?: string[];
}
export type ScenarioPatch = Partial<ScenarioInput & {
  winCondition: string; chronicle: string; outcome: string; epilogue: string; loot: string[]; campaignNotes: string[]; battleOpen: boolean; puzzle: Puzzle | null;
}>;

function rulebookOf(given: string | null | undefined): string | null {
  const s = clean(given, 80);
  if (!s) return null;
  return (RULEBOOK_SCENARIOS as readonly string[]).find((r) => r.toLowerCase() === s.toLowerCase()) ?? s;
}

export async function createScenario(actor: Actor, input: ScenarioInput): Promise<Scenario> {
  gmOnly(actor);
  await ensureSeeded();
  const title = clean(input.title, 120);
  if (!title) throw new LedgerError('The scenario needs a title.');
  if (!isDate(input.playedOn)) throw new LedgerError('Say which day it is played, as YYYY-MM-DD.');
  const d = db();
  const taken = new Set((await d.select({ id: scenarios.id }).from(scenarios)).map((r) => r.id));
  const [{ n }] = await d.select({ n: sql<number>`coalesce(max(${scenarios.sequence}), 0)::int` }).from(scenarios);
  const seq = n + 1;
  let id = `scenario-${String(seq).padStart(2, '0')}-${slugify(title)}`, k = 2;
  while (taken.has(id)) id = `scenario-${String(seq).padStart(2, '0')}-${slugify(title)}-${k++}`;
  await d.insert(scenarios).values({
    id, sequence: seq, status: 'upcoming', title, playedOn: input.playedOn, rulebookScenario: rulebookOf(input.rulebookScenario), customRules: clean(input.customRules, 8000),
    prologue: clean(input.prologue, 8000), prologueAsSummary: input.prologueAsSummary ?? true, summary: clean(input.summary, 1000), createdBy: actor.id,
  });
  if (input.warbandIds?.length) await setParticipants(actor, id, input.warbandIds);
  return (await getScenario(id))!;
}

export async function updateScenario(actor: Actor, id: string, patch: ScenarioPatch): Promise<Scenario> {
  gmOnly(actor);
  await row(id);
  const set: Partial<typeof scenarios.$inferInsert> = { updatedAt: new Date() };
  if (patch.title !== undefined) { const t = clean(patch.title, 120); if (!t) throw new LedgerError('The scenario needs a title.'); set.title = t; }
  if (patch.playedOn !== undefined) { if (!isDate(patch.playedOn)) throw new LedgerError('Say which day it is played, as YYYY-MM-DD.'); set.playedOn = patch.playedOn; }
  if (patch.rulebookScenario !== undefined) set.rulebookScenario = rulebookOf(patch.rulebookScenario);
  if (patch.customRules !== undefined) set.customRules = clean(patch.customRules, 8000);
  if (patch.winCondition !== undefined) set.winCondition = clean(patch.winCondition, 4000);
  // the summary and the Chronicle's paragraph are one field now; saving it empties the older one
  if (patch.summary !== undefined) { set.summary = clean(patch.summary, 1000); set.chronicle = ''; }
  else if (patch.chronicle !== undefined) set.chronicle = clean(patch.chronicle, 4000);
  if (patch.outcome !== undefined) set.outcome = clean(patch.outcome, 4000);
  if (patch.prologue !== undefined) set.prologue = clean(patch.prologue, 8000);
  if (patch.prologueAsSummary !== undefined) set.prologueAsSummary = !!patch.prologueAsSummary;
  if (patch.epilogue !== undefined) set.epilogue = clean(patch.epilogue, 8000);
  // the loot and the lasting records are one list now; saving it empties the older one
  if (patch.campaignNotes !== undefined) { set.campaignNotes = paragraphs(patch.campaignNotes); set.loot = []; }
  else if (patch.loot !== undefined) set.loot = paragraphs(patch.loot);
  if (patch.battleOpen !== undefined) set.battleOpen = !!patch.battleOpen;
  if (patch.puzzle !== undefined) set.puzzle = patch.puzzle ?? null;
  await db().update(scenarios).set(set).where(eq(scenarios.id, id));
  if (patch.warbandIds !== undefined) await setParticipants(actor, id, patch.warbandIds);
  return (await getScenario(id))!;
}

/** Which warbands attend. A warband taken off the list takes its warriors' records with it. */
export async function setParticipants(actor: Actor, id: string, warbandIds: string[]): Promise<Scenario> {
  gmOnly(actor);
  await row(id);
  const d = db();
  const known = new Set((await d.select({ id: warbands.id }).from(warbands)).map((r) => r.id));
  const wanted = [...new Set(warbandIds)].filter((w) => known.has(w));
  const current = (await d.select({ warbandId: scenarioWarbands.warbandId }).from(scenarioWarbands).where(eq(scenarioWarbands.scenarioId, id))).map((r) => r.warbandId);
  const gone = current.filter((w) => !wanted.includes(w));
  if (gone.length) {
    await d.delete(scenarioMembers).where(and(eq(scenarioMembers.scenarioId, id), inArray(scenarioMembers.warbandId, gone)));
    await d.delete(scenarioWarbands).where(and(eq(scenarioWarbands.scenarioId, id), inArray(scenarioWarbands.warbandId, gone)));
  }
  for (const w of wanted) if (!current.includes(w)) await d.insert(scenarioWarbands).values({ scenarioId: id, warbandId: w }).onConflictDoNothing();
  return (await getScenario(id))!;
}

/**
 * The game is played: every attending warband gets its result and the scenario joins the Chronicle, taking the next
 * place in play order. Standings recorded here are totals after the battle. A game master may also reopen a scenario
 * as upcoming, which keeps everything written and only lifts it out of the Chronicle.
 */
export async function markPlayed(actor: Actor, id: string, results: { warbandId: string; result: ScenarioResult }[]): Promise<Scenario> {
  gmOnly(actor);
  const r = await row(id);
  const d = db();
  const parts = (await d.select({ warbandId: scenarioWarbands.warbandId }).from(scenarioWarbands).where(eq(scenarioWarbands.scenarioId, id))).map((x) => x.warbandId);
  if (!parts.length) throw new LedgerError('Say which warbands fought before marking the scenario played.');
  for (const w of parts) {
    const given = results.find((x) => x.warbandId === w);
    if (!given || !SCENARIO_RESULTS.includes(given.result)) throw new LedgerError('Every warband that fought needs a result: victory, defeat or draw.');
  }
  for (const { warbandId, result } of results) if (parts.includes(warbandId)) await d.update(scenarioWarbands).set({ result }).where(and(eq(scenarioWarbands.scenarioId, id), eq(scenarioWarbands.warbandId, warbandId)));
  if (r.status !== 'played') {
    const [{ n }] = await d.select({ n: sql<number>`coalesce(max(${scenarios.sequence}), 0)::int` }).from(scenarios).where(eq(scenarios.status, 'played'));
    // played scenarios take the next place in play order; the upcoming ones move up behind them
    await d.update(scenarios).set({ sequence: sql`${scenarios.sequence} + 1` }).where(and(eq(scenarios.status, 'upcoming'), sql`${scenarios.sequence} > ${n}`));
    await d.update(scenarios).set({ status: 'played', sequence: n + 1, updatedAt: new Date() }).where(eq(scenarios.id, id));
  }
  return (await getScenario(id))!;
}

export async function reopenScenario(actor: Actor, id: string): Promise<Scenario> {
  gmOnly(actor);
  await row(id);
  await db().update(scenarios).set({ status: 'upcoming', updatedAt: new Date() }).where(eq(scenarios.id, id));
  return (await getScenario(id))!;
}

/** Strike an upcoming scenario. A played one stays in the archives. */
export async function deleteScenario(actor: Actor, id: string): Promise<void> {
  gmOnly(actor);
  const r = await row(id);
  if (r.status === 'played') throw new LedgerError('A played scenario stays in the archives. Reopen it first if it was never fought.', 409);
  await db().delete(scenarios).where(eq(scenarios.id, id));
}

// ───────────────────────── the battle, told and retold ─────────────────────────

/** Rewrite the battle. Game masters always; attending players once the game master has opened it. The old telling is kept. */
export async function writeBattle(actor: Actor, id: string, battle: string[]): Promise<Scenario> {
  const r = await row(id);
  if (!isGm(actor)) {
    if (!r.battleOpen) throw new LedgerError('The game master has not opened the battle to be retold.', 403);
    const mine = await db().select({ id: scenarioWarbands.warbandId }).from(scenarioWarbands).innerJoin(warbands, eq(warbands.id, scenarioWarbands.warbandId)).where(and(eq(scenarioWarbands.scenarioId, id), eq(warbands.ownerId, actor.id))).limit(1);
    if (!mine.length) throw new LedgerError('Only those who fought may retell the battle.', 403);
  }
  const next = paragraphs(battle);
  const previous = (r.battle as string[]) ?? [];
  if (JSON.stringify(next) === JSON.stringify(previous)) return (await getScenario(id))!;
  const d = db();
  if (previous.length) await d.insert(scenarioRevisions).values({ scenarioId: id, battle: previous, authorId: null, authorName: 'as it stood before' });
  await d.update(scenarios).set({ battle: next, updatedAt: new Date() }).where(eq(scenarios.id, id));
  await d.insert(scenarioRevisions).values({ scenarioId: id, battle: next, authorId: actor.id, authorName: actor.name });
  return (await getScenario(id))!;
}

// ───────────────────────── each warband's own telling ─────────────────────────

export interface PerspectivePatch { prologue?: string; epilogue?: string; accomplishments?: string; highlights?: string[]; lowlights?: string[]; rating?: number | null; wyrdstone?: number | null; gold?: number | null }

export async function writePerspective(actor: Actor, id: string, warbandId: string, patch: PerspectivePatch): Promise<Scenario> {
  await speaksFor(actor, id, warbandId);
  const set: Partial<typeof scenarioWarbands.$inferInsert> = {};
  if (patch.prologue !== undefined) set.prologue = clean(patch.prologue, 8000);
  if (patch.epilogue !== undefined) set.epilogue = clean(patch.epilogue, 8000);
  if (patch.accomplishments !== undefined) set.accomplishments = clean(patch.accomplishments, 2000);
  if (patch.highlights !== undefined) set.highlights = paragraphs(patch.highlights, 12);
  if (patch.lowlights !== undefined) set.lowlights = paragraphs(patch.lowlights, 12);
  for (const k of ['rating', 'wyrdstone', 'gold'] as const) if (patch[k] !== undefined) set[k] = patch[k] == null ? null : Math.max(0, Math.floor(Number(patch[k])));
  if (Object.keys(set).length) await db().update(scenarioWarbands).set(set).where(and(eq(scenarioWarbands.scenarioId, id), eq(scenarioWarbands.warbandId, warbandId)));
  await db().update(scenarios).set({ updatedAt: new Date() }).where(eq(scenarios.id, id));
  return (await getScenario(id))!;
}

export interface BroughtInput { memberId: string; status?: MemberStatus; highlight?: string; lowlight?: string }

/** Which warriors a warband brought and how each came out of it. Replaces the warband's list; only its own warriors count. */
export async function setBrought(actor: Actor, id: string, warbandId: string, brought: BroughtInput[]): Promise<Scenario> {
  await speaksFor(actor, id, warbandId);
  const d = db();
  const own = new Set((await d.select({ id: members.id }).from(members).where(eq(members.warbandId, warbandId))).map((m) => m.id));
  const wanted = brought.filter((b) => own.has(b.memberId));
  const seen = new Set<string>();
  await d.delete(scenarioMembers).where(and(eq(scenarioMembers.scenarioId, id), eq(scenarioMembers.warbandId, warbandId), wanted.length ? sql`${scenarioMembers.memberId} not in (${sql.join(wanted.map((b) => sql`${b.memberId}`), sql`, `)})` : sql`true`));
  for (const b of wanted) {
    if (seen.has(b.memberId)) continue;
    seen.add(b.memberId);
    const status = MEMBER_STATUSES.includes(b.status as MemberStatus) ? (b.status as MemberStatus) : 'active';
    const values = { status, highlight: clean(b.highlight, 1000), lowlight: clean(b.lowlight, 1000) };
    await d.insert(scenarioMembers).values({ scenarioId: id, memberId: b.memberId, warbandId, ...values }).onConflictDoUpdate({ target: [scenarioMembers.scenarioId, scenarioMembers.memberId], set: values });
  }
  await d.update(scenarios).set({ updatedAt: new Date() }).where(eq(scenarios.id, id));
  return (await getScenario(id))!;
}

// ───────────────────────── out of action ─────────────────────────

export interface OutOfActionInput { attackerId: string; targetId?: string | null; target?: string; detail?: string }

/** Record a takedown. The one who struck, or the one who fell, may record it for their own warband; a game master for any. */
export async function addOutOfAction(actor: Actor, id: string, input: OutOfActionInput): Promise<Scenario> {
  await row(id);
  const d = db();
  const attending = (await d.select({ warbandId: scenarioWarbands.warbandId, ownerId: warbands.ownerId }).from(scenarioWarbands).innerJoin(warbands, eq(warbands.id, scenarioWarbands.warbandId)).where(eq(scenarioWarbands.scenarioId, id)));
  const roster = await d.select({ id: members.id, name: members.name, warbandId: members.warbandId }).from(members).where(inArray(members.warbandId, attending.length ? attending.map((a) => a.warbandId) : ['']));
  const attacker = roster.find((m) => m.id === input.attackerId);
  if (!attacker) throw new LedgerError('The attacker must be a warrior of an attending warband.');
  const target = input.targetId ? roster.find((m) => m.id === input.targetId) : undefined;
  if (input.targetId && !target) throw new LedgerError('The one who fell must be a warrior of an attending warband.');
  const targetName = target?.name ?? clean(input.target, 120);
  if (!targetName) throw new LedgerError('Say who was put out of action.');
  const owns = (warbandId: string) => attending.some((a) => a.warbandId === warbandId && a.ownerId === actor.id);
  if (!isGm(actor) && !owns(attacker.warbandId) && !(target && owns(target.warbandId))) throw new LedgerError('You may record only what your own warriors did or suffered.', 403);
  await d.insert(scenarioOutOfAction).values({ scenarioId: id, attackerId: attacker.id, targetId: target?.id ?? null, target: targetName, detail: clean(input.detail, 1000) });
  await d.update(scenarios).set({ updatedAt: new Date() }).where(eq(scenarios.id, id));
  return (await getScenario(id))!;
}

export async function removeOutOfAction(actor: Actor, id: string, ooaId: number): Promise<Scenario> {
  await row(id);
  const d = db();
  const rows = await d.select().from(scenarioOutOfAction).where(and(eq(scenarioOutOfAction.id, ooaId), eq(scenarioOutOfAction.scenarioId, id))).limit(1);
  if (!rows.length) throw new LedgerError('That record is already gone.', 404);
  if (!isGm(actor)) {
    const ids = [rows[0].attackerId, rows[0].targetId].filter((x): x is string => !!x);
    const mine = await d.select({ id: members.id }).from(members).innerJoin(warbands, eq(warbands.id, members.warbandId)).where(and(inArray(members.id, ids), eq(warbands.ownerId, actor.id))).limit(1);
    if (!mine.length) throw new LedgerError('You may remove only what concerns your own warriors.', 403);
  }
  await d.delete(scenarioOutOfAction).where(eq(scenarioOutOfAction.id, ooaId));
  return (await getScenario(id))!;
}
