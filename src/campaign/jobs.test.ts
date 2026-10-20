import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DICE_HIGH, DICE_LOW, ERRAND_SHARE, EXPERIENCE_FLOOR, GOLD_PER_RATING, LEAN_GOLD, LEAN_SPLIT, MATCH_TARGET, SCOPE_FROM,
  dieFor, drawJobs, drawSlot, experienceShareOf, isD6, isD66, isDiceTotal, isNoticeRoll, jobSeed, matchFor, numberBoard, payJobs, powerOf,
  ratingOf, reckon, scopeFor, shutBecause, totalExperience, type Job, type JobScope, type Match, type Standing,
} from './jobs.ts';

const job = (id: number, scope: JobScope, over: Partial<Job> = {}): Job => ({ id, locationId: 'fussenbach', pointId: id, title: `Job ${id}`, text: '', lean: 'even', scope, withheld: false, sort: id, ...over });
const BOARD: Job[] = [
  job(1, 'errand', { lean: 'gold' }), job(2, 'errand', { lean: 'experience' }), job(3, 'errand'),
  job(11, 'commission', { lean: 'gold' }), job(12, 'commission', { lean: 'experience' }), job(13, 'commission', { lean: 'champion' }),
  job(21, 'undertaking', { lean: 'experience' }), job(22, 'undertaking', { lean: 'even' }), job(23, 'undertaking', { lean: 'gold', pointId: null }),
];

const band = (id: string, xp: number[], over: Partial<Standing> = {}): Standing => ({
  warbandId: id, name: id, rating: 0, gold: 0,
  warriors: xp.map((n, i) => ({ id: `${id}-${i}`, name: `${id} ${i}`, rank: i < 3 ? 'hero' : 'henchman', experience: n, leader: i === 0 })),
  ...over,
});

// a strong warband and a weak one, about to meet
const strong = () => band('strong', [30, 18, 14, 6, 6], { rating: 160, gold: 70 });
const weak = () => band('weak', [12, 4, 2, 1, 0], { rating: 90 });
const xpOf = (grants: { experience: number }[]) => grants.reduce((n, g) => n + g.experience, 0);
const closed = (p: { gold: number; grants: { experience: number }[] }) => xpOf(p.grants) + p.gold / GOLD_PER_RATING;

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
  assert.equal(matchFor(weak(), [band('third', [8], { rating: 120 }), strong()]).stronger?.warbandId, 'strong', 'the strongest of the others, in a game of three');
  assert.equal(matchFor(strong(), [weak()]).stronger, null, 'nobody is stronger than the strongest');
  assert.equal(matchFor(weak(), []).stronger, null, 'alone, nobody is');
  assert.equal(matchFor(band('near', [5], { rating: 150 }), [strong()]).gap, 0, 'already past the target: no gap, though the other is stronger');
});

test('the gap picks the scope: an errand when close, a commission when middling, an undertaking when wide', () => {
  assert.equal(scopeFor({ gap: 0 }), 'errand');
  assert.equal(scopeFor({ gap: SCOPE_FROM.commission - 1 }), 'errand');
  assert.equal(scopeFor({ gap: SCOPE_FROM.commission }), 'commission');
  assert.equal(scopeFor({ gap: SCOPE_FROM.undertaking - 1 }), 'commission');
  assert.equal(scopeFor({ gap: SCOPE_FROM.undertaking }), 'undertaking');
  assert.equal(reckon(weak(), [strong()], BOARD, 1).scope, 'undertaking', 'a gap of 46');
  assert.equal(reckon(band('mid', [5], { rating: 120 }), [strong()], BOARD, 1).scope, 'commission', 'a gap of 16');
  assert.equal(reckon(strong(), [weak()], BOARD, 1).scope, 'errand', 'the stronger side');
});

test('one job a warband, of the scope asked for', () => {
  for (let seed = 0; seed < 50; seed++) {
    for (const [me, scope] of [[weak(), 'undertaking'], [band('mid', [5], { rating: 120 }), 'commission'], [strong(), 'errand']] as const) {
      const r = reckon(me, [me === strong() ? weak() : strong(), weak()].filter((o) => o.warbandId !== me.warbandId), BOARD, seed);
      assert.equal(r.payout!.jobs.length, 1);
      assert.equal(r.payout!.jobs[0].job.scope, scope);
      assert.equal(r.payout!.jobs[0].owed, scope !== 'errand');
    }
  }
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
  for (const [rating, gold] of [[130, 0], [110, 0], [90, 0], [40, 0], [60, 300]]) {
    for (let seed = 0; seed < 40; seed++) {
      const me = band('weak', [12, 4, 2, 1, 0], { rating, gold });
      const r = reckon(me, [strong()], BOARD, seed, { dice: [12], experience: [6] });
      const { target, gap, stronger } = r.match;
      const after = r.payout!.after.power;
      assert.ok(after < stronger!.power, `rating ${rating}: never level with the stronger side`);
      if (r.scope === 'errand') continue;
      assert.ok(after <= target, `rating ${rating}, seed ${seed}: ${after} past the target ${target}`);
      assert.ok(after >= target - 3 || r.payout!.cut, `rating ${rating}, seed ${seed}: ${after} well short of ${target} (gap ${gap})`);
    }
  }
});

test('however the dice fall, the weaker side ends short of the stronger, and no warrior passes its best', () => {
  for (let seed = 0; seed < 300; seed++) {
    const me = band('weak', [20, 10, 9, 3, 2], { rating: 50 + (seed % 120), gold: (seed * 7) % 200 });
    const r = reckon(me, [strong()], BOARD, seed);
    const after = r.payout!.after.power;
    if (!r.match.stronger) continue;
    assert.ok(after < r.match.stronger.power, `seed ${seed}: ${after} is level with or past ${r.match.stronger.power}`);
    const xp = new Map(me.warriors.map((w) => [w.id, w.experience]));
    for (const p of r.payout!.jobs) for (const g of p.grants) xp.set(g.memberId, xp.get(g.memberId)! + g.experience);
    for (const w of me.warriors) assert.ok(xp.get(w.id)! <= Math.max(w.experience, r.match.stronger.best[w.rank]!), `seed ${seed}: ${w.id} past the best ${w.rank}`);
    for (const p of r.payout!.jobs) assert.equal(p.gold % 5, 0, 'gold in fives');
  }
});

test('ordinary rolls close a good part of the gap, the worst rolls still pay the floor', () => {
  let sum = 0, n = 0;
  for (let seed = 0; seed < 400; seed++) {
    const r = reckon(weak(), [strong()], BOARD, seed);
    sum += closed(r.payout!.jobs[0]) / r.match.gap;
    n++;
  }
  const mean = sum / n;
  assert.ok(mean > 0.45 && mean < 0.8, `on average the job closes ${(mean * 100).toFixed(0)} parts in a hundred of the gap`);
  const worst = reckon(weak(), [strong()], BOARD.filter((j) => j.lean === 'experience' || j.scope !== 'undertaking'), 1, { dice: [2], experience: [1] }).payout!.jobs[0];
  assert.ok(xpOf(worst.grants) > 0, 'the worst experience roll still pays the floor');
  assert.ok(worst.gold > 0, 'the worst gold roll still pays something');
  assert.equal(experienceShareOf(1), EXPERIENCE_FLOOR);
  assert.equal(experienceShareOf(2), EXPERIENCE_FLOOR);
  assert.equal(experienceShareOf(6), 1);
});

test('the leans split a job between gold and experience, and say who has the experience', () => {
  const me = weak();
  const m: Match = { stronger: { warbandId: 'x', name: 'x', power: 1000, best: { hero: 100, henchman: 100 } }, target: 800, gap: 30 };
  const pay = (lean: Job['lean']) => payJobs(me, m, [{ job: job(1, 'undertaking', { lean }), owed: true, dice: 12, experienceDie: 6 }], 1).jobs[0];
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

test('the stronger side takes an errand: a few crowns, a chance of a point or two, held under nothing', () => {
  const leaderXp: number[] = [];
  for (let seed = 0; seed < 200; seed++) {
    const r = reckon(strong(), [weak()], BOARD, seed);
    assert.equal(r.match.stronger, null);
    const [errand] = r.payout!.jobs;
    assert.equal(errand.owed, false);
    assert.ok(errand.gold >= 5 && errand.gold <= Math.round(((12 * 5 + 15) * 1.5 * ERRAND_SHARE) / 5) * 5, `seed ${seed}: ${errand.gold} gc`);
    const xp = xpOf(errand.grants);
    assert.ok(xp <= 2);
    leaderXp.push(xp);
  }
  assert.ok(leaderXp.some((n) => n > 0) && leaderXp.some((n) => n === 0), 'a chance, and only a chance');
});

test('an errand rolls its experience on its own table', () => {
  const me = weak();
  const open: Match = { stronger: null, target: 0, gap: 0 };
  const errand = (lean: Job['lean'], d6: number) => payJobs(me, open, [{ job: job(1, 'errand', { lean }), owed: false, experienceDie: d6 }], 3).jobs[0].grants;
  for (const d6 of [1, 2, 3]) assert.deepEqual(errand('experience', d6), [], `${d6}: none`);
  assert.deepEqual(errand('experience', 4).map((g) => [g.memberId, g.experience]), [['weak-4', 1]]);
  assert.deepEqual(errand('experience', 6).map((g) => [g.memberId, g.experience]), [['weak-4', 1], ['weak-3', 1]]);
  assert.deepEqual(errand('gold', 6).map((g) => [g.memberId, g.experience]), [['weak-0', 2]], 'the lean names one: two to them');
});

test('the post rolls every die, or the table does; a roll at the table changes that roll alone', () => {
  const post = reckon(weak(), [strong()], BOARD, 9).payout!.jobs[0];
  assert.ok(!post.byHand && !post.experienceByHand && isDiceTotal(post.dice) && isD6(post.experienceDie));
  const again = reckon(weak(), [strong()], BOARD, 9).payout!.jobs[0];
  assert.deepEqual([again.job.id, again.dice, again.experienceDie], [post.job.id, post.dice, post.experienceDie], 'the same game, the same job and rolls');
  const gold = reckon(weak(), [strong()], BOARD, 9, { dice: [12] }).payout!.jobs[0];
  assert.deepEqual([gold.dice, gold.byHand, gold.experienceDie, gold.experienceByHand, gold.job.id], [12, true, post.experienceDie, false, post.job.id], 'the gold rolled at the table, the rest the post’s');
  const xp = reckon(weak(), [strong()], BOARD, 9, { experience: [6] }).payout!.jobs[0];
  assert.deepEqual([xp.experienceDie, xp.experienceByHand, xp.dice], [6, true, post.dice]);
  for (const bad of [1, 13, 7.5, NaN]) assert.equal(reckon(weak(), [strong()], BOARD, 9, { dice: [bad] }).payout!.jobs[0].byHand, false, String(bad));
  for (const bad of [0, 7, 2.5]) assert.equal(reckon(weak(), [strong()], BOARD, 9, { experience: [bad] }).payout!.jobs[0].experienceByHand, false, String(bad));
  assert.ok(isDiceTotal(DICE_LOW) && isDiceTotal(DICE_HIGH) && !isDiceTotal('7'));
  assert.equal(LEAN_GOLD.gold, 1.5);
});

test('the draw is seeded by scope, skips withheld jobs and the next field, and favours jobs not done lately', () => {
  const seed = jobSeed('weak', 'scenario-02');
  assert.deepEqual(drawJobs(BOARD, 'commission', seed).map((j) => j.id), drawJobs(BOARD, 'commission', seed).map((j) => j.id), 'the same game, the same order');
  assert.ok(drawJobs(BOARD, 'commission', seed).every((j) => j.scope === 'commission'));
  const board = BOARD.map((j) => (j.id === 12 ? { ...j, withheld: true } : j));
  for (let s = 0; s < 50; s++) {
    const drawn = drawJobs(board, 'commission', s, { barredPoints: [13] });
    assert.deepEqual(drawn.map((j) => j.id), [11], 'withheld 12, a game set at 13');
  }
  assert.deepEqual(drawJobs(BOARD, 'errand', seed, { lastTaken: { 1: 3, 2: 2 } })[0].id, 3, 'the errand not done lately first');
});

test('a board with no open job of the scope asked for lends the nearest; a bare board pays nothing', () => {
  const noUndertakings = BOARD.filter((j) => j.scope !== 'undertaking');
  const r = reckon(weak(), [strong()], noUndertakings, 4);
  assert.equal(r.scope, 'undertaking');
  assert.equal(r.payout!.jobs[0].job.scope, 'commission', 'the nearest, smaller first');
  assert.equal(r.payout!.jobs[0].owed, true, 'and still paid as the gap asks');
  assert.equal(drawSlot(BOARD.filter((j) => j.scope === 'undertaking'), 'errand', 4)!.job.scope, 'undertaking', 'an errand board empty: the next scope up');
  assert.equal(reckon(strong(), [weak()], [], 4).payout, null, 'a bare board pays nothing');
});

test('the notices of each scope are numbered, on a D6 up to six of them and a D66 past that, withheld ones keeping their number', () => {
  const n = numberBoard(BOARD);
  assert.deepEqual([n.get(1), n.get(2), n.get(3)], [1, 2, 3], 'errands on a D6');
  assert.deepEqual([n.get(11), n.get(21)], [1, 1], 'each scope numbered on its own');
  const many = Array.from({ length: 40 }, (_, i) => job(i + 100, 'errand', { sort: 40 - i, withheld: i === 39 }));
  const m = numberBoard(many);
  assert.equal(dieFor(many, 'errand'), 'D66');
  assert.equal(m.get(139), 11, 'the first by sort, withheld or not');
  assert.equal(m.get(134), 16);
  assert.equal(m.get(133), 21);
  assert.equal(m.get(104), 66, 'the 36th');
  assert.equal(m.get(103), undefined, 'the 37th has no number');
  assert.equal(dieFor(BOARD, 'undertaking'), 'D6');
  assert.ok(isNoticeRoll('D6', 6) && !isNoticeRoll('D6', 11) && isNoticeRoll('D66', 34) && !isNoticeRoll('D66', 7));
  assert.ok(isD66(11) && isD66(66) && !isD66(17) && !isD66(70) && isD6(1) && !isD6(7));
});

test('the table may roll for the notice; a number it may not have is refused, and the post draws instead', () => {
  const board = BOARD.map((j) => (j.id === 22 ? { ...j, withheld: true } : j));
  const hand = drawSlot(board, 'undertaking', 5, { pick: 1 })!;
  assert.deepEqual([hand.job.id, hand.byHand, hand.die], [21, true, 'D6']);
  const withheld = drawSlot(board, 'undertaking', 5, { pick: 2 })!;
  assert.match(withheld.refused!, /withheld/);
  assert.equal(withheld.byHand, false);
  assert.notEqual(withheld.job.id, 22);
  assert.match(drawSlot(board, 'undertaking', 5, { pick: 1, barredPoints: [21] })!.refused!, /game is set/);
  assert.match(drawSlot(board, 'undertaking', 5, { pick: 5 })!.refused!, /No notice/);
  assert.match(drawSlot(board, 'undertaking', 5, { pick: 11 })!.refused!, /Not a roll of D6/);
  const viaReckon = reckon(weak(), [strong()], board, 5, { picks: [3] }).payout!.jobs[0];
  assert.deepEqual([viaReckon.job.id, viaReckon.slot?.byHand], [23, true], 'the table’s pick reaches the pay');
});
