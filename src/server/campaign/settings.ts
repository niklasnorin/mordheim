/**
 * A campaign's switches, set by the admin in the Watch House. Today there is one: whether the standings are shown. A
 * campaign keeps its tally to itself until the admin says otherwise, so the table of battles and victories is hidden by
 * default. The switches live in the campaign's options (`CampaignOptions` in campaign/campaign.ts), one set per campaign.
 */
import { eq, sql } from 'drizzle-orm';
import { db } from '../db/client.ts';
import { campaigns } from '../db/schema.ts';
import { LedgerError } from '../../curfew/ledger.ts';
import { isAdmin, type Actor } from '../roles.ts';
import { getCampaign, invalidateCampaigns } from './campaigns.ts';

export interface CampaignSettings {
  /** Whether the home page prints the standings table: who has fought and who has won. */
  standingsVisible: boolean;
}
export const DEFAULT_SETTINGS: CampaignSettings = { standingsVisible: false };
export type SettingKey = keyof CampaignSettings;
export const SETTING_KEYS = Object.keys(DEFAULT_SETTINGS) as SettingKey[];

export async function getSettings(campaignId: string): Promise<CampaignSettings> {
  const c = await getCampaign(campaignId);
  return { standingsVisible: c?.options.standingsVisible ?? DEFAULT_SETTINGS.standingsVisible };
}

/** Set one switch of a campaign's. The admin alone. */
export async function setSetting<K extends SettingKey>(actor: Actor, campaignId: string, key: K, value: CampaignSettings[K]): Promise<CampaignSettings> {
  if (!isAdmin(actor)) throw new LedgerError('That is for the admin alone.', 403);
  if (!SETTING_KEYS.includes(key)) throw new LedgerError('No such switch.', 404);
  if (!(await getCampaign(campaignId))) throw new LedgerError('No such campaign.', 404);
  await db().update(campaigns).set({ options: sql`${campaigns.options} || ${JSON.stringify({ [key]: value })}::jsonb`, updatedAt: new Date(), version: sql`${campaigns.version} + 1` }).where(eq(campaigns.id, campaignId));
  invalidateCampaigns();
  return getSettings(campaignId);
}
