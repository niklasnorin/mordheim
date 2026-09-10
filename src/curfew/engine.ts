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
import vignettes from '../data/curfew/vignettes.json' with { type: 'json' };

export type Errand = 'scavenge' | 'carouse' | 'train' | 'spy' | 'pray' | 'trade';
export const ERRANDS: Errand[] = ['scavenge', 'carouse', 'train', 'spy', 'pray', 'trade'];
export const ERRAND_LABEL: Record<Errand, string> = { scavenge: 'Scavenge', carouse: 'Carouse', train: 'Train', spy: 'Spy', pray: 'Pray', trade: 'Trade' };
export const ERRAND_BLURB: Record<Errand, string> = {
  scavenge: 'Sift the rubble for the green. Shards, and ink for the map.',
  carouse: 'Drink where the city talks. Favour, rumours, a Fortune charm.',
  train: 'The Pit, or the yard. A name, and Ground.',
  spy: 'Listen at the thin walls. Rumours and Sight.',
  pray: 'Keep the candles. Blessings, Fortune.',
  trade: 'Move the green quietly. Market chits; five shards make one.',
};

export type TokenType = 'fortune' | 'ground' | 'market' | 'sight';
export interface TokenDef { id: string; type: TokenType; name: string; effect: string }
export interface Omen { id: string; numeral: string; title: string; reading: string; tilt: Partial<Record<Errand, number>>; notes: string; image: string }
/** A Moon favours one errand by a single point. Everything else about it is narrative, woven into the Dawn Report. */
export interface Moon { id: string; name: string; reading: string; boost: Errand; ties: Partial<Record<Errand, string>> }

export type StatKey = 'M' | 'WS' | 'BS' | 'S' | 'T' | 'W' | 'I' | 'A' | 'Ld';
export type StatlineLike = Record<StatKey, number>;
export interface MemberLike { id: string; name: string; role: string; dead?: boolean; stats?: StatlineLike }
export interface WarbandLike { id: string; name: string; members: MemberLike[] }

export interface Order { memberId: string; errand: Errand; standing?: boolean }
export type Outcome = 'boon' | 'fair' | 'poor';
export interface HeldToken { id: string; earnedNight: number }
export interface HandState { favour: number; shards: number; renown: number; hand: HeldToken[] }

export interface OrderResult {
  memberId: string; errand: Errand; outcome: Outcome; standing: boolean;
  favour: number; renown: number; shards: number;
  /** Token earned this night, if any. Whether it fits the Hand is decided by applyNight. */
  token?: TokenDef; rumour?: string; convertedShards?: number; prose: string;
}
export interface NightResult {
  night: number; omenId: string; moonId: string; header: string; results: OrderResult[];
  closer?: string; detail: string; ledger: string[];
}
export interface TokenOffer { night: number; incoming: string; held: string }

export const CAMPAIGN = campaign;
export const OMENS = omensData.omens as Omen[];
export const MOONS = moonsData.moons as Moon[];
export const TOKENS = tokensData.tokens as TokenDef[];
export const TOKEN_TYPES = tokensData.types as Record<TokenType, { name: string; seal: string; flavour: string }>;
export const TITLES = vignettes.titles as { renown: number; title: string }[];

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

/** Local calendar date as YYYY-MM-DD. A night is one real day; it turns over at local midnight. */
export function localDate(now: Date = new Date()): string {
  const y = now.getFullYear(), m = String(now.getMonth() + 1).padStart(2, '0'), d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
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
/** Combined tilt for an errand on a night: the Omen's tilt plus one point for the Moon's favoured errand, clamped to ±3. */
export function tiltFor(errand: Errand, omen: Omen, moon: Moon): number {
  const o = omen.tilt[errand] ?? 0;
  return Math.max(-3, Math.min(3, o + (moon.boost === errand ? 1 : 0)));
}

// ───────────────────────── the edge ─────────────────────────

/**
 * Each errand leans on one or two characteristics. A warrior who stands above their own warband's usual in
 * those gets a small edge on that errand. The baseline is per warband, so a band of Dwarfs and a band of
 * Sisters each have their strong and weak hands, and neither is favoured over the other.
 */
export const ERRAND_STATS: Record<Errand, StatKey[]> = {
  scavenge: ['M', 'I'], carouse: ['T', 'Ld'], train: ['WS', 'T'], spy: ['I', 'BS'], pray: ['Ld', 'W'], trade: ['Ld', 'I'],
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

export interface Availability { memberId: string; available: boolean; reason?: 'dead' | 'recovering' }
export function availability(warband: WarbandLike, recovering: string[]): Availability[] {
  return warband.members.map((m) => {
    if (m.dead) return { memberId: m.id, available: false, reason: 'dead' };
    if (recovering.includes(m.id)) return { memberId: m.id, available: false, reason: 'recovering' };
    return { memberId: m.id, available: true };
  });
}
/** A sensible default errand from the role, for standing orders. */
export function defaultErrand(member: MemberLike): Errand {
  const role = member.role.toLowerCase();
  if (/priest|sister|confessor|flagellant|augur/.test(role)) return 'pray';
  if (/jaeger|hunter|scout|ranger|archer|marksman/.test(role)) return 'scavenge';
  if (/ogre|slayer|pit|champion|brother|troll/.test(role)) return 'train';
  if (/thief|assassin|beardling|youngblood|urchin|night runner/.test(role)) return 'spy';
  if (/lord|elder|captain|merchant|engineer|magister/.test(role)) return 'trade';
  return 'carouse';
}

// ───────────────────────── resolution ─────────────────────────

const ERRAND_TOKEN_TYPE: Partial<Record<Errand, TokenType>> = { carouse: 'fortune', train: 'ground', spy: 'sight', pray: 'fortune', trade: 'market' };
const FAVOUR: Record<Outcome, number> = { boon: 8, fair: 5, poor: 2 };

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
  warband: WarbandLike; rival?: WarbandLike; night: number; orders: Order[]; state: HandState;
}
/**
 * Resolve one night for one warband. Deterministic: the same input always gives the same night.
 * Does not mutate state; see applyNight for the bookkeeping.
 */
export function resolveNight(input: ResolveInput): NightResult {
  const { warband, night, state } = input;
  const omen = omenForNight(night), moon = moonForNight(night);
  const orders = input.orders.slice(0, campaign.membersPerNight);
  const r = rng(hashSeed(campaign.id, warband.id, night, ...orders.map((o) => `${o.memberId}:${o.errand}:${o.standing ? 's' : 'o'}`)));
  const results: OrderResult[] = [];
  let favour = state.favour, shards = state.shards;
  const rival = input.rival?.name ?? 'the rival warband';
  const detail = pick(r, vignettes.details);

  orders.forEach((order, i) => {
    const member = warband.members.find((m) => m.id === order.memberId);
    if (!member) return;
    const standing = !!order.standing;
    // the Omen and the Moon set the night's odds; who you send moves them a little further
    const tilt = Math.max(-3, Math.min(3, tiltFor(order.errand, omen, moon) + (standing ? 0 : statEdge(warband, member, order.errand))));
    const outcome: Outcome = standing ? (r() < 0.2 ? 'poor' : 'fair') : rollOutcome(r, tilt);
    let f = FAVOUR[outcome];
    if (standing) f = Math.ceil(f / 2);
    let renown = 0, gained = 0, token: TokenDef | undefined, rumour: string | undefined, convertedShards: number | undefined;
    // yields by errand
    if (order.errand === 'scavenge') gained = standing ? (outcome === 'fair' && r() < 0.5 ? 1 : 0) : { boon: 2, fair: 1, poor: 0 }[outcome];
    if (order.errand === 'train') renown += { boon: 3, fair: 1, poor: 0 }[outcome];
    if (order.errand === 'carouse' && outcome === 'boon') renown += 1;
    if (order.errand === 'spy' && outcome !== 'poor') rumour = fill(pick(r, vignettes.rumours), { rival });
    if (order.errand === 'trade' && outcome !== 'poor' && shards >= 5) {
      convertedShards = 5; shards -= 5;
      token = pick(r, TOKENS.filter((t) => t.type === 'market'));
    }
    // token drop: a boon always brings one, a fair night sometimes, standing orders never
    const type = ERRAND_TOKEN_TYPE[order.errand];
    if (type && !token && !standing) {
      const chance = outcome === 'boon' ? 1 : outcome === 'fair' ? Math.max(0.1, 0.35 + 0.1 * tilt) : 0;
      if (r() < chance) token = pick(r, TOKENS.filter((t) => t.type === type));
    }
    // favour soft cap: past it the city forgets quickly and the surplus becomes a name
    let effective = f;
    if (favour >= campaign.favourSoftCap) { effective = Math.ceil(f / 2); renown += f - effective; }
    effective = Math.max(0, Math.min(effective, 100 - favour));
    favour += effective; shards += gained;
    // prose
    const bank = (vignettes.templates as Record<Errand, Record<string, string[]>>)[order.errand];
    const template = pick(r, standing ? bank.standing : bank[outcome]);
    const other = orders.find((o) => o !== order);
    const otherMember = other && warband.members.find((m) => m.id === other.memberId);
    const slots = {
      name: member.name, first: firstName(member.name), they: 'they', them: 'them', their: 'their',
      district: pick(r, vignettes.districts), omen: omen.title, rival, other: otherMember ? firstName(otherMember.name) : 'nobody',
    };
    let prose = fill(template, slots);
    if (i === 1 && otherMember && r() < 0.35) prose += ' ' + fill(pick(r, vignettes.pairs), { ...slots, other: firstName(member.name) });
    // the Moon leaves its mark on one errand a night, quietly
    const tie = moon.ties[order.errand];
    if (i === 0 && tie && r() < 0.6) prose += ' ' + fill(tie, slots);
    results.push({ memberId: member.id, errand: order.errand, outcome, standing, favour: effective, renown, shards: gained, token, rumour, convertedShards, prose });
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
  const closer = results.length && r() < 0.45 ? pick(r, vignettes.closers) : undefined;
  return { night, omenId: omen.id, moonId: moon.id, header, results, closer, detail, ledger };
}

/** The night nobody went out. Still a Chronicle line. */
export function quietNight(night: number): NightResult {
  const omen = omenForNight(night), moon = moonForNight(night);
  const r = rng(hashSeed(campaign.id, 'quiet', night));
  return { night, omenId: omen.id, moonId: moon.id, header: `Night ${night} — under ${omen.title}.`, results: [], detail: pick(r, vignettes.details), closer: pick(r, vignettes.quiet), ledger: [] };
}
/** The single vignette a player gets after a long absence. No summary of what they missed. */
export function returnNight(night: number, warbandId: string): NightResult {
  const omen = omenForNight(night), moon = moonForNight(night);
  const r = rng(hashSeed(campaign.id, 'return', warbandId, night));
  return { night, omenId: omen.id, moonId: moon.id, header: `Night ${night} — the return.`, results: [], detail: pick(r, vignettes.return), ledger: ['Favour primed to 20'] };
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
/** The City Provides: a warband at the Eve with an empty Hand is dealt one random token. */
export function cityProvides(warbandId: string, night: number): TokenDef {
  return pick(rng(hashSeed(campaign.id, 'provides', warbandId, night)), TOKENS);
}
export function cityProvidesLine(warbandId: string, night: number): string {
  return pick(rng(hashSeed(campaign.id, 'provides-line', warbandId, night)), vignettes.cityProvides);
}
export function titleFor(renown: number): string {
  let title = TITLES[0].title;
  for (const t of TITLES) if (renown >= t.renown) title = t.title;
  return title;
}
export function nextTitle(renown: number): { title: string; renown: number } | undefined { return TITLES.find((t) => t.renown > renown); }
/** Epithets are earned by featuring in enough Chronicle entries; the errand they did most decides the flavour. */
export function epithetFor(memberId: string, counts: Partial<Record<Errand, number>>): string {
  const top = (Object.entries(counts) as [Errand, number][]).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'carouse';
  const pool = (vignettes.epithets as Record<Errand, string[]>)[top];
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
