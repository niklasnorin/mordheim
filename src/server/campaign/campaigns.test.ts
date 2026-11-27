/** The campaigns against a real Postgres (PGlite): the bridge from the days of one campaign, and the list. */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { eq } from 'drizzle-orm';
import * as schema from '../db/schema.ts';
import { testDatabase } from '../testdb.ts';
import { campaignBySlug, campaignLocationIds, ensureCampaigns, forgetCampaigns, frontDoor, listCampaigns } from './campaigns.ts';

let db: Awaited<ReturnType<typeof testDatabase>>['db'];

before(async () => {
  ({ db } = await testDatabase());
  // a database from before campaigns: the standings shown, and a content document kept for the whole site
  await db.insert(schema.campaignSettings).values({ key: 'standingsVisible', value: true });
  await db.insert(schema.legacyCurfewContent).values({ id: 'omens', document: { omens: [] }, version: 4, updatedBy: 'Old Hand' });
});

test('the first campaign is written once, from campaign.json, with what the single campaign kept', async () => {
  await ensureCampaigns();
  forgetCampaigns();
  await ensureCampaigns();
  const all = await listCampaigns();
  assert.equal(all.length, 1);
  const [c] = all;
  assert.equal(c.id, 'mordheim-2000');
  assert.equal(c.status, 'live');
  assert.equal(c.start, '2026-09-10');
  assert.equal(c.options.standingsVisible, true, 'the switch is carried across');
  assert.equal((await frontDoor()).id, 'mordheim-2000');
  assert.equal((await campaignBySlug('mordheim'))?.id, 'mordheim-2000');
});

test('the documents kept for the whole site become the first campaign’s', async () => {
  const docs = await db.select().from(schema.curfewContent).where(eq(schema.curfewContent.campaignId, 'mordheim-2000'));
  assert.equal(docs.length, 1);
  assert.equal(docs[0].id, 'omens');
  assert.equal(docs[0].version, 4);
});

test('the first campaign fights in every location the atlas holds', async () => {
  const ids = await campaignLocationIds('mordheim-2000');
  assert.ok(ids.includes('mordheim') && ids.includes('fussenbach'));
});

test('rows written before there were campaigns belong to the first', async () => {
  await db.insert(schema.newsArticles).values({ headline: 'Old news', body: 'From before.' });
  const [a] = await db.select().from(schema.newsArticles);
  assert.equal(a.campaignId, 'mordheim-2000');
});
