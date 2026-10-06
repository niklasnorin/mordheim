/**
 * The campaign's own scenarios: written by the game master for this campaign, with rules the battle tracker knows.
 *
 * A rulebook scenario is played as the book has it and the site only links to it. A house scenario is a rule of the
 * game written down here, so the scenario page can print it and the tracker can keep it: how many turns it lasts,
 * whether the warbands are attackers and defenders, what is held round by round, what is rolled at the end of each
 * turn, and who the rules give the game to. A scenario is one of these when its `rulebookScenario` names it.
 *
 * Pure: the verdict is a function of the scenario's log, so the tracker, the scenario page and the tests agree.
 */
import type { Scenario, ScenarioEvent, ScenarioResult, ScenarioWarband } from './model.ts';

export type Side = 'attacker' | 'defender';
export const SIDES: Side[] = ['attacker', 'defender'];
export const SIDE_LABEL: Record<Side, string> = { attacker: 'Attackers', defender: 'Defenders' };

export interface HouseScenario {
  name: string;
  /** Turns after which the game ends of itself; the table may add another, time permitting. */
  turns: number;
  /** Whether the warbands fight as attackers and defenders. */
  sides: boolean;
  /** The thing held round by round, and how long the attackers must hold it to have won outright. */
  objective?: { name: string; title: string; holdToWin: number };
  /** A die rolled at the end of every turn, and what a roll of `on` or more brings. */
  endOfTurnRoll?: { label: string; die: number; on: number; happens: string; nothing: string };
  /** The rules as the scenario page prints them, a heading and its lines each. */
  rules: { heading: string; lines: string[] }[];
  winCondition: string;
}

export const SUPPLY_CART: HouseScenario = {
  name: 'The Supply Cart',
  turns: 7,
  sides: true,
  objective: { name: 'the cart', title: 'The cart', holdToWin: 5 },
  endOfTurnRoll: { label: 'The skaven roll', die: 6, on: 6, happens: 'Skaven rise from the depths. See the NPC rules.', nothing: 'Nothing stirs below.' },
  rules: [
    { heading: 'Practicalities', lines: [
      'The game ends of itself at the end of the seventh round. It may run longer if time permits; end-of-game actions are done at the table, so no result is forgotten.',
      'At the end of each turn, roll a D6. On a 6, skaven appear from the depths (see the NPC rules).',
      'The normal house rules apply (see the Fussenbach notes).',
    ] },
    { heading: 'The supply cart', lines: [
      'The cart moves 3". It may not move while the opposing warband is in base contact with it.',
      'It is controlled by the warband with the most models within 2" of its base.',
    ] },
    { heading: 'Win conditions', lines: [
      'Attackers: control the cart for five consecutive rounds, or control it at the end of the seventh round. The cart is moved to the board edge in the attackers’ deployment zone.',
      'Defenders: control the cart at the end of the seventh round. The cart is moved to the board edge in the defenders’ deployment zone.',
    ] },
    { heading: 'Victory bonuses', lines: [
      'The normal post-game exploration rules apply.',
      'For every objective marker controlled at the end of the match, add +1 to your exploration roll, if any.',
      'If the attackers hold the cart at the end of the game, they loot it and take one: 10 gold and +1 to their exploration roll, or a roll for a rare item and 10 gold.',
      'If the defenders win, they receive a rare item roll and 5 gold. Amid the ambush some supplies fell off the cart: the attackers roll a D6, and recover 5 gold on a 3 or more, 10 gold on a 6.',
    ] },
  ],
  winCondition: 'The attackers win by holding the cart for five rounds running, or by holding it at the end of the last round; the defenders win by holding it at the end of the last round.',
};

export const HOUSE_SCENARIOS: readonly HouseScenario[] = [SUPPLY_CART];

/** A small count in words, as the archive writes it: "five rounds running". */
export const inWords = (n: number) => ['none', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'][n] ?? String(n);

/** The house scenario a scenario's name says it is, if any. */
export function houseScenario(name: string | null | undefined): HouseScenario | undefined {
  const n = name?.trim().toLowerCase();
  return n ? HOUSE_SCENARIOS.find((h) => h.name.toLowerCase() === n) : undefined;
}

/** The die an end-of-turn roll shows, and what it brought. */
export const rollBrings = (kind: HouseScenario, die: number) => !!kind.endOfTurnRoll && die >= kind.endOfTurnRoll.on;

/** What each turn's end left in the log: who held the objective (null when nobody did), and the die rolled. */
export interface TurnEnd { turn: number; held?: string | null; roll?: number }
export function turnEnds(events: ScenarioEvent[]): TurnEnd[] {
  const by = new Map<number, TurnEnd>();
  // the latest line of each kind for a turn stands, should one ever be written twice
  for (const e of [...events].sort((a, b) => a.id - b.id)) {
    if (e.kind !== 'hold' && e.kind !== 'roll') continue;
    const t = by.get(e.turn) ?? { turn: e.turn };
    if (e.kind === 'hold') t.held = e.warbandId ?? null; else t.roll = e.points;
    by.set(e.turn, t);
  }
  return [...by.values()].sort((a, b) => a.turn - b.turn);
}

export interface Verdict {
  /** Who held the objective at the end of each round recorded, oldest first. */
  held: { turn: number; warbandId: string | null; side: Side | null }[];
  /** The rounds running the attackers hold it now, and the longest such run. */
  run: number;
  best: number;
  /** Whether the rules say the game is over, which side they give it to (null: the table decides), and why. */
  over: boolean;
  winner: Side | null;
  reason: string;
}

/**
 * Who the rules give the game to, from who held the objective round by round. The attackers win outright on the
 * round they have held it long enough without a break; otherwise the game runs to its last turn and goes to whoever
 * holds it then. Held by nobody at the end, it is the table's call.
 */
export function verdictOf(kind: HouseScenario, s: Pick<Scenario, 'events' | 'turnLimit'> & { warbands: Pick<ScenarioWarband, 'warbandId' | 'side'>[] }): Verdict {
  const sideOf = (id: string | null) => (id ? s.warbands.find((w) => w.warbandId === id)?.side ?? null : null);
  const held = turnEnds(s.events).filter((t) => t.held !== undefined).map((t) => ({ turn: t.turn, warbandId: t.held ?? null, side: sideOf(t.held ?? null) }));
  const need = kind.objective?.holdToWin ?? Infinity;
  let run = 0, best = 0, wonOn: number | null = null, last = 0;
  for (const h of held) {
    run = h.side === 'attacker' && h.turn === last + 1 ? run + 1 : h.side === 'attacker' ? 1 : 0;
    last = h.turn;
    best = Math.max(best, run);
    if (wonOn === null && run >= need) wonOn = h.turn;
  }
  const name = kind.objective?.name ?? 'the objective';
  if (wonOn !== null) return { held, run, best, over: true, winner: 'attacker', reason: `The attackers held ${name} for ${inWords(need)} rounds running, to the end of turn ${wonOn}.` };
  const limit = s.turnLimit ?? kind.turns;
  const end = held.find((h) => h.turn === limit);
  if (!end) return { held, run, best, over: false, winner: null, reason: '' };
  if (!end.side) return { held, run, best, over: true, winner: null, reason: `Nobody held ${name} at the end of the last round. The table calls it.` };
  return { held, run, best, over: true, winner: end.side, reason: `The ${SIDE_LABEL[end.side].toLowerCase()} held ${name} at the end of the last round.` };
}

/** Each warband's result as the verdict has it: the winning side's warbands win, everyone else loses. Empty while undecided. */
export function resultsOf(v: Verdict, warbands: Pick<ScenarioWarband, 'warbandId' | 'side'>[]): Record<string, ScenarioResult> {
  if (!v.winner) return {};
  return Object.fromEntries(warbands.map((w) => [w.warbandId, w.side === v.winner ? 'victory' : 'defeat']));
}
