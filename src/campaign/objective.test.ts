import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkError, checkKey, checksOf, coerceObjective, describeCheck, objectiveOf, objectiveScores, objectiveSummary, slotsFor, type Objective } from './objective.ts';
import type { ScenarioEvent } from './model.ts';

const relic: Objective = { name: 'The relic', kind: 'one', count: 1, when: 'round-end' };
const markers: Objective = { name: 'Objective markers', kind: 'many', count: 4, when: 'turn-end' };
const attending = ['kin', 'brow'];
const names: Record<string, string> = { kin: 'The Kin', brow: 'Bitterbrow' };
const nameOf = (id: string) => names[id] ?? id;
let id = 0;
const control = (turn: number, key: string, warbandId: string, points: number): ScenarioEvent => ({ id: ++id, scenarioId: 's', turn, kind: 'control', warbandId, points, text: key, authorName: 'Ana', createdAt: new Date() });

test('a stored objective reads back as one, and an empty name means there is none', () => {
  assert.deepEqual(coerceObjective({ name: ' The relic ', kind: 'one', count: 7, when: 'round-end' }), relic, 'one of it is always one');
  assert.deepEqual(coerceObjective({ name: 'Doors', kind: 'many', count: 99, when: 'turn-start' }), { name: 'Doors', kind: 'many', count: 20, when: 'turn-start' });
  assert.equal(coerceObjective({ name: '  ', kind: 'one', when: 'round-end' }), null);
  assert.equal(coerceObjective(null), null);
  assert.equal(objectiveOf({ objective: relic, rulebookScenario: 'The Supply Cart' }), null, 'a campaign scenario keeps its own rules');
  assert.deepEqual(objectiveOf({ objective: relic, rulebookScenario: null }), relic);
});

test('a round asks for one check; a warband’s own turn, one for each warband in the order they attend', () => {
  assert.deepEqual(slotsFor(relic, attending, 3), [{ turn: 3, key: 'round-end', when: 'round-end', whose: null }]);
  assert.deepEqual(slotsFor(markers, attending, 2).map((s) => [s.key, s.whose]), [['turn-end:kin', 'kin'], ['turn-end:brow', 'brow']]);
});

test('only one warband holds the one thing, and nobody holds more than there is', () => {
  assert.equal(checkError(relic, { kin: 1, brow: 0 }, attending, null), null);
  assert.equal(checkError(relic, { kin: 0, brow: 0 }, attending, null), null, 'nobody may hold it');
  assert.match(checkError(relic, { kin: 1, brow: 1 }, attending, null)!, /Only one warband holds the relic/);
  assert.match(checkError(relic, { kin: 2 }, attending, null)!, /only one of the relic/);
  assert.match(checkError(relic, { grey: 1 }, attending, null)!, /not at this scenario/);
  const round = { ...markers, when: 'round-start' as const };
  assert.equal(checkError(round, { kin: 3, brow: 1 }, attending, null), null);
  assert.match(checkError(round, { kin: 3, brow: 2 }, attending, null)!, /only 4 of objective markers between them/);
});

test('at a warband’s own turn only that warband is counted', () => {
  assert.equal(checkError(markers, { kin: 3 }, attending, 'kin'), null);
  assert.match(checkError(markers, { kin: 3 }, attending, null)!, /whose turn/);
  assert.match(checkError(markers, { brow: 1 }, attending, 'kin')!, /Only the warband whose turn it is/);
  assert.match(checkError(markers, { kin: 5 }, attending, 'kin')!, /only 4/);
});

test('the checks come back from the log whole, one to a line', () => {
  const events = [control(1, 'round-end', 'kin', 1), control(1, 'round-end', 'brow', 0), control(2, 'round-end', 'kin', 0), control(2, 'round-end', 'brow', 0)];
  const checks = checksOf([...events, { ...events[0], id: ++id, kind: 'note', text: 'A note' }]);
  assert.equal(checks.length, 2);
  assert.deepEqual(checks[0].held, { kin: 1, brow: 0 });
  assert.equal(checks[0].ids.length, 2);
  assert.deepEqual(describeCheck(relic, checks[0], nameOf), { lead: 'End of the round: the relic ', strong: 'held by The Kin', rest: '' });
  assert.equal(describeCheck(relic, checks[1], nameOf).strong, 'held by nobody');
  assert.deepEqual(objectiveScores({ warbands: [{ warbandId: 'kin' }, { warbandId: 'brow' }] as never, events }), [{ warbandId: 'kin', points: 1 }, { warbandId: 'brow', points: 0 }]);
});

test('several things score a point each, check by check, and the log says how many', () => {
  const events = [control(1, checkKey('turn-end', 'kin'), 'kin', 2), control(1, checkKey('turn-end', 'brow'), 'brow', 1), control(2, checkKey('turn-end', 'kin'), 'kin', 3)];
  const checks = checksOf(events);
  assert.deepEqual(checks.map((c) => [c.turn, c.whose]), [[1, 'kin'], [1, 'brow'], [2, 'kin']]);
  assert.deepEqual(describeCheck(markers, checks[0], nameOf), { lead: 'End of The Kin’s turn: objective markers, ', strong: '2 held', rest: '' });
  assert.deepEqual(objectiveScores({ warbands: [{ warbandId: 'kin' }, { warbandId: 'brow' }] as never, events }).map((s) => s.points), [5, 1]);
  assert.equal(objectiveSummary(markers), '4 of them. A warband scores a point for each it holds at the end of its own turn.');
  assert.equal(objectiveSummary(relic), 'One of it. Whoever holds it at the end of each round scores a point.');
});
