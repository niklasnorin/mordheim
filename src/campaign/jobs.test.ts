import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LEAN_GOLD as LEAN, DICE_HIGH, DICE_LOW, GOLD_PER_RATING, JOBS_AT_MOST, USUAL_SHARE, isDiceTotal, ceilingFor, drawJobs, effectiveGames, jobSeed, jobsOwed, paceOf, payJobs, powerOf, ratingOf, reckon, shutBecause, totalExperience, type Job, type Standing } from './jobs.ts';

const job = (id: number, over: Partial<Job> = {}): Job => ({ id, locationId: 'fussenbach', pointId: id, title: `Job ${id}`, text: '', lean: 'even', withheld: false, sort: id, ...over });
const BOARD = [job(1, { lean: 'gold' }), job(2, { lean: 'experience' }), job(3, { lean: 'champion' }), job(4), job(5, { lean: 'gold' }), job(6, { pointId: null })];

const band = (id: string, played: number, xp: number[], over: Partial<Standing> = {}): Standing => ({
  warbandId: id, name: id, active: true, played, jobs: 0, rating: 0, gold: 0,
  warriors: xp.map((n, i) => ({ id: `${id}-${i}`, name: `${id} ${i}`, rank: i < 3 ? 'hero' : 'henchman', experience: n, leader: i === 0 })),
  ...over,
});

// three warbands: two who play and one who has missed games
const veteran = () => band('veteran', 4, [30, 18, 14, 6, 6], { gold: 80 });
const regular = () => band('regular', 3, [24, 12, 9, 4, 3], { gold: 40 });
const absent = () => band('absent', 1, [12, 4, 2, 1, 0]);

test('the rating is the logged one, or reckoned from the roster as the rulebook would; strength counts the treasury', () => {
  const s = absent();
  assert.equal(totalExperience(s), 19);
  assert.equal(ratingOf(s), 5 * 5 + 19, 'nobody logged a rating: 5 a warrior plus their experience');
  assert.equal(ratingOf({ ...s, rating: 140 }), 140);
  assert.equal(powerOf({ ...s, gold: 3 * GOLD_PER_RATING + 2 }), 44 + 3);
});

test('the pace is the median of effective games, the higher middle when even, and jobs count towards it', () => {
  assert.equal(paceOf([veteran(), regular(), absent()]), 3);
  assert.equal(paceOf([veteran(), absent()]), 4, 'two warbands: the higher of the two');
  assert.equal(paceOf([veteran(), regular(), absent(), { ...band('idle', 0, [5]), active: false }]), 3, 'a warband nobody keeps or plays does not count');
  assert.equal(effectiveGames({ played: 1, jobs: 2 }), 3);
  assert.equal(paceOf([]), 0);
});

test('what is owed is the gap to the pace, at most three, and nothing with nobody ahead', () => {
  const all = [veteran(), regular(), absent()];
  assert.equal(jobsOwed(absent(), all), 2);
  assert.equal(jobsOwed(regular(), all), 0, 'at the pace');
  assert.equal(jobsOwed(veteran(), all), 0, 'nobody ahead');
  const far = band('far', 0, [10]);
  assert.equal(jobsOwed(far, [band('a', 9, [40]), band('b', 9, [40]), far]), JOBS_AT_MOST);
  const caught = { ...absent(), jobs: 2 };
  assert.equal(jobsOwed(caught, [veteran(), regular(), caught]), 0, 'jobs already taken close the gap');
});

test('the ceiling is the weakest of those ahead, three ways', () => {
  const c = ceilingFor(absent(), [veteran(), regular(), absent()])!;
  assert.deepEqual(c.ahead.sort(), ['regular', 'veteran']);
  assert.equal(c.power, powerOf(regular()));
  assert.equal(c.experience, totalExperience(regular()));
  assert.deepEqual(c.warrior, { hero: 24, henchman: 4 }, 'the least of the best each warband ahead has of the rank');
  assert.equal(ceilingFor(veteran(), [veteran(), regular(), absent()]), null);
});

test('the post is open only before the first turn of a scheduled game the warband is on', () => {
  const game = { status: 'upcoming' as const, turn: 0, warbands: [{ warbandId: 'absent' }] };
  assert.equal(shutBecause(game, 'absent'), null);
  assert.match(shutBecause(null, 'absent')!, /No game is scheduled/);
  assert.match(shutBecause(game, 'veteran')!, /not on that game/);
  assert.match(shutBecause({ ...game, turn: 1 }, 'absent')!, /has begun/);
  assert.match(shutBecause({ ...game, status: 'played' }, 'absent')!, /played/);
});

test('the draw is seeded, never repeats, skips withheld jobs and the next field, and favours jobs not done lately', () => {
  const seed = jobSeed('absent', 'scenario-02');
  const a = drawJobs(BOARD, 3, seed), b = drawJobs(BOARD, 3, seed);
  assert.deepEqual(a.map((j) => j.id), b.map((j) => j.id), 'the same game, the same jobs');
  assert.equal(new Set(a.map((j) => j.id)).size, 3);
  const board = BOARD.map((j) => (j.id === 2 ? { ...j, withheld: true } : j));
  for (let s = 0; s < 50; s++) {
    const drawn = drawJobs(board, 5, s, { barredPoints: [4] });
    assert.ok(!drawn.some((j) => j.id === 2), 'withheld');
    assert.ok(!drawn.some((j) => j.id === 4), 'a game is set at point 4');
  }
  assert.equal(drawJobs(board, 9, seed, { barredPoints: [4] }).length, 4, 'a small board pays fewer');
  const fresh = drawJobs(BOARD, 2, seed, { lastTaken: { 1: 3, 2: 2, 3: 1, 4: 5 } });
  assert.deepEqual(fresh.map((j) => j.id).sort(), [5, 6], 'never-done jobs first');
});

test('the pay never lifts a warband past the weakest warband ahead, however the dice fall', () => {
  for (let seed = 0; seed < 300; seed++) {
    const me = band('absent', 0, [20, 10, 9, 3, 2], { gold: seed % 90 });
    const all = [veteran(), regular(), me, band('fourth', 3, [22, 11, 10, 4, 4], { gold: 10 })];
    const r = reckon(me, all, BOARD, seed);
    assert.ok(r.payout, `seed ${seed}: something is paid`);
    const c = r.ceiling!;
    // a warband already stronger than the ceiling (a fat treasury) is paid nothing at all
    assert.ok(r.payout.after.power <= Math.max(c.power, powerOf(me)), `seed ${seed}: strength ${r.payout.after.power} over ${c.power}`);
    if (powerOf(me) >= c.power) {
      assert.equal(r.payout.after.power, powerOf(me), `seed ${seed}: already as strong as those ahead, and no stronger after`);
      assert.equal(r.payout.experience, 0, `seed ${seed}: no experience either`);
    }
    assert.ok(r.payout.after.experience <= c.experience, `seed ${seed}: experience`);
    const xp = new Map(me.warriors.map((w) => [w.id, w.experience]));
    for (const p of r.payout.jobs) for (const g of p.grants) xp.set(g.memberId, xp.get(g.memberId)! + g.experience);
    for (const w of me.warriors) assert.ok(xp.get(w.id)! <= c.warrior[w.rank]!, `seed ${seed}: ${w.id} past the best ${w.rank} ahead`);
    for (const p of r.payout.jobs) assert.equal(p.gold % 5, 0, 'gold in fives');
    assert.deepEqual(r.payout.jobs.map((p) => p.owed), [...Array(r.owed).fill(true), false], 'the owed jobs first, then the usual work');
  }
});

test('a warband right under the ceiling is paid nothing, and says it was cut', () => {
  const me = band('absent', 1, [24, 12, 9, 4, 3], { gold: 40 });
  const all = [veteran(), regular(), me];
  const r = reckon(me, all, BOARD, 7);
  assert.ok(r.payout);
  assert.equal(r.payout.gold, 0);
  assert.equal(r.payout.experience, 0);
  assert.ok(r.payout.cut);
});

test('the leans pay as they say, and an advance reached is flagged', () => {
  const me = absent();
  const c = { ahead: ['x'], power: 10_000, experience: 10_000, warrior: { hero: 100, henchman: 100 } };
  const pay = (lean: Job['lean']) => payJobs(me, c, [{ job: job(1, { lean }), owed: true }], 1).jobs[0];
  assert.deepEqual(pay('experience').grants.map((g) => g.experience), [1, 1, 1, 1, 1], 'every warrior');
  assert.deepEqual(pay('even').grants.map((g) => g.memberId), ['absent-0', 'absent-1', 'absent-2'], 'every hero');
  assert.deepEqual(pay('gold').grants.map((g) => g.memberId), ['absent-0'], 'the leader');
  const champ = pay('champion').grants;
  assert.deepEqual(champ.map((g) => [g.memberId, g.experience]), [['absent-2', 2]], 'the least experienced hero, twice');
  assert.equal(champ[0].advance, true, '2 to 4 reaches a hero’s advance');
  assert.ok(pay('gold').rolled > pay('experience').rolled, 'gold leans pay more gold');
});

test('one warband’s jobs move the next one’s offer', () => {
  const a = band('a', 1, [10, 4, 2, 1, 0]);
  const b = band('b', 0, [8, 3, 1, 0, 0]);
  const before = jobsOwed(b, [veteran(), regular(), a, b]);
  const r = reckon(a, [veteran(), regular(), a, b], BOARD, 3);
  const taken = { ...a, jobs: r.payout!.jobs.filter((p) => p.owed).length, warriors: a.warriors.map((w) => ({ ...w, experience: w.experience + r.payout!.jobs.flatMap((p) => p.grants).filter((g) => g.memberId === w.id).reduce((n, g) => n + g.experience, 0) })) };
  const after = ceilingFor(b, [veteran(), regular(), taken, b])!;
  assert.ok(after.ahead.includes('a'), 'a counts as ahead of b once it has caught up');
  assert.ok(after.power <= powerOf(regular()), 'and b is still held under those who played');
  assert.ok(before >= 1);
});

test('everyone takes the usual work: a few crowns, no experience, and it does not count towards the pace', () => {
  const all = [veteran(), regular(), absent()];
  for (const s of [veteran(), regular()]) {
    for (let seed = 0; seed < 100; seed++) {
      const r = reckon(s, all, BOARD, seed);
      assert.equal(r.owed, 0);
      assert.equal(r.payout!.jobs.length, 1, `${s.warbandId}: the usual work alone`);
      const [usual] = r.payout!.jobs;
      assert.equal(usual.owed, false);
      assert.equal(usual.grants.length, 0, 'no experience');
      assert.ok(usual.gold >= 5 && usual.gold <= Math.round((12 * 5 + 15) * 1.5 * USUAL_SHARE / 5) * 5, `seed ${seed}: ${usual.gold} gc is a few crowns`);
      assert.equal(usual.gold % 5, 0);
    }
  }
  assert.equal(reckon(veteran(), all, BOARD, 1).ceiling, null, 'the leader is held under nothing, and paid only the usual work');
  const behind = reckon(absent(), all, BOARD, 1);
  assert.equal(behind.payout!.jobs.length, behind.owed + 1, 'the owed jobs and the usual work');
  const owedGold = behind.payout!.jobs.filter((p) => p.owed).reduce((n, p) => n + p.rolled, 0) / behind.owed;
  assert.ok(owedGold > behind.payout!.jobs.find((p) => !p.owed)!.rolled, 'an owed job pays far better than the usual work');
});

test('a board too small for everything pays what is owed before the usual work', () => {
  const all = [veteran(), regular(), absent()];
  const r = reckon(absent(), all, [job(1), job(2)], 4);
  assert.equal(r.owed, 2);
  assert.deepEqual(r.payout!.jobs.map((p) => p.owed), [true, true]);
  assert.equal(reckon(veteran(), all, [], 4).payout, null, 'a bare board pays nothing');
});

test('the post rolls the dice, or the table does and says the total', () => {
  const all = [veteran(), regular(), absent()];
  const post = reckon(absent(), all, BOARD, 9);
  assert.ok(post.payout!.jobs.every((p) => !p.byHand && p.dice >= DICE_LOW && p.dice <= DICE_HIGH), 'the post rolls 2D6 for every job');
  assert.deepEqual(reckon(absent(), all, BOARD, 9).payout!.jobs.map((p) => p.dice), post.payout!.jobs.map((p) => p.dice), 'the same game, the same roll');
  const hand = reckon(absent(), all, BOARD, 9, { dice: [12] });
  const [first, ...rest] = hand.payout!.jobs;
  assert.equal(first.dice, 12);
  assert.equal(first.byHand, true);
  assert.equal(first.rolled, Math.round(((12 * 5 + 15) * LEAN[first.job.lean]) / 5) * 5, 'the table’s 12 pays as a 12');
  assert.deepEqual(rest.map((p) => [p.dice, p.byHand]), post.payout!.jobs.slice(1).map((p) => [p.dice, false]), 'the other jobs keep the post’s roll');
  assert.deepEqual(hand.payout!.jobs.map((p) => p.job.id), post.payout!.jobs.map((p) => p.job.id), 'the dice choose the pay, not the jobs');
  // the usual work rolls too, at its share
  const usual = reckon(veteran(), all, BOARD, 9, { dice: [2] }).payout!.jobs[0];
  assert.equal(usual.byHand, true);
  assert.equal(usual.rolled, Math.max(5, Math.round(((2 * 5 + 15) * LEAN[usual.job.lean] * USUAL_SHARE) / 5) * 5));
  // what no 2D6 shows is not taken: the post's roll stands
  for (const bad of [1, 13, 7.5, NaN]) assert.equal(reckon(absent(), all, BOARD, 9, { dice: [bad] }).payout!.jobs[0].byHand, false, String(bad));
  assert.equal(isDiceTotal(7), true);
  assert.equal(isDiceTotal('7'), false);
});

test('the table’s dice are held under the ceiling like the post’s', () => {
  for (let seed = 0; seed < 100; seed++) {
    const me = band('absent', 0, [20, 10, 9, 3, 2]);
    const all = [veteran(), regular(), me];
    const r = reckon(me, all, BOARD, seed, { dice: [12, 12, 12, 12] });
    assert.ok(r.payout!.after.power <= r.ceiling!.power, `seed ${seed}`);
    assert.ok(r.payout!.jobs.every((p) => p.byHand));
  }
});
