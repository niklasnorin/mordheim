/**
 * The Fountain Post: the campaign's catch-up rule, pure and tested. A warband that has fought fewer games than the
 * campaign's pace was not idle: it took the place's work, nailed to the fountain post in Fussenbach's square or passed
 * along in Cutthroat's Haven, and when it next comes to the table it brings the pay home as gold and experience.
 *
 * Every warband takes the usual work before every game it is on, a single job that pays a few crowns and no
 * experience; a warband behind the pace takes the jobs it is owed on top, and those pay properly. Three things hold,
 * whatever the board says:
 *
 * - It counts games behind, never games lost. Losing is the rulebook's Underdog experience's business.
 * - It opens when a game is scheduled with the warband in it, and closes when that game's first turn begins. Coming
 *   back is what is paid for, not staying away. Only the owed jobs count towards the pace; the usual work does not.
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

/** At most this many owed jobs are paid at one return, however far behind the warband is. */
export const JOBS_AT_MOST = 3;
/** The usual work, which every warband takes before every game, pays this share of a job's gold, at least 5 gc, and a chance of experience (`USUAL_EXPERIENCE`). */
export const USUAL_SHARE = 0.2;
/** Unspent gold counts towards strength at this many crowns a point of rating: a henchman and their kit is about 35 gc for 5. */
export const GOLD_PER_RATING = 7;
/** A job's gold before its lean: 2D6×5+15 crowns, about 50 on average, a little less than a game's takings. */
export const JOB_GOLD = { dice: 2, sides: 6, times: 5, plus: 15 } as const;
/** The lowest and highest a job's dice can show: the 2D6 of `JOB_GOLD`. */
export const DICE_LOW = JOB_GOLD.dice, DICE_HIGH = JOB_GOLD.dice * JOB_GOLD.sides;
/** Whether a total is one the table could have rolled on the job's dice. */
export const isDiceTotal = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n >= DICE_LOW && n <= DICE_HIGH;
/** How much of the rolled gold each lean pays. */
export const LEAN_GOLD: Record<JobLean, number> = { gold: 1.5, experience: 0.5, champion: 1, even: 1 };
/** A warrior's worth in the reckoned rating, as the rulebook counts it: 5 a warrior, plus their experience. */
export const RATING_PER_WARRIOR = 5;

/**
 * An owed job's experience is rolled on a D6, never below the floor: 1–2 the floor (the lean's grant as it stands),
 * 3–5 the floor and a point more to the least experienced warrior it names, 6 twice the floor.
 */
export const EXPERIENCE_ROLL = { floor: [1, 2], more: [3, 4, 5], double: [6] } as const;
/**
 * The usual work's experience, on its own D6, so that even the warband leading the campaign has something for the
 * telling: 1–3 none, 4–5 a point to the least experienced warrior the job names, 6 a point each to the two least
 * experienced it names (two to the one, when it names one).
 */
export const USUAL_EXPERIENCE = { none: [1, 2, 3], one: [4, 5], two: [6] } as const;
export const isD6 = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= 6;

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
  /** Owed jobs taken from the post before now; the usual work does not count. */
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

/** How many owed jobs the warband has to its name: as far behind the pace as it is, at most `JOBS_AT_MOST`, none with nobody ahead. */
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

// ───────────────────────── the notices, numbered for the table ─────────────────────────

/**
 * The notices on a board are numbered D66 in the board's order, withheld ones included, so a number keeps its notice
 * while the game master withholds and restores: 11 to 16, 21 to 26, and so on to 66. A board numbers 36 notices at
 * most; the rest are the post's to draw and cannot be rolled for.
 */
export const isD66 = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 11 && n <= 66 && n % 10 >= 1 && n % 10 <= 6;
const d66At = (i: number) => (Math.floor(i / 6) + 1) * 10 + (i % 6) + 1;
const indexOfD66 = (n: number) => (Math.floor(n / 10) - 1) * 6 + (n % 10) - 1;
const inBoardOrder = (board: Job[]) => board.slice().sort((a, b) => a.sort - b.sort || a.id - b.id);

/** Each notice's D66 number on its board, by job id; the 37th notice and after have none. */
export function numberBoard(board: Job[]): Map<number, number> {
  return new Map(inBoardOrder(board).slice(0, 36).map((j, i) => [j.id, d66At(i)]));
}

/** One job drawn for one place in the return: the job, its number on the board, and whether the table rolled it. */
export interface Slot {
  job: Job;
  /** Its D66 number on the board, or null past the 36th. */
  number: number | null;
  byHand: boolean;
  /** Why the table's number was not taken, when it was not ("roll again"); the post drew this one instead. */
  refused?: string;
}

/**
 * The jobs for one return, a place at a time: the table's D66 where they rolled one and it lands on a notice that is
 * open and not already taken this return, the post's own draw (`drawJobs`) for the rest. A number the table may not
 * have is refused with the reason, and the post draws that place; at the table, that is a roll again.
 */
export function drawSlots(board: Job[], count: number, seed: number, opts: Parameters<typeof drawJobs>[3] & { picks?: (number | null | undefined)[] } = {}): Slot[] {
  const numbers = numberBoard(board);
  const byNumber = new Map([...numbers].map(([id, n]) => [n, board.find((j) => j.id === id)!]));
  const barred = new Set(opts.barredPoints ?? []);
  const order = drawJobs(board, board.length, seed, opts);
  const used = new Set<number>();
  const slots: Slot[] = [];
  for (let i = 0; i < count; i++) {
    const pick = opts.picks?.[i];
    let refused: string | undefined;
    if (pick != null) {
      const job = isD66(pick) ? byNumber.get(pick) : undefined;
      refused = !isD66(pick) ? 'Not a roll of D66.' : !job ? 'No notice has that number.' : job.withheld ? 'That notice is withheld.'
        : job.pointId != null && barred.has(job.pointId) ? 'A game is set there.' : used.has(job.id) ? 'Already taken this return.' : undefined;
      if (job && !refused) { used.add(job.id); slots.push({ job, number: pick, byHand: true }); continue; }
    }
    const next = order.find((j) => !used.has(j.id));
    if (!next) break;
    used.add(next.id);
    slots.push({ job: next, number: numbers.get(next.id) ?? null, byHand: false, refused });
  }
  return slots;
}

// ───────────────────────── the pay ─────────────────────────

/** A grant of experience to one warrior, and whether it brings them to an advance. */
export interface Grant { memberId: string; name: string; experience: number; advance: boolean }

export interface JobPay {
  job: Job;
  /** The total of the job's 2D6, and whether the table rolled it (`byHand`) or the post did. */
  dice: number;
  byHand: boolean;
  /** The experience D6, and whether the table rolled it: on the owed table for an owed job, the usual table for the usual work. */
  experienceDie: number;
  experienceByHand: boolean;
  /** Its number on the board and whether the table rolled for it, when it was drawn through `drawSlots`. */
  slot?: Omit<Slot, 'job'>;
  /** An owed job, paid in full and counted towards the pace; otherwise the usual work, paid in a few crowns. */
  owed: boolean;
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

/** Who the job pays experience before the ceiling: the lean says who, the D6 how much over the floor. */
function wanted(lean: JobLean, warriors: Warrior[], d6: number): { w: Warrior; n: number }[] {
  const floor = byLean(lean, warriors);
  if ((EXPERIENCE_ROLL.double as readonly number[]).includes(d6)) return floor.map(({ w, n }) => ({ w, n: n * 2 }));
  if ((EXPERIENCE_ROLL.more as readonly number[]).includes(d6) && floor.length) {
    const least = floor.reduce((a, b) => (b.w.experience < a.w.experience ? b : a));
    return floor.map((g) => (g === least ? { ...g, n: g.n + 1 } : g));
  }
  return floor;
}

/** The usual work's experience: a point or two, or none, to the least experienced the lean names. */
function usualWanted(lean: JobLean, warriors: Warrior[], d6: number): { w: Warrior; n: number }[] {
  const named = byLean(lean, warriors).map((g) => g.w).sort((a, b) => a.experience - b.experience);
  if (!named.length || (USUAL_EXPERIENCE.none as readonly number[]).includes(d6)) return [];
  if ((USUAL_EXPERIENCE.one as readonly number[]).includes(d6)) return [{ w: named[0], n: 1 }];
  return named.length > 1 ? [{ w: named[0], n: 1 }, { w: named[1], n: 1 }] : [{ w: named[0], n: 2 }];
}

/** The floor: who the lean pays, and how much, whatever the D6 says. */
function byLean(lean: JobLean, warriors: Warrior[]): { w: Warrior; n: number }[] {
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

/** No ceiling: a warband nobody is ahead of is held under nothing, and is paid only the usual work. */
const OPEN: Ceiling = { ahead: [], power: Infinity, experience: Infinity, warrior: { hero: Infinity, henchman: Infinity } };

/** One job to pay: owed or the usual work, and the table's own roll of its dice when they rolled them. */
export interface JobToPay {
  job: Job;
  owed: boolean;
  /** The table's 2D6 for the gold, and its D6 for the experience, where they rolled them. */
  dice?: number | null;
  experienceDie?: number | null;
  /** How the job came to be drawn, passed through to the pay. */
  slot?: Omit<Slot, 'job'>;
}

/**
 * What the jobs pay, cut to the ceiling. Each job's gold comes of its 2D6: the post rolls them from the seed, or the
 * table rolls them and says the total (`dice`), and the post's roll stands where they did not or said something no
 * 2D6 shows. The post rolls for every job either way, so a roll at the table changes that job alone.
 *
 * An owed job grants its experience first, warrior by warrior, then its gold;
 * the usual work grants a share of the gold alone. Every point is held under the warband's ceiling as it rises, so the
 * order of the jobs matters only at the margin: the owed ones come first. Gold is paid in fives, the usual work at
 * least five.
 */
export function payJobs(s: Standing, ceilingOrNone: Ceiling | null, jobs: JobToPay[], seed: number): Payout {
  const ceiling = ceilingOrNone ?? OPEN;
  const r = rng(hashSeed(seed, 'pay'));
  // a stream of its own, so the experience dice leave the gold's as they were
  const rx = rng(hashSeed(seed, 'experience'));
  const xp = new Map(s.warriors.map((w) => [w.id, w.experience]));
  let total = totalExperience(s), gold = s.gold, cut = false;
  // the rating moves with the experience granted, logged or reckoned alike
  let rating = ratingOf(s);
  const room = () => ceiling.power - (rating + Math.floor(gold / GOLD_PER_RATING));
  const paid: JobPay[] = [];
  for (const { job, owed, dice: atTable, experienceDie: xpAtTable, slot } of jobs) {
    let jobCut = false;
    const grants: Grant[] = [];
    const xpPosted = 1 + Math.floor(rx() * 6);
    const experienceByHand = isD6(xpAtTable);
    const experienceDie = experienceByHand ? xpAtTable! : xpPosted;
    for (const { w, n } of owed ? wanted(job.lean, s.warriors, experienceDie) : usualWanted(job.lean, s.warriors, experienceDie)) {
      const now = xp.get(w.id)!;
      const cap = ceiling.warrior[w.rank];
      const allowed = Math.max(0, Math.min(n, cap == null ? 0 : cap - now, ceiling.experience - total, room()));
      if (allowed < n) jobCut = true;
      if (!allowed) continue;
      xp.set(w.id, now + allowed); total += allowed; rating += allowed;
      grants.push({ memberId: w.id, name: w.name, experience: allowed, advance: crossesAdvance(w.rank, now, now + allowed) });
    }
    const posted = roll(r, JOB_GOLD.dice, JOB_GOLD.sides);
    const byHand = isDiceTotal(atTable);
    const dice = byHand ? atTable : posted;
    const full = (dice * JOB_GOLD.times + JOB_GOLD.plus) * LEAN_GOLD[job.lean];
    const rolled = owed ? Math.round(full / 5) * 5 : Math.max(5, Math.round((full * USUAL_SHARE) / 5) * 5);
    // the most gold that keeps rating + floor(gold / GOLD_PER_RATING) at or under the ceiling
    const most = ceiling.power === Infinity ? Infinity : Math.max(0, (ceiling.power - rating) * GOLD_PER_RATING + GOLD_PER_RATING - 1 - gold);
    const given = Math.min(rolled, Math.floor(most / 5) * 5);
    if (given < rolled) jobCut = true;
    gold += given;
    cut ||= jobCut;
    paid.push({ job, owed, dice, byHand, experienceDie, experienceByHand, slot, rolled, gold: given, grants, cut: jobCut });
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
  /** Owed jobs, on top of the usual work. */
  owed: number;
  ceiling: Ceiling | null;
  power: number;
  /** Null only when the board has nothing open to them. */
  payout: Payout | null;
}

/**
 * Draw the owed jobs and the usual work, one more than is owed, and pay them, with the table's rolls where they rolled:
 * a D66 for which notice, 2D6 for the gold, a D6 for the experience. The first drawn are the owed ones, so a
 * board too small for all of them pays what is owed before the usual work.
 */
export interface TableRolls {
  /** The table's D66 for which notice, 2D6 for the gold and D6 for the experience, place by place in the return. */
  picks?: (number | null | undefined)[];
  dice?: (number | null | undefined)[];
  experience?: (number | null | undefined)[];
}

export function reckon(s: Standing, all: Standing[], board: Job[], seed: number, opts: Parameters<typeof drawJobs>[3] & TableRolls = {}): Reckoning {
  const ceiling = ceilingFor(s, all);
  const owed = jobsOwed(s, all);
  // the table's rolls go place by place: the owed jobs first, then the usual work
  const jobs = drawSlots(board, owed + 1, seed, opts).map(({ job, ...slot }, i) => ({ job, owed: i < owed, dice: opts.dice?.[i] ?? null, experienceDie: opts.experience?.[i] ?? null, slot }));
  return { pace: paceOf(all), effective: effectiveGames(s), owed, ceiling, power: powerOf(s), payout: jobs.length ? payJobs(s, ceiling, jobs, seed) : null };
}
