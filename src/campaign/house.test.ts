import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SUPPLY_CART, houseScenario, resultsOf, turnEnds, verdictOf } from './house.ts';
import type { ScenarioEvent } from './model.ts';

const warbands = [{ warbandId: 'raiders', side: 'attacker' as const }, { warbandId: 'caravan', side: 'defender' as const }];
let id = 0;
const hold = (turn: number, warbandId: string | null): ScenarioEvent => ({ id: ++id, scenarioId: 's', turn, kind: 'hold', warbandId, points: 0, text: '', authorName: '', createdAt: new Date() });
const roll = (turn: number, die: number): ScenarioEvent => ({ id: ++id, scenarioId: 's', turn, kind: 'roll', warbandId: null, points: die, text: '', authorName: '', createdAt: new Date() });
const game = (events: ScenarioEvent[], turnLimit: number | null = 7) => ({ events, turnLimit, warbands });

test('the supply cart is known by its name, however it is written', () => {
  assert.equal(houseScenario('the supply cart '), SUPPLY_CART);
  assert.equal(houseScenario('Skirmish'), undefined);
  assert.equal(houseScenario(null), undefined);
});

test('a turn’s end keeps who held the cart and the die, and a second telling replaces the first', () => {
  assert.deepEqual(turnEnds([hold(1, 'raiders'), roll(1, 3), hold(2, null), hold(1, 'caravan')]), [{ turn: 1, held: 'caravan', roll: 3 }, { turn: 2, held: null }]);
});

test('the attackers win outright on the fifth round running they hold the cart', () => {
  const four = verdictOf(SUPPLY_CART, game([1, 2, 3, 4].map((t) => hold(t, 'raiders'))));
  assert.equal(four.over, false);
  assert.equal(four.run, 4);
  const five = verdictOf(SUPPLY_CART, game([1, 2, 3, 4, 5].map((t) => hold(t, 'raiders'))));
  assert.equal(five.over, true);
  assert.equal(five.winner, 'attacker');
  assert.match(five.reason, /five rounds running/);
  assert.deepEqual(resultsOf(five, warbands), { raiders: 'victory', caravan: 'defeat' });
});

test('a break in the run starts it again, and a contested round is a break', () => {
  const v = verdictOf(SUPPLY_CART, game([hold(1, 'raiders'), hold(2, 'raiders'), hold(3, null), hold(4, 'raiders'), hold(5, 'raiders')]));
  assert.equal(v.run, 2);
  assert.equal(v.best, 2);
  assert.equal(v.over, false);
});

test('at the end of the last round the cart goes to whoever holds it, and to nobody the table calls it', () => {
  const rounds = (last: string | null) => [1, 2, 3, 4, 5, 6].map((t) => hold(t, t % 2 ? 'caravan' : 'raiders')).concat(hold(7, last));
  assert.equal(verdictOf(SUPPLY_CART, game(rounds('caravan'))).winner, 'defender');
  assert.equal(verdictOf(SUPPLY_CART, game(rounds('raiders'))).winner, 'attacker');
  const nobody = verdictOf(SUPPLY_CART, game(rounds(null)));
  assert.equal(nobody.over, true);
  assert.equal(nobody.winner, null);
  assert.deepEqual(resultsOf(nobody, warbands), {});
});

test('another round, time permitting, moves the end', () => {
  const seven = [1, 2, 3, 4, 5, 6, 7].map((t) => hold(t, t % 2 ? 'caravan' : 'raiders'));
  assert.equal(verdictOf(SUPPLY_CART, game(seven, 8)).over, false);
  assert.equal(verdictOf(SUPPLY_CART, game([...seven, hold(8, 'raiders')], 8)).winner, 'attacker');
});
