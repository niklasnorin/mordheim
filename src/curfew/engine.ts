/**
 * CURFEW — the Night engine.
 *
 * Pure functions, no DOM, no storage. Every result is a deterministic function of
 * (campaign, night, warband, orders), so the same orders always produce the same dawn.
 * The Omen and Moon for a night are the same for every warband.
 */
import campaign from '../data/curfew/campaign.json' with { type: 'json' };
import omensData from '../data/curfew/omens.json' with { type: 'json' };
import moonsData from '../data/curfew/moons.json' with { type: 'json' };
import tokensData from '../data/curfew/tokens.json' with { type: 'json' };
import mordheim from '../data/curfew/locations/mordheim.json' with { type: 'json' };
import fussenbach from '../data/curfew/locations/fussenbach.json' with { type: 'json' };

/**
 * The seven errands the engine knows. Which of them a warband may actually be sent on depends on where the
 * campaign is: Mordheim has rubble to sift and a Pit to fight in, Fussenbach has algae basins to dredge.
 */
export type Errand = 'scavenge' | 'carouse' | 'train' | 'spy' | 'pray' | 'trade' | 'dredge';
export const ERRANDS: Errand[] = ['scavenge', 'carouse', 'train', 'spy', 'pray', 'trade', 'dredge'];
export const ERRAND_LABEL: Record<Errand, string> = { scavenge: 'Scavenge', carouse: 'Carouse', train: 'Train', spy: 'Spy', pray: 'Pray', trade: 'Trade', dredge: 'Dredge' };
/** What each errand brings, in a line. A location may word its own; see blurbFor. */
export const ERRAND_BLURB: Record<Errand, string> = {
  scavenge: 'Sift the rubble for the green. Shards, and ink for the map.',
  carouse: 'Drink where the city talks. Favour, rumours, a Fortune charm.',
  train: 'The Pit, or the yard. A name, and Ground.',
  spy: 'Listen at the thin walls. Rumours and Sight.',
  pray: 'Keep the candles. Blessings, Fortune.',
  trade: 'Move the green quietly. Market chits; five shards make one.',
  dredge: 'Work the algae basins for what glows in the silt. Shards, and the lie of the mudflats.',
};

export type TokenType = 'fortune' | 'ground' | 'market' | 'sight';
/** A charm. One with a `location` only turns up where the campaign is; one without may turn up anywhere. */
export interface TokenDef { id: string; type: TokenType; name: string; effect: string; location?: string }
export interface Omen { id: string; numeral: string; title: string; reading: string; tilt: Partial<Record<Errand, number>>; notes: string; image: string }
/** A Moon favours one errand by a single point. Everything else about it is narrative, woven into the Dawn Report. */
export interface Moon { id: string; name: string; reading: string; boost: Errand; ties: Partial<Record<Errand, string>> }

export type Outcome = 'boon' | 'fair' | 'poor';
type TemplateBank = Record<Outcome | 'standing', string[]>;

/**
 * A curse. Content in `tokens.json`; it reaches a warrior only through a risk road at a crossroads, never from
 * dice nights or absence. `nights` says how long it stands; `effects` what it does the moment it lands.
 */
export interface CurseDef { id: string; name: string; effect: string; source?: string; nights: number; effects?: { renown?: number; shards?: number; staysHome?: number }; headline?: string }

// ───────────────────────── the Crossroads ─────────────────────────
// Some nights one member comes to a crossroads. The Dawn Report stops there; the player decides at dawn. See CROSSROADS.md.

export type CrossroadKind = 'moral' | 'risk' | 'loyalty' | 'lore' | 'light';
/** What taking a road does. Every number is bounded by content; none should move more than a good night brings. */
export interface RoadEffects {
  favour?: number; shards?: number; renown?: number;
  /** A charm of this type, of the place's, through the Hand's offer rule as any other. */
  token?: TokenType;
  /** A rumour of the place's, warm as any other. */
  rumour?: boolean;
  /** A permanent mark on the warrior, named in the pack's `markNames`. */
  mark?: string;
  /** Reaches into tonight: a tilt on that member's errand, or a night kept home. */
  carry?: { tilt?: number; staysHome?: number };
  /** A curse by id. Risk roads only, on their bad branch. */
  curse?: string;
}
export interface RoadBranch { outcome: string; effects?: RoadEffects }
export interface Road extends RoadBranch {
  id: string;
  /** What the character does, present tense, four to eight words. */
  label: string;
  /** A gamble: the dice choose good or bad when the road is taken. `chance` is the odds of good; 0.5 when not said. */
  risk?: { chance?: number; good: RoadBranch; bad: RoadBranch };
  /** The road the character takes when nobody decides. Never the poorer road in mechanics. */
  default?: boolean;
  /** The Cryer may print this when the road is taken. */
  headline?: string;
}
export interface Crossroad {
  id: string; kind: CrossroadKind;
  errands: Errand[];
  /** Only after these outcomes; any when not said. */
  outcomes?: Outcome[];
  requires?: { moon?: string[]; omen?: string[]; mark?: string[]; notMark?: string[] };
  weight?: number;
  setup: string;
  options: Road[];
}
/** A crossroads a night met, as written in the ledger. Roads carry their labels only; effects are read from the pack when a road is taken. */
export interface CrossroadsMet {
  id: string; memberId: string; kind: CrossroadKind; setup: string;
  /** The rival warband the setup and the roads name, so the road taken names the same one. */
  rival?: string;
  options: { id: string; label: string }[];
  decided?: { roadId: string; label: string; outcome: string; ledger: string[]; defaulted: boolean; on: number };
}
/**
 * Where the campaign is. A location is a whole content pack: which errands are open and why the others are not,
 * the places, the Dawn Report templates, the rumours, the Town Cryer's headlines and masthead. The game master
 * moves the campaign from the Watch House; the move takes effect from a night, so earlier nights keep their place.
 */
export interface Location {
  id: string; name: string; kind: 'city' | 'village';
  /** "the city", "the village": how the prose refers to the place. */
  settlement: string;
  /** "Nights in the City of the Damned": the Curfew's subtitle here. */
  title: string; tagline: string;
  errands: Errand[];
  /** Why an errand is not to be had here, as shown to the player. */
  unavailable: Partial<Record<Errand, string>>;
  /** Where a standing order for an errand that is not to be had here goes instead. */
  redirect: Partial<Record<Errand, Errand>>;
  /** An errand that takes another's Omen tilt and Moon favour: Dredge is the village's Scavenge. */
  inherits: Partial<Record<Errand, Errand>>;
  /** A Moon whose favoured errand is not to be had here favours this one instead. */
  moonBoost?: Record<string, Errand>;
  /** The Moons' tie-in lines for this place, one or several per errand; without them the Moon's own lines are used. */
  moonTies?: Record<string, Partial<Record<Errand, string | string[]>>>;
  /** Headline for the Cryer when the campaign arrives here. */
  arrival: string;
  /** A line under "Who goes out?" about what the place offers. */
  watchNote: string;
  blurbs: Partial<Record<Errand, string>>;
  cryer: { edition: string; banner: string; price: string; watchHeading: string; heard: string; bylines: string[]; headlines: Partial<Record<Errand, Record<Outcome, string[]>>> };
  districts: string[]; details: string[]; closers: string[];
  templates: Partial<Record<Errand, TemplateBank>>;
  pairs: string[];
  /** A line in which the rival warband crosses the member's path. Light, and rare. */
  encounters: string[];
  rumours: string[]; return: string[]; cityProvides: string[]; quiet: string[];
  epithets: Partial<Record<Errand, string[]>>;
  /** The choices a member may come to on an errand here, decided by the player at dawn. */
  crossroads?: Crossroad[];
  /** How the outcome opens when nobody decided and the character chose for themselves. */
  undecided?: string[];
  /** What each mark is called in the ledger line and the warrior's story. */
  markNames?: Record<string, string>;
}
export interface Move { locationId: string; fromNight: number }

export type StatKey = 'M' | 'WS' | 'BS' | 'S' | 'T' | 'W' | 'I' | 'A' | 'Ld';
export type StatlineLike = Record<StatKey, number>;
export interface MemberLike { id: string; name: string; role: string; dead?: boolean; stats?: StatlineLike }
export interface WarbandLike { id: string; name: string; members: MemberLike[] }

export interface Order { memberId: string; errand: Errand; standing?: boolean }
export interface HeldToken { id: string; earnedNight: number }
export interface HandState { favour: number; shards: number; renown: number; hand: HeldToken[] }

export interface OrderResult {
  memberId: string; errand: Errand; outcome: Outcome; standing: boolean;
  favour: number; renown: number; shards: number;
  /** Token earned this night, if any. Whether it fits the Hand is decided by applyNight. */
  token?: TokenDef; rumour?: string; convertedShards?: number; prose: string;
  /** Which template the prose came from (`errand:outcome:index`), so the nights after can steer away from it. */
  line?: string;
}
export interface NightResult {
  night: number; omenId: string; moonId: string; header: string; results: OrderResult[];
  closer?: string; detail: string; ledger: string[];
  /** Where the night happened. Nights written before the campaign could move have none, and were in Mordheim. */
  locationId?: string;
  /** The crossroads one member came to, if any. Undecided until the player, or the next midnight, decides. */
  crossroads?: CrossroadsMet;
}
export interface TokenOffer { night: number; incoming: string; held: string }

export const CAMPAIGN = campaign;
export const OMENS = omensData.omens as Omen[];
export const MOONS = moonsData.moons as Moon[];
export const TOKENS = tokensData.tokens as TokenDef[];
export const CURSES = tokensData.curses as CurseDef[];
export function curseById(id: string): CurseDef | undefined { return CURSES.find((c) => c.id === id); }
export const TOKEN_TYPES = tokensData.types as Record<TokenType, { name: string; seal: string; flavour: string }>;
export const TITLES = campaign.titles as { renown: number; title: string }[];

// ───────────────────────── where the campaign is ─────────────────────────

export const LOCATIONS = [mordheim, fussenbach] as unknown as Location[];
export const DEFAULT_LOCATION_ID = 'mordheim';
export const DEFAULT_LOCATION: Location = LOCATIONS.find((l) => l.id === DEFAULT_LOCATION_ID)!;
/** The location with this id; Mordheim for anything unknown, so an old ledger always reads. */
export function locationById(id?: string | null): Location { return LOCATIONS.find((l) => l.id === id) ?? DEFAULT_LOCATION; }
/** Where the campaign was on a night: the latest move on or before it, else Mordheim. Later moves on the same night win. */
export function locationForNight(night: number, moves: readonly Move[]): Location {
  let id = DEFAULT_LOCATION_ID;
  for (const m of moves.slice().sort((a, b) => a.fromNight - b.fromNight)) if (m.fromNight <= night) id = m.locationId;
  return locationById(id);
}
export function isErrandAt(errand: Errand, location: Location): boolean { return location.errands.includes(errand); }
/** The errand itself where it is to be had; otherwise where the place sends it, or its first errand. */
export function errandAt(errand: Errand, location: Location): Errand {
  if (isErrandAt(errand, location)) return errand;
  const to = location.redirect[errand];
  return to && isErrandAt(to, location) ? to : location.errands[0];
}
export function unavailableReason(errand: Errand, location: Location): string {
  return location.unavailable[errand] ?? `There is no ${ERRAND_LABEL[errand].toLowerCase()} to be had in ${location.name}.`;
}
export function blurbFor(errand: Errand, location: Location = DEFAULT_LOCATION): string { return location.blurbs[errand] ?? ERRAND_BLURB[errand]; }
/** The charms that may turn up at a place: the ones of no fixed place, and the place's own. */
export function tokensFor(type: TokenType | null, location: Location = DEFAULT_LOCATION): TokenDef[] {
  return TOKENS.filter((t) => (!type || t.type === type) && (!t.location || t.location === location.id));
}

// ───────────────────────── randomness ─────────────────────────

/** 32-bit FNV-1a over the joined parts. Stable across platforms. */
export function hashSeed(...parts: (string | number)[]): number {
  let h = 0x811c9dc5;
  const s = parts.join('|');
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}
/** mulberry32 */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function pick<T>(r: () => number, list: readonly T[]): T { return list[Math.floor(r() * list.length)]; }
export function shuffle<T>(r: () => number, list: readonly T[]): T[] {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
}

// ───────────────────────── calendar ─────────────────────────

/**
 * Calendar date as YYYY-MM-DD in the campaign's time zone. A night is one real day; it turns over at
 * midnight where the campaign is played, so every player and the server agree on which night it is.
 */
export function localDate(now: Date = new Date(), timeZone: string = campaign.timezone): string {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
    const get = (t: string) => parts.find((p) => p.type === t)!.value;
    return `${get('year')}-${get('month')}-${get('day')}`;
  } catch {
    const y = now.getFullYear(), m = String(now.getMonth() + 1).padStart(2, '0'), d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
}
/** The night it is now, by the campaign's clock. */
export function currentNight(now: Date = new Date()): number { return nightForDate(localDate(now)); }
function utcDay(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86400000);
}
/** Night 1 is the campaign's start date. Dates before the start are night 0 or less (nothing happens). */
export function nightForDate(date: string): number { return utcDay(date) - utcDay(campaign.start) + 1; }
export function dateForNight(night: number): string {
  const d = new Date((utcDay(campaign.start) + night - 1) * 86400000);
  return d.toISOString().slice(0, 10);
}
export function moonIndex(night: number): number { return Math.floor((night - 1) / campaign.nightsPerMoon); }

// ───────────────────────── omens & moons ─────────────────────────

/** Same Omen for every warband. Each run of 30 nights is a fresh shuffle of the deck, so no card repeats within a cycle. */
export function omenForNight(night: number): Omen {
  const cycle = Math.floor((night - 1) / OMENS.length);
  const order = shuffle(rng(hashSeed(campaign.id, 'omens', cycle)), OMENS);
  return order[(((night - 1) % OMENS.length) + OMENS.length) % OMENS.length];
}
export function moonForNight(night: number): Moon {
  const idx = moonIndex(night);
  const cycle = Math.floor(idx / MOONS.length);
  const order = shuffle(rng(hashSeed(campaign.id, 'moons', cycle)), MOONS);
  return order[((idx % MOONS.length) + MOONS.length) % MOONS.length];
}
/**
 * The errand a Moon favours at a place. Its own where that is to be had; else what the place says, else the
 * errand that inherits from it (Dredge for Scavenge); else nothing, and the Moon is flat there.
 */
export function moonBoostAt(moon: Moon, location: Location = DEFAULT_LOCATION): Errand | undefined {
  const said = location.moonBoost?.[moon.id];
  if (said && isErrandAt(said, location)) return said;
  if (isErrandAt(moon.boost, location)) return moon.boost;
  return location.errands.find((e) => location.inherits[e] === moon.boost);
}
/** The Moon's tie-in lines for an errand at a place; empty if the Moon leaves none there. */
export function moonTiesAt(moon: Moon, errand: Errand, location: Location = DEFAULT_LOCATION): string[] {
  const tie = location.moonTies ? location.moonTies[moon.id]?.[errand] : moon.ties[errand];
  return tie === undefined ? [] : Array.isArray(tie) ? tie : [tie];
}
/** Combined tilt for an errand on a night: the Omen's tilt plus one point for the Moon's favoured errand, clamped to ±3. */
export function tiltFor(errand: Errand, omen: Omen, moon: Moon, location: Location = DEFAULT_LOCATION): number {
  const from = location.inherits[errand];
  const o = omen.tilt[errand] ?? (from ? omen.tilt[from] : undefined) ?? 0;
  return Math.max(-3, Math.min(3, o + (moonBoostAt(moon, location) === errand ? 1 : 0)));
}

// ───────────────────────── the edge ─────────────────────────

/**
 * Each errand leans on one or two characteristics. A warrior who stands above their own warband's usual in
 * those gets a small edge on that errand. The baseline is per warband, so a band of Dwarfs and a band of
 * Sisters each have their strong and weak hands, and neither is favoured over the other.
 */
export const ERRAND_STATS: Record<Errand, StatKey[]> = {
  scavenge: ['M', 'I'], carouse: ['T', 'Ld'], train: ['WS', 'T'], spy: ['I', 'BS'], pray: ['Ld', 'W'], trade: ['Ld', 'I'], dredge: ['S', 'T'],
};
export const STAT_LABEL: Record<StatKey, string> = { M: 'Movement', WS: 'Weapon Skill', BS: 'Ballistic Skill', S: 'Strength', T: 'Toughness', W: 'Wounds', I: 'Initiative', A: 'Attacks', Ld: 'Leadership' };
export const EDGE_MAX = 2;

/** Living members with a statline: the warband the edge is measured against. */
function measured(warband: WarbandLike): MemberLike[] { return warband.members.filter((m) => !m.dead && m.stats); }
function errandScore(member: MemberLike, errand: Errand): number { return ERRAND_STATS[errand].reduce((sum, k) => sum + member.stats![k], 0); }

/** Mean of each characteristic across the living members with a statline. */
export function statBaseline(warband: WarbandLike): Partial<StatlineLike> {
  const living = measured(warband);
  const out: Partial<StatlineLike> = {};
  if (!living.length) return out;
  for (const key of Object.keys(STAT_LABEL) as StatKey[]) out[key] = living.reduce((sum, m) => sum + m.stats![key], 0) / living.length;
  return out;
}
/** How far above the warband's usual this member stands in an errand's characteristics, averaged. Negative below it. */
export function statMargin(warband: WarbandLike, member: MemberLike, errand: Errand): number {
  if (!member.stats) return 0;
  const base = statBaseline(warband);
  const keys = ERRAND_STATS[errand];
  return keys.reduce((sum, k) => sum + (member.stats![k] - (base[k] ?? member.stats![k])), 0) / keys.length;
}
/**
 * The edge a member brings to an errand, in points of tilt. Never a penalty.
 * 1: the warband's best hand for it, by the errand's characteristics, ahead of at least one other living member. Ties share it.
 * 2: a best hand that also stands a full point or more above the warband's usual in those characteristics.
 * Measured within the warband, so every band has its best hands and no band is favoured over another.
 */
export function statEdge(warband: WarbandLike, member: MemberLike, errand: Errand): number {
  const living = measured(warband);
  if (!member.stats || member.dead || living.length < 2) return 0;
  const scores = living.map((m) => errandScore(m, errand));
  const best = Math.max(...scores), worst = Math.min(...scores);
  if (errandScore(member, errand) < best || best === worst) return 0;
  return statMargin(warband, member, errand) >= 1 ? 2 : 1;
}

// ───────────────────────── availability ─────────────────────────

export interface Availability { memberId: string; available: boolean; reason?: 'dead' | 'recovering' | 'resting' | 'kept' }
/** Who can go out tonight. The dead never; the wounded not until healed; whoever went out last night rests; a road taken may keep someone home. */
export function availability(warband: WarbandLike, recovering: string[], resting: string[] = [], kept: string[] = []): Availability[] {
  return warband.members.map((m) => {
    if (m.dead) return { memberId: m.id, available: false, reason: 'dead' };
    if (recovering.includes(m.id)) return { memberId: m.id, available: false, reason: 'recovering' };
    if (resting.includes(m.id)) return { memberId: m.id, available: false, reason: 'resting' };
    if (kept.includes(m.id)) return { memberId: m.id, available: false, reason: 'kept' };
    return { memberId: m.id, available: true };
  });
}
/** A sensible default errand from the role, for standing orders, among those the place offers. */
export function defaultErrand(member: MemberLike, location: Location = DEFAULT_LOCATION): Errand {
  const role = member.role.toLowerCase();
  const byRole = (): Errand => {
    if (/priest|sister|confessor|flagellant|augur/.test(role)) return 'pray';
    if (/jaeger|hunter|scout|ranger|archer|marksman/.test(role)) return 'scavenge';
    if (/ogre|slayer|pit|champion|brother|troll/.test(role)) return 'train';
    if (/thief|assassin|beardling|youngblood|urchin|night runner/.test(role)) return 'spy';
    if (/lord|elder|captain|merchant|engineer|magister/.test(role)) return 'trade';
    return 'carouse';
  };
  return errandAt(byRole(), location);
}

// ───────────────────────── resolution ─────────────────────────

const ERRAND_TOKEN_TYPE: Partial<Record<Errand, TokenType>> = { carouse: 'fortune', train: 'ground', spy: 'sight', pray: 'fortune', trade: 'market', dredge: 'ground' };
/** Errands that bring the green home. */
const SHARD_ERRANDS: Errand[] = ['scavenge', 'dredge'];
const FAVOUR: Record<Outcome, number> = { boon: 8, fair: 5, poor: 2 };
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
/** The odds a night brings a charm home, by outcome and tilt. See the note at the drop. */
export const TOKEN_CHANCE = {
  boon: (tilt: number) => clamp(0.33 + 0.05 * tilt, 0.2, 0.5),
  fair: (tilt: number) => clamp(0.07 + 0.02 * tilt, 0.02, 0.13),
};

function rollOutcome(r: () => number, tilt: number): Outcome {
  let boon = 0.25 + 0.08 * tilt, poor = 0.3 - 0.08 * tilt;
  boon = Math.max(0.05, Math.min(0.6, boon));
  poor = Math.max(0.05, Math.min(0.6, poor));
  const x = r();
  if (x < boon) return 'boon';
  if (x > 1 - poor) return 'poor';
  return 'fair';
}
function firstName(name: string): string { return name.split(' ')[0]; }
function fill(template: string, slots: Record<string, string>): string {
  return template
    .replace(/\{(\w+)\}/g, (_, k) => slots[k] ?? `{${k}}`)
    .replace(/(^|[.!?]\s+)([a-z])/g, (_, a, b) => a + b.toUpperCase());
}

export interface ResolveInput {
  warband: WarbandLike; night: number; orders: Order[]; state: HandState;
  /** The other warbands. With several, the night picks one to be the rival its vignettes speak of. */
  rival?: WarbandLike | WarbandLike[];
  /** Where the night happens. Mordheim when not said. */
  location?: Location;
  /** Lines (see OrderResult.line) written in the nights just before. The draw steers away from them, so a month rarely repeats itself. */
  avoid?: readonly string[];
  /** A road taken at dawn reaching into tonight: a tilt on one member's errand. */
  carry?: { memberId: string; tilt?: number };
  /** What the crossroads draw needs to know about the ledger. Without it no crossroads is met (quiet nights, tests of the dice alone). */
  crossroads?: { seen: readonly string[]; marks: Record<string, { id: string }[]>; recent: boolean };
}
/** The templates for an errand at a place, falling back to Mordheim's so an odd order never leaves a night unwritten. */
function templatesAt(errand: Errand, location: Location): TemplateBank {
  return location.templates[errand] ?? DEFAULT_LOCATION.templates[errand] ?? { boon: [], fair: [], poor: [], standing: [] };
}
/**
 * Resolve one night for one warband. Deterministic: the same input always gives the same night.
 * Does not mutate state; see applyNight for the bookkeeping.
 */
export function resolveNight(input: ResolveInput): NightResult {
  const { warband, night, state } = input;
  const location = input.location ?? DEFAULT_LOCATION;
  const omen = omenForNight(night), moon = moonForNight(night);
  const orders = input.orders.slice(0, campaign.membersPerNight);
  const r = rng(hashSeed(campaign.id, warband.id, night, ...orders.map((o) => `${o.memberId}:${o.errand}:${o.standing ? 's' : 'o'}`)));
  const results: OrderResult[] = [];
  let favour = state.favour, shards = state.shards;
  const rivals = Array.isArray(input.rival) ? input.rival : input.rival ? [input.rival] : [];
  const rivalBand = rivals.length > 1 ? pick(r, rivals) : rivals[0];
  // templates say "the {rival}", so a name that begins with "The" sheds it: "the Nordost Kin", never "the The Nordost Kin"
  const rival = rivalBand ? rivalBand.name.replace(/^the\s+/i, '') : 'rival warband';
  const rivalLiving = rivalBand?.members.filter((m) => !m.dead) ?? [];
  const detail = pick(r, location.details);

  orders.forEach((order, i) => {
    const member = warband.members.find((m) => m.id === order.memberId);
    if (!member) return;
    const standing = !!order.standing;
    // the Omen and the Moon set the night's odds; who you send moves them a little further
    const carried = input.carry?.memberId === member.id ? input.carry.tilt ?? 0 : 0;
    const tilt = Math.max(-3, Math.min(3, tiltFor(order.errand, omen, moon, location) + (standing ? 0 : statEdge(warband, member, order.errand)) + carried));
    const outcome: Outcome = standing ? (r() < 0.2 ? 'poor' : 'fair') : rollOutcome(r, tilt);
    let f = FAVOUR[outcome];
    if (standing) f = Math.ceil(f / 2);
    let renown = 0, gained = 0, token: TokenDef | undefined, rumour: string | undefined, convertedShards: number | undefined;
    // yields by errand
    if (SHARD_ERRANDS.includes(order.errand)) gained = standing ? (outcome === 'fair' && r() < 0.5 ? 1 : 0) : { boon: 2, fair: 1, poor: 0 }[outcome];
    if (order.errand === 'train') renown += { boon: 3, fair: 1, poor: 0 }[outcome];
    if (order.errand === 'carouse' && outcome === 'boon') renown += 1;
    if (order.errand === 'spy' && outcome !== 'poor') rumour = fill(pick(r, location.rumours), { rival });
    if (order.errand === 'trade' && outcome !== 'poor' && shards >= 5) {
      convertedShards = 5; shards -= 5;
      token = pick(r, tokensFor('market', location));
    }
    // token drop: a boon often brings one, a fair night now and then, a poor night and standing orders never.
    // Tuned so a warband with two out finds a charm about one night in three; the Omen, the Moon and the edge push it a little.
    const type = ERRAND_TOKEN_TYPE[order.errand];
    if (type && !token && !standing) {
      const chance = outcome === 'boon' ? TOKEN_CHANCE.boon(tilt) : outcome === 'fair' ? TOKEN_CHANCE.fair(tilt) : 0;
      if (r() < chance) token = pick(r, tokensFor(type, location));
    }
    // favour soft cap: past it the city forgets quickly and the surplus becomes a name
    let effective = f;
    if (favour >= campaign.favourSoftCap) { effective = Math.ceil(f / 2); renown += f - effective; }
    effective = Math.max(0, Math.min(effective, 100 - favour));
    favour += effective; shards += gained;
    // prose
    const bank = templatesAt(order.errand, location);
    const pool = standing ? bank.standing : bank[outcome];
    const lineKey = (idx: number) => `${order.errand}:${standing ? 'standing' : outcome}:${idx}`;
    let index = Math.floor(r() * pool.length);
    // a line used in the nights just before is redrawn, a few times, when the bank is deep enough to allow it
    if (input.avoid?.length && pool.length > 3) for (let tries = 0; tries < 3 && input.avoid.includes(lineKey(index)); tries++) index = Math.floor(r() * pool.length);
    const template = pool[index];
    const other = orders.find((o) => o !== order);
    const otherMember = other && warband.members.find((m) => m.id === other.memberId);
    const slots = {
      name: member.name, first: firstName(member.name), they: 'they', them: 'them', their: 'their',
      district: pick(r, location.districts), omen: omen.title, rival, other: otherMember ? firstName(otherMember.name) : 'nobody',
    };
    let prose = fill(template, slots);
    if (i === 1 && otherMember && r() < 0.35) prose += ' ' + fill(pick(r, location.pairs), { ...slots, other: firstName(member.name) });
    // the Moon leaves its mark on one errand a night, quietly
    const ties = moonTiesAt(moon, order.errand, location);
    if (i === 0 && ties.length && r() < 0.6) prose += ' ' + fill(pick(r, ties), slots);
    // now and then the rival warband crosses their path; never on standing orders, which nobody remarks on
    if (i === 0 && !standing && rivalBand && location.encounters.length && r() < 0.15) {
      const rivalMember = rivalLiving.length ? firstName(pick(r, rivalLiving).name) : 'somebody';
      prose += ' ' + fill(pick(r, location.encounters), { ...slots, rivalMember });
    }
    results.push({ memberId: member.id, errand: order.errand, outcome, standing, favour: effective, renown, shards: gained, token, rumour, convertedShards, prose, line: lineKey(index) });
  });

  const ledger: string[] = [];
  const totalFavour = results.reduce((a, b) => a + b.favour, 0);
  const totalShards = results.reduce((a, b) => a + b.shards, 0);
  const totalRenown = results.reduce((a, b) => a + b.renown, 0);
  if (totalFavour) ledger.push(`+${totalFavour} Favour`);
  if (totalShards) ledger.push(`${totalShards} ${totalShards === 1 ? 'shard' : 'shards'}`);
  if (totalRenown) ledger.push(`+${totalRenown} Renown`);
  for (const res of results) {
    const m = warband.members.find((x) => x.id === res.memberId)!;
    if (res.convertedShards) ledger.push(`${firstName(m.name)}: 5 shards to ${res.token!.name}`);
    else if (res.token) ledger.push(`${firstName(m.name)}: ${res.token.name}`);
    if (res.rumour) ledger.push(`${firstName(m.name)}: a rumour`);
  }
  const header = `Night ${night} — under ${omen.title}.`;
  const closer = results.length && r() < 0.45 ? pick(r, location.closers) : undefined;
  // last of all, and only after the dice have said their piece: does one of them come to a crossroads?
  const crossroads = input.crossroads ? drawCrossroads(r, warband, night, results, location, input.crossroads, { rival }) : undefined;
  return { night, omenId: omen.id, moonId: moon.id, header, results, closer, detail, ledger, locationId: location.id, ...(crossroads ? { crossroads } : {}) };
}

// ───────────────────────── the Crossroads ─────────────────────────

/** The crossroads a member could come to after this errand and outcome, here, given what they already carry. */
export function crossroadsFor(location: Location, errand: Errand, outcome: Outcome, night: number, marks: { id: string }[], seen: readonly string[]): Crossroad[] {
  const omen = omenForNight(night), moon = moonForNight(night);
  const has = (id: string) => marks.some((m) => m.id === id);
  return (location.crossroads ?? []).filter((c) =>
    c.errands.includes(errand)
    && (!c.outcomes || c.outcomes.includes(outcome))
    && !seen.includes(c.id)
    && (!c.requires?.moon || c.requires.moon.includes(moon.id))
    && (!c.requires?.omen || c.requires.omen.includes(omen.id))
    && (!c.requires?.mark || c.requires.mark.every(has))
    && (!c.requires?.notMark || !c.requires.notMark.some(has)));
}
/** Unmet crossroads first; when every fitting one has been met, all but the most recent half of them; failing that, any that fits. */
function crossroadsWithFallback(location: Location, errand: Errand, outcome: Outcome, night: number, marks: { id: string }[], seen: readonly string[]): Crossroad[] {
  const unmet = crossroadsFor(location, errand, outcome, night, marks, seen);
  if (unmet.length) return unmet;
  const any = crossroadsFor(location, errand, outcome, night, marks, []);
  if (!any.length) return any;
  const recent = seen.filter((id) => any.some((c) => c.id === id)).slice(-Math.floor(any.length / 2));
  const older = any.filter((c) => !recent.includes(c.id));
  return older.length ? older : any;
}
function weighted<T extends { weight?: number }>(r: () => number, list: readonly T[]): T {
  const total = list.reduce((a, c) => a + (c.weight ?? 1), 0);
  let x = r() * total;
  for (const c of list) { x -= c.weight ?? 1; if (x < 0) return c; }
  return list[list.length - 1];
}
/**
 * About one night in three (`crossroadsChance` is the raw draw; the night's rest after a crossroads brings it down to
 * about a third), the first member out on real orders whose errand has a crossroads to offer comes to one.
 * Never on standing orders, never two nights running, and not the same crossroads again while others are still unmet:
 * once a pack's crossroads have all been met, the least recently met come round again rather than the nights going quiet.
 */
function drawCrossroads(r: () => number, warband: WarbandLike, night: number, results: OrderResult[], location: Location, ctx: NonNullable<ResolveInput['crossroads']>, extra: { rival: string }): CrossroadsMet | undefined {
  const hit = r() < campaign.crossroadsChance;
  if (!hit || ctx.recent) return undefined;
  for (const res of results) {
    if (res.standing) continue;
    const member = warband.members.find((m) => m.id === res.memberId);
    if (!member) continue;
    const candidates = crossroadsWithFallback(location, res.errand, res.outcome, night, ctx.marks[member.id] ?? [], ctx.seen);
    if (!candidates.length) continue;
    const c = weighted(r, candidates);
    const other = results.find((x) => x !== res);
    const otherMember = other && warband.members.find((m) => m.id === other.memberId);
    const slots = roadSlots(warband, member, otherMember, location, r, extra.rival);
    return { id: c.id, memberId: member.id, kind: c.kind, setup: fill(c.setup, slots), rival: extra.rival, options: c.options.map((o) => ({ id: o.id, label: fill(o.label, slots) })) };
  }
  return undefined;
}
function roadSlots(warband: WarbandLike, member: MemberLike, other: MemberLike | undefined, location: Location, r: () => number, rival: string): Record<string, string> {
  return {
    name: member.name, first: firstName(member.name), they: 'they', them: 'them', their: 'their',
    district: pick(r, location.districts), other: other ? firstName(other.name) : 'nobody', rival, warband: warband.name,
  };
}
/** The road the character takes when nobody decides: the one marked default, else a seeded pick. */
export function defaultRoad(c: Crossroad, warbandId: string, night: number): Road {
  return c.options.find((o) => o.default) ?? pick(rng(hashSeed(campaign.id, 'undecided', warbandId, night, c.id)), c.options);
}
export function crossroadById(location: Location, id: string): Crossroad | undefined { return location.crossroads?.find((c) => c.id === id); }

/** What actually happened once a road was taken: the numbers, the charm, the words. */
export interface RoadTaken {
  road: Road; label: string; outcome: string; headline?: string;
  favour: number; shards: number; renown: number;
  tokenId?: string; rumour?: string; mark?: { id: string; name: string }; carryTilt?: number; staysHome?: number; curse?: CurseDef;
}
export interface TakeRoadInput { warband: WarbandLike; night: NightResult; roadId: string; location: Location; defaulted?: boolean; rival?: WarbandLike | WarbandLike[] }
/**
 * Take a road at a crossroads. Deterministic in (campaign, warband, night, crossroads, road): the dice inside a risk road,
 * the charm, the rumour and the words fall the same way on every machine. Does not touch state; the ledger does the bookkeeping.
 */
export function takeRoad(input: TakeRoadInput): RoadTaken {
  const { warband, night, location } = input;
  const met = night.crossroads;
  if (!met) throw new Error('No crossroads was met that night.');
  const c = crossroadById(location, met.id) ?? crossroadById(DEFAULT_LOCATION, met.id);
  if (!c) throw new Error(`The pack has no crossroads ${met.id}.`);
  const road = c.options.find((o) => o.id === input.roadId);
  if (!road) throw new Error(`No road ${input.roadId} at ${met.id}.`);
  const member = warband.members.find((m) => m.id === met.memberId) ?? { id: met.memberId, name: 'Somebody', role: '' };
  const r = rng(hashSeed(campaign.id, 'road', warband.id, night.night, c.id, road.id));
  // the rival named when the crossroads was met; only a night written before rivals were remembered falls back to a draw
  const rivals = Array.isArray(input.rival) ? input.rival : input.rival ? [input.rival] : [];
  const rivalBand = rivals.length > 1 ? pick(r, rivals) : rivals[0];
  const rival = met.rival ?? (rivalBand ? rivalBand.name.replace(/^the\s+/i, '') : 'rival warband');
  const otherRes = night.results.find((x) => x.memberId !== met.memberId);
  const other = otherRes && warband.members.find((m) => m.id === otherRes.memberId);
  const slots = roadSlots(warband, member, other, location, r, rival);
  // a risk road: the player chose the risk, the dice choose the branch
  let branch: RoadBranch = road;
  let outcome = fill(road.outcome, slots);
  if (road.risk) {
    branch = r() < (road.risk.chance ?? 0.5) ? road.risk.good : road.risk.bad;
    outcome = `${outcome} ${fill(branch.outcome, slots)}`.trim();
  }
  if (input.defaulted && location.undecided?.length) outcome = `${pick(r, location.undecided).replace(/\{first\}/g, slots.first)} ${outcome}`;
  const fx = branch.effects ?? {};
  const curse = fx.curse ? curseById(fx.curse) : undefined;
  const out: RoadTaken = {
    road, label: fill(road.label, slots), outcome, headline: road.headline ? fill(road.headline, slots) : curse?.headline ? fill(curse.headline, slots) : undefined,
    favour: (fx.favour ?? 0), shards: (fx.shards ?? 0) + (curse?.effects?.shards ?? 0), renown: (fx.renown ?? 0) + (curse?.effects?.renown ?? 0),
    tokenId: fx.token ? pick(r, tokensFor(fx.token, location)).id : undefined,
    rumour: fx.rumour ? fill(pick(r, location.rumours), { rival }) : undefined,
    mark: fx.mark ? { id: fx.mark, name: location.markNames?.[fx.mark] ?? DEFAULT_LOCATION.markNames?.[fx.mark] ?? fx.mark.replace(/-/g, ' ') } : undefined,
    carryTilt: fx.carry?.tilt, staysHome: fx.carry?.staysHome ?? curse?.effects?.staysHome, curse,
  };
  return out;
}
/** The ledger line a road taken adds beneath the night's own. */
export function roadLedger(taken: RoadTaken, member: MemberLike): string[] {
  const first = firstName(member.name), out: string[] = [];
  const signed = (n: number) => (n > 0 ? `+${n}` : `−${-n}`);
  if (taken.favour) out.push(`${signed(taken.favour)} Favour`);
  if (taken.shards) out.push(`${signed(taken.shards)} ${Math.abs(taken.shards) === 1 ? 'shard' : 'shards'}`);
  if (taken.renown) out.push(`${signed(taken.renown)} Renown`);
  if (taken.tokenId) out.push(`${first}: ${tokenById(taken.tokenId).name}`);
  if (taken.rumour) out.push(`${first}: a rumour`);
  if (taken.curse) out.push(`${first}: ${taken.curse.name}${taken.curse.nights > 1 ? ` (${taken.curse.nights} nights)` : ''}`);
  if (taken.mark) out.push(`${first}: ${taken.mark.name}`);
  if (taken.carryTilt) out.push(`${first}: ${taken.carryTilt > 0 ? '▲'.repeat(taken.carryTilt) : '▼'.repeat(-taken.carryTilt)} tonight`);
  if (taken.staysHome) out.push(`${first} stays in tonight`);
  return out;
}

/** The night nobody went out. Still a Chronicle line. */
export function quietNight(night: number, location: Location = DEFAULT_LOCATION): NightResult {
  const omen = omenForNight(night), moon = moonForNight(night);
  const r = rng(hashSeed(campaign.id, 'quiet', night));
  return { night, omenId: omen.id, moonId: moon.id, header: `Night ${night} — under ${omen.title}.`, results: [], detail: pick(r, location.details), closer: pick(r, location.quiet), ledger: [], locationId: location.id };
}
/** The single vignette a player gets after a long absence. No summary of what they missed. */
export function returnNight(night: number, warbandId: string, location: Location = DEFAULT_LOCATION): NightResult {
  const omen = omenForNight(night), moon = moonForNight(night);
  const r = rng(hashSeed(campaign.id, 'return', warbandId, night));
  return { night, omenId: omen.id, moonId: moon.id, header: `Night ${night} — the return.`, results: [], detail: pick(r, location.return), ledger: ['Favour primed to 20'], locationId: location.id };
}

// ───────────────────────── the Hand ─────────────────────────

export const HAND_SIZE = 3;
export function tokenById(id: string): TokenDef { return TOKENS.find((t) => t.id === id)!; }
export function handHas(hand: HeldToken[], type: TokenType): HeldToken | undefined { return hand.find((h) => tokenById(h.id).type === type); }

/** Apply a night's results to a hand state. Tokens of a type already held become offers to decide. */
export function applyNight(state: HandState, result: NightResult): { state: HandState; offers: TokenOffer[] } {
  const next: HandState = { ...state, hand: state.hand.slice() };
  const offers: TokenOffer[] = [];
  for (const res of result.results) {
    next.favour = Math.min(100, next.favour + res.favour);
    next.shards += res.shards - (res.convertedShards ?? 0);
    next.renown += res.renown;
    if (res.token) {
      // one per type, and never more than three: a fourth kind is offered against the oldest charm
      const held = handHas(next.hand, res.token.type) ?? (next.hand.length >= HAND_SIZE ? next.hand.slice().sort((a, b) => a.earnedNight - b.earnedNight)[0] : undefined);
      if (held) offers.push({ night: result.night, incoming: res.token.id, held: held.id });
      else next.hand.push({ id: res.token.id, earnedNight: result.night });
    }
  }
  return { state: next, offers };
}
/** The City Provides: a warband at the Eve with an empty Hand is dealt one random token, from among the place's. */
export function cityProvides(warbandId: string, night: number, location: Location = DEFAULT_LOCATION): TokenDef {
  return pick(rng(hashSeed(campaign.id, 'provides', warbandId, night)), tokensFor(null, location));
}
export function cityProvidesLine(warbandId: string, night: number, location: Location = DEFAULT_LOCATION): string {
  return pick(rng(hashSeed(campaign.id, 'provides-line', warbandId, night)), location.cityProvides);
}
export function titleFor(renown: number): string {
  let title = TITLES[0].title;
  for (const t of TITLES) if (renown >= t.renown) title = t.title;
  return title;
}
export function nextTitle(renown: number): { title: string; renown: number } | undefined { return TITLES.find((t) => t.renown > renown); }
/** Epithets are earned by featuring in enough Chronicle entries; the errand they did most decides the flavour, the place the words. */
export function epithetFor(memberId: string, counts: Partial<Record<Errand, number>>, location: Location = DEFAULT_LOCATION): string {
  const top = (Object.entries(counts) as [Errand, number][]).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'carouse';
  const pool = location.epithets[top] ?? DEFAULT_LOCATION.epithets[top] ?? DEFAULT_LOCATION.epithets.carouse!;
  return pick(rng(hashSeed(campaign.id, 'epithet', memberId)), pool);
}

/** Short ticket for the Eve, carrying the charm count so a rival can be shown how many, not which. */
export function eveTicket(warbandId: string, night: number, count: number): string {
  const h = hashSeed(campaign.id, 'eve', warbandId, night).toString(36).toUpperCase().padStart(7, '0').slice(-5);
  return `EVE-${count}-${h}`;
}
export function readTicket(ticket: string): number | null {
  const m = /^EVE-([0-3])-[0-9A-Z]{5}$/i.exec(ticket.trim());
  return m ? Number(m[1]) : null;
}
