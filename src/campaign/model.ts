/**
 * The campaign's record, as the database keeps it and the pages read it.
 *
 * Warbands and their members, the scenarios (upcoming and played), what each warband and warrior did in
 * them, and the Town Cryer's articles. These shapes are shared by the services, the API's answers, the pages
 * and the seed fixtures under `src/data/`. Ids are forever: a warband or member id keys the archives, the
 * ledgers and the dispatches, so it is chosen once and never renamed.
 */
import { RULEBOOK_TALLIES, type RulebookScenario } from './rulebook.ts';

export interface Statline {
  M: number; WS: number; BS: number; S: number; T: number; W: number; I: number; A: number; Ld: number;
}
export const STAT_KEYS = ['M', 'WS', 'BS', 'S', 'T', 'W', 'I', 'A', 'Ld'] as const;
export type StatKey = (typeof STAT_KEYS)[number];
export const STAT_NAMES: Record<StatKey, string> = {
  M: 'Movement', WS: 'Weapon Skill', BS: 'Ballistic Skill', S: 'Strength', T: 'Toughness', W: 'Wounds', I: 'Initiative', A: 'Attacks', Ld: 'Leadership',
};

export interface Death {
  /** Date the warrior fell, in the Imperial Calendar as `formatImperial` writes it. */
  date: string;
  /** Higher = more recent. Used to order graves front-to-back. */
  order: number;
  /** Quote carved on the tombstone. */
  epitaph: string;
}

export interface Member {
  id: string;
  warbandId: string;
  name: string;
  role: string;
  /** Heroes get elaborate graves; henchmen get plain ones. */
  rank: 'hero' | 'henchman';
  /** Two letters, drawn where there is no crest. */
  portrait: string;
  /** A relative clause without its subject: "Who Led Them South". */
  epithet: string;
  dead: boolean;
  death?: Death;
  stats: Statline;
  experience?: number;
  /** Skills, special rules and prayers, one line each. Weapons and gear are not tracked. */
  skills: string[];
  /** Lasting injuries rolled on the serious injury table. */
  injuries: string[];
  lore: string;
  /** Roster order within the warband. */
  sort: number;
}

export interface Warband {
  id: string;
  name: string;
  type: string;
  sigil: string;
  /** Heraldic crest in public/, drawn in place of the sigil where there is room. */
  crest?: string;
  /** The player who keeps this warband, if anyone does. Their display name, for the cards. */
  ownerId?: string | null;
  player: string;
  /** Counted from the played scenarios, never edited. */
  battles: number;
  victories: number;
  lore: string;
  members: Member[];
  /** Order on the home page. */
  sort: number;
  version: number;
}

/** A member's condition at the end of a scenario. */
export type MemberStatus = 'active' | 'injured' | 'dead';
export const MEMBER_STATUSES: MemberStatus[] = ['active', 'injured', 'dead'];
/** A warband's result in a scenario. */
export type ScenarioResult = 'victory' | 'defeat' | 'draw';
export const SCENARIO_RESULTS: ScenarioResult[] = ['victory', 'defeat', 'draw'];
export type ScenarioStatus = 'upcoming' | 'played';

/** One warrior in one scenario: whether they fought, how they came out of it, and their two moments. */
export interface ScenarioMember {
  scenarioId: string;
  warbandId: string;
  memberId: string;
  status: MemberStatus;
  /** This warrior's finest moment in the scenario. */
  highlight: string;
  /** This warrior's worst moment in the scenario. */
  lowlight: string;
  /** Their statline and experience as they stood after the battle, when recorded. */
  stats?: Statline | null;
  experience?: number | null;
}

/** One warband in one scenario: attending, its result once played, and its own telling. */
export interface ScenarioWarband {
  scenarioId: string;
  warbandId: string;
  result?: ScenarioResult | null;
  prologue: string;
  epilogue: string;
  accomplishments: string;
  highlights: string[];
  lowlights: string[];
  members: ScenarioMember[];
}

/** A confirmed out-of-action result. Only what was recorded; an empty list does not mean none occurred. */
export interface OutOfAction {
  id: number;
  scenarioId: string;
  attackerId: string;
  /** The victim by id when they are a member of an attending warband; the name is kept for the record either way. */
  targetId?: string | null;
  target: string;
  detail: string;
  /** The game turn it happened in, when the table logged it as it happened; null when written up afterwards. */
  turn?: number | null;
}

/** What the tracker logs besides takedowns: a note is anything worth remembering, a score counts towards the tally. */
export type EventKind = 'note' | 'score';
export const EVENT_KINDS: EventKind[] = ['note', 'score'];

/** One line of the battle tracker's log, tied to a game turn and, for a score or a warband's note, to a warband. */
export interface ScenarioEvent {
  id: number;
  scenarioId: string;
  turn: number;
  kind: EventKind;
  warbandId?: string | null;
  /** Towards the tally; zero for a note. */
  points: number;
  text: string;
  authorName: string;
  createdAt: Date;
}

export interface Puzzle {
  title: string;
  introduction: string;
  clues: { source: string; text: string }[];
  seals: string[];
  solution: string[];
  hints: string[];
  revelation: string[];
}

/** One paragraph of the battle as it stood at some moment, kept when somebody rewrote it. */
export interface NarrativeRevision {
  id: number;
  scenarioId: string;
  battle: string[];
  authorId?: string | null;
  authorName: string;
  savedAt: Date;
}

export interface Scenario {
  id: string;
  /** 1-based play order; higher = more recent. Upcoming scenarios are ordered by date. */
  sequence: number;
  status: ScenarioStatus;
  title: string;
  /** The real day it is or was played (YYYY-MM-DD). The Imperial date is derived from it. */
  playedOn: string;
  /** The rulebook's scenario name, or null for a custom scenario. */
  rulebookScenario: string | null;
  /** House rules and special rules in play, as the game master wrote them. */
  customRules: string;
  winCondition: string;
  summary: string;
  /** Merged into `summary`. Kept so a record written before the merge still reads; cleared when the summary is saved. */
  chronicle: string;
  outcome: string;
  /** The game master's neutral account. */
  prologue: string;
  /** Until the game is played, the prologue stands in for the summary under the title. */
  prologueAsSummary: boolean;
  battle: string[];
  epilogue: string;
  /** Whether attending players may rewrite the battle narrative. */
  battleOpen: boolean;
  /** Merged into `campaignNotes`. Kept so a record written before the merge still reads; cleared when the notes are saved. */
  loot: string[];
  /** What the campaign carries forward: loot, costs, lasting consequences, unresolved records. */
  campaignNotes: string[];
  puzzle?: Puzzle | null;
  /** The battle tracker: the game turn the table is on, 0 before the first. */
  turn: number;
  /** What the scenario scores, as the game master named it; empty means the rulebook scenario's own tally, or none. See `tallyOf`. */
  tally: string;
  warbands: ScenarioWarband[];
  outOfAction: OutOfAction[];
  /** The tracker's log, oldest first. */
  events: ScenarioEvent[];
  createdBy?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface NewsArticle {
  id: number;
  headline: string;
  byline: string;
  body: string;
  notice: boolean;
  /** Where the broadsheet prints this: a location id. */
  locationId: string;
  published: boolean;
  sort: number;
}

/**
 * What stands under a scenario's title. An upcoming game usually has no summary yet, so the game master's
 * prologue stands in for one until the game is played, unless they have said otherwise.
 */
export function summaryOf(s: Pick<Scenario, 'status' | 'summary' | 'prologue' | 'prologueAsSummary'> & { chronicle?: string }): string {
  if (s.summary.trim()) return s.summary;
  if (s.chronicle?.trim()) return s.chronicle;
  return s.status === 'upcoming' && s.prologueAsSummary ? s.prologue : '';
}

/** Everything a played scenario leaves the campaign, in one list: the loot and costs, then the lasting records. */
export function carriedForward(s: Pick<Scenario, 'loot' | 'campaignNotes'>): string[] {
  return [...s.loot, ...s.campaignNotes];
}

/** A slug for an id: lower-case ASCII, hyphens between words. */
export function slugify(text: string): string {
  return text
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/ø/gi, 'o').replace(/æ/gi, 'ae').replace(/ß/g, 'ss')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/**
 * The name of what a scenario scores, for the battle tracker: what the game master wrote, or else what the rulebook
 * scenario counts (shards on a Wyrdstone Hunt, warriors through on a Breakthrough). Empty when nothing is tallied
 * beyond the fighting itself.
 */
export function tallyOf(s: Pick<Scenario, 'tally' | 'rulebookScenario'>): string {
  const own = s.tally.trim();
  if (own) return own;
  if (!s.rulebookScenario) return '';
  const key = (Object.keys(RULEBOOK_TALLIES) as RulebookScenario[]).find((k) => k.toLowerCase() === s.rulebookScenario!.trim().toLowerCase());
  return key ? RULEBOOK_TALLIES[key] ?? '' : '';
}

/** Each attending warband's running total from the tracker's score events, in the order the warbands attend. */
export function scoresOf(s: Pick<Scenario, 'warbands' | 'events'>): { warbandId: string; points: number }[] {
  return s.warbands.map((w) => ({ warbandId: w.warbandId, points: s.events.filter((e) => e.kind === 'score' && e.warbandId === w.warbandId).reduce((a, e) => a + e.points, 0) }));
}

/** Whether the table tracked this game at all: a turn counted, a line logged, or a takedown with its turn. */
export function hasTurnLog(s: Pick<Scenario, 'events' | 'outOfAction' | 'turn'>): boolean {
  return s.turn > 0 || s.events.length > 0 || s.outOfAction.some((o) => o.turn != null);
}
