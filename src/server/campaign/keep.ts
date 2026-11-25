/**
 * A warband kept by the builder: its roster (the selections from its catalogue), its stash and the log of everything
 * that came in and went out. The roster and the rules are pure (`src/builder/`); this service loads, checks who may,
 * changes, charges or pays the stash, logs, writes the warriors' numbers back onto the record, and saves, refusing a
 * change made against an older roster.
 *
 * The campaign's rules, as the game masters set them: a warband is founded with 500 crowns and what is not spent goes
 * into the stash; between games gear moves between a warrior and the stash, and is sold at the trading post where the
 * campaign is now (half the price of a common item, half the base price of a rare one, rounded down, nothing for a
 * free dagger); a warrior who dies takes their gear with them. Gold and wyrdstone are the sums of the log.
 */
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { db } from '../db/client.ts';
import { members, scenarioMembers, scenarios, warbandLog, warbands } from '../db/schema.ts';
import { LedgerError } from '../../curfew/ledger.ts';
import { isGm, type Actor } from '../roles.ts';
import { getWarband, insertMemberRow, ownWarband, touch } from './roster.ts';
import { ensureSeeded } from './seed.ts';
import { bundleFor, catalogueSlugs } from '../../builder/data.ts';
import { nodeOf, type Bundle } from '../../builder/catalogue.ts';
import { evaluate, findPlaced, place, reachable, type Roster, type Selection } from '../../builder/evaluate.ts';
import { applyOp, randomId, type Op } from '../../builder/ops.ts';
import { addSelection, findSelection, flatOptions, moveSelection, optionAt, parentOf, removeSelection, RosterError, setCount, walk } from '../../builder/roster.ts';
import { optionsUnder } from '../../builder/evaluate.ts';
import { GROUP_MAX, STARTING_GOLD, slugForType, stashItems, stashOf, summarise, warriorsOf, type Warrior } from '../../builder/rules.ts';
import { chartItemFor, priceRange, saleOf } from '../../builder/stash.ts';
import { propose, type Proposal } from '../../builder/propose.ts';
import { stockOf, type StockLine } from '../../campaign/trading.ts';
import { formatImperial, imperialForDate } from '../../lib/calendar.ts';
import type { Warband } from '../../campaign/model.ts';

export { LedgerError };

type WarbandRow = typeof warbands.$inferSelect;

export interface LogLine { id: number; kind: string; gold: number; shards: number; text: string; authorName: string; struck: boolean; createdAt: Date; scenarioId: string | null; undoable: boolean }
export interface KeepView {
  warbandId: string;
  name: string;
  version: number;
  catalogue: string;
  roster: Roster | null;
  /** Each hero's and group's warriors by name, from the record. */
  names: Record<string, string[]>;
  gold: number;
  shards: number;
  log: LogLine[];
  /** Where the campaign is, and what its trading post has. */
  post: { id: string; name: string; lines: StockLine[] } | null;
}

// ───────────────────────── loading ─────────────────────────

async function row(warbandId: string): Promise<WarbandRow> {
  await ensureSeeded();
  const rows = await db().select().from(warbands).where(eq(warbands.id, warbandId)).limit(1);
  if (!rows.length) throw new LedgerError('No such warband has entered the gates.', 404);
  return rows[0];
}
function mayKeep(actor: Actor, w: WarbandRow): void {
  if (isGm(actor) || w.ownerId === actor.id) return;
  throw new LedgerError('That warband is not yours to keep.', 403);
}
function bundleOrRefuse(slug: string): Bundle {
  const b = bundleFor(slug);
  if (!b) throw new LedgerError('That warband is not in the builder’s catalogue.');
  return b;
}
/** The catalogue a warband's kind names, if the builder has it. */
export const catalogueForType = (type: string): string | undefined => slugForType(type, catalogueSlugs());

async function sums(warbandId: string): Promise<{ gold: number; shards: number }> {
  const [r] = await db().select({ gold: sql<number>`coalesce(sum(${warbandLog.gold}), 0)::int`, shards: sql<number>`coalesce(sum(${warbandLog.shards}), 0)::int` }).from(warbandLog).where(and(eq(warbandLog.warbandId, warbandId), eq(warbandLog.struck, false)));
  return { gold: r?.gold ?? 0, shards: r?.shards ?? 0 };
}

/** The trading post where the campaign is now: the record's location of that id, laid over the chart. */
export async function currentPost(): Promise<KeepView['post']> {
  try {
    const { currentLocation, todayFor } = await import('../curfew/service.ts');
    const place = await currentLocation(todayFor(null));
    const { getLocation } = await import('./locations.ts');
    const loc = await getLocation(place.id);
    return { id: place.id, name: loc?.name ?? place.name, lines: stockOf(loc?.stock ?? []) };
  } catch (e) {
    console.error('[keep] no trading post', e);
    return null;
  }
}

export async function keepView(warbandId: string): Promise<KeepView> {
  const w = await row(warbandId);
  const roster = (w.roster as Roster | null) ?? null;
  const memberRows = await db().select({ id: members.id, name: members.name }).from(members).where(eq(members.warbandId, warbandId));
  const nameOf = new Map(memberRows.map((m) => [m.id, m.name]));
  const names: Record<string, string[]> = {};
  if (roster) walk(roster.selections, (s) => { if (s.members?.length) names[s.id] = s.members.map((id) => nameOf.get(id) ?? ''); });
  const logRows = await db().select().from(warbandLog).where(eq(warbandLog.warbandId, warbandId)).orderBy(desc(warbandLog.id)).limit(60);
  const lastOpen = logRows.find((l) => !l.struck);
  const { gold, shards } = await sums(warbandId);
  return {
    warbandId, name: w.name, version: w.version, catalogue: roster?.catalogue ?? catalogueForType(w.type) ?? '', roster, names, gold, shards,
    log: logRows.map((l) => ({ id: l.id, kind: l.kind, gold: l.gold, shards: l.shards, text: l.text, authorName: l.authorName, struck: l.struck, createdAt: l.createdAt, scenarioId: l.scenarioId, undoable: !!lastOpen && l.id === lastOpen.id && l.before != null })),
    post: roster ? await currentPost() : null,
  };
}

/** The view as a viewer may have it: the stash and its log are the keeper's and the game masters' business. */
export async function keepViewFor(actor: Actor | null, warbandId: string): Promise<KeepView> {
  const v = await keepView(warbandId);
  const w = await row(warbandId);
  if (actor && (isGm(actor) || w.ownerId === actor.id)) return v;
  return { ...v, gold: 0, shards: 0, log: [], post: null };
}

// ───────────────────────── checking a roster sent from the browser ─────────────────────────

/** A roster as sent: every selection known to the catalogue, placed where it was offered, ids unique, counts whole. */
function checkSent(b: Bundle, slug: string, sent: Roster): Roster {
  if (!sent || sent.catalogue !== slug || !Array.isArray(sent.selections)) throw new LedgerError('The roster could not be read.');
  const ids = new Set<string>();
  const clean = (list: Selection[], depth: number): Selection[] => {
    if (depth > 8 || list.length > 200) throw new LedgerError('The roster could not be read.');
    return list.map((s) => {
      if (typeof s.id !== 'string' || !/^[\w#~-]{1,40}$/.test(s.id) || ids.has(s.id)) throw new LedgerError('The roster could not be read.');
      ids.add(s.id);
      if (typeof s.entry !== 'string' || !nodeOf(b, s.entry)) throw new LedgerError('The roster names something the catalogue does not have.');
      if (!Number.isInteger(s.count) || s.count < 1 || s.count > 999) throw new LedgerError('A count on the roster is not a whole number.');
      const out: Selection = { id: s.id, entry: s.entry, count: s.count, children: clean(Array.isArray(s.children) ? s.children : [], depth + 1) };
      if (Array.isArray(s.members)) out.members = s.members.filter((m) => typeof m === 'string').slice(0, GROUP_MAX);
      return out;
    });
  };
  const roster: Roster = { catalogue: slug, selections: clean(sent.selections, 0) };
  // every selection must sit where the catalogue offers it
  const offered = (list: Selection[], parent: Selection | null) => {
    const here = reachable(b, parent ? nodeOf(b, parent.entry)! : null);
    for (const s of list) { if (!here.has(s.entry)) throw new LedgerError(`${nodeOf(b, s.entry)?.name ?? 'Something'} is not offered where it stands on the roster.`); offered(s.children, s); }
  };
  offered(roster.selections, null);
  return roster;
}

// ───────────────────────── writing the warriors back onto the record ─────────────────────────

/** Each warrior's numbers, from the roster onto their row: their kind, rank, statline, gear, skills, old wounds, experience. */
async function project(b: Bundle, roster: Roster): Promise<void> {
  for (const w of warriorsOf(b, roster)) for (const id of w.members) {
    await db().update(members).set({
      role: w.type.slice(0, 60), rank: w.kind === 'hero' ? 'hero' : 'henchman', stats: w.stats, equipment: w.equipment.slice(0, 30),
      skills: w.skills.slice(0, 30), injuries: w.injuries.slice(0, 30), experience: w.experience, updatedAt: new Date(),
    }).where(eq(members.id, id));
  }
}

/** Give every hero and group without warriors its rows on the record, named as the builder named them. */
async function attachMembers(b: Bundle, warbandId: string, roster: Roster, names: Record<string, string[]>, known: Set<string>): Promise<string[]> {
  const created: string[] = [];
  for (const w of warriorsOf(b, roster)) {
    const s = findSelection(roster.selections, w.id)!;
    const have = (s.members ?? []).filter((id) => known.has(id));
    const want = w.kind === 'henchmen' && !w.promoted ? w.count : 1;
    const given = names[w.id] ?? [];
    for (let i = have.length; i < want; i++) {
      const name = (given[i] ?? '').trim().slice(0, 80) || (want > 1 ? `${w.type} ${i + 1}` : w.type);
      const id = await insertMemberRow(warbandId, name, w.kind === 'hero' ? 'hero' : 'henchman', w.type);
      have.push(id); created.push(id); known.add(id);
    }
    s.members = have.slice(0, want);
  }
  return created;
}

async function log(warbandId: string, actor: Actor, line: { kind: string; gold?: number; shards?: number; text: string; before?: Roster | null; created?: string[]; dead?: string[]; scenarioId?: string | null }): Promise<void> {
  await db().insert(warbandLog).values({
    warbandId, kind: line.kind, gold: line.gold ?? 0, shards: line.shards ?? 0, text: line.text.slice(0, 500), before: line.before ?? null,
    members: line.created?.length || line.dead?.length ? { created: line.created ?? [], dead: line.dead ?? [] } : null,
    scenarioId: line.scenarioId ?? null, authorId: actor.id, authorName: actor.name,
  });
}

/** Save a changed roster against the version it was read at; refused if it changed meanwhile. */
async function save(warbandId: string, version: number, roster: Roster): Promise<void> {
  const out = await db().update(warbands).set({ roster, version: version + 1, updatedAt: new Date() }).where(and(eq(warbands.id, warbandId), eq(warbands.version, version))).returning({ id: warbands.id });
  if (!out.length) throw new LedgerError('The roster was changed elsewhere meanwhile; it has been brought up to date. Try again.', 409);
}

// ───────────────────────── founding and drawing up ─────────────────────────

export interface FoundInput { name: string; player?: string; roster: Roster; names: Record<string, string[]> }

/** Found a warband from the builder: the roster as sent, its warriors on the record, 500 crowns in and the rest in the stash. */
export async function foundWarband(actor: Actor, input: FoundInput): Promise<Warband> {
  await ensureSeeded();
  if (!isGm(actor) && (await ownWarband(actor.id))) throw new LedgerError('You already keep a warband. Give it up before founding another.', 409);
  const slug = input.roster?.catalogue;
  const b = bundleOrRefuse(slug);
  const roster = checkSent(b, slug, input.roster);
  walk(roster.selections, (s) => { delete s.members; });
  const s = summarise(b, roster);
  if (s.errors.length) throw new LedgerError(s.errors[0]);
  if (s.spent > STARTING_GOLD) throw new LedgerError(`The roster costs ${s.spent} crowns; a warband is founded with ${STARTING_GOLD}.`);
  if (stashItems(b, roster).length) throw new LedgerError('A new warband’s stash holds only the crowns it did not spend.');
  if (!s.warriors.length) throw new LedgerError('A warband needs its warriors.');
  const { createWarband } = await import('./roster.ts');
  const w = await createWarband(actor, { name: input.name, type: b.catalogue.title ?? b.catalogue.name, player: input.player });
  await attachMembers(b, w.id, roster, input.names ?? {}, new Set());
  await db().update(warbands).set({ roster, version: w.version + 1, updatedAt: new Date() }).where(eq(warbands.id, w.id));
  await project(b, roster);
  await log(w.id, actor, { kind: 'found', gold: STARTING_GOLD - s.spent, text: `Founded with ${STARTING_GOLD} crowns: ${s.spent} spent on ${s.size} warriors and their gear, ${STARTING_GOLD - s.spent} put in the stash.` });
  return (await getWarband(w.id))!;
}

/** A roster drawn up from the warband's written record, for the keeper to correct and confirm. */
export async function proposalFor(warbandId: string): Promise<Proposal & { catalogue: string }> {
  const w = await getWarband(warbandId);
  if (!w) throw new LedgerError('No such warband has entered the gates.', 404);
  const slug = catalogueForType(w.type);
  if (!slug) throw new LedgerError(`The builder has no catalogue for ${w.type}. A game master may change the warband’s kind to one it has.`);
  const p = propose(bundleOrRefuse(slug), slug, w.members.map((m) => ({ ...m, experience: m.experience ?? undefined })), randomId);
  return { ...p, catalogue: slug };
}

/**
 * Confirm a warband's roster drawn up from its record. Every selection's warriors must be this warband's, each once;
 * a hero or group the keeper added gets new warriors on the record. The stash opens with the gold the keeper names.
 */
export async function drawUp(actor: Actor, warbandId: string, input: { roster: Roster; names?: Record<string, string[]>; gold: number; shards?: number }): Promise<KeepView> {
  const w = await row(warbandId);
  mayKeep(actor, w);
  if (w.roster) throw new LedgerError('The warband’s roster is kept already.', 409);
  const slug = catalogueForType(w.type);
  if (!slug || input.roster?.catalogue !== slug) throw new LedgerError('The roster is for another kind of warband.');
  const b = bundleOrRefuse(slug);
  const roster = checkSent(b, slug, input.roster);
  if (!Number.isInteger(input.gold) || input.gold < 0 || input.gold > 100000) throw new LedgerError('The stash’s gold is a whole number of crowns.');
  const own = new Set((await db().select({ id: members.id, dead: members.dead }).from(members).where(eq(members.warbandId, warbandId))).filter((m) => !m.dead).map((m) => m.id));
  const seen = new Set<string>();
  walk(roster.selections, (s) => {
    for (const id of s.members ?? []) {
      if (!own.has(id)) throw new LedgerError('The roster names a warrior who is not one of theirs, or not living.');
      if (seen.has(id)) throw new LedgerError('A warrior stands twice on the roster.');
      seen.add(id);
    }
  });
  const created = await attachMembers(b, warbandId, roster, input.names ?? {}, own);
  await save(warbandId, w.version, roster);
  await project(b, roster);
  const left = [...own].filter((id) => !seen.has(id) && !created.includes(id));
  await log(warbandId, actor, { kind: 'drawn', gold: input.gold, shards: Math.max(0, input.shards ?? 0), text: `The roster drawn up from the record, with ${input.gold} crowns in the stash${left.length ? `; ${left.length} warrior${left.length === 1 ? '' : 's'} left off it, written by hand` : ''}.` });
  await touch(warbandId);
  return keepView(warbandId);
}

/** Put a warband back to a hand-written roster. Game masters only; the log is kept, struck. */
export async function dropRoster(actor: Actor, warbandId: string): Promise<KeepView> {
  if (!isGm(actor)) throw new LedgerError('Only a game master puts a roster back in the record’s hands.', 403);
  await row(warbandId);
  await db().update(warbands).set({ roster: null, version: sql`${warbands.version} + 1`, updatedAt: new Date() }).where(eq(warbands.id, warbandId));
  await db().update(warbandLog).set({ struck: true }).where(eq(warbandLog.warbandId, warbandId));
  return keepView(warbandId);
}

// ───────────────────────── between games ─────────────────────────

interface Loaded { w: WarbandRow; b: Bundle; roster: Roster; gold: number; shards: number }
async function loadKept(actor: Actor, warbandId: string, version: number): Promise<Loaded> {
  const w = await row(warbandId);
  mayKeep(actor, w);
  if (!w.roster) throw new LedgerError('The warband’s roster is still written by hand. Draw it up first.', 409);
  if (w.version !== version) throw new LedgerError('The roster was changed elsewhere meanwhile; it has been brought up to date. Try again.', 409);
  const roster = w.roster as Roster;
  const b = bundleOrRefuse(roster.catalogue);
  return { w, b, roster, ...(await sums(warbandId)) };
}

/** Gear moves only between games: never while a game the warband is fighting has begun and is not yet played. */
async function betweenGames(warbandId: string): Promise<void> {
  const { scenarioWarbands } = await import('../db/schema.ts');
  const live = await db().select({ title: scenarios.title }).from(scenarios).innerJoin(scenarioWarbands, eq(scenarioWarbands.scenarioId, scenarios.id))
    .where(and(eq(scenarioWarbands.warbandId, warbandId), eq(scenarios.status, 'upcoming'), sql`${scenarios.turn} > 0`)).limit(1);
  if (live.length) throw new LedgerError(`${live[0].title} is being fought; gear changes hands between games.`, 409);
}

const worth = (b: Bundle, roster: Roster): number => summarise(b, roster).spent;
const nameOfSel = (b: Bundle, roster: Roster, id: string) => evaluate(b, roster).byId.get(id)?.name ?? nodeOf(b, findSelection(roster.selections, id)?.entry ?? '')?.name ?? 'it';

type Kind = 'warrior' | 'model' | 'gear' | 'experience' | 'stash' | 'stash-item' | 'other' | 'config';
function kindOf(b: Bundle, roster: Roster, id: string): { kind: Kind; warrior?: Warrior } {
  const warriors = warriorsOf(b, roster);
  const stash = stashOf(b, roster);
  if (stash?.id === id) return { kind: 'stash' };
  if (stash && stash.children.some((c) => c.id === id)) return { kind: 'stash-item' };
  const w = warriors.find((x) => x.id === id);
  if (w) return { kind: 'warrior', warrior: w };
  const owner = warriors.find((x) => { let found = false; walk([findSelection(roster.selections, x.id)!], (s) => { if (s.id === id) found = true; }); return found; });
  if (!owner) return { kind: 'config' };
  if (owner.modelId === id) return { kind: 'model', warrior: owner };
  if (owner.experienceId === id) return { kind: 'experience', warrior: owner };
  if (owner.gear.some((g) => g.id === id)) return { kind: 'gear', warrior: owner };
  return { kind: 'other', warrior: owner };
}
const whoOf = (names: Map<string, string>, w: Warrior | undefined) => (w ? (w.members.map((m) => names.get(m)).filter(Boolean).join(', ') || w.type) : 'the warband');
async function memberNames(warbandId: string): Promise<Map<string, string>> {
  return new Map((await db().select({ id: members.id, name: members.name }).from(members).where(eq(members.warbandId, warbandId))).map((m) => [m.id, m.name]));
}

/** Where an item can go in the stash: the stash's own option for the same thing. */
function stashSlotFor(b: Bundle, roster: Roster, target: string): string | undefined {
  const stash = stashOf(b, roster);
  if (!stash) return undefined;
  const roots = place(b, roster);
  const o = flatOptions(optionsUnder(b, roots, findPlaced(roots, stash.id) ?? null)).find((x) => !x.hidden && nodeOf(b, x.id)?.target === target);
  return o?.id;
}
/** Put one or more of an item into the stash, joining what is there already. */
function intoStash(b: Bundle, roster: Roster, entry: string, count: number, children: Selection[] = []): Roster {
  const stash = stashOf(b, roster)!;
  const r = structuredClone(roster);
  const s = findSelection(r.selections, stash.id)!;
  const same = !children.length && s.children.find((c) => c.entry === entry && c.children.length === 0);
  if (same) same.count += count; else s.children.push({ id: randomId(), entry, count, children: structuredClone(children) });
  return r;
}

/**
 * Change a kept roster. What it costs or earns is reckoned from the roster before and after: gear taken from a
 * warrior's own list is paid for from the stash at its list price; skills, advances, old wounds and experience cost
 * nothing; gear taken off a warrior goes into the stash. A warrior is hired, a henchman recruited and a warrior lost
 * by their own calls, which name them. A game master may make any change free of charge.
 */
export async function changeRoster(actor: Actor, warbandId: string, version: number, op: Op, free = false): Promise<KeepView> {
  const k = await loadKept(actor, warbandId, version);
  const { b, roster } = k;
  if (free && !isGm(actor)) throw new LedgerError('Only a game master changes a roster free of charge.', 403);
  const names = await memberNames(warbandId);
  let next: Roster, gold = 0, text: string, kind = 'change';
  try {
    if (op.kind === 'add') {
      if (op.parent === null) throw new LedgerError('Hire a warrior by name, from the hiring list.');
      const target = kindOf(b, roster, op.parent);
      if (target.kind === 'stash' || target.kind === 'stash-item') throw new LedgerError('The stash is filled from the trading post and from the warriors.');
      ({ roster: next } = applyOp(b, roster, op, randomId));
      const who = whoOf(names, kindOf(b, next, op.parent).warrior);
      const added = (findSelection(next.selections, op.parent)?.children ?? []).at(-1);
      const what = added ? nameOfSel(b, next, added.id) : 'it';
      const delta = worth(b, next) - worth(b, roster);
      if (delta > 0 && !free) { await betweenGames(warbandId); gold = -delta; kind = 'buy'; text = `Bought ${what} for ${who}: ${delta} crowns.`; }
      else { text = `${what} for ${who}.`; kind = 'advance'; }
    } else if (op.kind === 'count') {
      const t = kindOf(b, roster, op.id);
      const sel = findSelection(roster.selections, op.id);
      if (!sel) throw new LedgerError('That is not on the roster.');
      if (t.kind === 'model' && !free) throw new LedgerError(op.count > sel.count ? 'Recruit a henchman by name.' : 'A henchman leaves the group when lost or dismissed, by name.');
      next = setCount(roster, op.id, op.count);
      if (t.kind === 'experience') { kind = 'experience'; text = `${whoOf(names, t.warrior)}: ${op.count > sel.count ? `+${op.count - sel.count}` : op.count - sel.count} experience, ${op.count} in all.`; }
      else text = `${nameOfSel(b, roster, op.id)}: ${op.count} now.`;
      const delta = worth(b, next) - worth(b, roster);
      if (delta > 0 && !free && t.kind !== 'experience') { gold = -delta; kind = 'buy'; text += ` ${delta} crowns.`; }
    } else if (op.kind === 'remove') {
      const t = kindOf(b, roster, op.id);
      const sel = findSelection(roster.selections, op.id);
      if (!sel) throw new LedgerError('That is not on the roster.');
      if (t.kind === 'warrior') return dismiss(actor, k, op.id, names);
      if (t.kind === 'stash' || t.kind === 'config' || t.kind === 'model') throw new LedgerError('That stays on the roster.');
      if (t.kind === 'gear') {
        await betweenGames(warbandId);
        const node = nodeOf(b, sel.entry)!;
        const slot = stashSlotFor(b, roster, node.target);
        const what = nameOfSel(b, roster, op.id);
        const n = t.warrior?.kind === 'henchmen' && !t.warrior.promoted ? t.warrior.count : sel.count;
        next = removeSelection(roster, op.id);
        if (slot && !/^free dagger$/i.test(node.name)) { next = intoStash(b, next, slot, n, sel.children); kind = 'move'; text = `${n > 1 ? `${n} × ${what}` : what} from ${whoOf(names, t.warrior)} to the stash.`; }
        else { kind = 'discard'; text = `${what} taken from ${whoOf(names, t.warrior)}.`; }
      } else if (t.kind === 'stash-item') {
        next = removeSelection(roster, op.id); kind = 'discard'; text = `${nameOfSel(b, roster, op.id)} thrown out of the stash.`;
      } else { next = removeSelection(roster, op.id); kind = 'advance'; text = `${nameOfSel(b, roster, op.id)} struck from ${whoOf(names, t.warrior)}.`; }
    } else {
      throw new LedgerError('Move gear through the stash.');
    }
  } catch (e) {
    if (e instanceof RosterError) throw new LedgerError(e.message);
    throw e;
  }
  if (free && gold) { text += ' (free of charge, by a game master)'; gold = 0; }
  if (gold < 0 && k.gold + gold < 0) throw new LedgerError(`The stash holds ${k.gold} crowns; that costs ${-gold}.`);
  await save(warbandId, version, next);
  await project(b, next);
  await log(warbandId, actor, { kind, gold, text, before: roster });
  return keepView(warbandId);
}

/** Strike a warrior from the roster before they have fought: their gear goes to the stash, their row off the record. */
async function dismiss(actor: Actor, k: Loaded, id: string, names: Map<string, string>): Promise<KeepView> {
  const { b, roster, w } = k;
  const warrior = warriorsOf(b, roster).find((x) => x.id === id)!;
  for (const m of warrior.members) {
    const fought = await db().select({ id: scenarioMembers.scenarioId }).from(scenarioMembers).innerJoin(scenarios, eq(scenarios.id, scenarioMembers.scenarioId)).where(and(eq(scenarioMembers.memberId, m), eq(scenarios.status, 'played'))).limit(1);
    if (fought.length) throw new LedgerError(`${names.get(m) ?? 'They'} fought in a recorded battle; the archives keep them. Mark them fallen on the muster roll instead.`, 409);
  }
  let next = roster;
  const n = warrior.kind === 'henchmen' && !warrior.promoted ? warrior.count : 1;
  for (const g of warrior.gear) { const slot = stashSlotFor(b, next, g.target); if (slot && !/^free dagger$/i.test(g.name)) next = intoStash(b, next, slot, n * g.count); }
  next = removeSelection(next, id);
  await save(w.id, w.version, next);
  await db().delete(scenarioMembers).where(sql`${scenarioMembers.memberId} in ${warrior.members.length ? warrior.members : ['']}`);
  for (const m of warrior.members) await db().delete(members).where(eq(members.id, m));
  await project(b, next);
  await log(w.id, actor, { kind: 'dismiss', text: `${whoOf(names, warrior)} dismissed; their gear put in the stash.`, before: roster });
  return keepView(w.id);
}

/** Hire a hero or a new group of henchmen, named; paid for from the stash at the catalogue's price. */
export async function hire(actor: Actor, warbandId: string, version: number, entry: string, names: string[]): Promise<KeepView> {
  const k = await loadKept(actor, warbandId, version);
  const { b, roster } = k;
  let next: Roster, id: string;
  try { ({ roster: next, id } = addSelection(b, roster, null, entry, randomId)); } catch (e) { throw new LedgerError((e as Error).message); }
  const w = warriorsOf(b, next).find((x) => x.id === id);
  if (!w) throw new LedgerError('Only warriors are hired.');
  const want = Math.min(GROUP_MAX, Math.max(1, w.kind === 'henchmen' ? names.length || 1 : 1));
  if (w.modelId && want > 1) next = setCount(next, w.modelId, want);
  const s = summarise(b, next);
  const tooMany = s.errors.find((e) => /no more than|may field|may have/.test(e) && !summarise(b, roster).errors.includes(e));
  if (tooMany) throw new LedgerError(tooMany);
  const cost = worth(b, next) - worth(b, roster);
  if (cost > k.gold) throw new LedgerError(`The stash holds ${k.gold} crowns; ${w.type} cost ${cost}.`);
  const created = await attachMembers(b, warbandId, next, { [id]: names }, new Set());
  await save(warbandId, version, next);
  await project(b, next);
  const label = (await memberNames(warbandId));
  await log(warbandId, actor, { kind: 'hire', gold: -cost, text: `Hired ${created.map((m) => label.get(m)).join(', ')} (${w.type}) for ${cost} crowns.`, before: roster, created });
  return keepView(warbandId);
}

/** One more henchman for a group, named and armed as the group is; paid for from the stash. */
export async function recruit(actor: Actor, warbandId: string, version: number, groupId: string, name: string): Promise<KeepView> {
  const k = await loadKept(actor, warbandId, version);
  const { b, roster } = k;
  const w = warriorsOf(b, roster).find((x) => x.id === groupId);
  if (!w || w.kind !== 'henchmen' || w.promoted || !w.modelId) throw new LedgerError('Recruits join a group of henchmen.');
  if (w.count >= GROUP_MAX) throw new LedgerError(`A henchman group is no more than ${GROUP_MAX}.`);
  const next = setCount(roster, w.modelId, w.count + 1);
  const s = summarise(b, next);
  const err = s.errors.find((e) => !summarise(b, roster).errors.includes(e));
  if (err) throw new LedgerError(err);
  const cost = worth(b, next) - worth(b, roster);
  if (cost > k.gold) throw new LedgerError(`The stash holds ${k.gold} crowns; a recruit with the group’s gear costs ${cost}.`);
  const sel = findSelection(next.selections, groupId)!;
  const id = await insertMemberRow(warbandId, name.trim() || `${w.type} ${w.count + 1}`, 'henchman', w.type);
  sel.members = [...(sel.members ?? []), id];
  await save(warbandId, version, next);
  await project(b, next);
  await log(warbandId, actor, { kind: 'hire', gold: -cost, text: `${name.trim() || 'A recruit'} joins the ${w.type}, armed as they are, for ${cost} crowns.`, before: roster, created: [id] });
  return keepView(warbandId);
}

/** Move an item from the stash to a warrior, or from a warrior to the stash. A group takes one for every warrior in it. */
export async function moveGear(actor: Actor, warbandId: string, version: number, itemId: string, to: string): Promise<KeepView> {
  const k = await loadKept(actor, warbandId, version);
  const { b, roster } = k;
  await betweenGames(warbandId);
  const from = kindOf(b, roster, itemId);
  if (from.kind === 'gear') return changeRoster(actor, warbandId, version, { kind: 'remove', id: itemId });
  if (from.kind !== 'stash-item') throw new LedgerError('Only gear moves between the stash and the warriors.');
  const item = findSelection(roster.selections, itemId)!;
  const node = nodeOf(b, item.entry)!;
  const names = await memberNames(warbandId);
  const warrior = warriorsOf(b, roster).find((w) => w.id === to);
  if (!warrior) throw new LedgerError('Gear goes to a warrior.');
  const need = warrior.kind === 'henchmen' && !warrior.promoted ? warrior.count : 1;
  if (item.count < need) throw new LedgerError(`The ${warrior.type} are ${need}; the stash has ${item.count} ${node.name}. A group is armed alike.`);
  // the first place under the warrior that offers the same thing: their own list, then the trading post's
  const places: { parent: string; entry: string }[] = [];
  const roots = place(b, roster);
  const visit = (pid: string, depth: number) => {
    const p = findPlaced(roots, pid)!;
    for (const o of flatOptions(optionsUnder(b, roots, p))) {
      if (o.hidden) continue;
      if (nodeOf(b, o.id)?.target === node.target && (o.left !== 0)) places.push({ parent: pid, entry: o.id });
    }
    for (const c of p.children) if (/^(Starting Equipment|Trading Post)/i.test(c.node.name) && depth < 2) visit(c.s.id, depth + 1);
  };
  visit(to, 0);
  // a container not yet taken: offer it, then look inside
  let next = removeSelection(roster, itemId);
  if (item.count > need) next = intoStash(b, next, item.entry, item.count - need, item.children);
  let placed = false;
  for (const pl of places) { try { next = moveSelectionInto(b, next, pl.parent, pl.entry, item, need); placed = true; break; } catch { /* the next place */ } }
  if (!placed) {
    for (const container of flatOptions(optionsUnder(b, place(b, next), findPlaced(place(b, next), to) ?? null)).filter((o) => !o.hidden && /^(Starting Equipment|Trading Post)/i.test(o.name))) {
      try {
        const r = addSelection(b, next, to, container.id, randomId);
        const inner = flatOptions(optionsUnder(b, place(b, r.roster), findPlaced(place(b, r.roster), r.id) ?? null)).find((o) => !o.hidden && nodeOf(b, o.id)?.target === node.target);
        if (!inner) continue;
        next = moveSelectionInto(b, r.roster, r.id, inner.id, item, need);
        placed = true; break;
      } catch { /* the next list */ }
    }
  }
  if (!placed) throw new LedgerError(`${node.name} is not on the ${warrior.type}’s lists.`);
  await save(warbandId, version, next);
  await project(b, next);
  await log(warbandId, actor, { kind: 'move', text: `${need > 1 ? `${need} × ${node.name}` : node.name} from the stash to ${whoOf(names, warrior)}.`, before: roster });
  return keepView(warbandId);
}
function moveSelectionInto(b: Bundle, roster: Roster, parent: string, entry: string, item: Selection, need: number): Roster {
  const { option } = optionAt(b, roster, parent, entry);
  if (option.left === 0) throw new RosterError('No room.');
  const r = structuredClone(roster);
  findSelection(r.selections, parent)!.children.push({ id: item.id, entry, count: 1, children: structuredClone(item.children) });
  return r;
}

/** Sell from the stash at the trading post where the campaign is. */
export async function sellItem(actor: Actor, warbandId: string, version: number, itemId: string, count: number): Promise<KeepView> {
  const k = await loadKept(actor, warbandId, version);
  const { b, roster } = k;
  await betweenGames(warbandId);
  if (kindOf(b, roster, itemId).kind !== 'stash-item') throw new LedgerError('Only what is in the stash is sold; put it there first.');
  const item = findSelection(roster.selections, itemId)!;
  if (!Number.isInteger(count) || count < 1 || count > item.count) throw new LedgerError(`The stash has ${item.count}.`);
  const post = await currentPost();
  const ev = evaluate(b, roster);
  const v = ev.byId.get(itemId)!;
  const node = nodeOf(b, item.entry)!;
  const each = saleOf(node.name, { gold: node.costs.points ?? 0, rarity: node.costs.rarity ?? 0 }, post?.lines ?? stockOf([])).value;
  const extra = (v.total.points ?? 0) - (v.each.points ?? 0) * item.count; // a Gromril blade's or the like's own worth
  const value = each * count + (count === item.count && extra > 0 ? Math.floor(extra / 2) : 0);
  const next = count === item.count ? removeSelection(roster, itemId) : setCount(roster, itemId, item.count - count);
  await save(warbandId, version, next);
  await project(b, next);
  await log(warbandId, actor, { kind: 'sell', gold: value, text: `Sold ${count > 1 ? `${count} × ${v.name}` : v.name} at ${post?.name ?? 'the trading post'}: ${value} crowns.`, before: roster });
  return keepView(warbandId);
}

/**
 * Buy at the trading post where the campaign is: an item the post has, at its price (the dice rolled at the table and
 * the total given, or the plain figure), into the stash.
 */
export async function buyItem(actor: Actor, warbandId: string, version: number, itemId: string, count: number, price: number): Promise<KeepView> {
  const k = await loadKept(actor, warbandId, version);
  const { b, roster } = k;
  await betweenGames(warbandId);
  const post = await currentPost();
  const line = post?.lines.find((l) => l.itemId === itemId && l.available);
  if (!line) throw new LedgerError(`${post?.name ?? 'The trading post'} does not have that to sell.`);
  if (!Number.isInteger(count) || count < 1 || count > 20) throw new LedgerError('Buy one at a time, or a few.');
  const { min, max } = priceRange(line.price);
  if (!Number.isInteger(price) || price < min || price > max) throw new LedgerError(min === max ? `${line.name} costs ${min} crowns here.` : `${line.name} costs between ${min} and ${max} crowns here, as the dice fall.`);
  const stash = stashOf(b, roster);
  if (!stash) throw new LedgerError('The warband has no stash.');
  const roots = place(b, roster);
  const slot = flatOptions(optionsUnder(b, roots, findPlaced(roots, stash.id) ?? null)).find((o) => !o.hidden && chartItemFor(nodeOf(b, o.id)?.name ?? '')?.item.id === itemId && (chartItemFor(nodeOf(b, o.id)?.name ?? '')?.multiplier ?? 1) === 1);
  if (!slot) throw new LedgerError(`${line.name} is not in this warband’s catalogue; a game master may enter it by hand.`);
  const total = price * count;
  if (total > k.gold) throw new LedgerError(`The stash holds ${k.gold} crowns; that costs ${total}.`);
  const next = intoStash(b, roster, slot.id, count);
  await save(warbandId, version, next);
  await log(warbandId, actor, { kind: 'buy', gold: -total, text: `Bought ${count > 1 ? `${count} × ${line.name}` : line.name} at ${post!.name}: ${total} crowns.`, before: roster });
  return keepView(warbandId);
}

/**
 * A warrior of a built warband has died: they leave the roster, a group one fewer, and what they carried is lost.
 * Called when the warrior is marked fallen on the muster roll; the row on the record stays, as the dead do.
 */
export async function dropFromRoster(actor: Actor, warbandId: string, memberId: string, scenarioId: string | null = null): Promise<void> {
  const w = await row(warbandId);
  if (!w.roster) return;
  const roster = w.roster as Roster;
  const b = bundleOrRefuse(roster.catalogue);
  const warrior = warriorsOf(b, roster).find((x) => x.members.includes(memberId));
  if (!warrior) return;
  let next: Roster;
  if (warrior.kind === 'henchmen' && !warrior.promoted && warrior.count > 1 && warrior.modelId) {
    next = setCount(roster, warrior.modelId, warrior.count - 1);
    const s = findSelection(next.selections, warrior.id)!;
    s.members = (s.members ?? []).filter((m) => m !== memberId);
  } else next = removeSelection(roster, warrior.id);
  await save(warbandId, w.version, next);
  await project(b, next);
  const name = (await memberNames(warbandId)).get(memberId) ?? 'A warrior';
  await log(warbandId, actor, { kind: 'lost', text: `${name} fell; what they carried is lost.`, before: roster, dead: [memberId], scenarioId });
}

/** A warrior lost after a game: marked fallen on the record and gone from the roster with their gear. */
export async function loseWarrior(actor: Actor, warbandId: string, version: number, memberId: string, scenarioId: string | null = null): Promise<KeepView> {
  const k = await loadKept(actor, warbandId, version);
  if (!warriorsOf(k.b, k.roster).some((x) => x.members.includes(memberId))) throw new LedgerError('That warrior is not on the roster.');
  const today = new Date().toISOString().slice(0, 10);
  await db().update(members).set({ dead: true, death: { date: formatImperial(imperialForDate(today)), order: Date.now(), epitaph: '' }, updatedAt: new Date() }).where(eq(members.id, memberId));
  await dropFromRoster(actor, warbandId, memberId, scenarioId);
  return keepView(warbandId);
}

/** A henchman promoted: out of their group into one of their own, a hero from now on, their gear alike. */
export async function promote(actor: Actor, warbandId: string, version: number, memberId: string): Promise<KeepView> {
  const k = await loadKept(actor, warbandId, version);
  const { b, roster } = k;
  const warrior = warriorsOf(b, roster).find((x) => x.members.includes(memberId));
  if (!warrior || warrior.kind !== 'henchmen' || warrior.promoted) throw new LedgerError('Only a henchman is promoted.');
  const names = await memberNames(warbandId);
  let next = structuredClone(roster);
  const group = findSelection(next.selections, warrior.id)!;
  let own: Selection;
  if (warrior.count > 1 && warrior.modelId) {
    // the new hero's group: a copy of the old with one warrior in it, the old one fewer
    own = structuredClone(group);
    const fresh = (s: Selection) => { s.id = randomId(); s.children.forEach(fresh); };
    fresh(own);
    own.members = [memberId];
    const model = own.children.find((c) => nodeOf(b, c.entry)?.type === 'model');
    if (model) model.count = 1;
    group.members = (group.members ?? []).filter((m) => m !== memberId);
    const oldModel = group.children.find((c) => c.id === warrior.modelId)!;
    oldModel.count -= 1;
    next.selections.push(own);
  } else own = group;
  const promoted = flatOptions(optionsUnder(b, place(b, next), findPlaced(place(b, next), own.id) ?? null)).find((o) => /^Promoted$/i.test(o.name));
  if (!promoted) throw new LedgerError(`The ${warrior.type} cannot be promoted in this warband’s catalogue.`);
  next = addSelection(b, next, own.id, promoted.id, randomId).roster;
  const s = summarise(b, next);
  if (s.heroes > summarise(b, roster).heroes && s.errors.some((e) => /heroes/.test(e))) throw new LedgerError(s.errors.find((e) => /heroes/.test(e))!);
  await save(warbandId, version, next);
  await project(b, next);
  await log(warbandId, actor, { kind: 'advance', text: `${names.get(memberId) ?? 'A henchman'} is promoted: the lad’s got talent. A hero from now on.`, before: roster });
  return keepView(warbandId);
}

/** The rulebook's income: what so many shards of wyrdstone fetch, by how many warriors the warband has. */
export const WYRDSTONE_INCOME: number[][] = [
  // warriors:  1–3  4–6  7–9 10–12 13–15 16+
  [45, 40, 35, 30, 30, 25],
  [60, 55, 50, 45, 40, 35],
  [75, 70, 65, 60, 55, 50],
  [90, 80, 70, 65, 60, 55],
  [110, 100, 90, 80, 70, 65],
  [120, 110, 100, 90, 80, 70],
  [145, 130, 120, 110, 100, 90],
  [155, 140, 130, 120, 110, 100],
];
export function wyrdstoneIncome(shards: number, warriors: number): number {
  if (shards <= 0) return 0;
  const row = WYRDSTONE_INCOME[Math.min(shards, 8) - 1];
  const col = Math.min(5, Math.max(0, Math.ceil(Math.max(1, warriors) / 3) - 1));
  return row[col];
}

/**
 * What a game brought in: wyrdstone found (kept in the stash) and sold (at the rulebook's rate for the warband's size,
 * once a game), and gold found or paid. A game master may also correct the stash with a line of their own.
 */
export async function income(actor: Actor, warbandId: string, version: number, input: { found?: number; sold?: number; gold?: number; text?: string; scenarioId?: string | null }): Promise<KeepView> {
  const k = await loadKept(actor, warbandId, version);
  const found = Math.max(0, Math.floor(input.found ?? 0)), sold = Math.max(0, Math.floor(input.sold ?? 0)), extra = Math.floor(input.gold ?? 0);
  if (sold > k.shards + found) throw new LedgerError(`The stash holds ${k.shards + found} shards of wyrdstone.`);
  if (extra < 0 && !isGm(actor)) throw new LedgerError('Only a game master takes gold from the stash this way.', 403);
  if (!found && !sold && !extra) throw new LedgerError('Nothing came in.');
  const size = summarise(k.b, k.roster).size;
  const fetched = wyrdstoneIncome(sold, size);
  const gold = fetched + extra;
  if (k.gold + gold < 0) throw new LedgerError(`The stash holds ${k.gold} crowns.`);
  const parts = [found ? `${found} shard${found === 1 ? '' : 's'} of wyrdstone found` : '', sold ? `${sold} sold for ${fetched} crowns` : '', extra ? `${extra > 0 ? '+' : ''}${extra} crowns${input.text ? `: ${input.text.trim()}` : ''}` : ''].filter(Boolean);
  await log(warbandId, actor, { kind: extra && !found && !sold ? 'gold' : 'income', gold, shards: found - sold, text: `${parts.join('; ')}.`.replace(/^./, (c) => c.toUpperCase()), scenarioId: input.scenarioId ?? null });
  await db().update(warbands).set({ version: sql`${warbands.version} + 1`, updatedAt: new Date() }).where(eq(warbands.id, warbandId));
  return keepView(warbandId);
}

/** Strike the last line of the log and put the roster back as it stood before it. The keeper or a game master. */
export async function undoLast(actor: Actor, warbandId: string): Promise<KeepView> {
  const w = await row(warbandId);
  mayKeep(actor, w);
  const [last] = await db().select().from(warbandLog).where(and(eq(warbandLog.warbandId, warbandId), eq(warbandLog.struck, false))).orderBy(desc(warbandLog.id)).limit(1);
  if (!last || last.before == null) throw new LedgerError('There is nothing to take back.');
  const before = last.before as Roster;
  const b = bundleOrRefuse(before.catalogue);
  const touched = (last.members as { created?: string[]; dead?: string[] } | null) ?? {};
  for (const id of touched.created ?? []) {
    const fought = await db().select({ id: scenarioMembers.scenarioId }).from(scenarioMembers).where(eq(scenarioMembers.memberId, id)).limit(1);
    if (fought.length) throw new LedgerError('A warrior that line hired has fought since; it stands.', 409);
  }
  for (const id of touched.created ?? []) await db().delete(members).where(eq(members.id, id));
  for (const id of touched.dead ?? []) await db().update(members).set({ dead: false, death: null, updatedAt: new Date() }).where(eq(members.id, id));
  await db().update(warbandLog).set({ struck: true }).where(eq(warbandLog.id, last.id));
  if (last.before) {
    await db().update(warbands).set({ roster: before, version: sql`${warbands.version} + 1`, updatedAt: new Date() }).where(eq(warbands.id, warbandId));
    await project(b, before);
  }
  return keepView(warbandId);
}

/** The log of every built warband's stash, for the Watch House and the Fountain Post: gold and rating as the roster has them. */
export async function booksOf(): Promise<Record<string, { gold: number; rating: number }>> {
  const rows = await db().select({ id: warbands.id, roster: warbands.roster }).from(warbands).orderBy(asc(warbands.sort));
  const out: Record<string, { gold: number; rating: number }> = {};
  for (const r of rows) {
    if (!r.roster) continue;
    const roster = r.roster as Roster;
    const b = bundleFor(roster.catalogue);
    if (!b) continue;
    out[r.id] = { gold: (await sums(r.id)).gold, rating: summarise(b, roster).rating };
  }
  return out;
}

export { parentOf, moveSelection };
