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
