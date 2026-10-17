/**
 * Whose turn it is: the order the warbands take their turns in within a round, and the warband on now.
 *
 * A round is a turn of the tracker (`Scenario.turn`), in which every warband moves once. Before the first turn the
 * table says who starts; the rest follow in the order they attend. `Scenario.order` keeps that, `Scenario.active` the
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

/** The order with one warband starting: it first, the rest as they attend. */
export function startingWith(s: Pick<Turns, 'order' | 'warbands'>, starter: string): string[] {
  const order = turnOrder(s);
  if (!order.includes(starter)) throw new Error('That warband is not at this scenario.');
  return [starter, ...order.filter((id) => id !== starter)];
}

/** Whether the table has said who starts. */
export const starterChosen = (s: Pick<Turns, 'order' | 'warbands'>): boolean => s.order.some((id) => s.warbands.some((w) => w.warbandId === id));

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
