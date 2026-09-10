import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  hashSeed, rng, nightForDate, dateForNight, omenForNight, moonForNight, OMENS, MOONS, resolveNight, applyNight,
  quietNight, returnNight, tiltFor, availability, defaultErrand, titleFor, eveTicket, readTicket, cityProvides, epithetFor, CAMPAIGN,
  ERRAND_STATS, statEdge, statMargin, statBaseline,
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

test('the Moon adds one point to its favoured errand only, and tilt clamps', () => {
  const omen = { ...OMENS[0], tilt: { scavenge: 2, spy: -2 } };
  const moon = { id: 'x', name: '', reading: '', boost: 'scavenge' as const, ties: {} };
  assert.equal(tiltFor('scavenge', omen, moon), 3);
  assert.equal(tiltFor('spy', omen, moon), -2);
  assert.equal(tiltFor('pray', omen, moon), 0);
  const omen3 = { ...omen, tilt: { scavenge: 3 } };
  assert.equal(tiltFor('scavenge', omen3, moon), 3, 'clamped');
  for (const m of MOONS) { assert.ok(m.boost, m.id); assert.equal(Object.keys(m.ties).length, 6, `${m.id} has a tie for every errand`); }
});

test('the Moon leaves a narrative mark on some nights, never an unfilled slot', () => {
  let tied = 0;
  for (let n = 1; n <= 60; n++) {
    const res = resolveNight({ warband, night: n, orders: [{ memberId: 'torgrim', errand: 'scavenge' }], state: fresh });
    const tie = moonForNight(n).ties.scavenge!;
    const probe = tie.replace(/\{first\}/g, 'Torgrim').replace(/\{district\}.*$/, '').slice(0, 25);
    if (res.results[0].prose.includes(probe)) tied++;
    assert.doesNotMatch(res.results[0].prose, /\{\w+\}/);
  }
  assert.ok(tied > 15 && tied < 55, `tied ${tied} of 60 nights`);
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

const line = (over: Partial<Record<string, number>> = {}) => ({ M: 4, WS: 3, BS: 3, S: 3, T: 3, W: 1, I: 3, A: 1, Ld: 7, ...over });
const kin = {
  id: 'kin', name: 'The Kin',
  members: [
    { id: 'elder', name: 'Elder', role: 'Elder', stats: line({ WS: 4, BS: 4, T: 4, Ld: 8 }) },
    { id: 'ogre', name: 'Ogre', role: 'Ogre', stats: line({ M: 6, S: 4, T: 4, W: 3, Ld: 8, BS: 2 }) },
    { id: 'brother', name: 'Brother', role: 'Blood Brother', stats: line({ WS: 4 }) },
    { id: 'priest', name: 'Priest', role: 'Priest', stats: line() },
    { id: 'ghost', name: 'Ghost', role: 'Youngblood', dead: true, stats: line({ M: 9, WS: 9, BS: 9, I: 9, Ld: 10 }) },
  ],
};

test('every errand leans on one or two characteristics', () => {
  for (const e of ALL) { assert.ok(ERRAND_STATS[e].length >= 1 && ERRAND_STATS[e].length <= 2, e); }
});

test('the edge goes to the warband\'s best hand for an errand, measured against the living', () => {
  const [elder, ogre, brother, priest, ghost] = kin.members;
  assert.equal(statEdge(kin, ogre, 'scavenge'), 1, 'the ogre covers ground');
  assert.equal(statEdge(kin, elder, 'scavenge'), 0);
  assert.equal(statEdge(kin, elder, 'carouse'), 1, 'elder and ogre share the best hand for carousing');
  assert.equal(statEdge(kin, ogre, 'carouse'), 1);
  assert.equal(statEdge(kin, elder, 'train'), 1);
  assert.equal(statEdge(kin, brother, 'train'), 0, 'a good WS is not the best hand while the elder stands');
  assert.equal(statEdge(kin, ogre, 'pray'), 2, 'the ogre stands a full point above the usual in Ld and W');
  assert.equal(statEdge(kin, priest, 'pray'), 0);
  assert.equal(statEdge(kin, ghost, 'spy'), 0, 'the dead have no edge');
  assert.ok(statBaseline(kin).M! < 5, 'and do not raise the baseline');
  assert.ok(statMargin(kin, ogre, 'scavenge') > 0);
  const noStats = { id: 'x', name: 'X', members: [{ id: 'a', name: 'A', role: 'Elder' }, { id: 'b', name: 'B', role: 'Elder' }] };
  assert.equal(statEdge(noStats, noStats.members[0], 'train'), 0, 'no statline, no edge');
});

test('a warband that is uniformly stronger gets the same edges: the measure is within the band', () => {
  const shifted = { ...kin, members: kin.members.map((m) => ({ ...m, stats: Object.fromEntries(Object.entries(m.stats).map(([k, v]) => [k, v + 2])) as typeof m.stats })) };
  for (const e of ALL) for (let i = 0; i < kin.members.length; i++) {
    assert.equal(statEdge(shifted, shifted.members[i], e), statEdge(kin, kin.members[i], e), `${kin.members[i].id} ${e}`);
  }
  const uniform = { ...kin, members: kin.members.map((m) => ({ ...m, stats: line() })) };
  for (const e of ALL) for (const m of uniform.members) assert.equal(statEdge(uniform, m, e), 0, 'nobody stands out in a uniform band');
});

test('the edge tilts the dice for orders given, not for standing orders', () => {
  const orders = [{ memberId: 'ogre', errand: 'pray' as const }];
  const plain = { ...kin, members: kin.members.map((m) => ({ ...m, stats: undefined })) };
  let withEdge = 0, without = 0, standing = 0, standingPlain = 0;
  for (let night = 1; night <= 400; night++) {
    withEdge += resolveNight({ warband: kin, night, orders, state: fresh }).results[0].outcome === 'boon' ? 1 : 0;
    without += resolveNight({ warband: plain, night, orders, state: fresh }).results[0].outcome === 'boon' ? 1 : 0;
    const so = [{ ...orders[0], standing: true }];
    standing += resolveNight({ warband: kin, night, orders: so, state: fresh }).results[0].favour;
    standingPlain += resolveNight({ warband: plain, night, orders: so, state: fresh }).results[0].favour;
  }
  assert.ok(withEdge > without + 20, `edge ${withEdge} vs plain ${without}`);
  assert.equal(standing, standingPlain, 'standing orders run at half yield whoever goes');
});
