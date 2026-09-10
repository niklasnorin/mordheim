import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  hashSeed, rng, nightForDate, dateForNight, omenForNight, moonForNight, OMENS, MOONS, resolveNight, applyNight,
  quietNight, returnNight, tiltFor, availability, defaultErrand, titleFor, eveTicket, readTicket, cityProvides, epithetFor, CAMPAIGN,
} from './engine.ts';

const warband = {
  id: 'nordost', name: 'The Nordost Kin',
  members: [
    { id: 'agnar', name: 'Agnar Nordost', role: 'Elder' }, { id: 'skalle', name: 'Skalle', role: 'Priest of Taal' },
    { id: 'torgrim', name: 'Torgrim Nordost', role: 'Jaeger' }, { id: 'rudi', name: 'Rudi', role: 'Youngblood', dead: true },
  ],
};
const fresh = { favour: 0, shards: 0, renown: 0, hand: [] };
const ALL = ['scavenge', 'carouse', 'train', 'spy', 'pray', 'trade'] as const;

test('seeded randomness is stable', () => {
  assert.equal(hashSeed('a', 1), hashSeed('a', 1));
  assert.notEqual(hashSeed('a', 1), hashSeed('a', 2));
  assert.notEqual(hashSeed('ab', 'c'), hashSeed('a', 'bc'));
  const a = rng(42), b = rng(42);
  for (let i = 0; i < 5; i++) assert.equal(a(), b());
});

test('calendar: night 1 is the start date and round-trips', () => {
  assert.equal(nightForDate(CAMPAIGN.start), 1);
  assert.equal(dateForNight(1), CAMPAIGN.start);
  assert.equal(nightForDate(dateForNight(40)), 40);
});

test('omens: the same card for everyone, no repeats within a cycle', () => {
  const seen = new Set<string>();
  for (let n = 1; n <= OMENS.length; n++) seen.add(omenForNight(n).id);
  assert.equal(seen.size, OMENS.length);
  assert.equal(omenForNight(7).id, omenForNight(7).id);
});

test('moons: one per week, all of them appear across a cycle', () => {
  assert.equal(moonForNight(1).id, moonForNight(7).id);
  assert.notEqual(moonForNight(7).id, moonForNight(8).id);
  const seen = new Set<string>();
  for (let n = 1; n <= 7 * MOONS.length; n += 7) seen.add(moonForNight(n).id);
  assert.equal(seen.size, MOONS.length);
});

test('tilt clamps and the Silent Moon mutes the Omen', () => {
  const omen = { ...OMENS[0], tilt: { scavenge: 2 } };
  assert.equal(tiltFor('scavenge', omen, { id: 'x', name: '', reading: '', tilt: { scavenge: 2 }, notes: '' }), 3);
  assert.equal(tiltFor('scavenge', omen, { id: 'x', name: '', reading: '', tilt: {}, notes: '', flatOmen: true }), 0);
});

test('a night resolves deterministically and reads as prose with a ledger', () => {
  const orders = [{ memberId: 'torgrim', errand: 'scavenge' as const }, { memberId: 'skalle', errand: 'pray' as const }];
  const a = resolveNight({ warband, night: 3, orders, state: fresh });
  const b = resolveNight({ warband, night: 3, orders, state: fresh });
  assert.deepEqual(a, b);
  assert.equal(a.results.length, 2);
  assert.match(a.header, /^Night 3 — under /);
  for (const res of a.results) {
    assert.ok(res.prose.length > 20);
    assert.doesNotMatch(res.prose, /\{\w+\}/, 'no unfilled slots');
    assert.ok(res.favour >= 1 && res.favour <= 8);
  }
  assert.ok(a.ledger.some((l) => /Favour/.test(l)));
});

test('only membersPerNight orders are honoured', () => {
  const orders = [{ memberId: 'torgrim', errand: 'scavenge' as const }, { memberId: 'skalle', errand: 'pray' as const }, { memberId: 'agnar', errand: 'trade' as const }];
  assert.equal(resolveNight({ warband, night: 5, orders, state: fresh }).results.length, CAMPAIGN.membersPerNight);
});

test('over many nights every outcome, token type and shard drop occurs; standing orders never drop tokens', () => {
  const outcomes = new Set<string>(); const types = new Set<string>(); let shards = 0; let standingTokens = 0;
  for (let n = 1; n <= 400; n++) {
    const orders = [{ memberId: 'torgrim', errand: ALL[n % 6] }, { memberId: 'skalle', errand: 'pray' as const, standing: true }];
    const res = resolveNight({ warband, night: n, orders, state: fresh });
    for (const r of res.results) {
      outcomes.add(r.outcome); if (r.token) types.add(r.token.type); shards += r.shards; if (r.standing && r.token) standingTokens++;
      assert.doesNotMatch(r.prose, /\{\w+\}/);
    }
  }
  assert.deepEqual([...outcomes].sort(), ['boon', 'fair', 'poor']);
  assert.deepEqual([...types].sort(), ['fortune', 'ground', 'market', 'sight']);
  assert.ok(shards > 0);
  assert.equal(standingTokens, 0);
});

test('trade converts five shards into a Market token', () => {
  let found = false;
  for (let n = 1; n <= 60 && !found; n++) {
    const res = resolveNight({ warband, night: n, orders: [{ memberId: 'agnar', errand: 'trade' }], state: { ...fresh, shards: 7 } });
    const r = res.results[0];
    if (r.convertedShards) { found = true; assert.equal(r.token?.type, 'market'); assert.ok(res.ledger.some((l) => l.includes('5 shards to'))); }
  }
  assert.ok(found);
});

test('the Hand holds one token per type and a surplus becomes an offer', () => {
  const held = { favour: 10, shards: 0, renown: 0, hand: [{ id: 'lucky-bone', earnedNight: 1 }] };
  const result = {
    night: 2, omenId: 'x', moonId: 'y', header: '', detail: '', ledger: [],
    results: [{ memberId: 'agnar', errand: 'pray' as const, outcome: 'boon' as const, standing: false, favour: 8, renown: 0, shards: 0, token: { id: 'sigmars-nod', type: 'fortune' as const, name: '', effect: '' }, prose: '' }],
  };
  const { state, offers } = applyNight(held, result);
  assert.equal(state.hand.length, 1);
  assert.equal(state.favour, 18);
  assert.deepEqual(offers, [{ night: 2, incoming: 'sigmars-nod', held: 'lucky-bone' }]);
  const full = { favour: 0, shards: 0, renown: 0, hand: [{ id: 'lucky-bone', earnedNight: 3 }, { id: 'hidden-path', earnedNight: 1 }, { id: 'whisper', earnedNight: 2 }] };
  const fourth = { ...result, results: [{ ...result.results[0], token: { id: 'black-market', type: 'market' as const, name: '', effect: '' } }] };
  const r2 = applyNight(full, fourth);
  assert.equal(r2.state.hand.length, 3);
  assert.deepEqual(r2.offers, [{ night: 2, incoming: 'black-market', held: 'hidden-path' }], 'offered against the oldest charm');
});

test('favour past the soft cap halves and spills into renown, and never exceeds 100', () => {
  let spilled = false;
  for (let n = 1; n <= 30 && !spilled; n++) {
    const res = resolveNight({ warband, night: n, orders: [{ memberId: 'agnar', errand: 'carouse' }], state: { ...fresh, favour: 90 } });
    const r = res.results[0];
    if (r.outcome !== 'boon' && r.renown > 0) spilled = true;
    assert.ok(r.favour <= 4);
  }
  assert.ok(spilled);
  const res = resolveNight({ warband, night: 9, orders: [{ memberId: 'agnar', errand: 'carouse' }], state: { ...fresh, favour: 99 } });
  assert.ok(res.results[0].favour <= 1);
});

test('quiet and return nights still write a Chronicle line', () => {
  assert.ok(quietNight(4).closer);
  assert.equal(quietNight(4).results.length, 0);
  assert.match(returnNight(30, 'nordost').header, /return/);
});

test('availability, defaults, titles, tickets, city provides, epithets', () => {
  const av = availability(warband, ['skalle']);
  assert.deepEqual(av.map((a) => a.reason), [undefined, 'recovering', undefined, 'dead']);
  assert.equal(defaultErrand({ id: 'x', name: '', role: 'Priest of Taal' }), 'pray');
  assert.equal(defaultErrand({ id: 'x', name: '', role: 'Ogre' }), 'train');
  assert.equal(titleFor(0), 'Newcomers');
  assert.equal(titleFor(26), 'Ratcatchers');
  assert.equal(titleFor(500), 'Those Who Stayed');
  const t = eveTicket('nordost', 12, 3);
  assert.match(t, /^EVE-3-[0-9A-Z]{5}$/);
  assert.equal(readTicket(t), 3);
  assert.equal(readTicket('nonsense'), null);
  assert.equal(cityProvides('nordost', 12).id, cityProvides('nordost', 12).id);
  assert.ok(epithetFor('agnar', { pray: 3, trade: 1 }).length > 3);
});
