/**
 * Whose turn it is: the order the warbands take their turns in within a round, and the warband on now.
 *
 * A round is a turn of the tracker (`Scenario.turn`), in which every warband moves once. Before the first turn the
 * table sets the order, a tap at a time; a warband not placed follows the placed ones as it attends. `Scenario.order` keeps that, `Scenario.active` the
 * warband whose turn it is. "Next" moves to the next warband in the order; after the last, a new round begins with
 * the first again, which is where the scoring, the Tarot's hands and a house scenario's end-of-turn sheet live.
 *
 * Pure, so the tracker, the service and the tests agree; the service only stores what these say.
 */
import type { Scenario } from './model.ts';

type Turns = Pick<Scenario, 'order' | 'active' | 'turn'> & { warbands: Pick<Scenario['warbands'][number], 'warbandId'>[] };

/** The order the attending warbands take their turns in: as chosen, with any attending warband not chosen yet after. */
export function turnOrder(s: Pick<Turns, 'order' | 'warbands'>): string[] {
  const attending = s.warbands.map((w) => w.warbandId);
  const chosen = s.order.filter((id) => attending.includes(id));
  return [...chosen, ...attending.filter((id) => !chosen.includes(id))];
}

/** The order as chosen so far: only the warbands placed, in their places. */
export const placed = (s: Pick<Turns, 'order' | 'warbands'>): string[] => s.order.filter((id) => s.warbands.some((w) => w.warbandId === id));

/**
 * The table picks the order a tap at a time: a warband not yet placed goes next; one already placed is taken out
 * again, and everything after it with it, so a slip is undone from where it was made. When only one warband is left
 * unplaced it takes the last place of itself, so three warbands are ordered with two taps; with two at the table a tap
 * simply says who starts.
 */
export function pickOrder(s: Pick<Turns, 'order' | 'warbands'>, warbandId: string): string[] {
  const attending = s.warbands.map((w) => w.warbandId);
  if (!attending.includes(warbandId)) throw new Error('That warband is not at this scenario.');
  // two at the table: the one tapped starts, whatever was chosen before; undoing would only give the same order back
  if (attending.length === 2) return [warbandId, ...attending.filter((id) => id !== warbandId)];
  const chosen = placed(s);
  const at = chosen.indexOf(warbandId);
  const next = at >= 0 ? chosen.slice(0, at) : [...chosen, warbandId];
  const left = attending.filter((id) => !next.includes(id));
  return left.length === 1 ? [...next, left[0]] : next;
}

/** Whether every warband at the table has its place in the order. */
export const orderComplete = (s: Pick<Turns, 'order' | 'warbands'>): boolean => s.warbands.length > 0 && s.warbands.every((w) => s.order.includes(w.warbandId));

/** The warband whose turn it is: the one on record when it is still at the table, else the first in the order. Null before the first turn. */
export function activeWarband(s: Turns): string | null {
  if (s.turn < 1) return null;
  const order = turnOrder(s);
  if (!order.length) return null;
  return s.active && order.includes(s.active) ? s.active : order[0];
}

/** Whether the warband on now is the last of the round, so that "next" is a new round. */
export function lastOfRound(s: Turns): boolean {
  const order = turnOrder(s), active = activeWarband(s);
  return !active || order.indexOf(active) === order.length - 1;
}

export interface Step { turn: number; active: string | null }

/** The next warband's turn, or the first warband's in a new round after the last. */
export function stepForward(s: Turns): Step {
  const order = turnOrder(s), active = activeWarband(s);
  if (s.turn < 1 || !order.length) return { turn: Math.max(1, s.turn), active: order[0] ?? null };
  const i = order.indexOf(active!);
  return i < order.length - 1 ? { turn: s.turn, active: order[i + 1] } : { turn: s.turn + 1, active: order[0] };
}

/** The warband before, or the last warband of the round before; null from the first warband of the first round, which is before the game. */
export function stepBack(s: Turns): Step | null {
  const order = turnOrder(s), active = activeWarband(s);
  if (s.turn < 1 || !order.length) return null;
  const i = order.indexOf(active!);
  if (i > 0) return { turn: s.turn, active: order[i - 1] };
  return s.turn > 1 ? { turn: s.turn - 1, active: order[order.length - 1] } : null;
}

/** Where a round begins: its first warband. */
export const roundStart = (s: Pick<Turns, 'order' | 'warbands'>, turn: number): Step => ({ turn, active: turn >= 1 ? turnOrder(s)[0] ?? null : null });
