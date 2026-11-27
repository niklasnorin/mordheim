/**
 * Who may change a campaign's record, by the campaign's status. While a campaign is live, everyone writes what their
 * role lets them write, as before there were campaigns. A draft is the game masters' sketch: only they write in it.
 * A finished or archived campaign is closed to its players; game masters may still put the record straight.
 */
import { eq } from 'drizzle-orm';
import { db } from '../db/client.ts';
import { scenarios, warbands } from '../db/schema.ts';
import { LedgerError } from '../../curfew/ledger.ts';
import { isFrozen, playersMayWrite, type CampaignConfig } from '../../campaign/campaign.ts';
import { isGm, type Actor } from '../roles.ts';
import { getCampaign } from './campaigns.ts';

/** Refuse unless the actor may write in a campaign of this status. */
export function mayWriteIn(actor: Actor | null, campaign: Pick<CampaignConfig, 'status'>): void {
  if (isGm(actor) || playersMayWrite(campaign.status)) return;
  if (isFrozen(campaign.status)) throw new LedgerError('The campaign is over; its record is closed.', 409);
  throw new LedgerError('This campaign is still being sketched; only a game master writes in it.', 403);
}

/** The campaign, by id, refusing a writer who may not write in it. */
export async function writableCampaign(actor: Actor | null, campaignId: string): Promise<CampaignConfig> {
  const c = await getCampaign(campaignId);
  if (!c) throw new LedgerError('No such campaign.', 404);
  mayWriteIn(actor, c);
  return c;
}

/** The campaign a warband belongs to. */
export async function campaignOfWarband(warbandId: string): Promise<string> {
  const [r] = await db().select({ c: warbands.campaignId }).from(warbands).where(eq(warbands.id, warbandId)).limit(1);
  if (!r) throw new LedgerError('No such warband has entered the gates.', 404);
  return r.c;
}

/** The campaign a scenario belongs to. */
export async function campaignOfScenario(scenarioId: string): Promise<string> {
  const [r] = await db().select({ c: scenarios.campaignId }).from(scenarios).where(eq(scenarios.id, scenarioId)).limit(1);
  if (!r) throw new LedgerError('No such scenario.', 404);
  return r.c;
}
