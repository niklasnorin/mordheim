/**
 * Changing a roster: pure operations on the selection tree, each returning a new roster. A new selection brings
 * whatever the catalogue requires under it (a henchman group its first model, a captain the Leader rule), as
 * BattleScribe adds it. Ids come from the caller, so the server and the tests decide them.
 */
import { nodeOf, type Bundle } from './catalogue.ts';
import { findPlaced, optionsUnder, place, rootsOf, type OptionView, type Placed, type Roster, type Selection } from './evaluate.ts';

export type IdMaker = () => string;

/** Thrown when an operation cannot be made; the message is shown as written. */
export class RosterError extends Error {}

const clone = (r: Roster): Roster => structuredClone(r);

export function findSelection(list: Selection[], id: string): Selection | undefined {
  for (const s of list) { if (s.id === id) return s; const f = findSelection(s.children, id); if (f) return f; }
  return undefined;
}
export function parentOf(list: Selection[], id: string, parent: Selection | null = null): Selection | null | undefined {
  for (const s of list) { if (s.id === id) return parent; const f = parentOf(s.children, id, s); if (f !== undefined) return f; }
  return undefined;
}
/** The list a selection sits in: the roster's own, or its parent's children. */
function siblingsOf(r: Roster, id: string): Selection[] | undefined {
  const parent = parentOf(r.selections, id);
  if (parent === undefined) return undefined;
  return parent ? parent.children : r.selections;
}
export const walk = (list: Selection[], fn: (s: Selection, parent: Selection | null) => void, parent: Selection | null = null): void => {
  for (const s of list) { fn(s, parent); walk(s.children, fn, s); }
};

/** Every entry option under a placed parent, flattened out of its groups. */
export function flatOptions(options: OptionView[]): OptionView[] {
  return options.flatMap((o) => (o.kind === 'group' ? flatOptions(o.children) : [o]));
}

/** A new roster: the warband's catalogue with what every warband must have (its configuration, and a stash). */
export function newRoster(b: Bundle, slug: string, newId: IdMaker): Roster {
  const r = fill(b, { catalogue: slug, selections: [] }, null, newId);
  if (r.selections.some((s) => /^Stash$/i.test(nodeOf(b, s.entry)?.name ?? ''))) return r;
  const stash = flatOptions(optionsUnder(b, place(b, r), null)).find((o) => !o.hidden && /^Stash$/i.test(o.name));
  return stash ? addSelection(b, r, null, stash.id, newId).roster : r;
}

/** Add what the catalogue requires under a parent (the force when null), and under what that brings, until nothing is owed. */
export function fill(b: Bundle, roster: Roster, parentId: string | null, newId: IdMaker, depth = 0): Roster {
  if (depth > 6) return roster;
  const roots = place(b, roster);
  const parent = parentId ? findPlaced(roots, parentId) ?? null : null;
  if (parentId && !parent) return roster;
  const list = parentId ? findSelection(roster.selections, parentId)!.children : roster.selections;
  const added: string[] = [];
  const owe = (options: OptionView[]) => {
    for (const o of options) {
      if (o.hidden) continue;
      if (o.kind === 'group') {
        const n = nodeOf(b, o.id);
        if (o.min > o.count && n?.defaultId) { const def = flatOptions(o.children).find((c) => nodeOf(b, c.id)?.target === n.defaultId || c.id === n.defaultId); if (def) { const s = { id: newId(), entry: def.id, count: o.min - o.count, children: [] }; list.push(s); added.push(s.id); } }
        owe(o.children);
        continue;
      }
      if (o.min > o.count) { const s = { id: newId(), entry: o.id, count: o.min - o.count, children: [] }; list.push(s); added.push(s.id); }
    }
  };
  owe(optionsUnder(b, roots, parent));
  let out = roster;
  for (const id of added) out = fill(b, out, id, newId, depth + 1);
  return out;
}

/** The option under a parent a selection would be taken from, or a refusal. */
export function optionAt(b: Bundle, roster: Roster, parentId: string | null, entry: string): { option: OptionView; parent: Placed | null } {
  const roots = place(b, roster);
  const parent = parentId ? findPlaced(roots, parentId) ?? null : null;
  if (parentId && !parent) throw new RosterError('That is not on the roster.');
  const option = flatOptions(optionsUnder(b, roots, parent)).find((o) => o.id === entry);
  if (!option || option.hidden) throw new RosterError('That cannot be taken there.');
  return { option, parent };
}

/** Take something: a warrior at the root, gear or a skill under a warrior. Refused where the catalogue says no more. */
export function addSelection(b: Bundle, roster: Roster, parentId: string | null, entry: string, newId: IdMaker, count = 1): { roster: Roster; id: string } {
  const { option } = optionAt(b, roster, parentId, entry);
  if (option.left >= 0 && count > option.left) throw new RosterError(option.left === 0 ? `No more ${option.name} may be taken.` : `Only ${option.left} more ${option.name} may be taken.`);
  const r = clone(roster);
  const list = parentId ? findSelection(r.selections, parentId)!.children : r.selections;
  const id = newId();
  list.push({ id, entry, count, children: [] });
  return { roster: fill(b, r, id, newId), id };
}

export function setCount(roster: Roster, id: string, count: number): Roster {
  if (!Number.isInteger(count) || count < 1) throw new RosterError('A count is a whole number, one or more.');
  const r = clone(roster);
  const s = findSelection(r.selections, id);
  if (!s) throw new RosterError('That is not on the roster.');
  s.count = count;
  return r;
}

export function removeSelection(roster: Roster, id: string): Roster {
  const r = clone(roster);
  const list = siblingsOf(r, id);
  if (!list) throw new RosterError('That is not on the roster.');
  list.splice(list.findIndex((s) => s.id === id), 1);
  return r;
}

/** Put a selection (with what is under it) somewhere else, taken from the entry offered there. */
export function moveSelection(b: Bundle, roster: Roster, id: string, toParent: string | null, entry: string): Roster {
  const s = findSelection(roster.selections, id);
  if (!s) throw new RosterError('That is not on the roster.');
  const without = removeSelection(roster, id);
  const { option } = optionAt(b, without, toParent, entry);
  if (option.left >= 0 && s.count > option.left) throw new RosterError(`No more ${option.name} may go there.`);
  const r = clone(without);
  const list = toParent ? findSelection(r.selections, toParent)!.children : r.selections;
  list.push({ ...structuredClone(s), entry });
  return r;
}

/** Where an entry's target may be taken under a selection: the option ids, nearest first, searched through what is already taken there. */
export function placesFor(b: Bundle, roster: Roster, parentId: string, target: string): { parent: string; entry: string }[] {
  const out: { parent: string; entry: string }[] = [];
  const roots = place(b, roster);
  const visit = (p: Placed, depth: number) => {
    if (depth > 3) return;
    for (const o of flatOptions(optionsUnder(b, roots, p))) if (!o.hidden && nodeOf(b, o.id)?.target === target) out.push({ parent: p.s.id, entry: o.id });
    for (const c of p.children) if (c.node.type === 'upgrade' && !nodeOf(b, c.node.id)?.profiles.length) visit(c, depth + 1);
  };
  const start = findPlaced(roots, parentId);
  if (start) visit(start, 0);
  return out;
}

export { rootsOf };

/** The option of that name under a parent (the force when null), looked for through its groups; undefined if none is offered. */
export function optionNamed(b: Bundle, roster: Roster, parentId: string | null, name: string): OptionView | undefined {
  const roots = place(b, roster);
  const parent = parentId ? findPlaced(roots, parentId) ?? null : null;
  const want = name.trim().toLowerCase();
  const all = flatOptions(optionsUnder(b, roots, parent)).filter((o) => !o.hidden);
  return all.find((o) => o.name.toLowerCase() === want) ?? all.find((o) => nodeOf(b, o.id)?.name.toLowerCase() === want);
}

/** Take something by its name: a convenience for the tests and for drawing up a roster from the record. */
export function addNamed(b: Bundle, roster: Roster, parentId: string | null, name: string, newId: IdMaker, count = 1): { roster: Roster; id: string } {
  const o = optionNamed(b, roster, parentId, name);
  if (!o) throw new RosterError(`${name} cannot be taken there.`);
  return addSelection(b, roster, parentId, o.id, newId, count);
}
