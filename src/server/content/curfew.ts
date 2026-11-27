/**
 * The Curfew's content in the database: one JSON document per deck and per place for each campaign, edited by game
 * masters in the Watch House. `worldFor` builds a campaign's engine, ledger and Cryer from what is stored before
 * anything of it is resolved or rendered; one process serves several campaigns, so each has its own and nothing is
 * shared. The built-in files are the seed of a campaign with no documents and the fallback for one that is missing.
 */
import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '../db/client.ts';
import { curfewContent, curfewContentRevisions, FIRST_CAMPAIGN_ID } from '../db/schema.ts';
import { ensureCampaigns, getCampaign } from '../campaign/campaigns.ts';
import { BUILT_IN_DOCUMENTS, createEngine, documentsWith, type CurfewDocuments, type Engine } from '../../curfew/engine.ts';
import { createLedger, LedgerError, type Ledger } from '../../curfew/ledger.ts';
import { createCryer, type Cryer } from '../../curfew/cryer.ts';
import { createOdds, type Odds } from '../../curfew/odds.ts';
import { builtInRows, clientDocuments, documentsFrom, isLocationDoc, validateDocument, type DocumentId } from '../../curfew/packs.ts';
import { DEFAULT_CAMPAIGN, type CampaignConfig } from '../../campaign/campaign.ts';
import { settingFor } from '../../data/settings/index.ts';
import { isGm, type Actor } from '../roles.ts';

export interface ContentDocument { id: string; document: unknown; version: number; updatedAt: Date; updatedBy: string | null; bytes: number }

/** One campaign's rules in force: its engine, ledger, Cryer and odds, built from its documents. */
export interface CampaignWorld {
  campaign: CampaignConfig;
  content: CurfewDocuments;
  engine: Engine;
  ledger: Ledger;
  cryer: Cryer;
  odds: Odds;
}

/** What a campaign's Curfew pages hand their scripts: the campaign and its content, slimmed (`useWorld` in the browser). */
export function clientWorld(w: CampaignWorld): { campaign: CampaignConfig; content: CurfewDocuments } {
  return { campaign: w.campaign, content: clientDocuments(w.content) };
}

const seeded = new Map<string, Promise<void>>();
const worlds = new Map<string, { at: number; key: string; world: CampaignWorld }>();
/** How long a campaign's content is trusted before the database is asked again. Saving from the Watch House resets it. */
const PRIME_TTL_MS = 20_000;

/** The documents a campaign starts with when it has none: its setting's, else the built-in set. */
export function seedDocuments(campaign: CampaignConfig): CurfewDocuments {
  return settingFor(campaign.setting)?.documents ?? BUILT_IN_DOCUMENTS;
}

/** Write a campaign's documents from its setting if it has none. The first campaign first takes what the site kept. */
async function ensureContentSeeded(campaignId: string): Promise<void> {
  let p = seeded.get(campaignId);
  if (!p) {
    p = (async () => {
      await ensureCampaigns();
      const [{ n }] = await db().select({ n: sql<number>`count(*)::int` }).from(curfewContent).where(eq(curfewContent.campaignId, campaignId));
      if (n > 0) return;
      const campaign = campaignId === FIRST_CAMPAIGN_ID ? DEFAULT_CAMPAIGN : await getCampaign(campaignId);
      if (!campaign) throw new LedgerError('No such campaign.', 404);
      for (const r of builtInRows(seedDocuments(campaign))) await db().insert(curfewContent).values({ campaignId, id: r.id, document: r.document }).onConflictDoNothing();
    })().catch((e) => { seeded.delete(campaignId); throw e; });
    seeded.set(campaignId, p);
  }
  return p;
}
export function forgetContentSeeded(): void { seeded.clear(); worlds.clear(); }
/** Build the campaign's world again on the next ask: after its documents or its row changed. */
export function invalidateWorld(campaignId?: string): void { if (campaignId) worlds.delete(campaignId); else worlds.clear(); }

/** A world from a campaign and its documents. Pure apart from the building. */
export function buildWorld(campaign: CampaignConfig, docs: Partial<CurfewDocuments>): CampaignWorld {
  const content = documentsWith(docs);
  const engine = createEngine({ campaign, content });
  const ledger = createLedger(engine);
  const cryer = createCryer(engine);
  return { campaign, content, engine, ledger, cryer, odds: createOdds({ engine, ledger, cryer }) };
}

/** A campaign's rules in force. Cheap to call often; the database is read at most every few seconds per campaign. */
export async function worldFor(campaign: string | CampaignConfig, force = false): Promise<CampaignWorld> {
  const id = typeof campaign === 'string' ? campaign : campaign.id;
  const cached = worlds.get(id);
  const config = typeof campaign === 'string' ? await getCampaign(id) : campaign;
  if (!config) throw new LedgerError('No such campaign.', 404);
  const key = JSON.stringify(config);
  if (!force && cached && Date.now() - cached.at < PRIME_TTL_MS && cached.key === key) return cached.world;
  await ensureContentSeeded(id);
  const rows = await db().select({ id: curfewContent.id, document: curfewContent.document }).from(curfewContent).where(eq(curfewContent.campaignId, id));
  const world = buildWorld(config, documentsFrom(rows));
  worlds.set(id, { at: Date.now(), key, world });
  return world;
}

export async function listDocuments(campaignId: string): Promise<ContentDocument[]> {
  await ensureContentSeeded(campaignId);
  const rows = await db().select().from(curfewContent).where(eq(curfewContent.campaignId, campaignId)).orderBy(curfewContent.id);
  return rows.map((r) => ({ id: r.id, document: r.document, version: r.version, updatedAt: r.updatedAt, updatedBy: r.updatedBy, bytes: JSON.stringify(r.document).length }));
}

export async function getDocument(campaignId: string, id: string): Promise<ContentDocument | undefined> {
  return (await listDocuments(campaignId)).find((d) => d.id === id);
}

export async function documentRevisions(campaignId: string, id: string, limit = 10): Promise<{ id: number; version: number; savedAt: Date; savedBy: string | null; document: unknown }[]> {
  const rows = await db().select().from(curfewContentRevisions).where(and(eq(curfewContentRevisions.campaignId, campaignId), eq(curfewContentRevisions.contentId, id))).orderBy(desc(curfewContentRevisions.id)).limit(limit);
  return rows.map((r) => ({ id: r.id, version: r.version, savedAt: r.savedAt, savedBy: r.savedBy, document: r.document }));
}

/**
 * Save a document of a campaign's. The JSON is parsed and checked against the pack rules first; a refusal names every
 * problem. The version must be the one read, so two game masters cannot overwrite each other. The earlier version is kept.
 */
export async function saveDocument(actor: Actor, campaignId: string, id: string, text: string, version: number | null): Promise<ContentDocument> {
  if (!isGm(actor)) throw new LedgerError('Only a game master edits the Curfew’s content.', 403);
  if (text.length > 2_000_000) throw new LedgerError('The document is too large.');
  let doc: unknown;
  try { doc = JSON.parse(text); } catch (e) { throw new LedgerError(`Not valid JSON: ${(e as Error).message}`); }
  const world = await worldFor(campaignId, true);
  const known = await listDocuments(campaignId);
  const locationIds = known.filter((d) => isLocationDoc(d.id)).map((d) => d.id.slice('location:'.length));
  const newLocation = isLocationDoc(id) ? id.slice('location:'.length) : undefined;
  const errors = validateDocument(id, doc, { moonIds: world.engine.MOONS.map((m) => m.id), locationIds: newLocation && !locationIds.includes(newLocation) ? [...locationIds, newLocation] : locationIds });
  if (errors.length) throw new LedgerError(`The document was refused:\n${errors.slice(0, 12).join('\n')}${errors.length > 12 ? `\n…and ${errors.length - 12} more` : ''}`, 422);
  const d = db();
  const existing = known.find((k) => k.id === id);
  if (existing) {
    if (version !== null && version !== existing.version) throw new LedgerError('Somebody saved this document while you were editing it. Reload and try again.', 409);
    await d.insert(curfewContentRevisions).values({ campaignId, contentId: id, document: existing.document, version: existing.version, savedBy: existing.updatedBy });
    await d.update(curfewContent).set({ document: doc, version: existing.version + 1, updatedBy: actor.name, updatedAt: new Date() }).where(and(eq(curfewContent.campaignId, campaignId), eq(curfewContent.id, id)));
  } else {
    if (!isLocationDoc(id)) throw new LedgerError('Only a new place may be added; the decks already exist.', 404);
    await d.insert(curfewContent).values({ campaignId, id, document: doc, updatedBy: actor.name });
  }
  invalidateWorld(campaignId);
  return (await getDocument(campaignId, id))!;
}

/** Remove a place from a campaign's content. Mordheim stays; a place the campaign is in stays. */
export async function deleteDocument(actor: Actor, campaignId: string, id: string, currentLocationId: string): Promise<void> {
  if (!isGm(actor)) throw new LedgerError('Only a game master edits the Curfew’s content.', 403);
  if (!isLocationDoc(id)) throw new LedgerError('The decks cannot be removed.', 409);
  const loc = id.slice('location:'.length);
  if (loc === 'mordheim') throw new LedgerError('Mordheim is where every unknown night is read; it stays.', 409);
  if (loc === currentLocationId) throw new LedgerError('The campaign is there now. Move it first.', 409);
  const existing = await getDocument(campaignId, id);
  if (!existing) throw new LedgerError('No such document.', 404);
  await db().insert(curfewContentRevisions).values({ campaignId, contentId: id, document: existing.document, version: existing.version, savedBy: existing.updatedBy });
  await db().delete(curfewContent).where(and(eq(curfewContent.campaignId, campaignId), eq(curfewContent.id, id)));
  invalidateWorld(campaignId);
}

/** Copy documents from one campaign to another: a pack improved in one is reused in the next. The earlier version is kept. */
export async function copyDocuments(actor: Actor, fromId: string, toId: string, ids: string[]): Promise<number> {
  if (!isGm(actor)) throw new LedgerError('Only a game master edits the Curfew’s content.', 403);
  if (fromId === toId) throw new LedgerError('That is the same campaign.');
  const from = await listDocuments(fromId);
  const to = await listDocuments(toId);
  let n = 0;
  for (const id of ids) {
    const doc = from.find((d) => d.id === id);
    if (!doc) continue;
    const there = to.find((d) => d.id === id);
    if (there) {
      await db().insert(curfewContentRevisions).values({ campaignId: toId, contentId: id, document: there.document, version: there.version, savedBy: there.updatedBy });
      await db().update(curfewContent).set({ document: doc.document, version: there.version + 1, updatedBy: actor.name, updatedAt: new Date() }).where(and(eq(curfewContent.campaignId, toId), eq(curfewContent.id, id)));
    } else {
      await db().insert(curfewContent).values({ campaignId: toId, id, document: doc.document, updatedBy: actor.name });
    }
    n++;
  }
  invalidateWorld(toId);
  return n;
}

export type { DocumentId };

/** A campaign's world for a page to read from, or its built-in one when the database cannot be asked. Never throws. */
export async function worldOrBuiltIn(campaign: CampaignConfig): Promise<CampaignWorld> {
  try { return await worldFor(campaign); } catch (e) { console.error('[curfew] content unavailable', e); return buildWorld(campaign, seedDocuments(campaign)); }
}
