import { test } from 'node:test';
import assert from 'node:assert/strict';
import { activeWarband, lastOfRound, roundStart, starterChosen, startingWith, stepBack, stepForward, turnOrder } from './turns.ts';

const at = (ids: string[]) => ids.map((warbandId) => ({ warbandId }));
const game = (turn: number, active: string | null, order: string[] = ['b', 'a'], warbands = ['a', 'b']) => ({ turn, active, order, warbands: at(warbands) });

test('the order is as chosen, with any warband not chosen after, and one not at the table left out', () => {
  assert.deepEqual(turnOrder({ order: [], warbands: at(['a', 'b']) }), ['a', 'b']);
  assert.deepEqual(turnOrder({ order: ['b'], warbands: at(['a', 'b']) }), ['b', 'a']);
  assert.deepEqual(turnOrder({ order: ['b', 'gone', 'a'], warbands: at(['a', 'b', 'c']) }), ['b', 'a', 'c']);
  assert.deepEqual(startingWith({ order: [], warbands: at(['a', 'b', 'c']) }, 'c'), ['c', 'a', 'b']);
  assert.throws(() => startingWith({ order: [], warbands: at(['a']) }, 'x'), /not at this scenario/);
  assert.equal(starterChosen({ order: [], warbands: at(['a']) }), false);
  assert.equal(starterChosen({ order: ['gone'], warbands: at(['a']) }), false);
  assert.equal(starterChosen({ order: ['a'], warbands: at(['a']) }), true);
});

test('whose turn it is: nobody before the first, the first of the order when none is on record', () => {
  assert.equal(activeWarband(game(0, null)), null);
  assert.equal(activeWarband(game(1, null)), 'b');
  assert.equal(activeWarband(game(1, 'a')), 'a');
  assert.equal(activeWarband(game(1, 'gone')), 'b', 'a warband no longer at the table is nobody');
  assert.equal(activeWarband({ turn: 1, active: null, order: [], warbands: [] }), null);
});

test('next: the next warband, then a new round with the first again; back: the way it came', () => {
  assert.deepEqual(stepForward(game(1, 'b')), { turn: 1, active: 'a' });
  assert.equal(lastOfRound(game(1, 'b')), false);
  assert.equal(lastOfRound(game(1, 'a')), true);
  assert.deepEqual(stepForward(game(1, 'a')), { turn: 2, active: 'b' }, 'after the last, a new round');
  assert.deepEqual(stepForward(game(0, null)), { turn: 1, active: 'b' }, 'from before the game, the first turn');
  assert.deepEqual(stepBack(game(2, 'b')), { turn: 1, active: 'a' }, 'back from a round’s first is the round before’s last');
  assert.deepEqual(stepBack(game(2, 'a')), { turn: 2, active: 'b' });
  assert.equal(stepBack(game(1, 'b')), null, 'before the first turn is not a turn');
  assert.equal(stepBack(game(0, null)), null);
  // three at the table: round after round, every warband once
  const three = (turn: number, active: string) => game(turn, active, ['c', 'a', 'b'], ['a', 'b', 'c']);
  const seen: string[] = [];
  let s = three(1, 'c');
  for (let i = 0; i < 6; i++) { seen.push(`${s.turn}:${activeWarband(s)}`); const n = stepForward(s); s = three(n.turn, n.active!); }
  assert.deepEqual(seen, ['1:c', '1:a', '1:b', '2:c', '2:a', '2:b']);
});

test('a round starts with its first warband, and before the game with nobody', () => {
  assert.deepEqual(roundStart(game(0, null), 1), { turn: 1, active: 'b' });
  assert.deepEqual(roundStart(game(0, null), 0), { turn: 0, active: null });
  assert.deepEqual(roundStart({ order: [], warbands: [] }, 3), { turn: 3, active: null });
});
