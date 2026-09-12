/**
 * The odds, laid out for the game master. Everything here is computed from the same constants the dice use
 * (`outcomeOdds`, `TOKEN_CHANCE`, `FAVOUR`, `YIELDS`, `PRINT_CHANCE`, `crossroadsChance`), so the page at
 * `/admin/odds/` can never drift from the nights. `simulateNights` runs the real engine and ledger over many nights
 * as a check on the arithmetic, and to see what the fallbacks and the rests do to the long run.
 */
import {
  CAMPAIGN, ERRANDS, ERRAND_TOKEN_TYPE, FAVOUR, SHARD_ERRANDS, TOKEN_CHANCE, YIELDS, hashSeed, outcomeOdds, rng,
  type Crossroad, type CrossroadKind, type Errand, type Location, type Outcome, type WarbandLike,
} from './engine.ts';
import { PRINT_CHANCE, happeningFor } from './cryer.ts';
import { freshState, giveOrders, keptMembers, reconcile, restingMembers, decide, waitingCrossroads, type WarbandState } from './ledger.ts';

export const TILTS = [-3, -2, -1, 0, 1, 2, 3] as const;
export const OUTCOMES: Outcome[] = ['boon', 'fair', 'poor'];
export const KINDS: CrossroadKind[] = ['moral', 'risk', 'loyalty', 'lore', 'light'];

/** Where the points of tilt come from, for the page's legend. */
export const TILT_SOURCES = [
  { source: 'The Omen', range: '−2 to +2', note: 'per errand, the same for every warband on a night' },
  { source: 'The Moon', range: '+1', note: 'on its favoured errand, or the one the place redirects it to' },
  { source: 'The edge', range: '+1 or +2', note: "the warband's best hand for the errand's characteristics; never a penalty; not on standing orders" },
  { source: 'A road taken', range: '−1 or +1', note: 'a crossroads decided at dawn, carried into that member\'s errand tonight' },
  { source: 'Clamp', range: '−3 to +3', note: 'the sum never goes past three either way' },
];

/** The odds a member out on given orders brings a charm home, at a tilt, and what that means for a night with two out. */
export function charmOdds(tilt: number): { byOutcome: Record<Outcome, number>; perMember: number; perNight: number; nightsPerCharm: number } {
  const o = outcomeOdds(tilt);
  const byOutcome: Record<Outcome, number> = { boon: TOKEN_CHANCE.boon(tilt), fair: TOKEN_CHANCE.fair(tilt), poor: 0 };
  const perMember = o.boon * byOutcome.boon + o.fair * byOutcome.fair;
  const perNight = 1 - Math.pow(1 - perMember, CAMPAIGN.membersPerNight);
  return { byOutcome, perMember, perNight, nightsPerCharm: perNight > 0 ? 1 / perNight : Infinity };
}

export interface Expectation { favour: number; shards: number; renown: number; charm: number; rumour: number }

/** What one member out on given orders is expected to bring from an errand at a tilt, per night, below the Favour soft cap. */
export function errandExpectation(errand: Errand, tilt: number): Expectation {
  const o = outcomeOdds(tilt);
  const ev = (by: Record<Outcome, number>) => OUTCOMES.reduce((a, k) => a + o[k] * by[k], 0);
  const charm = ERRAND_TOKEN_TYPE[errand] ? o.boon * TOKEN_CHANCE.boon(tilt) + o.fair * TOKEN_CHANCE.fair(tilt) : 0;
  return {
    favour: ev(FAVOUR),
    shards: SHARD_ERRANDS.includes(errand) ? ev(YIELDS.shards) : 0,
    renown: errand === 'train' ? ev(YIELDS.trainRenown) : errand === 'carouse' ? o.boon * YIELDS.carouseBoonRenown : 0,
    charm,
    rumour: errand === 'spy' ? 1 - o.poor : 0,
  };
}

/** The same member on standing orders: one poor night in five, half Favour, no charms, no risk. */
export function standingExpectation(errand: Errand): Expectation {
  const poor = YIELDS.standing.poor, fair = 1 - poor;
  return {
    favour: fair * Math.ceil(FAVOUR.fair / 2) + poor * Math.ceil(FAVOUR.poor / 2),
    shards: SHARD_ERRANDS.includes(errand) ? fair * YIELDS.standing.shardOnFair : 0,
    renown: errand === 'train' ? fair * YIELDS.trainRenown.fair : 0,
    charm: 0,
    rumour: errand === 'spy' ? fair : 0,
  };
}

export interface CrossroadsOdds {
  /** The draw made at the end of a night with someone out on given orders. */
  raw: number;
  /** The long-run share of such nights that meet one, given the night's rest after each. */
  effective: number;
  perMoon: number; perSeason: number;
  pool: number; byKind: Record<CrossroadKind, number>; byErrand: Partial<Record<Errand, number>>;
  /** Nights of play until every crossroads in the pool has been met once, at the effective rate. */
  nightsToExhaust: number;
  /** Roads that gamble, with their odds of the good branch. */
  riskRoads: { crossroads: string; road: string; chance: number; curse?: string }[];
  /** Roads whose default is not the first option, for the eye. */
  defaults: number;
}

export function crossroadsOdds(location: Location): CrossroadsOdds {
  const raw = CAMPAIGN.crossroadsChance;
  const effective = raw / (1 + raw);
  const list: Crossroad[] = location.crossroads ?? [];
  const byKind = Object.fromEntries(KINDS.map((k) => [k, list.filter((c) => c.kind === k).length])) as Record<CrossroadKind, number>;
  const byErrand: Partial<Record<Errand, number>> = {};
  for (const e of ERRANDS) { const n = list.filter((c) => c.errands.includes(e)).length; if (n) byErrand[e] = n; }
  const riskRoads = list.flatMap((c) => c.options.filter((o) => o.risk).map((o) => ({ crossroads: c.id, road: o.label, chance: o.risk!.chance ?? 0.5, curse: o.risk!.bad.effects?.curse })));
  return {
    raw, effective, perMoon: effective * CAMPAIGN.nightsPerMoon, perSeason: effective * CAMPAIGN.nightsPerMoon * CAMPAIGN.seasonMoons,
    pool: list.length, byKind, byErrand, nightsToExhaust: effective > 0 ? list.length / effective : Infinity, riskRoads,
    defaults: list.filter((c) => c.options.some((o) => o.default)).length,
  };
}

/** The odds one member's night is printed by the Town Cryer, by outcome, and per night with two out at a tilt. */
export function happeningOdds(tilt: number): { byOutcome: Record<Outcome, number>; perMember: number; perNight: number } {
  const o = outcomeOdds(tilt);
  const perMember = OUTCOMES.reduce((a, k) => a + o[k] * PRINT_CHANCE[k], 0);
  return { byOutcome: PRINT_CHANCE, perMember, perNight: 1 - Math.pow(1 - perMember, CAMPAIGN.membersPerNight) };
}

export interface Simulation {
  nights: number; nightsOut: number; membersOut: number;
  outcomes: Record<Outcome, number>;
  tilts: Record<string, number>;
  charms: number; favour: number; shards: number; renown: number; rumours: number;
  crossroads: number; repeats: number; happenings: number; risks: { good: number; bad: number }; curses: number;
  /** Per night with someone out. */
  perNight: { charms: number; favour: number; shards: number; renown: number; rumours: number; crossroads: number; happenings: number };
}

/**
 * Play `nights` nights with orders given every night for the first two members free, errands rotating through the
 * place's, roads at a crossroads taken by a seeded coin so both branches of a risk are seen. Deterministic for a seed.
 */
export function simulateNights(location: Location, warband: WarbandLike, nights: number, seed = 1): Simulation {
  const r = rng(hashSeed(CAMPAIGN.id, 'odds', warband.id, location.id, seed));
  const s: WarbandState = freshState(warband, 1);
  const moves = [{ locationId: location.id, fromNight: 1 }];
  const sim: Simulation = {
    nights, nightsOut: 0, membersOut: 0, outcomes: { boon: 0, fair: 0, poor: 0 }, tilts: {},
    charms: 0, favour: 0, shards: 0, renown: 0, rumours: 0, crossroads: 0, repeats: 0, happenings: 0, risks: { good: 0, bad: 0 }, curses: 0,
    perNight: { charms: 0, favour: 0, shards: 0, renown: 0, rumours: 0, crossroads: 0, happenings: 0 },
  };
  const seen = new Set<string>();
  for (let night = 1; night <= nights; night++) {
    const waiting = waitingCrossroads(s);
    if (waiting) {
      const options = waiting.crossroads!.options;
      const road = options[Math.floor(r() * options.length)];
      const taken = decide(s, warband, waiting.night, road.id, { on: night, rival: warband });
      if (taken.road.risk) { if (taken.curse) sim.risks.bad++; else sim.risks.good++; }
      if (taken.curse) sim.curses++;
    }
    const free = warband.members.filter((m) => !m.dead && !restingMembers(s, night).includes(m.id) && !keptMembers(s, night).includes(m.id)).slice(0, CAMPAIGN.membersPerNight);
    if (free.length) giveOrders(s, warband, night, free.map((m, i) => ({ memberId: m.id, errand: location.errands[(night * 7 + i * 3) % location.errands.length] })), [], location);
    reconcile(s, warband, night + 1, [], warband, moves);
    const n = s.nights.at(-1)!;
    if (!n.results.length) continue;
    sim.nightsOut++;
    for (const res of n.results) {
      sim.membersOut++; sim.outcomes[res.outcome]++;
      if (res.token) sim.charms++;
      sim.favour += res.favour; sim.shards += res.shards; sim.renown += res.renown; if (res.rumour) sim.rumours++;
    }
    if (n.crossroads) { sim.crossroads++; if (seen.has(n.crossroads.id)) sim.repeats++; seen.add(n.crossroads.id); }
    if (happeningFor(warband, n)) sim.happenings++;
    // keep the Hand from filling, so a charm found is a charm counted rather than an offer; keep Favour under the soft cap, so the yield is the night's own
    s.hand = []; s.offers = []; s.favour = 0;
  }
  const per = (x: number) => (sim.nightsOut ? x / sim.nightsOut : 0);
  sim.perNight = { charms: per(sim.charms), favour: per(sim.favour), shards: per(sim.shards), renown: per(sim.renown), rumours: per(sim.rumours), crossroads: per(sim.crossroads), happenings: per(sim.happenings) };
  return sim;
}
