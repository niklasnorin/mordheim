import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CAMPAIGN, LOCATIONS, ERRANDS, outcomeOdds, locationById } from './engine.ts';
import { TILTS, charmOdds, crossroadsOdds, errandExpectation, happeningOdds, simulateNights, standingExpectation } from './odds.ts';
import { warbands } from '../data/warbands.ts';

test('outcome odds sum to one and move eight points a tilt, within the floors', () => {
  for (const t of TILTS) {
    const o = outcomeOdds(t);
    assert.ok(Math.abs(o.boon + o.fair + o.poor - 1) < 1e-9, `${t}`);
    assert.ok(o.boon >= 0.05 && o.poor >= 0.05);
  }
  assert.ok(outcomeOdds(1).boon > outcomeOdds(0).boon && outcomeOdds(-1).boon < outcomeOdds(0).boon);
  assert.equal(Math.round((outcomeOdds(1).boon - outcomeOdds(0).boon) * 100), 8);
});

test('a charm comes about one night in five on a flat regular night with two out, one in three once the Moon and the edge tilt it, never on a poor night', () => {
  const regular = charmOdds(0), favoured = charmOdds(1);
  assert.ok(regular.perNight > 0.15 && regular.perNight < 0.3, `${regular.perNight}`);
  assert.ok(favoured.perNight > 0.25 && favoured.perNight < 0.4, `${favoured.perNight}`);
  assert.equal(regular.byOutcome.poor, 0);
  for (let t = -2; t < 3; t++) assert.ok(charmOdds(t + 1).perNight > charmOdds(t).perNight, 'more tilt, more charms');
  assert.ok(charmOdds(2).perNight < 0.6, 'a blessed night is still not a charm a night');
});

test('errand expectations are consistent with the dice: shards only where the green is, renown at the Pit, rumours from spying', () => {
  for (const e of ERRANDS) {
    const x = errandExpectation(e, 0);
    assert.ok(x.favour > 4 && x.favour < 6, `${e} favour ${x.favour}`);
    assert.equal(x.shards > 0, e === 'scavenge' || e === 'dredge');
    assert.equal(x.renown > 0, e === 'train' || e === 'carouse');
    assert.equal(x.rumour > 0, e === 'spy');
    assert.equal(x.charm > 0, e !== 'scavenge', `${e} charm`);
    assert.ok(errandExpectation(e, 2).favour > x.favour);
    const s = standingExpectation(e);
    assert.equal(s.charm, 0);
    assert.ok(s.favour < x.favour, 'standing orders bring less');
  }
  assert.ok(standingExpectation('scavenge').shards > 0 && standingExpectation('pray').shards === 0);
});

test('crossroads odds: the long run is the raw draw over one plus itself, and every pack is counted', () => {
  for (const location of LOCATIONS) {
    const c = crossroadsOdds(location);
    assert.equal(c.raw, CAMPAIGN.crossroadsChance);
    assert.ok(Math.abs(c.effective - c.raw / (1 + c.raw)) < 1e-9);
    assert.equal(c.pool, location.crossroads!.length);
    assert.equal(c.defaults, c.pool, 'every crossroads has a default road');
    assert.equal(Object.values(c.byKind).reduce((a, b) => a + b, 0), c.pool);
    assert.ok(c.riskRoads.length >= 2);
    for (const r of c.riskRoads) assert.ok(r.chance > 0 && r.chance < 1);
    assert.ok(c.nightsToExhaust < CAMPAIGN.nightsPerMoon * CAMPAIGN.seasonMoons, `${location.id}: the pool is met within a season at this rate, which is why the fallback exists`);
  }
  assert.ok(happeningOdds(0).perNight > 0.3 && happeningOdds(0).perNight < 0.7);
});

test('the simulation plays real nights and lands near the arithmetic', () => {
  const sim = simulateNights(locationById('mordheim'), warbands[0], 84 * 6);
  assert.ok(sim.nightsOut > 400, `${sim.nightsOut}`);
  assert.equal(sim.outcomes.boon + sim.outcomes.fair + sim.outcomes.poor, sim.membersOut);
  assert.ok(sim.perNight.crossroads > 0.25 && sim.perNight.crossroads < 0.42, `crossroads ${sim.perNight.crossroads}`);
  assert.ok(sim.perNight.charms > 0.2 && sim.perNight.charms < 0.5, `charms ${sim.perNight.charms}`);
  assert.ok(sim.risks.good + sim.risks.bad > 0, 'risk roads were walked');
  assert.ok(sim.perNight.favour > 6 && sim.perNight.favour < 14, `favour ${sim.perNight.favour}`);
  assert.deepEqual(simulateNights(locationById('mordheim'), warbands[0], 84), simulateNights(locationById('mordheim'), warbands[0], 84), 'deterministic');
  assert.notDeepEqual(simulateNights(locationById('fussenbach'), warbands[0], 84).perNight, sim.perNight);
});
