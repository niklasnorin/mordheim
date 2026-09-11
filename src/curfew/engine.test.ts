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

// ───────────────────────── where the campaign is ─────────────────────────

import { LOCATIONS, DEFAULT_LOCATION, locationById, locationForNight, isErrandAt, errandAt, unavailableReason, moonBoostAt, moonTiesAt, tokensFor, blurbFor, TOKENS, OMENS as DECK, cityProvides as provides } from './engine.ts';

const fussenbach = locationById('fussenbach');
const rival = { id: 'welling', name: 'the Welling Rune', members: [{ id: 'merovech', name: 'Merovech', role: 'Captain' }, { id: 'krylov', name: 'Krylov', role: 'Youngblood', dead: true }] };

test('every location is a complete pack for its own errands', () => {
  assert.ok(LOCATIONS.length >= 2);
  assert.equal(DEFAULT_LOCATION.id, 'mordheim');
  assert.equal(locationById('nowhere').id, 'mordheim', 'unknown places read as Mordheim');
  for (const loc of LOCATIONS) {
    assert.ok(loc.errands.length >= 4, loc.id);
    for (const e of loc.errands) {
      const bank = loc.templates[e]!;
      assert.ok(bank, `${loc.id} has templates for ${e}`);
      for (const k of ['boon', 'fair', 'poor', 'standing'] as const) assert.ok(bank[k].length >= 2, `${loc.id} ${e} ${k}`);
      for (const k of ['boon', 'fair', 'poor'] as const) assert.ok(loc.cryer.headlines[e]![k].length >= 3, `${loc.id} cryer ${e} ${k}`);
      assert.ok(loc.epithets[e]!.length >= 3, `${loc.id} epithets ${e}`);
      assert.ok(blurbFor(e, loc).length > 10);
    }
    for (const e of ALL) if (!loc.errands.includes(e)) assert.ok(unavailableReason(e, loc).length > 10, `${loc.id} says why not ${e}`);
    for (const list of [loc.districts, loc.details, loc.closers, loc.rumours, loc.return, loc.cityProvides, loc.quiet, loc.pairs, loc.cryer.bylines]) assert.ok(list.length >= 2);
    assert.match(loc.arrival, /\{warband\}/);
    if (loc.moonTies) for (const m of MOONS) for (const e of loc.errands) assert.ok(moonTiesAt(m, e, loc).length, `${loc.id} ties ${m.id} ${e}`);
  }
});

test('a month of nights for four warbands rarely repeats a line', () => {
  // four warbands, two members a night, thirty nights, errands spread as a player would spread them
  const bands = ['a', 'b', 'c', 'd'].map((id) => ({ ...warband, id: `${warband.id}-${id}` }));
  const E = fussenbach.errands;
  for (const [b, band] of bands.entries()) {
    const seen = new Map<string, number>();
    const lines: { night: number; line: string }[] = [];
    for (let n = 1; n <= 30; n++) {
      const orders = [{ memberId: 'torgrim', errand: E[(n + b) % E.length] }, { memberId: 'skalle', errand: E[(n * 2 + b + 1) % E.length] }];
      // the ledger hands the engine the last ten nights' lines; do the same here
      const avoid = lines.filter((l) => l.night >= n - 10).map((l) => l.line);
      const res = resolveNight({ warband: band, rival: bands.filter((x) => x !== band), night: n, orders, state: fresh, location: fussenbach, avoid });
      for (const r of res.results) { const key = r.prose.split('. ')[0]; seen.set(key, (seen.get(key) ?? 0) + 1); lines.push({ night: n, line: r.line! }); }
    }
    const counts = [...seen.values()];
    assert.ok(Math.max(...counts) <= 2, `${band.id}: a line opened three nights in one month`);
    assert.ok(counts.filter((c) => c === 2).length <= 5, `${band.id}: ${counts.filter((c) => c === 2).length} of 60 openings repeated once`);
  }
  // without the ledger's memory the same month repeats itself more
  const blind = new Map<string, number>();
  for (let n = 1; n <= 30; n++) {
    const res = resolveNight({ warband: bands[0], night: n, orders: [{ memberId: 'torgrim', errand: E[n % E.length] }, { memberId: 'skalle', errand: E[(n * 2 + 1) % E.length] }], state: fresh, location: fussenbach });
    for (const r of res.results) blind.set(r.line!, (blind.get(r.line!) ?? 0) + 1);
  }
  assert.ok([...blind.values()].some((c) => c > 1), 'the redraw is what keeps the month fresh');
  // and the rival is not always the same one
  const named = new Set<string>();
  for (let n = 1; n <= 120; n++) {
    const res = resolveNight({ warband: bands[0], rival: bands.slice(1), night: n, orders: [{ memberId: 'agnar', errand: 'spy' }], state: fresh, location: fussenbach });
    for (const b of bands.slice(1)) if (res.results[0].prose.includes(b.name) || res.results[0].rumour?.includes(b.name)) named.add(b.id);
  }
  assert.ok(named.size >= 1, 'the rival is named by warband name, which here is shared; the rotation is checked below');
  const picked = new Set<string>();
  const distinct = bands.slice(1).map((b, i) => ({ ...b, name: `Band ${i}` }));
  for (let n = 1; n <= 120; n++) {
    const res = resolveNight({ warband: bands[0], rival: distinct, night: n, orders: [{ memberId: 'agnar', errand: 'spy' }], state: fresh, location: fussenbach });
    for (const b of distinct) if ((res.results[0].prose + (res.results[0].rumour ?? '')).includes(b.name)) picked.add(b.name);
  }
  assert.equal(picked.size, 3, 'over a season every other warband gets a turn as the rival');
});

test('Fussenbach has fewer errands, one of its own, and sends the missing ones somewhere sensible', () => {
  assert.deepEqual(fussenbach.errands, ['dredge', 'carouse', 'spy', 'pray', 'trade']);
  assert.ok(!isErrandAt('train', fussenbach) && !isErrandAt('scavenge', fussenbach));
  assert.ok(!isErrandAt('dredge', DEFAULT_LOCATION), 'no basins in the city');
  assert.equal(errandAt('scavenge', fussenbach), 'dredge');
  assert.equal(errandAt('train', fussenbach), 'carouse');
  assert.equal(errandAt('pray', fussenbach), 'pray');
  assert.equal(errandAt('dredge', DEFAULT_LOCATION), 'scavenge');
  assert.match(unavailableReason('train', fussenbach), /Pit/);
  assert.equal(defaultErrand({ id: 'x', name: '', role: 'Ogre' }, fussenbach), 'carouse', 'no Pit, so the ogre drinks');
  assert.equal(defaultErrand({ id: 'x', name: '', role: 'Jaeger' }, fussenbach), 'dredge');
});

test('the campaign is where the latest move on or before a night says, and Mordheim before any', () => {
  assert.equal(locationForNight(5, []).id, 'mordheim');
  const moves = [{ locationId: 'fussenbach', fromNight: 10 }, { locationId: 'mordheim', fromNight: 20 }];
  assert.equal(locationForNight(9, moves).id, 'mordheim');
  assert.equal(locationForNight(10, moves).id, 'fussenbach');
  assert.equal(locationForNight(19, moves).id, 'fussenbach');
  assert.equal(locationForNight(20, moves).id, 'mordheim');
  assert.equal(locationForNight(10, [...moves, { locationId: 'mordheim', fromNight: 10 }]).id, 'mordheim', 'a later move on the same night wins');
});

test('in the village Dredge takes the Omen tilt and Moon favour that Scavenge would have had', () => {
  const omen = { ...DECK[0], tilt: { scavenge: 2, train: 1 } };
  const green = { id: 'green-moon', name: '', reading: '', boost: 'scavenge' as const, ties: {} };
  const hunters = { id: 'hunters-moon', name: '', reading: '', boost: 'train' as const, ties: {} };
  assert.equal(tiltFor('dredge', omen, green, fussenbach), 3);
  assert.equal(tiltFor('dredge', omen, hunters, fussenbach), 2);
  assert.equal(tiltFor('dredge', omen, green, DEFAULT_LOCATION), 0, 'dredge inherits nothing in the city');
  assert.equal(moonBoostAt(green, fussenbach), 'dredge');
  assert.equal(moonBoostAt(hunters, fussenbach), 'pray', 'the village says where the Hunter\'s Moon goes');
  assert.equal(moonBoostAt(hunters, DEFAULT_LOCATION), 'train');
  assert.equal(moonBoostAt({ ...hunters, id: 'made-up' }, fussenbach), undefined, 'a Moon for an errand nobody has is flat');
  assert.ok(moonTiesAt(MOONS[0], 'dredge', fussenbach).length >= 2, 'the village has several lines per Moon');
  assert.deepEqual(moonTiesAt(MOONS[0], 'dredge', DEFAULT_LOCATION), []);
  assert.deepEqual(moonTiesAt(MOONS[0], 'pray', DEFAULT_LOCATION), [MOONS[0].ties.pray]);
});

test('the village has charms of its own, which never turn up in the city', () => {
  const village = TOKENS.filter((t) => t.location === 'fussenbach');
  assert.ok(village.length >= 4);
  for (const type of ['fortune', 'ground', 'market', 'sight'] as const) {
    const city = tokensFor(type, DEFAULT_LOCATION), there = tokensFor(type, fussenbach);
    assert.ok(city.every((t) => !t.location));
    assert.ok(there.length > city.length, `${type}: the village adds to the pool`);
    assert.ok(city.every((t) => there.includes(t)), 'the common charms still turn up');
  }
  const seen = new Set<string>();
  for (let n = 1; n <= 200; n++) seen.add(provides('nordost', n, fussenbach).id);
  assert.ok(village.some((t) => seen.has(t.id)), 'the Village Provides its own charms too');
  for (let n = 1; n <= 200; n++) assert.ok(!provides('nordost', n).location, 'the City Provides only common ones');
});

test('a Fussenbach night reads in the village\'s words, drops its charms, and now and then meets the rival', () => {
  let dredgeShards = 0, ground = 0, villageTokens = 0, encounters = 0, tied = 0;
  for (let n = 1; n <= 300; n++) {
    const res = resolveNight({ warband, rival, night: n, orders: [{ memberId: 'torgrim', errand: 'dredge' }, { memberId: 'skalle', errand: 'pray' }], state: fresh, location: fussenbach });
    assert.equal(res.locationId, 'fussenbach');
    for (const r of res.results) {
      assert.doesNotMatch(r.prose, /\{\w+\}/, 'every slot is filled');
      assert.doesNotMatch(r.prose, /Henrik|the Pit|Sister Agathe/, 'nothing of the city leaks in');
      if (r.token?.location) villageTokens++;
    }
    const d = res.results[0];
    dredgeShards += d.shards;
    if (d.token?.type === 'ground') ground++;
    if (d.prose.includes('Welling Rune')) encounters++;
    if (d.prose.includes('Merovech')) assert.ok(d.prose.includes('Welling Rune'));
    if (moonTiesAt(moonForNight(n), 'dredge', fussenbach).some((t) => d.prose.includes(t.replace(/\{first\}/g, 'Torgrim').slice(0, 20)))) tied++;
    assert.ok(fussenbach.details.includes(res.detail));
  }
  assert.ok(dredgeShards > 100, `dredging brings the green home: ${dredgeShards}`);
  assert.ok(ground > 20, `and the lie of the mudflats: ${ground} Ground charms`);
  assert.ok(villageTokens > 10, `village charms drop: ${villageTokens}`);
  assert.ok(encounters > 15 && encounters < 90, `the rival crosses their path now and then: ${encounters} of 300`);
  assert.ok(tied > 60, `the Moon leaves its village mark: ${tied}`);
  const quiet = quietNight(3, fussenbach), back = returnNight(30, 'nordost', fussenbach);
  assert.equal(quiet.locationId, 'fussenbach'); assert.ok(fussenbach.quiet.includes(quiet.closer!));
  assert.ok(fussenbach.return.includes(back.detail));
  assert.ok(fussenbach.epithets.dredge!.includes(epithetFor('torgrim', { dredge: 4, pray: 1 }, fussenbach)));
  assert.ok(DEFAULT_LOCATION.epithets.train!.includes(epithetFor('torgrim', { train: 4 }, fussenbach)), 'a name earned at the Pit keeps the city\'s words');
});

test('a rival whose name begins with "The" is never "the The"', () => {
  const order = { id: 'welling-rune', name: 'The Order of the Welling Rune', members: [{ id: 'merovech', name: 'Merovech', role: 'Captain' }] };
  let named = 0;
  for (let n = 1; n <= 200; n++) {
    const res = resolveNight({ warband, rival: order, night: n, orders: [{ memberId: 'agnar', errand: 'spy' }], state: fresh, location: fussenbach });
    const text = res.results[0].prose + ' ' + (res.results[0].rumour ?? '');
    assert.doesNotMatch(text, /the The /);
    if (text.includes('the Order of the Welling Rune')) named++;
  }
  assert.ok(named > 10, `${named}`);
  const none = resolveNight({ warband, night: 3, orders: [{ memberId: 'agnar', errand: 'spy' }], state: fresh, location: fussenbach });
  assert.doesNotMatch(none.results[0].prose + (none.results[0].rumour ?? ''), /the the /i);
});

test('a Mordheim night is unchanged in kind: no village words, and the rival crosses paths there too', () => {
  let encounters = 0;
  for (let n = 1; n <= 200; n++) {
    const res = resolveNight({ warband, rival, night: n, orders: [{ memberId: 'agnar', errand: 'carouse' }], state: fresh });
    assert.equal(res.locationId, 'mordheim');
    assert.doesNotMatch(res.results[0].prose, /Flagon|Fussen|Justinian/);
    if (res.results[0].prose.includes('Welling Rune')) encounters++;
  }
  assert.ok(encounters > 8 && encounters < 70, `${encounters} of 200`);
  const standing = resolveNight({ warband, rival, night: 7, orders: [{ memberId: 'agnar', errand: 'carouse', standing: true }], state: fresh });
  assert.doesNotMatch(standing.results[0].prose, /Welling Rune/, 'nobody remarks on standing orders');
});
