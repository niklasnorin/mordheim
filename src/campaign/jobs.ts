/**
 * The Fountain Post: the campaign's catch-up rule, pure and tested. A warband that has fought fewer games than the
 * campaign's pace was not idle: it took the place's work, nailed to the fountain post in Fussenbach's square or passed
 * along in Cutthroat's Haven, and when it next comes to the table it brings the pay home as gold and experience.
 *
 * Three things hold, whatever the board says:
 *
 * - It counts games behind, never games lost. Losing is the rulebook's Underdog experience's business.
 * - It opens when a game is scheduled with the warband in it, and closes when that game's first turn begins. Coming
 *   back is what is paid for, not staying away.
 * - It never makes a warband stronger than any warband that has fought more. The ceiling is the weakest of those
 *   ahead, measured three ways (strength, the warband's experience, each warrior's), and every grant is cut to fit.
 *   Those ahead are reckoned as they stand now, jobs included, so one warband's jobs move the next one's offer; since
 *   each of them was held under the same ceiling, nobody climbs past a warband that actually played.
 *
 * The board itself (which jobs a place has, their words, which point of interest each is at) is the game master's,
 * kept on the location (`location_jobs`); the pay, the pace and the ceiling are the rule, so code. The server
 * (`src/server/campaign/jobs.ts`) loads the record into `Standing`s and hands them here.
 */
import campaign from '../data/curfew/campaign.json' with { type: 'json' };
import { hashSeed, rng, shuffle } from '../lib/random.ts';

/** How a job's pay leans: mostly gold, experience for the whole warband, a share for one hero, or an even split. */
export const JOB_LEANS = ['gold', 'experience', 'champion', 'even'] as const;
export type JobLean = (typeof JOB_LEANS)[number];
export const JOB_LEAN_LABEL: Record<JobLean, string> = { gold: 'Mostly gold', experience: 'Experience for all', champion: 'A share for one hero', even: 'An even split' };

/** One job on a location's board. `pointId` is the point of interest it is done at, when it is at one. */
export interface Job {
  id: number;
  locationId: string;
  pointId: number | null;
  title: string;
  /** What came of it, in the place's voice: noticed, never explained. */
  text: string;
  lean: JobLean;
  /** Taken off the post by the game master: never drawn. */
  withheld: boolean;
  sort: number;
}

// ───────────────────────── the dials ─────────────────────────

/** At most this many jobs are paid at one return, however far behind the warband is. */
export const JOBS_AT_MOST = 3;
/** Unspent gold counts towards strength at this many crowns a point of rating: a henchman and their kit is about 35 gc for 5. */
export const GOLD_PER_RATING = 7;
/** A job's gold before its lean: 2D6×5+15 crowns, about 50 on average, a little less than a game's takings. */
export const JOB_GOLD = { dice: 2, sides: 6, times: 5, plus: 15 } as const;
/** How much of the rolled gold each lean pays. */
export const LEAN_GOLD: Record<JobLean, number> = { gold: 1.5, experience: 0.5, champion: 1, even: 1 };
/** A warrior's worth in the reckoned rating, as the rulebook counts it: 5 a warrior, plus their experience. */
export const RATING_PER_WARRIOR = 5;

/** The rulebook's experience at which a hero, or a henchman group, rolls an advance. */
export const HERO_ADVANCES = [2, 4, 6, 8, 11, 14, 17, 20, 24, 28, 32, 36, 41, 46, 51, 57, 63, 69, 76, 83, 90];
export const HENCHMAN_ADVANCES = [2, 5, 9, 14];

// ───────────────────────── the warbands as the rule sees them ─────────────────────────

export interface Warrior { id: string; name: string; rank: 'hero' | 'henchman'; experience: number; leader?: boolean }

/** A warband as the rule reckons it: the living warriors only. */
export interface Standing {
  warbandId: string;
  name: string;
  /** Counts towards the pace: kept by a player, or has fought at least once. */
  active: boolean;
  /** Games played, counted from the played scenarios. */
  played: number;
  /** Jobs taken from the post before now. */
  jobs: number;
  /** The rating as the keeper logged it; 0 when nobody has, and then it is reckoned from the roster. */
  rating: number;
  /** Crowns in the treasury, unspent. */
  gold: number;
  warriors: Warrior[];
}

/** Games played and jobs taken: how far along the campaign a warband counts as. */
export const effectiveGames = (s: Pick<Standing, 'played' | 'jobs'>) => s.played + s.jobs;
export const totalExperience = (s: Pick<Standing, 'warriors'>) => s.warriors.reduce((n, w) => n + w.experience, 0);
/** The rating as logged, or as the rulebook would reckon it from the roster when nobody has logged one. */
export const ratingOf = (s: Pick<Standing, 'rating' | 'warriors'>) => (s.rating > 0 ? s.rating : s.warriors.length * RATING_PER_WARRIOR + totalExperience(s));
/** Strength: the rating with the unspent treasury counted in, since gold banked now is warriors bought later. */
export const powerOf = (s: Pick<Standing, 'rating' | 'gold' | 'warriors'>) => ratingOf(s) + Math.floor(s.gold / GOLD_PER_RATING);

/**
 * The campaign's pace: the median of the active warbands' effective games, the higher of the two middle ones when
 * their number is even, so that two warbands a game apart are a game apart and not half of one.
 */
export function paceOf(all: Standing[]): number {
  const games = all.filter((s) => s.active).map(effectiveGames).sort((a, b) => a - b);
  return games.length ? games[Math.floor(games.length / 2)] : 0;
}

/** The weakest of the warbands ahead, three ways. Null when nobody is ahead, and then nothing is owed. */
export interface Ceiling {
  /** The warbands with more effective games than this one, by id. */
  ahead: string[];
  /** Strength, rating and unspent gold, may not pass this. */
  power: number;
  /** The warband's experience together may not pass this. */
  experience: number;
  /** No hero, nor henchman, may pass this: the least of the best each warband ahead has of that rank. Null when none ahead has one. */
  warrior: Record<'hero' | 'henchman', number | null>;
}

export function ceilingFor(s: Standing, all: Standing[]): Ceiling | null {
  const mine = effectiveGames(s);
  const ahead = all.filter((o) => o.active && o.warbandId !== s.warbandId && effectiveGames(o) > mine);
  if (!ahead.length) return null;
  const best = (o: Standing, rank: Warrior['rank']) => Math.max(-1, ...o.warriors.filter((w) => w.rank === rank).map((w) => w.experience));
  const least = (rank: Warrior['rank']) => {
    const bests = ahead.map((o) => best(o, rank)).filter((n) => n >= 0);
    return bests.length ? Math.min(...bests) : null;
  };
  return {
    ahead: ahead.map((o) => o.warbandId),
    power: Math.min(...ahead.map(powerOf)),
    experience: Math.min(...ahead.map(totalExperience)),
    warrior: { hero: least('hero'), henchman: least('henchman') },
  };
}

/** How many jobs the warband has to its name: as far behind the pace as it is, at most `JOBS_AT_MOST`, none with nobody ahead. */
export function jobsOwed(s: Standing, all: Standing[]): number {
  if (!ceilingFor(s, all)) return 0;
  return Math.max(0, Math.min(JOBS_AT_MOST, Math.floor(paceOf(all) - effectiveGames(s))));
}

// ───────────────────────── the window ─────────────────────────

export interface Fixture { status: 'upcoming' | 'played'; turn: number; warbands: { warbandId: string }[] }

/** Why the post is shut to this warband for this game, or null when it is open. In the Watch's words. */
export function shutBecause(scenario: Fixture | null, warbandId: string): string | null {
  if (!scenario) return 'No game is scheduled for them. The post opens when one is.';
  if (scenario.status !== 'upcoming') return 'That game is played. The post opens again with the next one.';
  if (!scenario.warbands.some((w) => w.warbandId === warbandId)) return 'They are not on that game’s muster.';
  if (scenario.turn > 0) return 'The game has begun. The post shut at the first turn.';
  return null;
}

// ───────────────────────── the draw ─────────────────────────

/** The seed of one warband's jobs before one game. The same warband, the same game: the same jobs and the same pay. */
export const jobSeed = (warbandId: string, scenarioId: string) => hashSeed(campaign.id, 'jobs', warbandId, scenarioId);

/**
 * Which jobs were taken: the board's open ones, none withheld and none at a point of interest where a game is
 * scheduled (nobody scouts the next field by sweeping it), those the warband has done least recently first, the rest
 * shuffled by the seed. No job twice in one return; a board with fewer jobs than are owed pays fewer.
 *
 * `lastTaken` maps a job's id to how recently the warband took it (higher is more recent).
 */
export function drawJobs(board: Job[], count: number, seed: number, opts: { barredPoints?: Iterable<number>; lastTaken?: Record<number, number> } = {}): Job[] {
  const barred = new Set(opts.barredPoints ?? []);
  const open = board.filter((j) => !j.withheld && !(j.pointId != null && barred.has(j.pointId)));
  const order = shuffle(rng(seed), open.slice().sort((a, b) => a.id - b.id));
  const when = (j: Job) => opts.lastTaken?.[j.id] ?? -1;
  return order.map((j, i) => ({ j, i })).sort((a, b) => when(a.j) - when(b.j) || a.i - b.i).slice(0, Math.max(0, count)).map((x) => x.j);
}

// ───────────────────────── the pay ─────────────────────────

/** A grant of experience to one warrior, and whether it brings them to an advance. */
export interface Grant { memberId: string; name: string; experience: number; advance: boolean }

export interface JobPay {
  job: Job;
  /** The crowns the dice gave before the ceiling, and what was paid. */
  rolled: number;
  gold: number;
  grants: Grant[];
  /** The ceiling cut something from this job. */
  cut: boolean;
}

export interface Payout {
  jobs: JobPay[];
  gold: number;
  experience: number;
  /** The warband as it would stand after: its experience, rating and strength. */
  after: { experience: number; rating: number; power: number };
  /** The ceiling cut something somewhere. */
  cut: boolean;
}

const roll = (r: () => number, n: number, sides: number) => Array.from({ length: n }, () => 1 + Math.floor(r() * sides)).reduce((a, b) => a + b, 0);
const crossesAdvance = (rank: Warrior['rank'], from: number, to: number) => (rank === 'hero' ? HERO_ADVANCES : HENCHMAN_ADVANCES).some((t) => t > from && t <= to);

/** Who the job pays experience, before the ceiling: the lean decides. */
function wanted(lean: JobLean, warriors: Warrior[]): { w: Warrior; n: number }[] {
  const heroes = warriors.filter((w) => w.rank === 'hero');
  switch (lean) {
    case 'experience': return warriors.map((w) => ({ w, n: 1 }));
    case 'even': return heroes.map((w) => ({ w, n: 1 }));
    case 'gold': { const lead = heroes.find((w) => w.leader) ?? heroes[0]; return lead ? [{ w: lead, n: 1 }] : []; }
    case 'champion': {
      const least = heroes.slice().sort((a, b) => a.experience - b.experience)[0];
      return least ? [{ w: least, n: 2 }] : [];
    }
  }
}

/**
 * What the jobs pay, cut to the ceiling. Each job grants its experience first, warrior by warrior, then its gold;
 * every point is held under the warband's ceiling as it rises, so the order of the jobs matters only at the margin.
 * Gold is paid in fives.
 */
export function payJobs(s: Standing, ceiling: Ceiling, jobs: Job[], seed: number): Payout {
  const r = rng(hashSeed(seed, 'pay'));
  const xp = new Map(s.warriors.map((w) => [w.id, w.experience]));
  let total = totalExperience(s), gold = s.gold, cut = false;
  // the rating moves with the experience granted, logged or reckoned alike
  let rating = ratingOf(s);
  const room = () => ceiling.power - (rating + Math.floor(gold / GOLD_PER_RATING));
  const paid: JobPay[] = [];
  for (const job of jobs) {
    let jobCut = false;
    const grants: Grant[] = [];
    for (const { w, n } of wanted(job.lean, s.warriors)) {
      const now = xp.get(w.id)!;
      const cap = ceiling.warrior[w.rank];
      const allowed = Math.max(0, Math.min(n, cap == null ? 0 : cap - now, ceiling.experience - total, room()));
      if (allowed < n) jobCut = true;
      if (!allowed) continue;
      xp.set(w.id, now + allowed); total += allowed; rating += allowed;
      grants.push({ memberId: w.id, name: w.name, experience: allowed, advance: crossesAdvance(w.rank, now, now + allowed) });
    }
    const rolled = Math.round((roll(r, JOB_GOLD.dice, JOB_GOLD.sides) * JOB_GOLD.times + JOB_GOLD.plus) * LEAN_GOLD[job.lean] / 5) * 5;
    // the most gold that keeps rating + floor(gold / GOLD_PER_RATING) at or under the ceiling
    const most = Math.max(0, (ceiling.power - rating) * GOLD_PER_RATING + GOLD_PER_RATING - 1 - gold);
    const given = Math.min(rolled, Math.floor(most / 5) * 5);
    if (given < rolled) jobCut = true;
    gold += given;
    cut ||= jobCut;
    paid.push({ job, rolled, gold: given, grants, cut: jobCut });
  }
  return {
    jobs: paid,
    gold: gold - s.gold,
    experience: total - totalExperience(s),
    after: { experience: total, rating, power: rating + Math.floor(gold / GOLD_PER_RATING) },
    cut,
  };
}

/** The whole reckoning for one warband before one game: what is owed, the ceiling, the jobs and their pay. */
export interface Reckoning {
  pace: number;
  effective: number;
  owed: number;
  ceiling: Ceiling | null;
  power: number;
  payout: Payout | null;
}

export function reckon(s: Standing, all: Standing[], board: Job[], seed: number, opts: Parameters<typeof drawJobs>[3] = {}): Reckoning {
  const ceiling = ceilingFor(s, all);
  const owed = jobsOwed(s, all);
  const jobs = ceiling && owed ? drawJobs(board, owed, seed, opts) : [];
  return { pace: paceOf(all), effective: effectiveGames(s), owed, ceiling, power: powerOf(s), payout: ceiling && jobs.length ? payJobs(s, ceiling, jobs, seed) : null };
}
