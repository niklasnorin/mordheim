import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DICE_HIGH, DICE_LOW, EXPERIENCE_FLOOR, GOLD_PER_RATING, JOBS_AT_MOST, JOB_SPAN, LEAN_GOLD, LEAN_SPLIT, MATCH_TARGET, USUAL_SHARE,
  drawJobs, drawSlots, experienceShareOf, isD6, isD66, isDiceTotal, jobSeed, jobsOwed, matchFor, numberBoard, payJobs, powerOf, ratingOf, reckon,
  shutBecause, totalExperience, type Job, type Match, type Standing,
} from './jobs.ts';

const job = (id: number, over: Partial<Job> = {}): Job => ({ id, locationId: 'fussenbach', pointId: id, title: `Job ${id}`, text: '', lean: 'even', withheld: false, sort: id, ...over });
const BOARD = [job(1, { lean: 'gold' }), job(2, { lean: 'experience' }), job(3, { lean: 'champion' }), job(4), job(5, { lean: 'gold' }), job(6, { pointId: null })];

const band = (id: string, xp: number[], over: Partial<Standing> = {}): Standing => ({
  warbandId: id, name: id, played: 0, rating: 0, gold: 0,
  warriors: xp.map((n, i) => ({ id: `${id}-${i}`, name: `${id} ${i}`, rank: i < 3 ? 'hero' : 'henchman', experience: n, leader: i === 0 })),
  ...over,
});

// a strong warband and a weak one, about to meet
const strong = () => band('strong', [30, 18, 14, 6, 6], { rating: 160, gold: 70 });
const weak = () => band('weak', [12, 4, 2, 1, 0], { rating: 90 });
const xpOf = (grants: { experience: number }[]) => grants.reduce((n, g) => n + g.experience, 0);

test('the rating is the logged one, or reckoned from the roster as the rulebook would; strength counts the treasury', () => {
  const s = band('x', [12, 4, 2, 1, 0]);
  assert.equal(totalExperience(s), 19);
  assert.equal(ratingOf(s), 5 * 5 + 19, 'nobody logged a rating: 5 a warrior plus their experience');
  assert.equal(ratingOf({ ...s, rating: 140 }), 140);
  assert.equal(powerOf({ ...s, gold: 3 * GOLD_PER_RATING + 2 }), 44 + 3);
});

test('the match: the stronger side is the strongest other warband of the game, and the target four fifths of it', () => {
  const m = matchFor(weak(), [strong(), weak()]);
  assert.equal(m.stronger?.warbandId, 'strong');
  assert.equal(m.stronger?.power, 170);
  assert.equal(m.target, Math.floor(MATCH_TARGET * 170));
  assert.equal(m.gap, 136 - 90);
  assert.deepEqual(m.stronger?.best, { hero: 30, henchman: 6 });
  const third = band('third', [8], { rating: 120 });
  assert.equal(matchFor(weak(), [third, strong()]).stronger?.warbandId, 'strong', 'the strongest of the others, in a game of three');
  assert.equal(matchFor(strong(), [weak()]).stronger, null, 'nobody is stronger than the strongest');
  assert.equal(matchFor(weak(), []).stronger, null, 'alone, nobody is');
  assert.equal(matchFor(band('near', [5], { rating: 150 }), [strong()]).gap, 0, 'already past the target: no gap, though the other is stronger');
});

test('the gap asks for one owed job per span of it, at most three', () => {
  assert.equal(jobsOwed({ gap: 0 }), 0);
  assert.equal(jobsOwed({ gap: 1 }), 1);
  assert.equal(jobsOwed({ gap: JOB_SPAN }), 1);
  assert.equal(jobsOwed({ gap: JOB_SPAN + 1 }), 2);
  assert.equal(jobsOwed({ gap: 500 }), JOBS_AT_MOST);
});

test('the post is open only before the first turn of a scheduled game the warband is on', () => {
  const game = { status: 'upcoming' as const, turn: 0, warbands: [{ warbandId: 'weak' }] };
  assert.equal(shutBecause(game, 'weak'), null);
  assert.match(shutBecause(null, 'weak')!, /No game is scheduled/);
  assert.match(shutBecause(game, 'strong')!, /not on that game/);
  assert.match(shutBecause({ ...game, turn: 1 }, 'weak')!, /has begun/);
  assert.match(shutBecause({ ...game, status: 'played' }, 'weak')!, /played/);
});

test('every roll at its best lifts the weaker side to the target, and never past it', () => {
  for (const [rating, gold] of [[90, 0], [40, 0], [120, 10], [60, 300]]) {
    for (let seed = 0; seed < 40; seed++) {
      const me = band('weak', [12, 4, 2, 1, 0], { rating, gold });
      const r = reckon(me, [strong()], BOARD, seed, { dice: [12, 12, 12, 12], experience: [6, 6, 6, 6] });
      const { target, gap, stronger } = r.match;
      if (!gap) continue;
      const owedOnly = r.payout!.jobs.filter((p) => p.owed);
      const reached = powerOf(me) + xpOf(owedOnly.flatMap((p) => p.grants)) + Math.floor(owedOnly.reduce((n, p) => n + p.gold, 0) / GOLD_PER_RATING) ;
      assert.ok(reached <= target, `rating ${rating}, seed ${seed}: the owed jobs reach ${reached}, past the target ${target}`);
      // a warrior short of experience room may leave a little behind; the rest comes within a few points of the target
      assert.ok(reached >= target - 4 || r.payout!.cut, `rating ${rating}, seed ${seed}: ${reached} is well short of ${target}`);
      assert.ok(r.payout!.after.power < stronger!.power, 'and never level with the stronger side, the usual work included');
    }
  }
});

test('however the dice fall, the weaker side ends short of the stronger, and no warrior passes its best', () => {
  for (let seed = 0; seed < 300; seed++) {
    const me = band('weak', [20, 10, 9, 3, 2], { rating: 50 + (seed % 120), gold: (seed * 7) % 200 });
    const them = strong();
    const r = reckon(me, [them], BOARD, seed);
    const after = r.payout!.after.power;
    if (r.match.stronger) {
      assert.ok(after < r.match.stronger.power, `seed ${seed}: ${after} is level with or past ${r.match.stronger.power}`);
      const xp = new Map(me.warriors.map((w) => [w.id, w.experience]));
      for (const p of r.payout!.jobs) for (const g of p.grants) xp.set(g.memberId, xp.get(g.memberId)! + g.experience);
      for (const w of me.warriors) assert.ok(xp.get(w.id)! <= Math.max(w.experience, r.match.stronger.best[w.rank]!), `seed ${seed}: ${w.id} past the best ${w.rank}`);
    }
    for (const p of r.payout!.jobs) assert.equal(p.gold % 5, 0, 'gold in fives');
  }
});

test('ordinary rolls close a good part of the gap, the worst rolls still pay the floor', () => {
  let closed = 0, n = 0;
  for (let seed = 0; seed < 400; seed++) {
    const me = weak();
    const r = reckon(me, [strong()], BOARD, seed);
    const owedOnly = r.payout!.jobs.filter((p) => p.owed);
    closed += (xpOf(owedOnly.flatMap((p) => p.grants)) + owedOnly.reduce((a, p) => a + p.gold, 0) / GOLD_PER_RATING) / r.match.gap;
    n++;
  }
  const mean = closed / n;
  assert.ok(mean > 0.45 && mean < 0.8, `on average the owed jobs close ${(mean * 100).toFixed(0)} parts in a hundred of the gap`);
  const worst = reckon(weak(), [strong()], [job(2, { lean: 'experience' }), job(4)], 1, { dice: [2, 2, 2], experience: [1, 1, 1] });
  const owedWorst = worst.payout!.jobs.filter((p) => p.owed);
  assert.ok(xpOf(owedWorst.flatMap((p) => p.grants)) > 0, 'the worst experience roll still pays the floor');
  assert.ok(owedWorst.every((p) => p.gold > 0), 'the worst gold roll still pays something');
  assert.equal(experienceShareOf(1), EXPERIENCE_FLOOR);
  assert.equal(experienceShareOf(2), EXPERIENCE_FLOOR);
  assert.equal(experienceShareOf(6), 1);
});

test('the leans split an owed job between gold and experience, and say who has the experience', () => {
  const me = weak();
  const m: Match = { stronger: { warbandId: 'x', name: 'x', power: 1000, best: { hero: 100, henchman: 100 } }, target: 800, gap: 30 };
  const pay = (lean: Job['lean']) => payJobs(me, m, [{ job: job(1, { lean }), owed: true, dice: 12, experienceDie: 6 }], 1).jobs[0];
  for (const lean of ['gold', 'experience', 'champion', 'even'] as const) {
    const p = pay(lean);
    assert.equal(p.worth, 30);
    assert.equal(p.rolled, Math.round((30 * LEAN_SPLIT[lean] * GOLD_PER_RATING) / 5) * 5, `${lean}: its gold share at a 12`);
    assert.equal(xpOf(p.grants), Math.round(30 * (1 - LEAN_SPLIT[lean])), `${lean}: its experience share at a 6`);
  }
  assert.ok(pay('gold').rolled > pay('experience').rolled, 'a gold job pays more gold');
  assert.ok(xpOf(pay('experience').grants) > xpOf(pay('gold').grants), 'an experience job more experience');
  assert.deepEqual(pay('gold').grants.map((g) => g.memberId), ['weak-0'], 'the leader');
  assert.deepEqual(pay('champion').grants.map((g) => g.memberId), ['weak-2'], 'the least experienced hero, alone');
  assert.deepEqual(pay('even').grants.map((g) => g.memberId).sort(), ['weak-0', 'weak-1', 'weak-2'], 'every hero');
  assert.equal(pay('experience').grants.length, 5, 'every warrior');
  assert.ok(pay('champion').grants[0].advance, 'an advance reached is flagged');
});

test('the stronger side takes the usual work alone: a few crowns, a chance of a point or two, held under nothing', () => {
  const leaderXp: number[] = [];
  for (let seed = 0; seed < 200; seed++) {
    const r = reckon(strong(), [weak()], BOARD, seed);
    assert.equal(r.owed, 0);
    assert.equal(r.match.stronger, null);
    assert.equal(r.payout!.jobs.length, 1);
    const [usual] = r.payout!.jobs;
    assert.equal(usual.owed, false);
    assert.ok(usual.gold >= 5 && usual.gold <= Math.round(((12 * 5 + 15) * 1.5 * USUAL_SHARE) / 5) * 5, `seed ${seed}: ${usual.gold} gc`);
    const xp = xpOf(usual.grants);
    assert.ok(xp <= 2);
    leaderXp.push(xp);
  }
  assert.ok(leaderXp.some((n) => n > 0) && leaderXp.some((n) => n === 0), 'a chance, and only a chance');
  const behind = reckon(weak(), [strong()], BOARD, 1);
  assert.equal(behind.payout!.jobs.length, behind.owed + 1, 'the weaker side: the owed jobs and the usual work');
  assert.equal(behind.payout!.jobs.at(-1)!.owed, false);
});

test('the usual work rolls its experience on its own table', () => {
  const me = weak();
  const open: Match = { stronger: null, target: 0, gap: 0 };
  const usual = (lean: Job['lean'], d6: number) => payJobs(me, open, [{ job: job(1, { lean }), owed: false, experienceDie: d6 }], 3).jobs[0].grants;
  for (const d6 of [1, 2, 3]) assert.deepEqual(usual('experience', d6), [], `${d6}: none`);
  assert.deepEqual(usual('experience', 4).map((g) => [g.memberId, g.experience]), [['weak-4', 1]]);
  assert.deepEqual(usual('experience', 6).map((g) => [g.memberId, g.experience]), [['weak-4', 1], ['weak-3', 1]]);
  assert.deepEqual(usual('gold', 6).map((g) => [g.memberId, g.experience]), [['weak-0', 2]], 'the lean names one: two to them');
});

test('the post rolls every die, or the table does; a roll at the table changes that roll alone', () => {
  const post = reckon(weak(), [strong()], BOARD, 9);
  assert.ok(post.payout!.jobs.every((p) => !p.byHand && !p.experienceByHand && isDiceTotal(p.dice) && isD6(p.experienceDie)));
  assert.deepEqual(reckon(weak(), [strong()], BOARD, 9).payout!.jobs.map((p) => [p.dice, p.experienceDie]), post.payout!.jobs.map((p) => [p.dice, p.experienceDie]), 'the same game, the same rolls');
  const hand = reckon(weak(), [strong()], BOARD, 9, { dice: [12], experience: [6] });
  const [first, ...rest] = hand.payout!.jobs;
  assert.deepEqual([first.dice, first.byHand, first.experienceDie, first.experienceByHand], [12, true, 6, true]);
  assert.deepEqual(rest.map((p) => [p.dice, p.experienceDie]), post.payout!.jobs.slice(1).map((p) => [p.dice, p.experienceDie]), 'the other jobs keep the post’s rolls');
  assert.deepEqual(hand.payout!.jobs.map((p) => p.job.id), post.payout!.jobs.map((p) => p.job.id), 'the dice choose the pay, not the jobs');
  for (const bad of [1, 13, 7.5, NaN]) assert.equal(reckon(weak(), [strong()], BOARD, 9, { dice: [bad] }).payout!.jobs[0].byHand, false, String(bad));
  for (const bad of [0, 7, 2.5]) assert.equal(reckon(weak(), [strong()], BOARD, 9, { experience: [bad] }).payout!.jobs[0].experienceByHand, false, String(bad));
  assert.ok(isDiceTotal(DICE_LOW) && isDiceTotal(DICE_HIGH) && !isDiceTotal('7'));
  assert.equal(LEAN_GOLD.gold, 1.5);
});

test('the draw is seeded, never repeats, skips withheld jobs and the next field, and favours jobs not done lately', () => {
  const seed = jobSeed('weak', 'scenario-02');
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

test('a board too small for everything pays what is owed before the usual work', () => {
  const r = reckon(weak(), [strong()], [job(1), job(2)], 4);
  assert.equal(r.owed, 3);
  assert.deepEqual(r.payout!.jobs.map((p) => p.owed), [true, true]);
  assert.equal(reckon(strong(), [weak()], [], 4).payout, null, 'a bare board pays nothing');
});

test('the notices are numbered D66 in the board’s order, withheld ones keeping their number', () => {
  const board = Array.from({ length: 40 }, (_, i) => job(i + 1, { sort: 40 - i, withheld: i === 39 }));
  const n = numberBoard(board);
  assert.equal(n.get(40), 11, 'the first by sort, withheld or not');
  assert.equal(n.get(35), 16);
  assert.equal(n.get(34), 21);
  assert.equal(n.get(5), 66, 'the 36th');
  assert.equal(n.get(4), undefined, 'the 37th has no number');
  assert.ok(isD66(11) && isD66(66) && isD66(34) && !isD66(17) && !isD66(70) && !isD66(10) && !isD66(3));
  assert.ok(isD6(1) && isD6(6) && !isD6(0) && !isD6(7) && !isD6(2.5));
});

test('the table may roll D66 for a notice; a number it may not have is refused, and the post draws that place', () => {
  const board = [job(1), job(2, { withheld: true }), job(3), job(4), job(5), job(6)];
  const n = numberBoard(board);
  const at = (id: number) => n.get(id)!;
  const post = drawSlots(board, 3, 5);
  assert.ok(post.every((s) => !s.byHand && s.number != null));
  const hand = drawSlots(board, 3, 5, { picks: [at(4), at(4), at(2)], barredPoints: [5] });
  assert.equal(hand[0].job.id, 4);
  assert.equal(hand[0].byHand, true);
  assert.match(hand[1].refused!, /Already taken/);
  assert.match(hand[2].refused!, /withheld/);
  assert.ok(hand.slice(1).every((s) => !s.byHand && s.job.id !== 4 && s.job.id !== 2 && s.job.id !== 5));
  assert.match(drawSlots(board, 1, 5, { picks: [at(5)], barredPoints: [5] })[0].refused!, /game is set/);
  assert.match(drawSlots(board, 1, 5, { picks: [26] })[0].refused!, /No notice/);
  assert.match(drawSlots(board, 1, 5, { picks: [17] })[0].refused!, /Not a roll/);
  assert.equal(new Set(drawSlots(board, 5, 5, { picks: [at(1), null, at(3)] }).map((s) => s.job.id)).size, 5, 'never a job twice');
});
