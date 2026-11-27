/**
 * The campaigns as the record keeps them (`campaigns`, `docs/campaigns.md`). Every request asks which campaign it is
 * in, so the list is read at most every few seconds and at once after a change.
 *
 * `ensureCampaigns` is the bridge from the days of one campaign: the first campaign's row is written from
 * `campaign.json`, the switch that showed the standings is carried into its options, the Curfew's documents kept for
 * the whole site are copied into its own, and it is given every location the atlas holds. Every row written before
 * there were campaigns already names it, through the column's default.
 */
import { asc, eq, sql } from 'drizzle-orm';
import { db } from '../db/client.ts';
import { campaignLocations, campaignSettings, campaigns, curfewContent, FIRST_CAMPAIGN_ID, legacyCurfewContent, locations, scenarios, warbands } from '../db/schema.ts';
import { configOf, DEFAULT_CAMPAIGN, mayView, tuningFrom, type CampaignConfig } from '../../campaign/campaign.ts';
import { ensureLocationsSeeded } from './seed.ts';
import { LedgerError } from '../../curfew/ledger.ts';

let ensured: Promise<void> | undefined;

/** Write the first campaign and carry the single campaign's things into it, once. Memoised per process. */
export function ensureCampaigns(): Promise<void> {
  ensured ??= bridge().then(() => undefined, (e) => { ensured = undefined; throw e; });
  return ensured;
}

/** For tests and a reset: forget the bridge was crossed and what was read. */
export function forgetCampaigns(): void { ensured = undefined; cache = undefined; }

async function bridge(): Promise<void> {
  const d = db();
  const [first] = await d.select({ id: campaigns.id }).from(campaigns).where(eq(campaigns.id, FIRST_CAMPAIGN_ID));
  if (!first) {
    const [shown] = await d.select().from(campaignSettings).where(eq(campaignSettings.key, 'standingsVisible'));
    const c = DEFAULT_CAMPAIGN;
    await d.insert(campaigns).values({
      id: c.id, slug: c.slug, name: c.name, setting: c.setting, status: 'live', start: c.start, timezone: c.timezone,
      anchor: c.anchor, tuning: tuningFrom(c), options: { ...c.options, standingsVisible: shown?.value === true },
    }).onConflictDoNothing();
    const [door] = await d.select().from(campaignSettings).where(eq(campaignSettings.key, 'frontDoor'));
    if (!door) await d.insert(campaignSettings).values({ key: 'frontDoor', value: c.id }).onConflictDoNothing();
  }
  const [{ n: docs }] = await d.select({ n: sql<number>`count(*)::int` }).from(curfewContent).where(eq(curfewContent.campaignId, FIRST_CAMPAIGN_ID));
  if (docs === 0) {
    const old = await d.select().from(legacyCurfewContent);
    for (const r of old) await d.insert(curfewContent).values({ campaignId: FIRST_CAMPAIGN_ID, id: r.id, document: r.document, version: r.version, updatedBy: r.updatedBy, updatedAt: r.updatedAt }).onConflictDoNothing();
  }
  await ensureLocationsSeeded();
  const [{ n: places }] = await d.select({ n: sql<number>`count(*)::int` }).from(campaignLocations).where(eq(campaignLocations.campaignId, FIRST_CAMPAIGN_ID));
  if (places === 0) {
    const all = await d.select({ id: locations.id, sort: locations.sort }).from(locations);
    for (const l of all) await d.insert(campaignLocations).values({ campaignId: FIRST_CAMPAIGN_ID, locationId: l.id, sort: l.sort }).onConflictDoNothing();
  }
  cache = undefined;
}

let cache: { at: number; list: CampaignConfig[]; frontDoor: string } | undefined;
const TTL_MS = 5_000;

async function read(): Promise<{ list: CampaignConfig[]; frontDoor: string }> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache;
  await ensureCampaigns();
  const d = db();
  const rows = await d.select().from(campaigns).orderBy(asc(campaigns.sort), asc(campaigns.createdAt));
  const [door] = await d.select().from(campaignSettings).where(eq(campaignSettings.key, 'frontDoor'));
  const list = rows.map(configOf);
  const wanted = typeof door?.value === 'string' ? door.value : FIRST_CAMPAIGN_ID;
  const frontDoor = list.find((c) => c.id === wanted && c.status !== 'draft')?.id ?? list.find((c) => c.status === 'live')?.id ?? FIRST_CAMPAIGN_ID;
  cache = { at: Date.now(), list, frontDoor };
  return cache;
}

/** Read the list again on the next ask: after a campaign was made or changed. */
export function invalidateCampaigns(): void { cache = undefined; }

/** Every campaign, in order. Drafts included: the caller filters with `mayView`. */
export async function listCampaigns(): Promise<CampaignConfig[]> { return (await read()).list; }

/** The campaigns a viewer may see. */
export async function visibleCampaigns(gm: boolean): Promise<CampaignConfig[]> { return (await listCampaigns()).filter((c) => mayView(c.status, gm)); }

export async function getCampaign(id: string): Promise<CampaignConfig | undefined> { return (await listCampaigns()).find((c) => c.id === id); }

export async function campaignBySlug(slug: string): Promise<CampaignConfig | undefined> { return (await listCampaigns()).find((c) => c.slug === slug); }

/** The campaign the site's plain addresses show: the one the admin chose, else the first live one. */
export async function frontDoor(): Promise<CampaignConfig> {
  const { list, frontDoor: id } = await read();
  return list.find((c) => c.id === id) ?? DEFAULT_CAMPAIGN;
}

/** A campaign that must exist, or a refusal. */
export async function requireCampaign(id: string): Promise<CampaignConfig> {
  const c = await getCampaign(id);
  if (!c) throw new LedgerError('No such campaign.', 404);
  return c;
}

/** The locations a campaign fights in, by id, in order. */
export async function campaignLocationIds(campaignId: string): Promise<string[]> {
  await ensureCampaigns();
  const rows = await db().select({ id: campaignLocations.locationId }).from(campaignLocations).where(eq(campaignLocations.campaignId, campaignId)).orderBy(asc(campaignLocations.sort));
  return rows.map((r) => r.id);
}

/** How many warbands each campaign musters and how many games it has played, by campaign id, for the campaigns' list. */
export async function campaignCounts(): Promise<Record<string, { warbands: number; played: number }>> {
  const d = db();
  const [w, s] = await Promise.all([
    d.select({ id: warbands.campaignId, n: sql<number>`count(*)::int` }).from(warbands).groupBy(warbands.campaignId),
    d.select({ id: scenarios.campaignId, n: sql<number>`count(*)::int` }).from(scenarios).where(eq(scenarios.status, 'played')).groupBy(scenarios.campaignId),
  ]);
  const out: Record<string, { warbands: number; played: number }> = {};
  for (const r of w) (out[r.id] ??= { warbands: 0, played: 0 }).warbands = r.n;
  for (const r of s) (out[r.id] ??= { warbands: 0, played: 0 }).played = r.n;
  return out;
}

/** The address of a campaign's front page: the site's own for the front door, `/c/<slug>/` for the rest. */
export const campaignHref = (siteBase: string, c: Pick<CampaignConfig, 'slug' | 'id'>, frontDoorId: string): string => (c.id === frontDoorId ? `${siteBase}/` : `${siteBase}/c/${c.slug}/`);
