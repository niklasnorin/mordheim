/**
 * Something to hold: a custom scenario's objective, as the game master sets it up, kept by the battle tracker.
 *
 * Either one of it (a relic, a banner, a well: only one warband holds it at a time) or several (objective markers,
 * shards, doors: each warband holds as many as it can), checked at a moment the game master chooses: the start or the
 * end of every round, or the start or the end of each warband's own turn within it. A round is a turn of the tracker,
 * in which every warband moves once. Every check gives a warband a point for each thing it holds then.
 *
 * In the log a check is a run of `control` events of one turn sharing a key in `text`: the moment, and for a
 * warband's own turn whose turn it was. Each says how many one warband held (`points`), nought included, so
 * "nobody held it" is written down and a check not yet made is not. Pure, so the tracker, the scenario page, the
 * service and the tests agree.
 */
import type { Scenario, ScenarioEvent } from './model.ts';
import { houseScenario } from './house.ts';

export type HoldKind = 'one' | 'many';
export const HOLD_KINDS: HoldKind[] = ['one', 'many'];
export type CheckMoment = 'round-start' | 'round-end' | 'turn-start' | 'turn-end';
export const CHECK_MOMENTS: CheckMoment[] = ['round-start', 'round-end', 'turn-start', 'turn-end'];

export interface Objective {
  /** What is held, as the game master named it: "The relic", "Objective markers". */
  name: string;
  kind: HoldKind;
  /** How many there are: 1 for one of it, 2 or more for several. */
  count: number;
  /** When it is checked. */
  when: CheckMoment;
}

/** The most of anything a scenario has to hold. */
export const MAX_HELD = 20;

export const HOLD_KIND_LABEL: Record<HoldKind, string> = { one: 'One of it: only one warband holds it at a time', many: 'Several: each warband holds as many as it can' };
export const MOMENT_LABEL: Record<CheckMoment, string> = {
  'round-start': 'At the start of each round',
  'round-end': 'At the end of each round',
  'turn-start': 'At the start of each warband’s own turn',
  'turn-end': 'At the end of each warband’s own turn',
};
/** The moment in a sentence about a warband: "a point … at the end of its own turn". */
const MOMENT_PHRASE: Record<CheckMoment, string> = { 'round-start': 'at the start of each round', 'round-end': 'at the end of each round', 'turn-start': 'at the start of its own turn', 'turn-end': 'at the end of its own turn' };

/** Whether a moment comes once for each warband in a round, rather than once for the round. */
export const perWarband = (when: CheckMoment) => when === 'turn-start' || when === 'turn-end';

/** A name inside a sentence: "the relic", but "SSL" stays as it is. */
export const inSentence = (name: string) => /^[A-Z][a-z]/.test(name) ? name[0].toLowerCase() + name.slice(1) : name;

/** The stored JSON as an objective, or null when there is none or it does not read as one. */
export function coerceObjective(raw: unknown): Objective | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Partial<Record<keyof Objective, unknown>>;
  const name = typeof o.name === 'string' ? o.name.trim() : '';
  if (!name) return null;
  const kind = HOLD_KINDS.includes(o.kind as HoldKind) ? (o.kind as HoldKind) : 'one';
  const when = CHECK_MOMENTS.includes(o.when as CheckMoment) ? (o.when as CheckMoment) : 'round-end';
  const count = kind === 'one' ? 1 : Math.min(MAX_HELD, Math.max(2, Number.isInteger(o.count) ? (o.count as number) : 2));
  return { name, kind, count, when };
}

/** The objective the tracker keeps for a scenario: the game master's, unless a campaign scenario brings its own rules. */
export function objectiveOf(s: Pick<Scenario, 'objective' | 'rulebookScenario'>): Objective | null {
  if (houseScenario(s.rulebookScenario)) return null;
  return coerceObjective(s.objective);
}

/** How the objective scores, in a sentence for the scenario page and the tracker. */
export function objectiveSummary(o: Objective): string {
  if (o.kind === 'one') return perWarband(o.when)
    ? `One of it. A warband scores a point when it holds it ${MOMENT_PHRASE[o.when]}.`
    : `One of it. Whoever holds it ${MOMENT_PHRASE[o.when]} scores a point.`;
  return `${o.count} of them. A warband scores a point for each it holds ${MOMENT_PHRASE[o.when]}.`;
}

/** The key a check is logged under: the moment, and for a warband's own turn, whose. */
export const checkKey = (when: CheckMoment, whose?: string | null) => perWarband(when) ? `${when}:${whose ?? ''}` : when;
export function parseKey(key: string): { when: CheckMoment; whose: string | null } | null {
  const [when, ...rest] = key.split(':');
  if (!CHECK_MOMENTS.includes(when as CheckMoment)) return null;
  return { when: when as CheckMoment, whose: perWarband(when as CheckMoment) ? rest.join(':') || null : null };
}

/** One check as the log has it: when, whose turn if a warband's own, how many each warband held, and its lines. */
export interface Check { turn: number; key: string; when: CheckMoment; whose: string | null; held: Record<string, number>; ids: number[]; authorName: string }

/** Every check in the log, oldest turn first and, within a turn, in the order they were made. */
export function checksOf(events: ScenarioEvent[]): Check[] {
  const by = new Map<string, Check>();
  for (const e of [...events].sort((a, b) => a.id - b.id)) {
    if (e.kind !== 'control') continue;
    const parsed = parseKey(e.text);
    if (!parsed) continue;
    const at = `${e.turn}|${e.text}`;
    const c = by.get(at) ?? { turn: e.turn, key: e.text, ...parsed, held: {}, ids: [], authorName: e.authorName };
    if (e.warbandId) c.held[e.warbandId] = e.points;
    c.ids.push(e.id);
    by.set(at, c);
  }
  return [...by.values()].sort((a, b) => a.turn - b.turn || a.ids[0] - b.ids[0]);
}

/** A check the table owes: the turn, the moment, and whose turn it is when that matters. */
export interface Slot { turn: number; key: string; when: CheckMoment; whose: string | null }

/** The checks a turn of the game asks for: once in the round, or once for each warband in the order they attend. */
export function slotsFor(o: Objective, warbandIds: string[], turn: number): Slot[] {
  if (!perWarband(o.when)) return [{ turn, key: checkKey(o.when), when: o.when, whose: null }];
  return warbandIds.map((w) => ({ turn, key: checkKey(o.when, w), when: o.when, whose: w }));
}

/** Each warband's points from the checks, in the order the warbands attend. */
export function objectiveScores(s: Pick<Scenario, 'warbands' | 'events'>): { warbandId: string; points: number }[] {
  return s.warbands.map((w) => ({ warbandId: w.warbandId, points: s.events.filter((e) => e.kind === 'control' && e.warbandId === w.warbandId).reduce((a, e) => a + e.points, 0) }));
}

/**
 * What is wrong with a telling of a check, as the table reads it, or null when the rules allow it. At a warband's
 * own turn only that warband is counted; at a round every warband may be, and together they hold no more than there is.
 */
export function checkError(o: Objective, held: Record<string, number>, attending: string[], whose: string | null): string | null {
  const name = inSentence(o.name);
  if (perWarband(o.when)) {
    if (!whose) return 'Say whose turn it is.';
    if (!attending.includes(whose)) return 'That warband is not at this scenario.';
    if (Object.keys(held).some((w) => w !== whose)) return `Only the warband whose turn it is is counted for ${name}.`;
  }
  for (const [w, n] of Object.entries(held)) {
    if (!attending.includes(w)) return 'That warband is not at this scenario.';
    if (!Number.isInteger(n) || n < 0) return 'Say how many each warband holds.';
    if (n > o.count) return o.kind === 'one' ? `There is only one of ${name}.` : `There are only ${o.count} of ${name}.`;
  }
  const total = Object.values(held).reduce((a, n) => a + n, 0);
  if (total > o.count) return o.kind === 'one' ? `Only one warband holds ${name} at a time.` : `There are only ${o.count} of ${name} between them.`;
  return null;
}

/** When a check was made, as the log heads it: "End of the round", "Start of the Nordost Kin’s turn". */
export function checkLabel(c: Pick<Check, 'when' | 'whose'>, nameOf: (id: string) => string): string {
  const edge = c.when.endsWith('start') ? 'Start' : 'End';
  return perWarband(c.when) ? `${edge} of ${nameOf(c.whose ?? '')}’s turn` : `${edge} of the round`;
}

/** A check as one line of the log, in three parts so a page may make the middle one bold. */
export function describeCheck(o: Objective | null, c: Check, nameOf: (id: string) => string): { lead: string; strong: string; rest: string } {
  const name = o?.name ?? 'The objective';
  const lead = `${checkLabel(c, nameOf)}: ${inSentence(name)}`;
  const entries = Object.entries(c.held);
  if (perWarband(c.when)) {
    const n = c.held[c.whose ?? ''] ?? 0;
    return o?.kind === 'many' ? { lead: `${lead}, `, strong: `${n} held`, rest: '' } : { lead: `${lead} `, strong: n ? 'held' : 'not held', rest: '' };
  }
  if (o?.kind !== 'many') {
    const holder = entries.find(([, n]) => n > 0)?.[0];
    return { lead: `${lead} `, strong: holder ? `held by ${nameOf(holder)}` : 'held by nobody', rest: '' };
  }
  const holding = entries.filter(([, n]) => n > 0);
  return { lead: `${lead}: `, strong: holding.length ? holding.map(([w, n]) => `${nameOf(w)} ${n}`).join(' · ') : 'none held', rest: '' };
}
