/** The campaigns against a real Postgres (PGlite): the bridge from the days of one campaign, and the list. */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { eq } from 'drizzle-orm';
import * as schema from '../db/schema.ts';
import { testDatabase } from '../testdb.ts';
import { campaignBySlug, campaignLocationIds, ensureCampaigns, forgetCampaigns, frontDoor, invalidateCampaigns, listCampaigns } from './campaigns.ts';
import { actorOf } from '../testdb.ts';
import { BUILT_IN_DOCUMENTS } from '../../curfew/engine.ts';
import { DEFAULT_CAMPAIGN, tuningFrom } from '../../campaign/campaign.ts';
import { claimWarband, createWarband, listWarbands, ownWarband, updateWarband, LedgerError } from './roster.ts';
import { createScenario, listScenarios, getScenario } from './scenarios.ts';
import { actions, claimWarband as claimLedger, reconcileAll, reconcileCampaign, recentDispatches } from '../curfew/service.ts';
import { worldFor, invalidateWorld } from '../content/curfew.ts';
import { postNotice } from '../admin/service.ts';

let db: Awaited<ReturnType<typeof testDatabase>>['db'];

before(async () => {
  ({ db } = await testDatabase());
  // a database from before campaigns: the standings shown, and a content document kept for the whole site
  await db.insert(schema.campaignSettings).values({ key: 'standingsVisible', value: true });
  await db.insert(schema.legacyCurfewContent).values({ id: 'omens', document: BUILT_IN_DOCUMENTS.omens, version: 4, updatedBy: 'Old Hand' });
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

// ───────────────────────── two campaigns side by side ─────────────────────────

const A = 'mordheim-2000', B = 'lustria-2005';
const gm = actorOf('user-gm', 'Game Master', 'gm');
const niklas = actorOf('user-niklas', 'Niklas');

async function setStatus(id: string, status: 'draft' | 'live' | 'finished' | 'archived') {
  await db.update(schema.campaigns).set({ status }).where(eq(schema.campaigns.id, id));
  invalidateCampaigns();
  invalidateWorld(id);
}

test('a second campaign begins as a draft with nothing in it', async () => {
  await db.insert(schema.user).values([gm, niklas].map((a) => ({ id: a.id, name: a.name, email: a.email, emailVerified: true })));
  await db.insert(schema.campaigns).values({
    id: B, slug: 'lustria', name: 'Lustria', setting: 'city-of-the-damned', status: 'draft', start: '2026-09-20', timezone: 'Europe/London',
    anchor: { date: '2026-09-20', imperial: '15th of Pflugzeit, 2005 IC' }, tuning: tuningFrom(DEFAULT_CAMPAIGN), options: {},
  });
  invalidateCampaigns();
  assert.equal((await listCampaigns()).length, 2);
  assert.equal((await frontDoor()).id, A, 'a draft is never the front door');
  assert.deepEqual(await listWarbands(B), []);
  assert.deepEqual(await listScenarios(B), []);
  assert.ok((await listWarbands(A)).length > 0, 'the first campaign keeps its seed');
});

test('a draft is the game masters’: a player may not write in it', async () => {
  await assert.rejects(createWarband(niklas, B, { name: 'The Lizard Watch', type: 'Lizardmen' }), (e: unknown) => e instanceof LedgerError && e.status === 403);
  const w = await createWarband(gm, B, { name: 'The Lizard Watch', type: 'Lizardmen' });
  assert.equal(w.campaignId, B);
  assert.ok(!(await listWarbands(A)).some((x) => x.id === w.id), 'it is not mustered in the first campaign');
  const s = await createScenario(gm, B, { title: 'Into the Jungle', playedOn: '2026-10-01', warbandIds: [w.id, 'nordost'] });
  assert.equal(s.sequence, 1, 'the sequence counts within the campaign');
  assert.deepEqual((await getScenario(s.id))!.warbands.map((x) => x.warbandId), [w.id], 'a warband of another campaign may not attend');
  assert.ok(!(await listScenarios(A)).some((x) => x.id === s.id));
});

test('one warband per player in each campaign, and a ledger in each', async () => {
  await setStatus(B, 'live');
  await claimWarband(niklas, 'nordost');
  assert.equal((await ownWarband(niklas.id, A))?.id, 'nordost');
  assert.equal(await ownWarband(niklas.id, B), undefined);
  await claimWarband(niklas, 'lizard-watch');
  assert.equal((await ownWarband(niklas.id, B))?.id, 'lizard-watch', 'a warband in another campaign as well');
  await claimLedger(A, niklas.id, 'nordost', 5);
  const view = await claimLedger(B, niklas.id, 'lizard-watch', 5);
  assert.equal(view.warbandId, 'lizard-watch');
});

test('each campaign rolls its own dice', async () => {
  const [a, b] = await Promise.all([worldFor(A), worldFor(B)]);
  const omens = (w: typeof a) => Array.from({ length: 30 }, (_, i) => w.engine.omenForNight(i + 1).id).join();
  assert.notEqual(omens(a), omens(b), 'another id, another shuffle');
  assert.equal(b.engine.nightForDate('2026-09-20'), 1, 'night 1 is its own start');
});

test('midnight runs only where nights run, each by its own clock', async () => {
  await actions.orders(B, niklas.id, 5, [{ memberId: (await listWarbands(B))[0].members[0]?.id ?? 'x', errand: 'carouse' }]).catch(() => undefined);
  const now = new Date('2026-10-01T12:00:00Z');
  let runs = await reconcileAll('cron', now);
  assert.deepEqual(runs.map((r) => r.campaignId).sort(), [A, B].sort());
  assert.equal(runs.find((r) => r.campaignId === A)!.night, 22);
  assert.equal(runs.find((r) => r.campaignId === B)!.night, 12);
  await setStatus(B, 'draft');
  runs = await reconcileAll('cron', now);
  assert.deepEqual(runs.map((r) => r.campaignId), [A], 'a draft has no midnight');
});

test('the Cryer of one campaign does not print another’s', async () => {
  await setStatus(B, 'live');
  const notice = await postNotice(B, 'The jungle has eyes.', 12);
  assert.ok((await recentDispatches(B, 12, 20)).some((d) => d.id === notice.id));
  assert.ok(!(await recentDispatches(A, 22, 50)).some((d) => d.id === notice.id));
  // the same key may stand in two campaigns
  await db.insert(schema.cryerDispatches).values([{ campaignId: A, key: 'k:1', warbandId: 'the-watch', night: 3, kind: 'notice', headline: 'A' }, { campaignId: B, key: 'k:1', warbandId: 'the-watch', night: 3, kind: 'notice', headline: 'B' }]);
});

test('a finished campaign is closed: its players may not write, its nights do not run', async () => {
  await setStatus(B, 'finished');
  await assert.rejects(updateWarband(niklas, 'lizard-watch', { lore: 'Still here.' }), (e: unknown) => e instanceof LedgerError && e.status === 409);
  await updateWarband(gm, 'lizard-watch', { lore: 'Put straight by the Watch.' });
  await assert.rejects(actions.reset(B, niklas.id, 14), (e: unknown) => e instanceof LedgerError && e.status === 409);
  await assert.rejects(reconcileCampaign(B, 14), (e: unknown) => e instanceof LedgerError && e.status === 409);
  const runs = await reconcileAll('cron', new Date('2026-10-03T12:00:00Z'));
  assert.ok(!runs.some((r) => r.campaignId === B));
  // the first campaign is untouched by all of this
  await updateWarband(niklas, 'nordost', { lore: 'Still the Kin.' });
});
