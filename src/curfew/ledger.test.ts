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

// ───────────────────────── where the campaign is ─────────────────────────

import { locationById } from './engine.ts';
import { recentLines } from './ledger.ts';

const village = locationById('fussenbach');

test('the place refuses errands it has none of, and standing orders go where it sends them', () => {
  const s = freshState(warband, 10);
  assert.throws(() => giveOrders(s, warband, 10, [{ memberId: 'torgrim', errand: 'train' }], [], village), (e: unknown) => e instanceof LedgerError && /Pit/.test(e.message));
  assert.throws(() => giveOrders(s, warband, 10, [{ memberId: 'torgrim', errand: 'dredge' }], []), (e: unknown) => e instanceof LedgerError && /basins/.test(e.message));
  giveOrders(s, warband, 10, [{ memberId: 'torgrim', errand: 'dredge' }, { memberId: 'skalle', errand: 'pray' }], [], village);
  assert.deepEqual(s.orders[10].map((o) => o.errand), ['dredge', 'pray']);
  // before any selection the roles decide, among what the place offers
  assert.deepEqual(standingOrders(freshState(warband, 10), warband, [], 10, village).map((o) => o.errand), ['trade', 'pray']);
  // a selection made in the city runs on in the village, translated
  const t = freshState(warband, 10);
  giveOrders(t, warband, 10, [{ memberId: 'torgrim', errand: 'scavenge' }, { memberId: 'agnar', errand: 'train' }]);
  assert.deepEqual(standingOrders(t, warband, [], 12, village).map((o) => [o.memberId, o.errand]), [['torgrim', 'dredge'], ['agnar', 'carouse']]);
  assert.deepEqual(standingOrders(t, warband, [], 12).map((o) => o.errand), ['scavenge', 'train']);
});

test('a move takes effect from its night: earlier nights stay in the city, the first night away is news', () => {
  const s = freshState(warband, 10);
  giveOrders(s, warband, 10, [{ memberId: 'torgrim', errand: 'scavenge' }]);
  giveOrders(s, warband, 12, [{ memberId: 'torgrim', errand: 'scavenge' }, { memberId: 'agnar', errand: 'train' }]);
  const moves = [{ locationId: 'fussenbach', fromNight: 12 }];
  const written = reconcile(s, warband, 14, [], undefined, moves);
  assert.equal(written.length, 4);
  assert.equal(written[0].locationId, 'mordheim');
  assert.equal(written[1].locationId, 'mordheim');
  assert.equal(written[2].locationId, 'fussenbach');
  assert.deepEqual(written[2].results.map((r) => r.errand).sort(), ['carouse', 'dredge'], 'orders given before the move go where the village sends them');
  assert.ok(written[2].results.every((r) => !r.standing), 'and still count as given in full');
  assert.equal(written[3].locationId, 'fussenbach');
  const arrivals = s.headlines.filter((h) => /Cracked Flagon/.test(h.text));
  assert.equal(arrivals.length, 1);
  assert.equal(arrivals[0].night, 12);
  assert.match(arrivals[0].text, /^The Nordost Kin came up the Fussen/);
  // and back again
  reconcile(s, warband, 16, [], undefined, [...moves, { locationId: 'mordheim', fromNight: 15 }]);
  assert.equal(s.nights.at(-1)!.locationId, 'mordheim');
  assert.ok(s.headlines.some((h) => h.night === 15 && /back inside the walls/.test(h.text)));
  assert.equal(s.headlines.filter((h) => /Cracked Flagon|back inside/.test(h.text)).length, 2, 'one headline per move, not per night');
});

test('the Dawn Report remembers its last ten nights and does not read the same line three times in a month', () => {
  const s = freshState(warband, 1);
  const E = village.errands;
  for (let n = 1; n <= 30; n += 2) giveOrders(s, warband, n, [{ memberId: 'torgrim', errand: E[n % E.length] }, { memberId: 'agnar', errand: E[(n + 2) % E.length] }], [], village);
  reconcile(s, warband, 31, [], undefined, [{ locationId: 'fussenbach', fromNight: 1 }]);
  const counts = new Map<string, number>();
  for (const n of s.nights) for (const r of n.results) { assert.ok(r.line, 'every result says which line it came from'); counts.set(r.line!, (counts.get(r.line!) ?? 0) + 1); }
  assert.ok(Math.max(...counts.values()) <= 2, 'no line three times in a month');
  assert.ok(recentLines(s, 31).length > 0 && recentLines(s, 31).every((l) => /^\w+:(boon|fair|poor|standing):\d+$/.test(l)));
  assert.equal(recentLines(s, 100).length, 0, 'old nights are forgotten');
});

test('a ledger opened in the village announces no arrival, and old nights without a place read as Mordheim', () => {
  const s = freshState(warband, 20);
  reconcile(s, warband, 22, [], undefined, [{ locationId: 'fussenbach', fromNight: 5 }]);
  assert.ok(s.headlines.every((h) => !/Fussen/.test(h.text)));
  const old = freshState(warband, 1);
  reconcile(old, warband, 3, []);
  for (const n of old.nights) delete n.locationId; // as a ledger written before the campaign could move
  reconcile(old, warband, 4, [], undefined, [{ locationId: 'fussenbach', fromNight: 3 }]);
  assert.ok(s.nights.every((n) => n.locationId === 'fussenbach'));
  assert.equal(old.headlines.filter((h) => /Fussen/.test(h.text)).length, 1, 'the move out of the city is still noticed');
  assert.equal(provideIfEmpty(freshState(warband, 9), 9, village) !== null, true);
});

// ───────────────────────── the Crossroads ─────────────────────────

import { afflictionsAt, decide, keptMembers, waitingCrossroads } from './ledger.ts';
import { crossroadById, defaultRoad } from './engine.ts';

/** Play nights until one meets a crossroads. Orders are given every night, so it is never on standing orders. */
function playToCrossroads(s: ReturnType<typeof freshState>, from: number, moves: { locationId: string; fromNight: number }[] = []) {
  for (let night = from; night < from + 300; night++) {
    const free = warband.members.filter((m) => !m.dead && !restingMembers(s, night).includes(m.id) && !keptMembers(s, night).includes(m.id)).slice(0, 2);
    const location = locationById(moves.at(-1)?.locationId);
    giveOrders(s, warband, night, free.map((m, i) => ({ memberId: m.id, errand: location.errands[(night + i) % location.errands.length] })), [], location);
    reconcile(s, warband, night + 1, [], undefined, moves);
    const waiting = waitingCrossroads(s);
    if (waiting) return { waiting, today: night + 1 };
  }
  throw new Error('no crossroads in 300 nights');
}

test('a crossroads waits for a decision; the road taken lands on the ledger, the story and the warrior\'s marks', () => {
  const s = freshState(warband, 10);
  const { waiting, today } = playToCrossroads(s, 10);
  assert.equal(waiting.night, today - 1, 'it is last night\'s');
  assert.ok(s.seenCrossroads.includes(waiting.crossroads!.id));
  const c = crossroadById(locationById(waiting.locationId), waiting.crossroads!.id)!;
  const road = c.options.find((o) => !o.default && !o.risk) ?? c.options.find((o) => !o.default)!;
  assert.throws(() => decide(s, warband, waiting.night, 'no-such-road', { on: today }), (e: unknown) => e instanceof LedgerError && /nowhere/.test(e.message));
  assert.throws(() => decide(s, warband, waiting.night - 1, road.id, { on: today }), LedgerError, 'no crossroads waited the night before');
  const before = { favour: s.favour, shards: s.shards, renown: s.renown };
  const taken = decide(s, warband, waiting.night, road.id, { on: today, rival: warband });
  assert.equal(waiting.crossroads!.decided?.roadId, road.id);
  assert.equal(waiting.crossroads!.decided?.defaulted, false);
  assert.equal(waiting.crossroads!.decided?.on, today);
  assert.ok(waiting.crossroads!.decided!.outcome.length > 10);
  assert.equal(s.favour, Math.max(0, Math.min(100, before.favour + taken.favour)));
  assert.equal(s.shards, Math.max(0, before.shards + taken.shards));
  assert.equal(s.renown, Math.max(0, before.renown + taken.renown));
  if (taken.mark) assert.ok(s.marks[waiting.crossroads!.memberId].some((m) => m.id === taken.mark!.id && m.name === taken.mark!.name));
  if (taken.staysHome) assert.ok(keptMembers(s, today).includes(waiting.crossroads!.memberId));
  if (taken.carryTilt) assert.deepEqual(s.carry, { night: today, memberId: waiting.crossroads!.memberId, tilt: taken.carryTilt });
  if (taken.headline) assert.ok(s.headlines.some((h) => h.night === waiting.night && h.text === taken.headline));
  assert.throws(() => decide(s, warband, waiting.night, road.id, { on: today }), (e: unknown) => e instanceof LedgerError && /already|decided/i.test(e.message));
  assert.equal(waitingCrossroads(s), undefined);
  // the next night is written without another crossroads: never two nights running
  giveOrders(s, warband, today, standingOrders(s, warband, [], today).map((o) => ({ memberId: o.memberId, errand: o.errand })));
  reconcile(s, warband, today + 1, []);
  assert.equal(s.nights.at(-1)!.crossroads, undefined);
  assert.equal(s.carry, undefined, 'what was carried into tonight is spent');
});

test('a crossroads nobody decides is decided by the character at the next midnight, along the default road', () => {
  const s = freshState(warband, 10);
  const { waiting, today } = playToCrossroads(s, 10);
  const c = crossroadById(locationById(waiting.locationId), waiting.crossroads!.id)!;
  reconcile(s, warband, today + 1, []);
  assert.equal(waiting.crossroads!.decided?.roadId, defaultRoad(c, warband.id, waiting.night).id);
  assert.equal(waiting.crossroads!.decided?.defaulted, true);
  assert.equal(waiting.crossroads!.decided?.on, today);
  assert.ok(waiting.crossroads!.decided!.outcome.length > 10);
  assert.equal(waitingCrossroads(s), undefined);
  // many nights at once: still only the default, still nothing waiting but the very last
  const t = freshState(warband, 10);
  const far = playToCrossroads(t, 10);
  reconcile(t, warband, far.today + 9, []);
  assert.equal(t.nights.filter((n) => n.crossroads && !n.crossroads.decided).length <= 1, true);
  assert.ok(far.waiting.crossroads!.decided?.defaulted);
});

test('a version 1 ledger is kept whole and gains the Crossroads\' fields', () => {
  const s = freshState(warband, 10);
  giveOrders(s, warband, 10, [{ memberId: 'torgrim', errand: 'scavenge' }]);
  reconcile(s, warband, 11, []);
  const raw = JSON.parse(JSON.stringify(s)) as Record<string, unknown>;
  raw.version = 1; delete raw.marks; delete raw.afflictions; delete raw.kept; delete raw.seenCrossroads;
  const back = coerceState(raw, warband, 11);
  assert.equal(back.version, 2);
  assert.equal(back.nights.length, 1);
  assert.deepEqual(back.marks, {});
  assert.deepEqual(back.seenCrossroads, []);
  assert.equal(coerceState({ ...raw, version: 3 }, warband, 11).nights.length, 0, 'a version from the future starts afresh');
});

test('a member kept home is refused tonight and free again after; a curse stands its nights and fades', () => {
  const s = freshState(warband, 10);
  s.kept.push({ memberId: 'agnar', fromNight: 10, nights: 1, reason: 'Hungover' });
  s.afflictions.push({ memberId: 'agnar', curseId: 'hungover', fromNight: 10, nights: 1 }, { memberId: 'torgrim', curseId: 'wyrdstone-cough', fromNight: 10, nights: 3 });
  assert.throws(() => giveOrders(s, warband, 10, [{ memberId: 'agnar', errand: 'trade' }]), (e: unknown) => e instanceof LedgerError && /cannot go out/.test(e.message));
  assert.deepEqual(standingOrders(s, warband, [], 10).map((o) => o.memberId), ['skalle', 'torgrim'], 'standing orders skip the kept');
  assert.deepEqual(afflictionsAt(s, 10).map((a) => a.curseId), ['hungover', 'wyrdstone-cough']);
  reconcile(s, warband, 11, []);
  assert.deepEqual(keptMembers(s, 11), []);
  assert.deepEqual(afflictionsAt(s, 11).map((a) => a.curseId), ['wyrdstone-cough']);
  giveOrders(s, warband, 11, [{ memberId: 'agnar', errand: 'trade' }]);
  reconcile(s, warband, 13, []);
  assert.deepEqual(s.afflictions.map((a) => a.curseId), [], 'faded');
});
