import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { CAMPAIGN } from './engine.ts';
import { freshState, giveOrders, loadState, reconcile, saveState, settleOffer, standingOrders, recoveringMembers, allHeadlines } from './state.ts';

const store = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
};

const warband = {
  id: 'nordost', name: 'The Nordost Kin',
  members: [
    { id: 'agnar', name: 'Agnar Nordost', role: 'Elder' }, { id: 'skalle', name: 'Skalle', role: 'Priest of Taal' },
    { id: 'torgrim', name: 'Torgrim Nordost', role: 'Jaeger' }, { id: 'rudi', name: 'Rudi', role: 'Youngblood', dead: true },
  ],
};

beforeEach(() => store.clear());

test('a fresh state has no backlog and sensible standing orders', () => {
  const s = freshState(warband, 10);
  assert.equal(s.lastResolved, 9);
  assert.deepEqual(s.standing.members, ['agnar', 'skalle']);
  assert.equal(s.standing.errands.skalle, 'pray');
  assert.equal(reconcile(s, warband, 10, []).length, 0);
});

test('orders given at dusk are resolved once the date turns, and only then', () => {
  const s = freshState(warband, 10);
  giveOrders(s, 10, [{ memberId: 'torgrim', errand: 'scavenge' }, { memberId: 'skalle', errand: 'pray' }]);
  assert.equal(reconcile(s, warband, 10, []).length, 0, 'nothing before midnight');
  const written = reconcile(s, warband, 11, []);
  assert.equal(written.length, 1);
  assert.equal(written[0].night, 10);
  assert.equal(written[0].results.length, 2);
  assert.ok(s.favour > 0);
  assert.equal(s.lastResolved, 10);
  assert.equal(reconcile(s, warband, 11, []).length, 0, 'idempotent');
  const reloaded = loadState(warband, 11);
  assert.equal(reloaded.nights.length, 1, 'persisted');
});

test('missed nights within the threshold run on standing orders at half yield', () => {
  const s = freshState(warband, 10);
  const written = reconcile(s, warband, 14, []);
  assert.equal(written.length, 4);
  for (const n of written) for (const r of n.results) { assert.ok(r.standing); assert.ok(r.favour <= 4); assert.equal(r.token, undefined); }
});

test('a long absence collapses into a single Return with favour primed to 20', () => {
  const s = freshState(warband, 10);
  const written = reconcile(s, warband, 10 + CAMPAIGN.returnAfterNights + 5, []);
  assert.equal(written.length, 1);
  assert.match(written[0].header, /return/);
  assert.equal(s.favour, 20);
  assert.equal(s.lastResolved, 10 + CAMPAIGN.returnAfterNights + 4);
});

test('recovering members are skipped by standing orders until healed', () => {
  const s = freshState(warband, 10);
  assert.deepEqual(recoveringMembers(s, ['skalle']), ['skalle']);
  assert.deepEqual(standingOrders(s, warband, ['skalle']).map((o) => o.memberId), ['agnar']);
  s.healed.push('skalle');
  assert.deepEqual(recoveringMembers(s, ['skalle']), []);
  assert.equal(standingOrders(s, warband, recoveringMembers(s, ['skalle'])).length, 2);
});

test('surplus tokens wait as offers and settle either way', () => {
  const s = freshState(warband, 10);
  s.hand = [{ id: 'lucky-bone', earnedNight: 1 }];
  s.offers = [{ night: 10, incoming: 'sigmars-nod', held: 'lucky-bone' }];
  settleOffer(s, s.offers[0], 'held');
  assert.deepEqual(s.hand.map((h) => h.id), ['lucky-bone']);
  assert.equal(s.offers.length, 0);
  s.offers = [{ night: 11, incoming: 'sigmars-nod', held: 'lucky-bone' }];
  settleOffer(s, s.offers[0], 'incoming');
  assert.deepEqual(s.hand.map((h) => h.id), ['sigmars-nod']);
});

test('epithets arrive after enough entries and become headlines the Town Cryer can read', () => {
  const s = freshState(warband, 10);
  for (let n = 10; n < 10 + CAMPAIGN.epithetAfterEntries; n++) giveOrders(s, n, [{ memberId: 'torgrim', errand: 'scavenge' }]);
  reconcile(s, warband, 10 + CAMPAIGN.epithetAfterEntries, []);
  assert.ok(s.epithets.torgrim, 'Torgrim has a name now');
  saveState(s);
  const headlines = allHeadlines(['nordost', 'nobody']);
  assert.ok(headlines.some((h) => h.text.includes('Torgrim')));
});
