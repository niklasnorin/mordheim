/**
 * The campaign's switches. Each is a row with a default when unset; only the admin changes them, from the Watch
 * House. Today there is one: whether the standings are shown. A campaign keeps its tally to itself until the admin
 * says otherwise, so the table of battles and victories is hidden by default.
 */
import { db } from '../db/client.ts';
import { campaignSettings } from '../db/schema.ts';
import { LedgerError } from '../../curfew/ledger.ts';
import { isAdmin, type Actor } from '../roles.ts';

export interface CampaignSettings {
  /** Whether the home page prints the standings table: who has fought and who has won. */
  standingsVisible: boolean;
}
export const DEFAULT_SETTINGS: CampaignSettings = { standingsVisible: false };
export type SettingKey = keyof CampaignSettings;
export const SETTING_KEYS = Object.keys(DEFAULT_SETTINGS) as SettingKey[];

export async function getSettings(): Promise<CampaignSettings> {
  const rows = await db().select().from(campaignSettings);
  const out: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  for (const r of rows) if ((SETTING_KEYS as string[]).includes(r.key) && typeof r.value === typeof DEFAULT_SETTINGS[r.key as SettingKey]) out[r.key] = r.value;
  return out as unknown as CampaignSettings;
}

/** Set one switch. The admin alone. */
export async function setSetting<K extends SettingKey>(actor: Actor, key: K, value: CampaignSettings[K]): Promise<CampaignSettings> {
  if (!isAdmin(actor)) throw new LedgerError('That is for the admin alone.', 403);
  if (!SETTING_KEYS.includes(key)) throw new LedgerError('No such switch.', 404);
  await db().insert(campaignSettings).values({ key, value }).onConflictDoUpdate({ target: campaignSettings.key, set: { value, updatedAt: new Date() } });
  return getSettings();
}
