/**
 * The Fountain Post: the campaign's catch-up rule, pure and tested. Between games every warband takes one of the place's
 * jobs, nailed to the fountain post in Fussenbach's square or passed along in Cutthroat's Haven, and brings the pay home
 * as gold and experience. Its purpose is the game ahead: to make the matchup as good a fight as it can be, however many
 * games each warband has played.
 *
 * The jobs come in three scopes. An errand is the usual work: a few crowns and a chance of a point or two of
 * experience, taken by the strongest warband of the game and anyone already close to it, for the telling. A warband
 * weaker than the strongest other warband of its game (the stronger side) takes a bigger job instead, sized to the gap:
 * a commission when the gap is middling, an undertaking, with more to it and more lore, when it is wide. With every roll
 * at its best the job lifts it to `MATCH_TARGET` (four fifths) of the stronger side's strength; with ordinary rolls, a
 * good way towards it. Three things hold, whatever the board says:
 *
 * - It looks at the game ahead, and only at it: the warbands on that game's muster, as they stand now.
 * - It opens when a game is scheduled with the warband in it, and closes when that game's first turn begins.
 * - It never lifts a warband level with the stronger side, nor past it. A commission or an undertaking stops at the
 *   target; an errand stops short of the stronger side's strength; no warrior passes the stronger side's best of the
 *   same rank.
 *
 * The board itself (which jobs a place has, their scope, their words, which point of interest each is at) is the game
 * master's, kept on the location (`location_jobs`); the match, the pay and the limits are the rule, so code. The server
 * (`src/server/campaign/jobs.ts`) loads the record into `Standing`s and hands them here.
 */
import campaign from '../data/curfew/campaign.json' with { type: 'json' };
import { hashSeed, rng, shuffle } from '../lib/random.ts';

/** How a job's pay leans: mostly gold, experience for the whole warband, a share for one hero, or an even split. */
export const JOB_LEANS = ['gold', 'experience', 'champion', 'even'] as const;
export type JobLean = (typeof JOB_LEANS)[number];
export const JOB_LEAN_LABEL: Record<JobLean, string> = { gold: 'Mostly gold', experience: 'Experience for all', champion: 'A share for one hero', even: 'An even split' };

/** How big a job is: an errand, the usual work; a commission; an undertaking, the biggest, with the most to it. */
export const JOB_SCOPES = ['errand', 'commission', 'undertaking'] as const;
export type JobScope = (typeof JOB_SCOPES)[number];
export const JOB_SCOPE_LABEL: Record<JobScope, string> = { errand: 'An errand', commission: 'A commission', undertaking: 'An undertaking' };
export const JOB_SCOPE_PLURAL: Record<JobScope, string> = { errand: 'Errands', commission: 'Commissions', undertaking: 'Undertakings' };

/** One job on a location's board. `pointId` is the point of interest it is done at, when it is at one. */
export interface Job {
  id: number;
  locationId: string;
  pointId: number | null;
  title: string;
  /** What came of it, in the place's voice: noticed, never explained. */
  text: string;
  lean: JobLean;
  scope: JobScope;
  /** Taken off the post by the game master: never drawn. */
  withheld: boolean;
  sort: number;
}

// ───────────────────────── the dials ─────────────────────────

/** With every roll at its best, a commission or an undertaking lifts the weaker side to this share of the stronger side's strength, and no further. */
export const MATCH_TARGET = 0.8;
/** The gap, in points of strength short of the target, from which a warband takes a commission, and from which an undertaking. Below the first, an errand. */
export const SCOPE_FROM: Record<Exclude<JobScope, 'errand'>, number> = { commission: 5, undertaking: 25 };
/** An errand pays this share of its rolled gold, at least 5 gc, and a chance of experience (`ERRAND_EXPERIENCE`). */
export const ERRAND_SHARE = 0.2;
/** Unspent gold counts towards strength at this many crowns a point of rating: a henchman and their kit is about 35 gc for 5. */
export const GOLD_PER_RATING = 7;
/** An errand's gold before its share: 2D6×5+15 crowns, times its lean (`LEAN_GOLD`). */
export const JOB_GOLD = { dice: 2, sides: 6, times: 5, plus: 15 } as const;
/** The lowest and highest a job's gold dice can show: the 2D6 of `JOB_GOLD`. */
export const DICE_LOW = JOB_GOLD.dice, DICE_HIGH = JOB_GOLD.dice * JOB_GOLD.sides;
/** Whether a total is one the table could have rolled on the job's dice. */
export const isDiceTotal = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n >= DICE_LOW && n <= DICE_HIGH;
/** How much of an errand's rolled gold each lean pays. */
export const LEAN_GOLD: Record<JobLean, number> = { gold: 1.5, experience: 0.5, champion: 1, even: 1 };
/** How a commission's or an undertaking's worth is split between gold and experience, by its lean: this much of it in gold, the rest in experience. */
export const LEAN_SPLIT: Record<JobLean, number> = { gold: 0.8, experience: 0.25, champion: 0.4, even: 0.5 };
/** A warrior's worth in the reckoned rating, as the rulebook counts it: 5 a warrior, plus their experience. */
export const RATING_PER_WARRIOR = 5;

/**
 * A commission or an undertaking pays its gold share times the 2D6 out of 12, and its experience share times the
 * experience D6 out of 6, never below the floor of a third: 1–2 the floor, 3 a half, 4 two thirds, 5 five sixths, 6 the
 * whole.
 */
export const goldShareOf = (dice: number) => dice / DICE_HIGH;
export const EXPERIENCE_FLOOR = 1 / 3;
export const experienceShareOf = (d6: number) => Math.max(EXPERIENCE_FLOOR, d6 / 6);
/**
 * An errand's experience, on its own D6, so that even the strongest warband has something for the telling: 1–3 none,
 * 4–5 a point to the least experienced warrior the job names, 6 a point each to the two least experienced it names
 * (two to the one, when it names one).
 */
export const ERRAND_EXPERIENCE = { none: [1, 2, 3], one: [4, 5], two: [6] } as const;
export const isD6 = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= 6;
/** A six on the experience die always pays at least a point, whatever the job and past the limits, though never level with the stronger side. */
export const SIX_PAYS = 6;

/** The rulebook's experience at which a hero, or a henchman group, rolls an advance. */
export const HERO_ADVANCES = [2, 4, 6, 8, 11, 14, 17, 20, 24, 28, 32, 36, 41, 46, 51, 57, 63, 69, 76, 83, 90];
export const HENCHMAN_ADVANCES = [2, 5, 9, 14];

// ───────────────────────── the warbands as the rule sees them ─────────────────────────

export interface Warrior { id: string; name: string; rank: 'hero' | 'henchman'; experience: number; leader?: boolean }

/** A warband as the rule reckons it: the living warriors only. How many games it has played does not enter into it. */
export interface Standing {
  warbandId: string;
  name: string;
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
  /** The strength a commission or an undertaking may lift this warband to at most: `MATCH_TARGET` of the stronger side's, rounded down. */
  target: number;
  /** How far short of the target this warband is; 0 when it is not. */
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

/** The scope of job the gap asks for: an undertaking for a wide one, a commission for a middling one, an errand otherwise. */
export function scopeFor(match: Pick<Match, 'gap'>): JobScope {
  return match.gap >= SCOPE_FROM.undertaking ? 'undertaking' : match.gap >= SCOPE_FROM.commission ? 'commission' : 'errand';
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

/** The seed of one warband's job before one game. The same warband, the same game: the same job and the same pay. */
export const jobSeed = (warbandId: string, scenarioId: string) => hashSeed(campaign.id, 'jobs', warbandId, scenarioId);

export interface DrawOptions {
  /** Points of interest where a game is scheduled: nobody scouts the next field by sweeping it. */
  barredPoints?: Iterable<number>;
  /** How recently the warband took each job, by its id (higher is more recent). */
  lastTaken?: Record<number, number>;
}

const isOpen = (j: Job, barred: Set<number>) => !j.withheld && !(j.pointId != null && barred.has(j.pointId));

/**
 * The post's own order for a scope's notices: the open ones, none withheld and none at a point of interest where a game
 * is scheduled, those the warband has done least recently first, the rest shuffled by the seed.
 */
export function drawJobs(board: Job[], scope: JobScope, seed: number, opts: DrawOptions = {}): Job[] {
  const barred = new Set(opts.barredPoints ?? []);
  const open = board.filter((j) => j.scope === scope && isOpen(j, barred));
  const order = shuffle(rng(hashSeed(seed, scope)), open.slice().sort((a, b) => a.id - b.id));
  const when = (j: Job) => opts.lastTaken?.[j.id] ?? -1;
  return order.map((j, i) => ({ j, i })).sort((a, b) => when(a.j) - when(b.j) || a.i - b.i).map((x) => x.j);
}

// ───────────────────────── the notices, numbered for the table ─────────────────────────

/**
 * The notices of each scope are numbered for the table in the board's order, withheld ones included, so a number keeps
 * its notice while the game master withholds and restores: on a D6, 1 to 6, while a scope has six notices or fewer; on
 * a D66, 11 to 16, 21 to 26 and so on to 66, past that. A scope numbers 36 notices at most; the rest are the post's to
 * draw and cannot be rolled for.
 */
export type NoticeDie = 'D6' | 'D66';
export const isD66 = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 11 && n <= 66 && n % 10 >= 1 && n % 10 <= 6;
const d66At = (i: number) => (Math.floor(i / 6) + 1) * 10 + (i % 6) + 1;
const inBoardOrder = (board: Job[]) => board.slice().sort((a, b) => a.sort - b.sort || a.id - b.id);

/** The die a scope's notices are numbered on. */
export function dieFor(board: Job[], scope: JobScope): NoticeDie {
  return board.filter((j) => j.scope === scope).length <= 6 ? 'D6' : 'D66';
}
/** Whether a roll is one the scope's die shows. */
export const isNoticeRoll = (die: NoticeDie, n: unknown): n is number => (die === 'D6' ? isD6(n) : isD66(n));

/** Each notice's number within its scope, by job id; the 37th notice of a scope and after have none. */
export function numberBoard(board: Job[]): Map<number, number> {
  const out = new Map<number, number>();
  for (const scope of JOB_SCOPES) {
    const mine = inBoardOrder(board.filter((j) => j.scope === scope)).slice(0, 36);
    const die = dieFor(board, scope);
    mine.forEach((j, i) => out.set(j.id, die === 'D6' ? i + 1 : d66At(i)));
  }
  return out;
}

/** The job drawn for one warband before one game: the job, its scope and number, and whether the table rolled it. */
export interface Slot {
  job: Job;
  /** The scope the gap asked for; the job is of it unless the board had none of it open. */
  scope: JobScope;
  /** Its number within its scope, and the die the table rolls for it; null past the 36th. */
  number: number | null;
  die: NoticeDie;
  byHand: boolean;
  /** Why the table's number was not taken, when it was not ("roll again"); the post drew this one instead. */
  refused?: string;
}

/** The scopes to look in, the one asked for first, then the nearest, smaller before larger. */
const nearest = (scope: JobScope): JobScope[] => ({ errand: ['errand', 'commission', 'undertaking'], commission: ['commission', 'errand', 'undertaking'], undertaking: ['undertaking', 'commission', 'errand'] } as const)[scope].slice();

/**
 * The job for one warband before one game: from the scope the gap asks for, the table's number where they rolled one and
 * it lands on a notice that is open, the post's own draw (`drawJobs`) otherwise. A number the table may not have is
 * refused with the reason, and the post draws instead; at the table, that is a roll again. When the board has no open
 * notice of the scope, the nearest scope that has one stands in; the pay is the rule's either way. Null on a bare board.
 */
export function drawSlot(board: Job[], scope: JobScope, seed: number, opts: DrawOptions & { pick?: number | null } = {}): Slot | null {
  const barred = new Set(opts.barredPoints ?? []);
  const from = nearest(scope).find((sc) => board.some((j) => j.scope === sc && isOpen(j, barred)));
  if (!from) return null;
  const numbers = numberBoard(board);
  const die = dieFor(board, from);
  const pick = opts.pick;
  let refused: string | undefined;
  if (pick != null) {
    const job = isNoticeRoll(die, pick) ? board.find((j) => j.scope === from && numbers.get(j.id) === pick) : undefined;
    refused = !isNoticeRoll(die, pick) ? `Not a roll of ${die}.` : !job ? 'No notice has that number.' : job.withheld ? 'That notice is withheld.'
      : job.pointId != null && barred.has(job.pointId) ? 'A game is set there.' : undefined;
    if (job && !refused) return { job, scope, number: pick, die, byHand: true };
  }
  const job = drawJobs(board, from, seed, opts)[0];
  return { job, scope, number: numbers.get(job.id) ?? null, die, byHand: false, refused };
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
  /** How the job came to be drawn, when it was drawn through `drawSlot`. */
  slot?: Omit<Slot, 'job'>;
  /** A commission or an undertaking, sized to the gap (`owed`); otherwise an errand, paid in a few crowns. */
  owed: boolean;
  /** What the job is worth before the limits: the gap, in strength, for a commission or an undertaking; 0 for an errand. */
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

/** An errand's experience: a point or two, or none, to the least experienced the lean names. */
function errandWanted(lean: JobLean, warriors: Warrior[], d6: number): { w: Warrior; n: number }[] {
  const list = named(lean, warriors).sort((a, b) => a.experience - b.experience);
  if (!list.length || (ERRAND_EXPERIENCE.none as readonly number[]).includes(d6)) return [];
  if ((ERRAND_EXPERIENCE.one as readonly number[]).includes(d6)) return [{ w: list[0], n: 1 }];
  return list.length > 1 ? [{ w: list[0], n: 1 }, { w: list[1], n: 1 }] : [{ w: list[0], n: 2 }];
}

/** One job to pay: a commission or an undertaking (`owed`) or an errand, and the table's own rolls where they rolled them. */
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
 * What a job pays, held under the match's limits. Its gold comes of its 2D6 and its experience of a D6: the post rolls
 * them from the seed, or the table rolls them and says what they show, and the post's roll stands where they did not or
 * said something no such roll shows. The post rolls both dice either way, on streams of their own, so a roll at the
 * table changes that roll alone.
 *
 * A commission or an undertaking is worth the gap. Its lean splits that between gold (`LEAN_SPLIT`) and experience,
 * the gold paid at its 2D6 out of 12 and the experience at its D6 out of 6, never below the floor, the experience shared
 * out a point at a time among those the lean names, least experienced first; what a warrior already at the stronger
 * side's best cannot take goes to the rest of the warband, and what nobody can take is paid in gold instead. An errand
 * pays a few crowns and a chance of a point or two. A six on the experience die always pays at least a point (`SIX_PAYS`). Experience is granted before gold, every point held under the limits as the warband's strength
 * rises: the target for a commission or an undertaking, short of the stronger side for an errand, the stronger side's
 * best of the rank for each warrior. Gold is paid in fives, an errand at least five.
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
    // how strong this job may leave the warband: the target for a commission or an undertaking, short of the stronger side for an errand
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
      : errandWanted(job.lean, s.warriors, experienceDie);
    const given: Map<string, number> = new Map();
    const capOf = (w: Warrior) => (match.stronger ? match.stronger.best[w.rank] ?? 0 : Infinity);
    const grant = (w: Warrior, n: number) => {
      const now = xp.get(w.id)!;
      const allowed = Math.max(0, Math.min(n, capOf(w) - now, room()));
      if (!allowed) return 0;
      xp.set(w.id, now + allowed); total += allowed; rating += allowed;
      given.set(w.id, (given.get(w.id) ?? 0) + allowed);
      return allowed;
    };
    const asked = wanted.reduce((a, g) => a + g.n, 0);
    let granted = 0;
    for (const { w, n } of wanted) granted += grant(w, n);
    // what a warrior at the stronger side's best cannot take spills to the rest of the warband, least experienced first,
    // and what nobody can take is paid in gold instead; the limit still cuts the lot
    let spare = owed ? asked - granted : 0;
    for (const w of s.warriors.slice().sort((a, b) => xp.get(a.id)! - xp.get(b.id)!)) { if (spare <= 0 || room() <= 0) break; const k = grant(w, spare); spare -= k; granted += k; }
    if (granted < asked && !owed) jobCut = true;
    // a six on the experience die always pays a point, past the target and a warrior's best if need be, though never
    // level with the stronger side: to the least experienced warrior the job names, or of the warband if it names none
    if (experienceDie === SIX_PAYS && granted === 0 && s.warriors.length && (!match.stronger || strength() + 1 < match.stronger.power)) {
      const byXp = (list: Warrior[]) => list.slice().sort((a, b) => xp.get(a.id)! - xp.get(b.id)!)[0];
      const w = byXp(named(job.lean, s.warriors)) ?? byXp(s.warriors);
      xp.set(w.id, xp.get(w.id)! + 1); total += 1; rating += 1;
      given.set(w.id, (given.get(w.id) ?? 0) + 1);
      granted = 1;
    }
    const grants: Grant[] = [...given].map(([id, n]) => {
      const w = s.warriors.find((x) => x.id === id)!;
      return { memberId: id, name: w.name, experience: n, advance: crossesAdvance(w.rank, w.experience, w.experience + n) };
    });
    const rolled = owed
      ? Math.round(((worth * LEAN_SPLIT[job.lean] * goldShareOf(dice) + Math.max(0, spare)) * GOLD_PER_RATING) / 5) * 5
      : Math.max(5, Math.round(((dice * JOB_GOLD.times + JOB_GOLD.plus) * LEAN_GOLD[job.lean] * ERRAND_SHARE) / 5) * 5);
    // the most gold that keeps rating + floor(gold / GOLD_PER_RATING) at or under the limit
    const most = limit === Infinity ? Infinity : Math.max(0, (limit - rating) * GOLD_PER_RATING + GOLD_PER_RATING - 1 - gold);
    const paidGold = Math.min(rolled, Math.floor(most / 5) * 5);
    if (paidGold < rolled || (owed && granted < asked && room() <= 0)) jobCut = true;
    gold += paidGold;
    cut ||= jobCut;
    paid.push({ job, owed, worth, dice, byHand, experienceDie, experienceByHand, slot, rolled, gold: paidGold, grants, cut: jobCut });
  }
  return {
    jobs: paid,
    gold: gold - s.gold,
    experience: total - totalExperience(s),
    after: { experience: total, rating, power: strength() },
    cut,
  };
}

/** The whole reckoning for one warband before one game: the match, the scope of job it asks for, the job and its pay. */
export interface Reckoning {
  match: Match;
  scope: JobScope;
  power: number;
  /** Null only when the board has nothing open to them. */
  payout: Payout | null;
}

/** The table's own rolls for the job: a D6 or D66 for which notice, 2D6 for the gold, a D6 for the experience. Each a list of one, the job's. */
export interface TableRolls {
  picks?: (number | null | undefined)[];
  dice?: (number | null | undefined)[];
  experience?: (number | null | undefined)[];
}

/** Draw the job the match asks for and pay it, with the table's rolls where they rolled. */
export function reckon(s: Standing, others: Standing[], board: Job[], seed: number, opts: DrawOptions & TableRolls = {}): Reckoning {
  const match = matchFor(s, others);
  const scope = scopeFor(match);
  const drawn = drawSlot(board, scope, seed, { ...opts, pick: opts.picks?.[0] ?? null });
  if (!drawn) return { match, scope, power: powerOf(s), payout: null };
  const { job, ...slot } = drawn;
  const pay = payJobs(s, match, [{ job, owed: scope !== 'errand', dice: opts.dice?.[0] ?? null, experienceDie: opts.experience?.[0] ?? null, slot }], seed);
  return { match, scope, power: powerOf(s), payout: pay };
}
