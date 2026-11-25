/**
 * The changes a builder makes to a roster, as data: what the browser sends and the server applies, the same
 * function on both sides. A change that costs or earns gold in a campaign (hiring, buying, selling) is reckoned by the
 * server from the roster before and after; here only the tree changes.
 */
import type { Bundle } from './catalogue.ts';
import type { Roster } from './evaluate.ts';
import { addSelection, findSelection, moveSelection, removeSelection, RosterError, setCount, type IdMaker } from './roster.ts';

export type Op =
  | { kind: 'add'; parent: string | null; entry: string; count?: number }
  | { kind: 'count'; id: string; count: number }
  | { kind: 'remove'; id: string }
  | { kind: 'move'; id: string; to: string | null; entry: string };

export interface Applied { roster: Roster; /** The selection the change made, for an add. */ id?: string }

export function applyOp(b: Bundle, roster: Roster, op: Op, newId: IdMaker): Applied {
  switch (op.kind) {
    case 'add': { const r = addSelection(b, roster, op.parent, op.entry, newId, op.count ?? 1); return { roster: r.roster, id: r.id }; }
    case 'count': return { roster: setCount(roster, op.id, op.count) };
    case 'remove': return { roster: removeSelection(roster, op.id) };
    case 'move': return { roster: moveSelection(b, roster, op.id, op.to, op.entry) };
  }
  throw new RosterError('No such change.');
}

/** A random id, short and safe in a URL; the server and the browser both make them. */
export function randomId(): string {
  const bytes = new Uint8Array(8);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Whether a selection is still where it was: for refusing a change made against an older roster. */
export const has = (roster: Roster, id: string): boolean => !!findSelection(roster.selections, id);
