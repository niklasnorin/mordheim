/**
 * The Curfew's content in the database: one JSON document per deck and per place, edited by game masters in the
 * Watch House. `primeContent` puts what is stored in force for the engine before anything is resolved or rendered;
 * the built-in files are the seed when the table is empty and the fallback for a document that is missing.
 */
import { desc, eq, sql } from 'drizzle-orm';
import { db } from '../db/client.ts';
import { curfewContent, curfewContentRevisions } from '../db/schema.ts';
import { BUILT_IN_DOCUMENTS, MOONS, useContent } from '../../curfew/engine.ts';
import { builtInRows, documentsFrom, isLocationDoc, validateDocument, type DocumentId } from '../../curfew/packs.ts';
import { LedgerError } from '../../curfew/ledger.ts';
import { isGm, type Actor } from '../roles.ts';

export interface ContentDocument { id: string; document: unknown; version: number; updatedAt: Date; updatedBy: string | null; bytes: number }

let seeded: Promise<void> | undefined;
let primedAt = 0;
/** How long the content in force is trusted before the database is asked again. Saving from the Watch House resets it. */
const PRIME_TTL_MS = 20_000;

/** Write the built-in documents if the table is empty. */
async function ensureContentSeeded(): Promise<void> {
  seeded ??= (async () => {
    const [{ n }] = await db().select({ n: sql<number>`count(*)::int` }).from(curfewContent);
    if (n > 0) return;
    for (const r of builtInRows(BUILT_IN_DOCUMENTS)) await db().insert(curfewContent).values({ id: r.id, document: r.document }).onConflictDoNothing();
  })().catch((e) => { seeded = undefined; throw e; });
  return seeded;
}
export function forgetContentSeeded(): void { seeded = undefined; primedAt = 0; }

/** Put the stored content in force for the engine. Cheap to call often; the database is read at most every few seconds. */
export async function primeContent(force = false): Promise<void> {
  if (!force && Date.now() - primedAt < PRIME_TTL_MS) return;
  await ensureContentSeeded();
  const rows = await db().select({ id: curfewContent.id, document: curfewContent.document }).from(curfewContent);
  useContent(documentsFrom(rows));
  primedAt = Date.now();
}

export async function listDocuments(): Promise<ContentDocument[]> {
  await ensureContentSeeded();
  const rows = await db().select().from(curfewContent).orderBy(curfewContent.id);
  return rows.map((r) => ({ id: r.id, document: r.document, version: r.version, updatedAt: r.updatedAt, updatedBy: r.updatedBy, bytes: JSON.stringify(r.document).length }));
}

export async function getDocument(id: string): Promise<ContentDocument | undefined> {
  return (await listDocuments()).find((d) => d.id === id);
}

export async function documentRevisions(id: string, limit = 10): Promise<{ id: number; version: number; savedAt: Date; savedBy: string | null; document: unknown }[]> {
  const rows = await db().select().from(curfewContentRevisions).where(eq(curfewContentRevisions.contentId, id)).orderBy(desc(curfewContentRevisions.id)).limit(limit);
  return rows.map((r) => ({ id: r.id, version: r.version, savedAt: r.savedAt, savedBy: r.savedBy, document: r.document }));
}

/**
 * Save a document. The JSON is parsed and checked against the pack rules first; a refusal names every problem. The
 * version must be the one read, so two game masters cannot overwrite each other. The earlier version is kept.
 */
export async function saveDocument(actor: Actor, id: string, text: string, version: number | null): Promise<ContentDocument> {
  if (!isGm(actor)) throw new LedgerError('Only a game master edits the Curfew’s content.', 403);
  if (text.length > 2_000_000) throw new LedgerError('The document is too large.');
  let doc: unknown;
  try { doc = JSON.parse(text); } catch (e) { throw new LedgerError(`Not valid JSON: ${(e as Error).message}`); }
  await primeContent(true);
  const known = await listDocuments();
  const locationIds = known.filter((d) => isLocationDoc(d.id)).map((d) => d.id.slice('location:'.length));
  const newLocation = isLocationDoc(id) ? id.slice('location:'.length) : undefined;
  const errors = validateDocument(id, doc, { moonIds: MOONS.map((m) => m.id), locationIds: newLocation && !locationIds.includes(newLocation) ? [...locationIds, newLocation] : locationIds });
  if (errors.length) throw new LedgerError(`The document was refused:\n${errors.slice(0, 12).join('\n')}${errors.length > 12 ? `\n…and ${errors.length - 12} more` : ''}`, 422);
  const d = db();
  const existing = known.find((k) => k.id === id);
  if (existing) {
    if (version !== null && version !== existing.version) throw new LedgerError('Somebody saved this document while you were editing it. Reload and try again.', 409);
    await d.insert(curfewContentRevisions).values({ contentId: id, document: existing.document, version: existing.version, savedBy: existing.updatedBy });
    await d.update(curfewContent).set({ document: doc, version: existing.version + 1, updatedBy: actor.name, updatedAt: new Date() }).where(eq(curfewContent.id, id));
  } else {
    if (!isLocationDoc(id)) throw new LedgerError('Only a new place may be added; the decks already exist.', 404);
    await d.insert(curfewContent).values({ id, document: doc, updatedBy: actor.name });
  }
  await primeContent(true);
  return (await getDocument(id))!;
}

/** Remove a place. Mordheim stays; a place the campaign is in stays. */
export async function deleteDocument(actor: Actor, id: string, currentLocationId: string): Promise<void> {
  if (!isGm(actor)) throw new LedgerError('Only a game master edits the Curfew’s content.', 403);
  if (!isLocationDoc(id)) throw new LedgerError('The decks cannot be removed.', 409);
  const loc = id.slice('location:'.length);
  if (loc === 'mordheim') throw new LedgerError('Mordheim is where every unknown night is read; it stays.', 409);
  if (loc === currentLocationId) throw new LedgerError('The campaign is there now. Move it first.', 409);
  const existing = await getDocument(id);
  if (!existing) throw new LedgerError('No such document.', 404);
  await db().insert(curfewContentRevisions).values({ contentId: id, document: existing.document, version: existing.version, savedBy: existing.updatedBy });
  await db().delete(curfewContent).where(eq(curfewContent.id, id));
  await primeContent(true);
}

export type { DocumentId };
