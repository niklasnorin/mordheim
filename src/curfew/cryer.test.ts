import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveNight, type NightResult } from './engine.ts';
import { dispatchesForNight, happeningFor } from './cryer.ts';

const warband = {
  id: 'nordost', name: 'The Nordost Kin',
  members: [{ id: 'agnar', name: 'Agnar Nordost', role: 'Elder' }, { id: 'skalle', name: 'Skalle', role: 'Priest of Taal' }, { id: 'torgrim', name: 'Torgrim Nordost', role: 'Jaeger' }],
};
const fresh = { favour: 0, shards: 0, renown: 0, hand: [] };
const night = (n: number, standing = false): NightResult => resolveNight({ warband, night: n, orders: [{ memberId: 'agnar', errand: 'carouse', standing }, { memberId: 'torgrim', errand: 'scavenge', standing }], state: fresh });

test('headlines the ledger wrote are always printed, with stable keys', () => {
  const n = night(5);
  const d = dispatchesForNight(warband, n, [{ night: 5, text: 'The Nordost Kin are spoken of in the taverns as Sifters.' }, { night: 4, text: 'older' }]);
  const heads = d.filter((x) => x.kind === 'headline');
  assert.equal(heads.length, 1);
  assert.equal(heads[0].key, 'nordost:5:h0');
  assert.deepEqual(dispatchesForNight(warband, n, []).map((x) => x.key), dispatchesForNight(warband, n, []).map((x) => x.key), 'deterministic');
});

test('a happening is occasional, never from standing orders, and reads the member\'s night', () => {
  let printed = 0;
  for (let n = 1; n <= 60; n++) {
    const h = happeningFor(warband, night(n));
    if (!h) continue;
    printed++;
    assert.equal(h.kind, 'happening');
    assert.equal(h.key, `nordost:${n}:e`);
    assert.doesNotMatch(h.headline, /\{\w+\}/, 'every slot is filled');
    assert.ok(h.body && h.body.length > 20);
  }
  assert.ok(printed > 5 && printed < 55, `printed ${printed} of 60: occasional, not always`);
  for (let n = 1; n <= 20; n++) assert.equal(happeningFor(warband, night(n, true)), null, 'standing orders are too dull for the broadsheet');
});

test('a happening in the village is headlined in the village\'s words, with its own byline', async () => {
  const { locationById } = await import('./engine.ts');
  const { bylineFor } = await import('./cryer.ts');
  const village = locationById('fussenbach');
  let printed = 0;
  for (let n = 1; n <= 60; n++) {
    const res = resolveNight({ warband, night: n, orders: [{ memberId: 'torgrim', errand: 'dredge' }, { memberId: 'agnar', errand: 'carouse' }], state: fresh, location: village });
    const h = happeningFor(warband, res);
    if (!h) continue;
    printed++;
    assert.doesNotMatch(h.headline, /\{\w+\}/);
    assert.doesNotMatch(h.headline, /Henrik|the Pit|Sisters/);
    const templates = Object.values(village.cryer.headlines).flatMap((o) => Object.values(o!).flat());
    const asRegex = (t: string) => new RegExp('^' + t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\{\w+\\\}/g, '.+') + '$');
    assert.ok(templates.some((t) => asRegex(t).test(h.headline)), `${h.headline} is one of the village's headlines`);
  }
  assert.ok(printed > 5, `${printed}`);
  assert.ok(village.cryer.bylines.includes(bylineFor('nordost', 4, village)));
  assert.ok(!village.cryer.bylines.includes(bylineFor('nordost', 4)));
});

test('a night whose crossroads still waits prints no happening; once decided it prints, reading the road taken', () => {
  let checked = 0;
  for (let n = 1; n <= 80 && checked < 3; n++) {
    const plain = night(n);
    const printed = happeningFor(warband, plain);
    if (!printed) continue;
    const member = plain.results.find((r) => printed.body!.startsWith(r.prose))!.memberId;
    const met = { id: 'x', memberId: member, kind: 'moral' as const, setup: 'A door stood open that should not have.', options: [{ id: 'a', label: 'Go in.' }, { id: 'b', label: 'Walk on.' }] };
    assert.equal(happeningFor(warband, { ...plain, crossroads: met }), null, 'undecided: not yet a story');
    assert.deepEqual(dispatchesForNight(warband, { ...plain, crossroads: met }, [{ night: n, text: 'a headline' }]).map((d) => d.kind), ['headline'], 'headlines still print');
    const decided = { ...met, decided: { roadId: 'a', label: 'Go in.', outcome: 'Nobody was inside. Something had been.', ledger: [], defaulted: false, on: n + 1 } };
    const h = happeningFor(warband, { ...plain, crossroads: decided })!;
    assert.ok(h);
    assert.match(h.body!, /A door stood open/);
    assert.match(h.body!, /Nobody was inside/);
    checked++;
  }
  assert.ok(checked > 0);
});
