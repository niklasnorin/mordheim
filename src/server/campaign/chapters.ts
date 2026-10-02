/**
 * A warband's own story, chapter by chapter, and the pictures in it.
 *
 * The keeper (or a game master) writes the chapters on the warband's page: prose and pictures in order, each
 * picture placed left, right or in the middle at a width of their choosing. Pictures are uploaded first, already
 * shrunk by the browser, kept in the database as base64 and served at `/images/<id>`. A picture no chapter shows
 * any more is swept a day after its upload, so an abandoned draft does not keep its pictures for ever.
 */
import { and, asc, eq, inArray, lt, notInArray } from 'drizzle-orm';
import { db } from '../db/client.ts';
import { images, warbandChapters } from '../db/schema.ts';
import { LedgerError, mayTend } from './roster.ts';
import { normaliseBlocks, type ChapterBlock, type StoryChapter } from '../../campaign/model.ts';
import type { Actor } from '../roles.ts';

type ChapterRow = typeof warbandChapters.$inferSelect;
const chapterOf = (r: ChapterRow): StoryChapter => ({
  id: r.id, warbandId: r.warbandId, title: r.title, blocks: (r.blocks as ChapterBlock[]) ?? [], sort: r.sort, authorName: r.authorName, createdAt: r.createdAt, updatedAt: r.updatedAt,
});

/** The warband's chapters in the order the story tells them. */
export async function listChapters(warbandId: string): Promise<StoryChapter[]> {
  const rows = await db().select().from(warbandChapters).where(eq(warbandChapters.warbandId, warbandId)).orderBy(asc(warbandChapters.sort), asc(warbandChapters.id));
  return rows.map(chapterOf);
}

async function chapterRow(id: number): Promise<ChapterRow> {
  const rows = await db().select().from(warbandChapters).where(eq(warbandChapters.id, id)).limit(1);
  if (!rows.length) throw new LedgerError('No such chapter is in their story.', 404);
  return rows[0];
}

export interface ChapterInput { title: string; blocks: ChapterBlock[] }

/** The chapter as it may be kept: a title of reasonable length, and something in it, every picture one of theirs. */
async function checked(warbandId: string, input: Partial<ChapterInput>, before?: ChapterRow): Promise<{ title: string; blocks: ChapterBlock[] }> {
  const title = (input.title ?? before?.title ?? '').trim().slice(0, 120);
  const blocks = input.blocks ? normaliseBlocks(input.blocks) : ((before?.blocks as ChapterBlock[]) ?? []);
  if (!blocks.length) throw new LedgerError('A chapter needs some words or a picture.');
  const ids = [...new Set(blocks.flatMap((b) => (b.kind === 'image' ? [b.imageId] : [])))];
  if (ids.length) {
    const found = await db().select({ id: images.id }).from(images).where(and(eq(images.warbandId, warbandId), inArray(images.id, ids)));
    if (found.length !== ids.length) throw new LedgerError('A picture in that chapter is not one of theirs. Upload it again.', 400);
  }
  return { title, blocks };
}

/** A new chapter at the end of the story. */
export async function addChapter(actor: Actor, warbandId: string, input: ChapterInput): Promise<StoryChapter[]> {
  await mayTend(actor, warbandId);
  const { title, blocks } = await checked(warbandId, input);
  const last = await listChapters(warbandId);
  await db().insert(warbandChapters).values({ warbandId, title, blocks, sort: (last.at(-1)?.sort ?? 0) + 1, authorId: actor.id, authorName: actor.name });
  await sweepImages(warbandId);
  return listChapters(warbandId);
}

export async function updateChapter(actor: Actor, chapterId: number, patch: Partial<ChapterInput>): Promise<StoryChapter[]> {
  const row = await chapterRow(chapterId);
  await mayTend(actor, row.warbandId);
  const { title, blocks } = await checked(row.warbandId, patch, row);
  await db().update(warbandChapters).set({ title, blocks, updatedAt: new Date() }).where(eq(warbandChapters.id, chapterId));
  await sweepImages(row.warbandId);
  return listChapters(row.warbandId);
}

export async function removeChapter(actor: Actor, chapterId: number): Promise<StoryChapter[]> {
  const row = await chapterRow(chapterId);
  await mayTend(actor, row.warbandId);
  await db().delete(warbandChapters).where(eq(warbandChapters.id, chapterId));
  await sweepImages(row.warbandId);
  return listChapters(row.warbandId);
}

/** Move a chapter one place earlier (-1) or later (1) in the story. */
export async function moveChapter(actor: Actor, chapterId: number, by: -1 | 1): Promise<StoryChapter[]> {
  const row = await chapterRow(chapterId);
  await mayTend(actor, row.warbandId);
  const list = await listChapters(row.warbandId);
  const at = list.findIndex((c) => c.id === chapterId), to = at + by;
  if (to < 0 || to >= list.length) return list;
  [list[at], list[to]] = [list[to], list[at]];
  for (const [i, c] of list.entries()) if (c.sort !== i + 1) await db().update(warbandChapters).set({ sort: i + 1 }).where(eq(warbandChapters.id, c.id));
  return listChapters(row.warbandId);
}

// ───────────────────────── the pictures ─────────────────────────

export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;
export type ImageType = (typeof IMAGE_TYPES)[number];
/** The largest picture kept, after the browser has shrunk it. */
export const IMAGE_MAX_BYTES = 2_500_000;

/** Whether the bytes are what the upload says they are, by their first few. SVG is never taken: it can carry script. */
export function looksLike(mime: ImageType, bytes: Uint8Array): boolean {
  const starts = (...b: number[]) => b.every((v, i) => bytes[i] === v);
  const ascii = (at: number, s: string) => [...s].every((c, i) => bytes[at + i] === c.charCodeAt(0));
  if (mime === 'image/jpeg') return starts(0xff, 0xd8, 0xff);
  if (mime === 'image/png') return starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
  if (mime === 'image/gif') return ascii(0, 'GIF87a') || ascii(0, 'GIF89a');
  return ascii(0, 'RIFF') && ascii(8, 'WEBP');
}

/** Keep a picture for one of the warband's chapters. Answers with its id; the page shows it at `/images/<id>`. */
export async function uploadImage(actor: Actor, warbandId: string, mime: ImageType, base64: string): Promise<{ id: string }> {
  await mayTend(actor, warbandId);
  const bytes = Buffer.from(base64, 'base64');
  if (!bytes.length) throw new LedgerError('That picture came through empty. Try again.');
  if (bytes.length > IMAGE_MAX_BYTES) throw new LedgerError('That picture is too large, even shrunk. Try a smaller one.', 413);
  if (!looksLike(mime, bytes)) throw new LedgerError('That file is not a picture the page can show. Use a JPEG, PNG, WebP or GIF.', 415);
  const id = crypto.randomUUID();
  await db().insert(images).values({ id, warbandId, mime, data: bytes.toString('base64'), bytes: bytes.length, uploadedBy: actor.id });
  return { id };
}

/** A picture as it is served. Anyone may look; the id is the key. */
export async function getImage(id: string): Promise<{ mime: string; bytes: Buffer } | undefined> {
  const rows = await db().select({ mime: images.mime, data: images.data }).from(images).where(eq(images.id, id)).limit(1);
  return rows.length ? { mime: rows[0].mime, bytes: Buffer.from(rows[0].data, 'base64') } : undefined;
}

/** Forget the warband's pictures no chapter shows, once they are a day old: an upload is given that long to be used. */
async function sweepImages(warbandId: string): Promise<void> {
  const shown = [...new Set((await listChapters(warbandId)).flatMap((c) => c.blocks.flatMap((b) => (b.kind === 'image' ? [b.imageId] : []))))];
  const stale = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const where = [eq(images.warbandId, warbandId), lt(images.createdAt, stale)];
  if (shown.length) where.push(notInArray(images.id, shown));
  await db().delete(images).where(and(...where));
}
