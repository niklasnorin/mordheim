import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GOLD_PER_RATING, JOBS_AT_MOST, ceilingFor, drawJobs, effectiveGames, jobSeed, jobsOwed, paceOf, payJobs, powerOf, ratingOf, reckon, shutBecause, totalExperience, type Job, type Standing } from './jobs.ts';

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
  const pay = (lean: Job['lean']) => payJobs(me, c, [job(1, { lean })], 1).jobs[0];
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
  const taken = { ...a, jobs: r.payout!.jobs.length, warriors: a.warriors.map((w) => ({ ...w, experience: w.experience + r.payout!.jobs.flatMap((p) => p.grants).filter((g) => g.memberId === w.id).reduce((n, g) => n + g.experience, 0) })) };
  const after = ceilingFor(b, [veteran(), regular(), taken, b])!;
  assert.ok(after.ahead.includes('a'), 'a counts as ahead of b once it has caught up');
  assert.ok(after.power <= powerOf(regular()), 'and b is still held under those who played');
  assert.ok(before >= 1);
});
