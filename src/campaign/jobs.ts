/**
 * The Fountain Post: the campaign's catch-up rule, pure and tested. Between games every warband takes the place's work,
 * nailed to the fountain post in Fussenbach's square or passed along in Cutthroat's Haven, and brings the pay home as
 * gold and experience. Its purpose is the next game: to make the matchup as good a fight as it can be.
 *
 * Every warband takes the usual work before every game it is on, a single job that pays a few crowns and a chance of a
 * point or two of experience, the strongest warband of the game too, for the telling. A warband weaker than the
 * strongest other warband of its game (the stronger side) takes owed jobs on top, sized to the gap: with every roll at
 * its best they lift it to `MATCH_TARGET` (four fifths) of the stronger side's strength; with ordinary rolls, a good way
 * towards it. Three things hold, whatever the board says:
 *
 * - It looks at the game ahead, and only at it: the warbands on that game's muster, as they stand now.
 * - It opens when a game is scheduled with the warband in it, and closes when that game's first turn begins.
 * - It never lifts a warband level with the stronger side, nor past it. The owed jobs stop at the target; the usual
 *   work stops short of the stronger side's strength; no warrior passes the stronger side's best of the same rank.
 *
 * The board itself (which jobs a place has, their words, which point of interest each is at) is the game master's,
 * kept on the location (`location_jobs`); the match, the pay and the limits are the rule, so code. The server
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

/** With every roll at its best, the owed jobs lift the weaker side to this share of the stronger side's strength, and no further. */
export const MATCH_TARGET = 0.8;
/** One owed job for every this many points of strength the weaker side is short of the target, rounded up. */
export const JOB_SPAN = 10;
/** At most this many owed jobs are paid at one return, however wide the gap. */
export const JOBS_AT_MOST = 3;
/** The usual work, which every warband takes before every game, pays this share of a usual job's gold, at least 5 gc, and a chance of experience (`USUAL_EXPERIENCE`). */
export const USUAL_SHARE = 0.2;
/** Unspent gold counts towards strength at this many crowns a point of rating: a henchman and their kit is about 35 gc for 5. */
export const GOLD_PER_RATING = 7;
/** The usual work's gold before its share: 2D6×5+15 crowns, times its lean (`LEAN_GOLD`). */
export const JOB_GOLD = { dice: 2, sides: 6, times: 5, plus: 15 } as const;
/** The lowest and highest a job's gold dice can show: the 2D6 of `JOB_GOLD`. */
export const DICE_LOW = JOB_GOLD.dice, DICE_HIGH = JOB_GOLD.dice * JOB_GOLD.sides;
/** Whether a total is one the table could have rolled on the job's dice. */
export const isDiceTotal = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n >= DICE_LOW && n <= DICE_HIGH;
/** How much of the usual work's rolled gold each lean pays. */
export const LEAN_GOLD: Record<JobLean, number> = { gold: 1.5, experience: 0.5, champion: 1, even: 1 };
/** How an owed job's worth is split between gold and experience, by its lean: this much of it in gold, the rest in experience. */
export const LEAN_SPLIT: Record<JobLean, number> = { gold: 0.8, experience: 0.25, champion: 0.4, even: 0.5 };
/** A warrior's worth in the reckoned rating, as the rulebook counts it: 5 a warrior, plus their experience. */
export const RATING_PER_WARRIOR = 5;

/**
 * An owed job pays its gold share times the 2D6 out of 12, and its experience share times the experience D6 out of 6,
 * never below the floor of a third: 1–2 the floor, 3 a half, 4 two thirds, 5 five sixths, 6 the whole.
 */
export const goldShareOf = (dice: number) => dice / DICE_HIGH;
export const EXPERIENCE_FLOOR = 1 / 3;
export const experienceShareOf = (d6: number) => Math.max(EXPERIENCE_FLOOR, d6 / 6);
/**
 * The usual work's experience, on its own D6, so that even the strongest warband has something for the telling:
 * 1–3 none, 4–5 a point to the least experienced warrior the job names, 6 a point each to the two least experienced
 * it names (two to the one, when it names one).
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
  /** Games played, counted from the played scenarios; shown, not reckoned with. */
  played: number;
  /** The rating as the keeper logged it; 0 when nobody has, and then it is reckoned from the roster. */
  rating: number;
  /** Crowns in the treasury, unspent. */
  gold: number;
  warriors: Warrior[];
}

export const totalExperience = (s: Pick<Standing, 'warriors'>) => s.warriors.reduce((n, w) => n + w.experience, 0);
/** The rating as logged, or as the rulebook would reckon it from the roster when nobody has logged one. */
export const ratingOf = (s: Pick<Standing, 'rating' | 'warriors'>) => (s.rating > 0 ? s.rating : s.warriors.length * RATING_PER_WARRIOR + totalExperience(s));
/** Strength: the rating with the unspent treasury counted in, since gold banked now is warriors bought later. */
export const powerOf = (s: Pick<Standing, 'rating' | 'gold' | 'warriors'>) => ratingOf(s) + Math.floor(s.gold / GOLD_PER_RATING);

// ───────────────────────── the match ─────────────────────────

/** Where a warband stands against the game it is on: the stronger side, the target, and the gap to it. */
export interface Match {
  /** The strongest other warband of the game, when it is stronger than this one; null when none is (or nobody else is on it). */
  stronger: { warbandId: string; name: string; power: number; best: Record<Warrior['rank'], number | null> } | null;
  /** The strength the owed jobs may lift this warband to at most: `MATCH_TARGET` of the stronger side's, rounded down. */
  target: number;
  /** How far short of the target this warband is; 0 when it is not, and then only the usual work is paid. */
  gap: number;
}

/** The match for one warband, against the others on its game. */
export function matchFor(s: Standing, others: Standing[]): Match {
  const mine = powerOf(s);
  const top = others.filter((o) => o.warbandId !== s.warbandId).sort((a, b) => powerOf(b) - powerOf(a))[0];
  if (!top || powerOf(top) <= mine) return { stronger: null, target: mine, gap: 0 };
  const best = (rank: Warrior['rank']) => { const xs = top.warriors.filter((w) => w.rank === rank).map((w) => w.experience); return xs.length ? Math.max(...xs) : null; };
  const target = Math.floor(MATCH_TARGET * powerOf(top));
  return { stronger: { warbandId: top.warbandId, name: top.name, power: powerOf(top), best: { hero: best('hero'), henchman: best('henchman') } }, target, gap: Math.max(0, target - mine) };
}

/** How many owed jobs the gap asks for: one per `JOB_SPAN` of it, rounded up, at most `JOBS_AT_MOST`; none without a gap. */
export function jobsOwed(match: Pick<Match, 'gap'>): number {
  return match.gap > 0 ? Math.min(JOBS_AT_MOST, Math.ceil(match.gap / JOB_SPAN)) : 0;
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
  /** The experience D6, and whether the table rolled it. */
  experienceDie: number;
  experienceByHand: boolean;
  /** Its number on the board and whether the table rolled for it, when it was drawn through `drawSlots`. */
  slot?: Omit<Slot, 'job'>;
  /** An owed job, sized to the gap; otherwise the usual work, paid in a few crowns. */
  owed: boolean;
  /** What the job is worth before the limits: an owed job's share of the gap, in strength; 0 for the usual work. */
  worth: number;
  /** The crowns the dice gave before the limits, and what was paid. */
  rolled: number;
  gold: number;
  grants: Grant[];
  /** A limit cut something from this job. */
  cut: boolean;
}

export interface Payout {
  jobs: JobPay[];
  gold: number;
  experience: number;
  /** The warband as it would stand after: its experience, rating and strength. */
  after: { experience: number; rating: number; power: number };
  /** A limit cut something somewhere. */
  cut: boolean;
}

const roll = (r: () => number, n: number, sides: number) => Array.from({ length: n }, () => 1 + Math.floor(r() * sides)).reduce((a, b) => a + b, 0);
const crossesAdvance = (rank: Warrior['rank'], from: number, to: number) => (rank === 'hero' ? HERO_ADVANCES : HENCHMAN_ADVANCES).some((t) => t > from && t <= to);

/** Who a lean pays experience to: every warrior, every hero, the leader, or the least experienced hero. */
function named(lean: JobLean, warriors: Warrior[]): Warrior[] {
  const heroes = warriors.filter((w) => w.rank === 'hero');
  switch (lean) {
    case 'experience': return warriors.slice();
    case 'even': return heroes;
    case 'gold': { const lead = heroes.find((w) => w.leader) ?? heroes[0]; return lead ? [lead] : []; }
    case 'champion': { const least = heroes.slice().sort((a, b) => a.experience - b.experience)[0]; return least ? [least] : []; }
  }
}

/** Points of experience shared out among those named, a point at a time, the least experienced first. */
function shareOut(points: number, among: Warrior[]): { w: Warrior; n: number }[] {
  const order = among.slice().sort((a, b) => a.experience - b.experience);
  const n = new Map<Warrior, number>();
  for (let i = 0; i < points && order.length; i++) n.set(order[i % order.length], (n.get(order[i % order.length]) ?? 0) + 1);
  return [...n].map(([w, k]) => ({ w, n: k }));
}

/** The usual work's experience: a point or two, or none, to the least experienced the lean names. */
function usualWanted(lean: JobLean, warriors: Warrior[], d6: number): { w: Warrior; n: number }[] {
  const list = named(lean, warriors).sort((a, b) => a.experience - b.experience);
  if (!list.length || (USUAL_EXPERIENCE.none as readonly number[]).includes(d6)) return [];
  if ((USUAL_EXPERIENCE.one as readonly number[]).includes(d6)) return [{ w: list[0], n: 1 }];
  return list.length > 1 ? [{ w: list[0], n: 1 }, { w: list[1], n: 1 }] : [{ w: list[0], n: 2 }];
}

/** One job to pay: owed or the usual work, and the table's own rolls where they rolled them. */
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
 * What the jobs pay, held under the match's limits. Each job's gold comes of its 2D6 and its experience of a D6: the
 * post rolls them from the seed, or the table rolls them and says what they show, and the post's roll stands where they
 * did not or said something no such roll shows. The post rolls for every job either way, on streams of its own, so a
 * roll at the table changes that roll alone.
 *
 * An owed job is worth an equal share of the gap. Its lean splits that between gold (`LEAN_SPLIT`) and experience,
 * the gold paid at its 2D6 out of 12 and the experience at its D6 out of 6, never below the floor, the experience
 * shared out a point at a time among those the lean names, least experienced first. The usual work pays a few crowns
 * and a chance of a point or two. Experience is granted before gold, the owed jobs before the usual work, every point
 * held under the limits as the warband's strength rises: the target for owed jobs, short of the stronger side for the
 * usual work, the stronger side's best of the rank for each warrior. Gold is paid in fives, the usual work at least five.
 */
export function payJobs(s: Standing, match: Match, jobs: JobToPay[], seed: number): Payout {
  const r = rng(hashSeed(seed, 'pay'));
  // a stream of its own, so the experience dice leave the gold's as they were
  const rx = rng(hashSeed(seed, 'experience'));
  const owedCount = jobs.filter((j) => j.owed).length;
  const xp = new Map(s.warriors.map((w) => [w.id, w.experience]));
  let total = totalExperience(s), gold = s.gold, cut = false;
  // the rating moves with the experience granted, logged or reckoned alike
  let rating = ratingOf(s);
  const strength = () => rating + Math.floor(gold / GOLD_PER_RATING);
  const paid: JobPay[] = [];
  for (const { job, owed, dice: atTable, experienceDie: xpAtTable, slot } of jobs) {
    let jobCut = false;
    // how strong this job may leave the warband: the target for an owed job, short of the stronger side for the usual work
    const limit = !match.stronger ? Infinity : owed ? match.target : match.stronger.power - 1;
    const room = () => limit - strength();
    const xpPosted = 1 + Math.floor(rx() * 6);
    const experienceByHand = isD6(xpAtTable);
    const experienceDie = experienceByHand ? xpAtTable! : xpPosted;
    const posted = roll(r, JOB_GOLD.dice, JOB_GOLD.sides);
    const byHand = isDiceTotal(atTable);
    const dice = byHand ? atTable : posted;
    const worth = owed && owedCount ? match.gap / owedCount : 0;
    const wanted = owed
      ? shareOut(Math.round(worth * (1 - LEAN_SPLIT[job.lean]) * experienceShareOf(experienceDie)), named(job.lean, s.warriors))
      : usualWanted(job.lean, s.warriors, experienceDie);
    const grants: Grant[] = [];
    for (const { w, n } of wanted) {
      const now = xp.get(w.id)!;
      const cap = match.stronger ? match.stronger.best[w.rank] : Infinity;
      const allowed = Math.max(0, Math.min(n, cap == null ? 0 : cap - now, room()));
      if (allowed < n) jobCut = true;
      if (!allowed) continue;
      xp.set(w.id, now + allowed); total += allowed; rating += allowed;
      grants.push({ memberId: w.id, name: w.name, experience: allowed, advance: crossesAdvance(w.rank, now, now + allowed) });
    }
    const rolled = owed
      ? Math.round((worth * LEAN_SPLIT[job.lean] * goldShareOf(dice) * GOLD_PER_RATING) / 5) * 5
      : Math.max(5, Math.round(((dice * JOB_GOLD.times + JOB_GOLD.plus) * LEAN_GOLD[job.lean] * USUAL_SHARE) / 5) * 5);
    // the most gold that keeps rating + floor(gold / GOLD_PER_RATING) at or under the limit
    const most = limit === Infinity ? Infinity : Math.max(0, (limit - rating) * GOLD_PER_RATING + GOLD_PER_RATING - 1 - gold);
    const given = Math.min(rolled, Math.floor(most / 5) * 5);
    if (given < rolled) jobCut = true;
    gold += given;
    cut ||= jobCut;
    paid.push({ job, owed, worth, dice, byHand, experienceDie, experienceByHand, slot, rolled, gold: given, grants, cut: jobCut });
  }
  return {
    jobs: paid,
    gold: gold - s.gold,
    experience: total - totalExperience(s),
    after: { experience: total, rating, power: strength() },
    cut,
  };
}

/** The whole reckoning for one warband before one game: the match, what is owed, the jobs and their pay. */
export interface Reckoning {
  match: Match;
  /** Owed jobs, on top of the usual work. */
  owed: number;
  power: number;
  /** Null only when the board has nothing open to them. */
  payout: Payout | null;
}

/** The table's own rolls, place by place in the return: a D66 for which notice, 2D6 for the gold, a D6 for the experience. */
export interface TableRolls {
  picks?: (number | null | undefined)[];
  dice?: (number | null | undefined)[];
  experience?: (number | null | undefined)[];
}

/**
 * Draw the owed jobs and the usual work, one more than is owed, and pay them, with the table's rolls where they rolled.
 * The first drawn are the owed ones, so a board too small for all of them pays what is owed before the usual work.
 */
export function reckon(s: Standing, others: Standing[], board: Job[], seed: number, opts: Parameters<typeof drawJobs>[3] & TableRolls = {}): Reckoning {
  const match = matchFor(s, others);
  const owed = jobsOwed(match);
  // the table's rolls go place by place: the owed jobs first, then the usual work
  const jobs = drawSlots(board, owed + 1, seed, opts).map(({ job, ...slot }, i) => ({ job, owed: i < owed, dice: opts.dice?.[i] ?? null, experienceDie: opts.experience?.[i] ?? null, slot }));
  return { match, owed, power: powerOf(s), payout: jobs.length ? payJobs(s, match, jobs, seed) : null };
}
