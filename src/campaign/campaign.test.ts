import { test } from 'node:test';
import assert from 'node:assert/strict';
import campaignJson from '../data/curfew/campaign.json' with { type: 'json' };
import { configOf, DEFAULT_CAMPAIGN, isFrozen, isIsoDate, isTimeZone, mayView, optionsOf, playersMayWrite, runsNights, slugError, slugify, tuningFrom, tuningOf } from './campaign.ts';

test('the first campaign is campaign.json, so its dice and dates never move', () => {
  assert.equal(DEFAULT_CAMPAIGN.id, 'mordheim-2000');
  assert.equal(DEFAULT_CAMPAIGN.start, campaignJson.start);
  assert.equal(DEFAULT_CAMPAIGN.timezone, campaignJson.timezone);
  assert.deepEqual(DEFAULT_CAMPAIGN.anchor, campaignJson.anchor);
  assert.equal(DEFAULT_CAMPAIGN.nightsPerMoon, campaignJson.nightsPerMoon);
  assert.deepEqual(DEFAULT_CAMPAIGN.titles, campaignJson.titles);
  assert.equal(DEFAULT_CAMPAIGN.status, 'live');
});

test('options fill their defaults and drop what is malformed', () => {
  const o = optionsOf({ curfew: false, startingCrowns: -3, catalogues: ['averlanders', 7, ''], carry: { modes: ['as-is', 'teleport'], goldCap: 200, heroesOnly: true } });
  assert.equal(o.curfew, false);
  assert.equal(o.standingsVisible, false);
  assert.equal(o.startingCrowns, 500);
  assert.deepEqual(o.catalogues, ['averlanders']);
  assert.deepEqual(o.carry.modes, ['as-is']);
  assert.equal(o.carry.goldCap, 200);
  assert.equal(o.carry.shardCap, null);
  assert.equal(o.carry.heroesOnly, true);
  assert.deepEqual(optionsOf(null).carry.modes, ['as-is', 'adjusted', 'start-over']);
});

test('a row reads back as the campaign it was written from', () => {
  const row = { id: 'lustria-2005', slug: 'lustria', name: 'Lustria', setting: 'city-of-the-damned', status: 'draft', start: '2027-01-01', timezone: 'Europe/London', anchor: { date: '2027-01-01', imperial: 'Festag, 1st of Nachexen, 2005 IC' }, tuning: { ...tuningFrom(DEFAULT_CAMPAIGN), nightsPerMoon: 8 }, options: { curfew: false } };
  const c = configOf(row);
  assert.equal(c.nightsPerMoon, 8);
  assert.equal(c.membersPerNight, DEFAULT_CAMPAIGN.membersPerNight);
  assert.equal(c.status, 'draft');
  assert.equal(c.options.curfew, false);
  assert.equal(configOf({ ...row, status: 'nonsense' }).status, 'draft');
  assert.deepEqual(tuningOf({ titles: 'no' }).titles, DEFAULT_CAMPAIGN.titles);
});

test('who sees, who writes, and when the nights run', () => {
  assert.equal(mayView('draft', false), false);
  assert.equal(mayView('draft', true), true);
  assert.equal(mayView('archived', false), true);
  assert.equal(isFrozen('finished'), true);
  assert.equal(isFrozen('live'), false);
  assert.equal(playersMayWrite('live'), true);
  assert.equal(playersMayWrite('draft'), false);
  assert.equal(runsNights({ status: 'live', options: optionsOf({}) }), true);
  assert.equal(runsNights({ status: 'live', options: optionsOf({ curfew: false }) }), false);
  assert.equal(runsNights({ status: 'draft', options: optionsOf({}) }), false);
});

test('slugs, dates and time zones', () => {
  assert.equal(slugify('Lustria: The Lost Continent!'), 'lustria-the-lost-continent');
  assert.equal(slugify('Fußenbach Ärger'), 'fu-enbach-arger');
  assert.equal(slugError('lustria-2005'), null);
  assert.ok(slugError('Lustria'));
  assert.ok(slugError('a--b'));
  assert.ok(isIsoDate('2027-02-28'));
  assert.ok(!isIsoDate('2027-2-28'));
  assert.ok(isTimeZone('Europe/Stockholm'));
  assert.ok(!isTimeZone('Mars/Olympus'));
});

test('the campaign’s clock is the engine’s', async () => {
  const { createEngine, BUILT_IN_DOCUMENTS } = await import('../curfew/engine.ts');
  const { nightNow, nightOn, localDateIn } = await import('./campaign.ts');
  const other = { ...DEFAULT_CAMPAIGN, id: 'other', start: '2027-03-01', timezone: 'America/Los_Angeles' };
  for (const c of [DEFAULT_CAMPAIGN, other]) {
    const e = createEngine({ campaign: c, content: BUILT_IN_DOCUMENTS });
    for (const iso of ['2026-09-09T22:30:00Z', '2027-03-01T07:59:00Z', '2027-03-01T08:01:00Z', '2028-01-01T12:00:00Z']) {
      const now = new Date(iso);
      assert.equal(localDateIn(c.timezone, now), e.localDate(now, c.timezone));
      assert.equal(nightNow(c, now), e.currentNight(now));
    }
    assert.equal(nightOn(c, '2027-03-02'), e.nightForDate('2027-03-02'));
  }
});
