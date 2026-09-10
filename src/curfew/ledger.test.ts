import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CAMPAIGN } from './engine.ts';
import { freshState, giveOrders, reconcile, settleOffer, standingOrders, recoveringMembers, normalizeOffers, lastGivenOrders, restingMembers, coerceState, layTable, fightDone, putBack, provideIfEmpty, LedgerError, heal } from './ledger.ts';

const warband = {
  id: 'nordost', name: 'The Nordost Kin',
  members: [
    { id: 'agnar', name: 'Agnar Nordost', role: 'Elder' }, { id: 'skalle', name: 'Skalle', role: 'Priest of Taal' },
    { id: 'torgrim', name: 'Torgrim Nordost', role: 'Jaeger' }, { id: 'rudi', name: 'Rudi', role: 'Youngblood', dead: true },
  ],
};

test('a fresh state has no backlog, and standing orders default from the roster until a selection is made', () => {
  const s = freshState(warband, 10);
  assert.equal(s.lastResolved, 9);
  assert.deepEqual(standingOrders(s, warband, []).map((o) => [o.memberId, o.errand]), [['agnar', 'trade'], ['skalle', 'pray']]);
  assert.equal(reconcile(s, warband, 10, []).length, 0);
});

test('the last selection becomes the standing orders, run at half yield on nights without a change', () => {
  const s = freshState(warband, 10);
  giveOrders(s, warband, 10, [{ memberId: 'torgrim', errand: 'scavenge' }, { memberId: 'agnar', errand: 'carouse' }]);
  assert.deepEqual(lastGivenOrders(s, 11)?.night, 10);
  assert.equal(lastGivenOrders(s, 10), null, 'only earlier nights count');
  const written = reconcile(s, warband, 14, []);
  assert.equal(written.length, 4);
  assert.ok(written[0].results.every((r) => !r.standing), 'night 10 was given in full');
  assert.equal(written[1].results.length, 0, 'night 11: the same two rest, nobody else stands in');
  assert.deepEqual(written[2].results.map((r) => r.memberId).sort(), ['agnar', 'torgrim'], 'night 12: the standing orders run again');
  assert.ok(written[2].results.every((r) => r.standing && r.favour <= 4));
  assert.equal(written[3].results.length, 0);
});

test('nobody goes out two nights running, on given orders or standing ones', () => {
  const s = freshState(warband, 10);
  giveOrders(s, warband, 10, [{ memberId: 'torgrim', errand: 'scavenge' }, { memberId: 'agnar', errand: 'carouse' }]);
  giveOrders(s, warband, 11, [{ memberId: 'torgrim', errand: 'scavenge' }, { memberId: 'skalle', errand: 'pray' }]);
  const written = reconcile(s, warband, 12, []);
  assert.deepEqual(restingMembers(s, 11).sort(), ['agnar', 'torgrim']);
  assert.deepEqual(written[1].results.map((r) => r.memberId), ['skalle'], 'Torgrim went out on night 10, so night 11 sends only Skalle');
  assert.deepEqual(restingMembers(s, 12), ['skalle']);
  assert.deepEqual(standingOrders(s, warband, [], 12).map((o) => o.memberId), ['torgrim'], 'standing orders skip whoever rests');
  assert.deepEqual(restingMembers(s, 10), [], 'nothing before the first dawn');
});

test('orders are checked: the dead, the resting and strangers are refused, and so is a third member', () => {
  const s = freshState(warband, 10);
  assert.throws(() => giveOrders(s, warband, 10, [{ memberId: 'rudi', errand: 'pray' }]), LedgerError);
  assert.throws(() => giveOrders(s, warband, 10, [{ memberId: 'nobody', errand: 'pray' }]), LedgerError);
  assert.throws(() => giveOrders(s, warband, 10, [{ memberId: 'agnar', errand: 'pray' }, { memberId: 'skalle', errand: 'pray' }, { memberId: 'torgrim', errand: 'pray' }]), LedgerError);
  assert.throws(() => giveOrders(s, warband, 0, [{ memberId: 'agnar', errand: 'pray' }]), LedgerError, 'nothing before night 1');
  giveOrders(s, warband, 10, [{ memberId: 'agnar', errand: 'trade' }]);
  reconcile(s, warband, 11, []);
  assert.throws(() => giveOrders(s, warband, 11, [{ memberId: 'agnar', errand: 'trade' }]), LedgerError, 'Agnar rests');
  assert.throws(() => giveOrders(s, warband, 11, [{ memberId: 'skalle', errand: 'pray' }], ['skalle']), LedgerError, 'Skalle is recovering');
  heal(s, warband, 'skalle');
  giveOrders(s, warband, 11, [{ memberId: 'skalle', errand: 'pray' }], recoveringMembers(s, ['skalle']));
  assert.equal(s.orders[11].length, 1);
});

test('orders given at dusk are resolved once the date turns, and only then', () => {
  const s = freshState(warband, 10);
  giveOrders(s, warband, 10, [{ memberId: 'torgrim', errand: 'scavenge' }, { memberId: 'skalle', errand: 'pray' }]);
  assert.equal(reconcile(s, warband, 10, []).length, 0, 'nothing before midnight');
  const written = reconcile(s, warband, 11, []);
  assert.equal(written.length, 1);
  assert.equal(written[0].night, 10);
  assert.equal(written[0].results.length, 2);
  assert.ok(s.favour > 0);
  assert.equal(s.lastResolved, 10);
  assert.equal(reconcile(s, warband, 11, []).length, 0, 'idempotent');
});

test('a stored ledger round-trips through JSON; anything else starts afresh', () => {
  const s = freshState(warband, 10);
  giveOrders(s, warband, 10, [{ memberId: 'torgrim', errand: 'scavenge' }]);
  reconcile(s, warband, 11, []);
  const back = coerceState(JSON.parse(JSON.stringify(s)), warband, 11);
  assert.deepEqual(JSON.parse(JSON.stringify(back)), JSON.parse(JSON.stringify(s)));
  assert.equal(coerceState(null, warband, 11).nights.length, 0);
  assert.equal(coerceState({ version: 1, warbandId: 'someone-else', nights: [] }, warband, 11).warbandId, 'nordost');
});

test('missed nights within the threshold run on standing orders at half yield', () => {
  const s = freshState(warband, 10);
  const written = reconcile(s, warband, 14, []);
  assert.equal(written.length, 4);
  for (const n of written) for (const r of n.results) { assert.ok(r.standing); assert.ok(r.favour <= 4); assert.equal(r.token, undefined); }
  assert.deepEqual(written.map((n) => n.results.map((r) => r.memberId).sort()), [['agnar', 'skalle'], ['torgrim'], ['agnar', 'skalle'], ['torgrim']], 'the roster defaults take turns: whoever went out rests');
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
  assert.deepEqual(standingOrders(s, warband, ['skalle']).map((o) => o.memberId), ['agnar', 'torgrim'], 'defaults skip the recovering');
  giveOrders(s, warband, 10, [{ memberId: 'skalle', errand: 'pray' }, { memberId: 'agnar', errand: 'trade' }]);
  assert.deepEqual(standingOrders(s, warband, ['skalle'], 11).map((o) => o.memberId), ['agnar'], 'a recovering member drops out of the standing orders');
  s.healed.push('skalle');
  assert.deepEqual(recoveringMembers(s, ['skalle']), []);
  assert.equal(standingOrders(s, warband, recoveringMembers(s, ['skalle']), 11).length, 2);
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
  assert.throws(() => settleOffer(s, { night: 11, incoming: 'sigmars-nod', held: 'lucky-bone' }, 'incoming'), LedgerError, 'settling twice is refused');
});

test('epithets arrive after enough entries and become headlines for the Town Cryer', () => {
  const s = freshState(warband, 10);
  // Torgrim rests every other night, so five entries take ten nights
  for (let n = 10; n < 10 + 2 * CAMPAIGN.epithetAfterEntries; n += 2) giveOrders(s, warband, n, [{ memberId: 'torgrim', errand: 'scavenge' }]);
  reconcile(s, warband, 10 + 2 * CAMPAIGN.epithetAfterEntries, []);
  assert.equal(s.nights.filter((n) => n.results.length).length, CAMPAIGN.epithetAfterEntries, 'the nights he rested wrote no entry for him');
  assert.ok(s.epithets.torgrim, 'Torgrim has a name now');
  assert.ok(s.headlines.some((h) => h.text.includes('Torgrim')));
});

test('offers collapse to one decision per type, newest first, and never offer a charm against itself', () => {
  const s = freshState(warband, 10);
  s.hand = [{ id: 'lucky-bone', earnedNight: 1 }];
  s.offers = [
    { night: 11, incoming: 'sigmars-nod', held: 'lucky-bone' },
    { night: 12, incoming: 'lucky-bone', held: 'lucky-bone' },
    { night: 13, incoming: 'steady-hand', held: 'lucky-bone' },
    { night: 13, incoming: 'whisper', held: 'lucky-bone' },
  ];
  normalizeOffers(s);
  assert.deepEqual(s.offers, [{ night: 13, incoming: 'steady-hand', held: 'lucky-bone' }], 'one Fortune decision, the newest');
  assert.deepEqual(s.hand.map((h) => h.id).sort(), ['lucky-bone', 'whisper'], 'a Sight charm had room and simply joined the Hand');
  settleOffer(s, s.offers[0], 'incoming');
  assert.deepEqual(s.hand.map((h) => h.id).sort(), ['steady-hand', 'whisper']);
  assert.equal(s.offers.length, 0);
});

test('an untouched first night still counts: the next night writes a dawn on standing orders', () => {
  const s = freshState(warband, 10);
  assert.equal(reconcile(s, warband, 10, []).length, 0, 'nothing to write on the first night itself');
  const written = reconcile(s, warband, 11, []);
  assert.equal(written.length, 1);
  assert.equal(written[0].night, 10);
  assert.ok(written[0].results.length > 0 && written[0].results.every((r) => r.standing));
});

test('the Eve: the City Provides, the table is laid with a flourish, the fight spends the charms', () => {
  const dead = { ...warband, members: warband.members.map((m) => m.id === 'rudi' ? { ...m, dead: true } : m) };
  const s = freshState(dead, 20);
  s.favour = 30;
  const provided = provideIfEmpty(s, 20);
  assert.ok(provided && s.hand.length === 1, 'an empty Hand is dealt one charm');
  assert.equal(s.provided?.tokenId, provided);
  assert.equal(provideIfEmpty(s, 20), null, 'only when empty');
  assert.throws(() => layTable(s, dead, 20, [provided!], { kind: 'headline', text: '   ' }), LedgerError, 'a flourish needs words');
  assert.throws(() => layTable(s, dead, 20, [provided!], { kind: 'dedication', text: 'Agnar Nordost' }), LedgerError, 'a dedication is for the dead');
  layTable(s, dead, 20, [provided!, 'not-held'], { kind: 'headline', text: 'Nordost Kin Seen Buying Candles by the Crate' });
  assert.equal(s.favour, 30 - CAMPAIGN.flourishCost);
  assert.deepEqual(s.eve?.tokens, [provided]);
  assert.equal(s.eve?.provided, provided, 'the table remembers what the city gave');
  assert.equal(s.provided, undefined);
  assert.match(s.eve!.ticket, /^EVE-1-/);
  assert.ok(s.headlines.some((h) => h.text.includes('Candles')), 'a planted headline is a headline');
  assert.throws(() => layTable(s, dead, 20, []), LedgerError, 'already laid');
  putBack(s);
  assert.equal(s.eve, undefined);
  assert.equal(s.hand.length, 1, 'the charm is back');
  assert.equal(s.favour, 30 - CAMPAIGN.flourishCost, 'spent Favour does not return');
  layTable(s, dead, 20, [provided!]);
  fightDone(s, 20);
  assert.equal(s.hand.length, 0);
  assert.equal(s.fights.length, 1);
  assert.match(s.nights.at(-1)!.header, /the fight/);
  assert.throws(() => fightDone(s, 20), LedgerError);
});
