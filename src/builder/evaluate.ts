/**
 * The builder's engine: a warband's roster read against its catalogue the way BattleScribe reads it. Pure and
 * deterministic, the same in the browser and on the server.
 *
 * A roster is a tree of selections: each names the catalogue node it was taken from (an entry or a link to one) and
 * how many, with the selections made under it. Groups are not selections; a selection remembers the groups it was
 * taken through, which the data's conditions ask about ("is this sword under the trading post?"). Evaluating a
 * roster gives every selection its name, costs, profiles and rules with the catalogue's modifiers applied, the totals,
 * and what the catalogue's constraints and error modifiers object to.
 *
 * Only what the Mordheim data uses is understood: the condition, constraint and modifier kinds that
 * `scripts/builder/normalise.mjs --check` reports. A rule BattleScribe cannot express (promotion, the advance tables,
 * the warband's size) is in `src/builder/rules.ts`.
 */
import { COST, nodeOf, type Bundle, type Condition, type ConditionGroup, type Constraint, type Modifier, type Node, type Profile } from './catalogue.ts';

export interface Selection {
  /** Unique within the roster, forever: the warband's log and its warriors point at it. */
  id: string;
  /** The node it was taken from: a link's id or an entry's. */
  entry: string;
  count: number;
  children: Selection[];
  /** The warrior this is, for a hero; the warriors it is, one per model, for a group of henchmen. */
  members?: string[];
}
export interface Roster {
  /** The warband's catalogue, by slug (`reiklanders`). */
  catalogue: string;
  selections: Selection[];
}

/** A selection placed in its tree. */
export interface Placed {
  s: Selection;
  node: Node;
  parent: Placed | null;
  /** The groups it was taken through under its parent: their node ids and their targets. */
  chain: string[];
  children: Placed[];
}

export interface ProfileView { name: string; type: string; typeName: string; chars: { id: string; name: string; value: string }[] }
export interface SelectionView {
  id: string;
  entry: string;
  target: string;
  name: string;
  type?: Node['type'];
  count: number;
  hidden: boolean;
  /** The cost of one, and of all of them with everything under them. */
  each: Record<string, number>;
  total: Record<string, number>;
  profiles: ProfileView[];
  rules: string[];
  categories: string[];
  /** The groups it was taken through, by name, innermost last. */
  groups: string[];
  children: SelectionView[];
  errors: string[];
}
export interface Evaluation {
  views: SelectionView[];
  byId: Map<string, SelectionView>;
  totals: Record<string, number>;
  errors: string[];
  warnings: string[];
}

// ───────────────────────── placing ─────────────────────────

const FORCE = null;
type Scope = Placed | null; // null is the force

/** Every entry under a node, through its groups, with the groups it is reached through. Memoised per node. */
const optionMemo = new WeakMap<Bundle, Map<string, Map<string, string[]>>>();
export function reachable(b: Bundle, parent: Node | null): Map<string, string[]> {
  let byBundle = optionMemo.get(b);
  if (!byBundle) { byBundle = new Map(); optionMemo.set(b, byBundle); }
  const key = parent?.id ?? '#force';
  const memo = byBundle.get(key);
  if (memo) return memo;
  const out = new Map<string, string[]>();
  const walk = (ids: string[], chain: string[]) => {
    for (const id of ids) {
      const n = nodeOf(b, id);
      if (!n) continue;
      if (n.kind === 'g') walk(n.children, [...chain, n.id, n.target]);
      else if (!out.has(n.id)) out.set(n.id, chain);
    }
  };
  walk(parent ? parent.children : rootsOf(b), []);
  byBundle.set(key, out);
  return out;
}

/** The entries a warband may take at its root: those whose category the force allows. */
export function rootsOf(b: Bundle): string[] {
  const allowed = new Set(b.force.categories.map((c) => c.target));
  return b.roots.filter((id) => { const n = nodeOf(b, id); return !!n && (n.categories.length === 0 || n.categories.some((c) => allowed.has(c))); });
}

export function place(b: Bundle, roster: Roster): Placed[] {
  const placeAll = (list: Selection[], parent: Placed | null): Placed[] => {
    const options = reachable(b, parent?.node ?? null);
    const out: Placed[] = [];
    for (const s of list) {
      const node = nodeOf(b, s.entry);
      if (!node) continue;
      const p: Placed = { s, node, parent, chain: options.get(s.entry) ?? [], children: [] };
      p.children = placeAll(s.children, p);
      out.push(p);
    }
    return out;
  };
  return placeAll(roster.selections, null);
}

const descendants = (p: Placed): Placed[] => p.children.flatMap((c) => [c, ...descendants(c)]);
const ancestors = (p: Placed | null): Placed[] => { const out: Placed[] = []; for (let a = p?.parent ?? null; a; a = a.parent) out.push(a); return out; };

// ───────────────────────── conditions ─────────────────────────

/** Where an entry is being read: the selection itself (or a stand-in for one not yet taken), under its parent. */
interface Ctx { self: Placed; parent: Scope; roots: Placed[]; b: Bundle }

function matches(p: Placed, childId: string): boolean {
  if (childId === 'any') return true;
  if (childId === p.node.type) return true;
  return p.node.id === childId || p.node.target === childId || p.chain.includes(childId) || p.node.categories.includes(childId);
}
function isInstance(p: Placed, id: string): boolean {
  return p.node.id === id || p.node.target === id || p.chain.includes(id) || p.node.categories.includes(id);
}

/** The selection a scope names, from where the entry stands. */
function scopeOf(scope: string, ctx: Ctx): Scope | undefined {
  switch (scope) {
    case 'self': return ctx.self;
    case 'parent': return ctx.parent;
    case 'force': case 'roster': case 'primary-catalogue': return FORCE;
    case 'root-entry': { let p: Placed = ctx.self; while (p.parent) p = p.parent; return p; }
    case 'model': case 'unit': { for (let p: Placed | null = ctx.self; p; p = p.parent) if (p.node.type === scope) return p; return undefined; }
    default: { for (let p: Placed | null = ctx.self; p; p = p.parent) if (p.node.id === scope || p.node.target === scope) return p; return undefined; }
  }
}

function countIn(scope: Scope, childId: string, field: string, inc: boolean, ctx: Ctx): number {
  const all = () => ctx.roots.flatMap((r) => [r, ...descendants(r)]);
  const pool = scope === FORCE ? (inc ? all() : ctx.roots) : (inc ? descendants(scope) : scope.children);
  let n = 0;
  for (const p of pool) {
    if (!matches(p, childId)) continue;
    n += field === 'selections' ? p.s.count : (p.node.costs[field] ?? 0) * p.s.count;
  }
  return n;
}

function holds(c: Condition, ctx: Ctx): boolean {
  if (c.type === 'instanceOf' || c.type === 'notInstanceOf') {
    let found: boolean;
    if (c.scope === 'force' || c.scope === 'roster' || c.scope === 'primary-catalogue') found = c.childId === ctx.b.catalogue.id || ctx.b.catalogue.links.includes(c.childId);
    else if (c.scope === 'ancestor') found = ancestors(ctx.self).some((a) => isInstance(a, c.childId));
    else { const s = scopeOf(c.scope, ctx); found = !!s && isInstance(s, c.childId); }
    return c.type === 'instanceOf' ? found : !found;
  }
  const s = c.scope === 'ancestor' ? ctx.parent : scopeOf(c.scope, ctx);
  const n = s === undefined ? 0 : countIn(s, c.childId, c.field, !!c.inc, ctx);
  switch (c.type) {
    case 'atLeast': return n >= c.value;
    case 'atMost': return n <= c.value;
    case 'equalTo': return n === c.value;
    case 'notEqualTo': return n !== c.value;
    case 'greaterThan': return n > c.value;
    case 'lessThan': return n < c.value;
  }
}
function groupHolds(g: ConditionGroup, ctx: Ctx): boolean {
  const results = [...(g.conditions ?? []).map((c) => holds(c, ctx)), ...(g.groups ?? []).map((x) => groupHolds(x, ctx))];
  return g.type === 'or' ? results.some(Boolean) : results.every(Boolean);
}
/** How many times a modifier applies: once if its conditions hold, or as often as its repeats count; 0 if not at all. */
function timesOf(m: Modifier, ctx: Ctx): number {
  if (!(m.conditions ?? []).every((c) => holds(c, ctx))) return 0;
  if (!(m.groups ?? []).every((g) => groupHolds(g, ctx))) return 0;
  if (!m.repeats?.length) return 1;
  let times = 0;
  for (const r of m.repeats) {
    const s = scopeOf(r.scope, ctx);
    const n = s === undefined ? 0 : countIn(s, r.childId, r.field, !!r.inc, ctx);
    const per = r.value || 1;
    times += (r.roundUp ? Math.ceil(n / per) : Math.floor(n / per)) * (r.repeats || 1);
  }
  return times;
}

const numeric = (op: Modifier['type'], current: number, value: number, times: number): number => {
  switch (op) {
    case 'set': return value;
    case 'increment': return current + value * times;
    case 'decrement': return current - value * times;
    case 'multiply': return current * value ** times;
    case 'divide': return value ? Math.floor(current / value ** times) : current;
    default: return current;
  }
};

// ───────────────────────── reading one entry where it stands ─────────────────────────

export interface EntryState {
  name: string;
  hidden: boolean;
  costs: Record<string, number>;
  /** Each constraint's value after the modifiers. */
  limits: Map<string, number>;
  errors: string[];
  warnings: string[];
  categories: string[];
  /** Words to put before the parent's name ("Gromril"). */
  parentPrefix: string[];
}

export function readEntry(b: Bundle, node: Node, ctx: Ctx): EntryState {
  const st: EntryState = { name: node.name, hidden: node.hidden, costs: { ...node.costs }, limits: new Map(node.constraints.map((c) => [c.id, c.value])), errors: [], warnings: [], categories: [...node.categories], parentPrefix: [] };
  for (const m of node.modifiers) {
    const times = timesOf(m, ctx);
    if (!times) continue;
    const v = Number(m.value);
    if (m.field === 'hidden') { if (m.type === 'set') st.hidden = m.value === 'true'; }
    else if (m.field === 'name') {
      if (m.scope === 'parent') { if (m.type === 'prepend') st.parentPrefix.push(m.value); continue; }
      st.name = m.type === 'set' ? m.value : m.type === 'prepend' ? `${m.value} ${st.name}` : m.type === 'append' ? `${st.name} ${m.value}` : st.name;
    } else if (m.field === 'error' || m.field === 'warning') (m.field === 'error' ? st.errors : st.warnings).push(m.value);
    else if (m.field === 'category') { if (m.type === 'add' && !st.categories.includes(m.value)) st.categories.push(m.value); if (m.type === 'remove') st.categories = st.categories.filter((c) => c !== m.value); }
    else if (st.limits.has(m.field)) st.limits.set(m.field, numeric(m.type, st.limits.get(m.field)!, v, times));
    else if (m.field === COST.gold || m.field === COST.rating || m.field === COST.rarity || b.system.costTypes.some((c) => c.id === m.field)) st.costs[m.field] = numeric(m.type, st.costs[m.field] ?? 0, v, times);
  }
  return st;
}

function readProfile(b: Bundle, p: Profile, ctx: Ctx): ProfileView {
  const type = b.system.profileTypes[p.type];
  const chars = new Map(Object.entries(p.chars));
  for (const m of p.modifiers ?? []) {
    if (!chars.has(m.field)) continue;
    const times = timesOf(m, ctx);
    if (!times) continue;
    const current = chars.get(m.field)!;
    const n = parseInt(current, 10);
    if (m.type === 'set') chars.set(m.field, m.value);
    else if (!Number.isNaN(n) && /^-?\d+$/.test(current.trim())) chars.set(m.field, String(numeric(m.type, n, Number(m.value), times)));
    else if (m.type === 'append') chars.set(m.field, `${current} ${m.value}`);
    else if (m.type === 'prepend') chars.set(m.field, `${m.value} ${current}`);
  }
  return { name: p.name, type: p.type, typeName: type?.name ?? '', chars: (type?.chars ?? Object.keys(p.chars).map((id) => ({ id, name: id }))).map((c) => ({ id: c.id, name: c.name, value: chars.get(c.id) ?? '' })) };
}

// ───────────────────────── the whole roster ─────────────────────────

const add = (a: Record<string, number>, b: Record<string, number>, times = 1) => { for (const [k, v] of Object.entries(b)) a[k] = (a[k] ?? 0) + v * times; };

export function evaluate(b: Bundle, roster: Roster): Evaluation {
  const roots = place(b, roster);
  const byId = new Map<string, SelectionView>();
  const errors: string[] = [], warnings: string[] = [];

  const view = (p: Placed): SelectionView => {
    const ctx: Ctx = { self: p, parent: p.parent, roots, b };
    const st = readEntry(b, p.node, ctx);
    const children = p.children.map(view);
    const prefix = p.children.flatMap((c) => readEntry(b, c.node, { self: c, parent: p, roots, b }).parentPrefix);
    const total: Record<string, number> = {};
    add(total, st.costs, p.s.count);
    for (const c of children) add(total, c.total);
    const v: SelectionView = {
      id: p.s.id, entry: p.node.id, target: p.node.target, name: [...prefix, st.name].join(' '), type: p.node.type, count: p.s.count, hidden: st.hidden,
      each: st.costs, total, profiles: p.node.profiles.filter((x) => !x.hidden).map((x) => readProfile(b, x, ctx)), rules: p.node.rules.map((r) => b.rules[r]?.name).filter((x): x is string => !!x),
      categories: st.categories, groups: p.chain.filter((_, i) => i % 2 === 0).map((id) => nodeOf(b, id)?.name ?? ''), children, errors: st.errors,
    };
    for (const e of st.errors) errors.push(e);
    for (const w of st.warnings) warnings.push(w);
    byId.set(v.id, v);
    return v;
  };
  const views = roots.map(view);
  const totals: Record<string, number> = {};
  for (const v of views) add(totals, v.total);

  // the constraints, under every parent: the force, then each selection
  const checkUnder = (parent: Placed | null) => {
    for (const o of optionsUnder(b, roots, parent)) for (const problem of o.problems) errors.push(problem);
    for (const c of parent ? parent.children : roots) checkUnder(c);
  };
  checkUnder(null);
  // the force's own categories: a warband needs its leader's category, its configuration
  for (const fc of b.force.categories) for (const c of fc.constraints ?? []) {
    const n = roots.filter((r) => r.node.categories.includes(fc.target)).reduce((s, r) => s + r.s.count, 0);
    if (c.type === 'min' && n < c.value) errors.push(c.value === 1 ? `The warband needs one of its ${fc.name.toLowerCase()}.` : `The warband needs at least ${c.value} ${fc.name.toLowerCase()}.`);
    if (c.type === 'max' && c.value >= 0 && n > c.value) errors.push(`The warband may have no more than ${c.value} ${fc.name.toLowerCase()}.`);
  }
  return { views, byId, totals, errors: [...new Set(errors)], warnings: [...new Set(warnings)] };
}

// ───────────────────────── what may be taken ─────────────────────────

export interface OptionView {
  kind: 'entry' | 'group';
  /** The node's id, as a selection would name it. */
  id: string;
  name: string;
  type?: Node['type'];
  hidden: boolean;
  /** The cost of one more, where it would stand. */
  each: Record<string, number>;
  /** How many are taken now, under this parent (for a group: all its entries together). */
  count: number;
  min: number;
  /** -1 for no limit. */
  max: number;
  /** How many more may be taken here, the warband's own limits counted too; -1 for no limit. */
  left: number;
  children: OptionView[];
  problems: string[];
}

/** A stand-in for a selection not yet made, so its own conditions can be read. */
function standIn(node: Node, parent: Placed | null, chain: string[]): Placed {
  return { s: { id: '#new', entry: node.id, count: 1, children: [] }, node, parent, chain, children: [] };
}

function limitOf(cs: Constraint[], limits: Map<string, number>, type: 'min' | 'max', scope: (c: Constraint) => boolean): number {
  let out = type === 'max' ? -1 : 0;
  for (const c of cs) {
    if (c.type !== type || c.field !== 'selections' || !scope(c)) continue;
    const v = limits.get(c.id) ?? c.value;
    if (type === 'max') { if (v >= 0 && (out < 0 || v < out)) out = v; } else if (v > out) out = v;
  }
  return out;
}

/** The options under a parent (the force when null), as the catalogue offers them there, with what is taken. */
export function optionsUnder(b: Bundle, roots: Placed[], parent: Placed | null): OptionView[] {
  const taken = parent ? parent.children : roots;
  const allSel = () => roots.flatMap((r) => [r, ...descendants(r)]);
  const build = (ids: string[], chain: string[]): OptionView[] => {
    const out: OptionView[] = [];
    for (const id of ids) {
      const n = nodeOf(b, id);
      if (!n) continue;
      if (parent === null && chain.length === 0 && !rootsOf(b).includes(id)) continue;
      const mine = taken.filter((t) => (n.kind === 'g' ? t.chain.includes(n.id) : t.node.id === n.id));
      const self = mine[0] ?? standIn(n, parent, chain);
      const st = readEntry(b, n, { self, parent, roots, b });
      const children = n.kind === 'g' ? build(n.children, [...chain, n.id, n.target]) : [];
      const count = n.kind === 'g' ? mine.reduce((s, t) => s + t.s.count, 0) : mine.reduce((s, t) => s + t.s.count, 0);
      const inParent = (c: Constraint) => c.scope === 'parent';
      const min = limitOf(n.constraints, st.limits, 'min', inParent);
      const max = limitOf(n.constraints, st.limits, 'max', inParent);
      const problems: string[] = [];
      const name = st.name;
      if (max >= 0 && count > max) problems.push(max === 0 ? `${name}: none may be taken here.` : `${name}: no more than ${max}${parent ? '' : ' in the warband'}.`);
      if (!st.hidden && count < min && (parent !== null || n.kind === 'e')) problems.push(`${name}: at least ${min} must be taken${parent ? ` for ${parentName(b, parent, roots)}` : ''}.`);
      // a limit across the whole warband
      let left = max >= 0 ? Math.max(0, max - count) : -1;
      for (const c of n.constraints) {
        if (c.field !== 'selections' || (c.scope !== 'roster' && c.scope !== 'force')) continue;
        const v = st.limits.get(c.id) ?? c.value;
        const across = allSel().filter((t) => (n.kind === 'g' ? t.chain.includes(n.id) : t.node.target === n.target)).reduce((s, t) => s + t.s.count, 0);
        if (c.type === 'max' && v >= 0 && across > v) problems.push(v === 0 ? `${name}: the warband may take none.` : `${name}: no more than ${v} in the warband.`);
        if (c.type === 'max' && v >= 0) left = left < 0 ? Math.max(0, v - across) : Math.min(left, Math.max(0, v - across));
        if (c.type === 'min' && !st.hidden && across < v && parent === null) problems.push(`${name}: the warband needs at least ${v}.`);
      }
      out.push({ kind: n.kind === 'g' ? 'group' : 'entry', id: n.id, name, type: n.type, hidden: st.hidden, each: st.costs, count, min, max, left, children, problems });
    }
    return out;
  };
  return build(parent ? parent.node.children : rootsOf(b), []);
}

function parentName(b: Bundle, p: Placed, roots: Placed[]): string {
  return readEntry(b, p.node, { self: p, parent: p.parent, roots, b }).name;
}

/** Find a placed selection by id. */
export function findPlaced(roots: Placed[], id: string): Placed | undefined {
  for (const r of roots) { if (r.s.id === id) return r; const f = findPlaced(r.children, id); if (f) return f; }
  return undefined;
}
