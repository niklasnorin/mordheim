/**
 * The Town Cryer's articles and notices, written by game masters. Each carries the place it prints in; the
 * broadsheet shows the published ones for where the campaign is, newest at the top. Each belongs to one campaign.
 * Voice: docs/agents/writing.md §2.
 */
import { asc, desc, eq } from 'drizzle-orm';
import { db } from '../db/client.ts';
import { newsArticles } from '../db/schema.ts';
import { LedgerError } from '../../curfew/ledger.ts';
import type { NewsArticle } from '../../campaign/model.ts';
import { proseSource } from '../../campaign/prose.ts';
import { worldFor } from '../content/curfew.ts';
import { isGm, type Actor } from '../roles.ts';
import { ensureSeeded } from './seed.ts';

const clean = (s: string | undefined | null, max: number) => (s ?? '').trim().slice(0, max);

function articleOf(r: typeof newsArticles.$inferSelect): NewsArticle {
  return { id: r.id, headline: r.headline, byline: r.byline, body: r.body, notice: r.notice, locationId: r.locationId, published: r.published, sort: r.sort };
}

/** Every article, the broadsheet's order: lowest sort first, then newest first. */
export async function listArticles(campaignId: string): Promise<NewsArticle[]> {
  await ensureSeeded();
  const rows = await db().select().from(newsArticles).where(eq(newsArticles.campaignId, campaignId)).orderBy(asc(newsArticles.sort), desc(newsArticles.id));
  return rows.map(articleOf);
}

/** What a campaign's broadsheet prints at a place. */
export async function articlesFor(campaignId: string, locationId: string): Promise<NewsArticle[]> {
  return (await listArticles(campaignId)).filter((a) => a.published && a.locationId === locationId);
}

export interface ArticleInput { headline: string; byline?: string; body: string; notice?: boolean; locationId?: string; published?: boolean; sort?: number }

function checked(places: string[], input: Partial<ArticleInput>, previous?: NewsArticle): Omit<typeof newsArticles.$inferInsert, 'campaignId'> {
  const headline = clean(input.headline ?? previous?.headline, 200), body = proseSource(input.body ?? previous?.body, 4000);
  if (!headline) throw new LedgerError('The article needs a headline.');
  if (!body) throw new LedgerError('The article needs a body.');
  const locationId = input.locationId ?? previous?.locationId ?? 'mordheim';
  if (!places.includes(locationId)) throw new LedgerError('No such place is on the map.');
  return {
    headline, body, byline: clean(input.byline ?? previous?.byline, 200), notice: input.notice ?? previous?.notice ?? false, locationId,
    published: input.published ?? previous?.published ?? true, sort: input.sort ?? previous?.sort ?? 0, updatedAt: new Date(),
  };
}

/** The places a campaign's broadsheet may print in: the places of its Curfew content. */
async function placesOf(campaignId: string): Promise<string[]> { return (await worldFor(campaignId)).engine.LOCATIONS.map((l) => l.id); }

export async function createArticle(actor: Actor, campaignId: string, input: ArticleInput): Promise<NewsArticle> {
  if (!isGm(actor)) throw new LedgerError('Only a game master writes for the Cryer.', 403);
  await ensureSeeded();
  const [row] = await db().insert(newsArticles).values({ campaignId, ...checked(await placesOf(campaignId), input) }).returning();
  return articleOf(row);
}

export async function updateArticle(actor: Actor, id: number, patch: Partial<ArticleInput>): Promise<NewsArticle> {
  if (!isGm(actor)) throw new LedgerError('Only a game master writes for the Cryer.', 403);
  const rows = await db().select().from(newsArticles).where(eq(newsArticles.id, id)).limit(1);
  if (!rows.length) throw new LedgerError('That article is not in the Cryer.', 404);
  const [row] = await db().update(newsArticles).set(checked(await placesOf(rows[0].campaignId), patch, articleOf(rows[0]))).where(eq(newsArticles.id, id)).returning();
  return articleOf(row);
}

export async function deleteArticle(actor: Actor, id: number): Promise<void> {
  if (!isGm(actor)) throw new LedgerError('Only a game master writes for the Cryer.', 403);
  const deleted = await db().delete(newsArticles).where(eq(newsArticles.id, id)).returning({ id: newsArticles.id });
  if (!deleted.length) throw new LedgerError('That article is not in the Cryer.', 404);
}
