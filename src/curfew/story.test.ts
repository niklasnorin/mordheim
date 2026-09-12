import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshState, giveOrders, reconcile } from './ledger.ts';
import { memberNights, warbandStandings } from './story.ts';

const warband = {
  id: 'nordost', name: 'The Nordost Kin',
  members: [{ id: 'agnar', name: 'Agnar Nordost', role: 'Elder' }, { id: 'skalle', name: 'Skalle', role: 'Priest of Taal' }, { id: 'torgrim', name: 'Torgrim Nordost', role: 'Jaeger' }],
};

test('a member\'s nights are gathered newest first, with what they brought back; the warband gets its standing', () => {
  const s = freshState(warband, 1);
  giveOrders(s, warband, 1, [{ memberId: 'torgrim', errand: 'scavenge' }, { memberId: 'agnar', errand: 'carouse' }]);
  giveOrders(s, warband, 3, [{ memberId: 'torgrim', errand: 'scavenge' }]);
  reconcile(s, warband, 5, []);
  const nights = memberNights([{ warband, state: s }]);
  const torgrim = nights.torgrim;
  assert.ok(torgrim.entries.length >= 2);
  assert.deepEqual(torgrim.entries.map((e) => e.night), torgrim.entries.map((e) => e.night).slice().sort((a, b) => b - a), 'newest first');
  assert.equal(torgrim.entries[0].errandLabel, 'Scavenge');
  assert.ok(torgrim.entries.every((e) => e.prose.length > 10 && e.warbandId === 'nordost'));
  assert.equal(torgrim.nightsOut, torgrim.entries.length);
  assert.equal(nights.skalle?.entries.length ?? 0, nights.skalle?.nightsOut ?? 0);
  const standing = warbandStandings([{ warband, state: s }]).nordost;
  assert.equal(standing.nights, 4);
  assert.ok(standing.nightsOut >= 2);
  assert.equal(standing.title, 'Newcomers');
  assert.deepEqual(memberNights([]), {});
});

test('a road taken shows in the warrior\'s story as the choice, and the marks are gathered', () => {
  const s = freshState(warband, 1);
  giveOrders(s, warband, 1, [{ memberId: 'torgrim', errand: 'scavenge' }]);
  reconcile(s, warband, 2, []);
  const night = s.nights[0];
  night.crossroads = { id: 'x', memberId: 'torgrim', kind: 'moral', setup: 'A hand in the rubble.', options: [{ id: 'a', label: 'Take the rings.' }], decided: { roadId: 'a', label: 'Take the rings.', outcome: 'Three rings.', ledger: ['+1 shard'], defaulted: true, on: 2 } };
  s.marks.torgrim = [{ id: 'took-the-rings', name: 'took the rings off a warm hand', night: 1 }];
  const nights = memberNights([{ warband, state: s }]);
  assert.deepEqual(nights.torgrim.entries[0].choice, { setup: 'A hand in the rubble.', label: 'Take the rings.', outcome: 'Three rings.', defaulted: true });
  assert.deepEqual(nights.torgrim.marks.map((m) => m.name), ['took the rings off a warm hand']);
  assert.deepEqual(nights.agnar?.marks ?? [], []);
});
