/**
 * A warrior's portrait, uploaded and framed by the warband's keeper (or a game master).
 *
 * Two pictures are kept for it, both in `images` against the member: the picture as it was brought (shrunk by the
 * browser), so it can be framed again, and the portrait the browser framed from it at `PORTRAIT_SIZE`, which is what
 * every page shows. The framing itself is kept on the member as a crop (`campaign/portrait.ts`). The picture to frame
 * goes up first; a picture never framed is swept a day later, and the old pair goes as soon as a new one is kept.
 */
import { and, eq, inArray, lt, notInArray, or } from 'drizzle-orm';
import { db } from '../db/client.ts';
import { images, members } from '../db/schema.ts';
import { getWarband, LedgerError, mayTend, touch } from './roster.ts';
import { IMAGE_MAX_BYTES, looksLike, type ImageType } from './chapters.ts';
import { normaliseCrop, type PortraitCrop } from '../../campaign/portrait.ts';
import type { Warband } from '../../campaign/model.ts';
import type { Actor } from '../roles.ts';

/** The largest framed portrait kept. At 600 by 800 a portrait is a tenth of this. */
export const PORTRAIT_MAX_BYTES = 800_000;

type MemberRow = typeof members.$inferSelect;

async function memberRow(id: string): Promise<MemberRow> {
  const rows = await db().select().from(members).where(eq(members.id, id)).limit(1);
  if (!rows.length) throw new LedgerError('No such warrior is on the roster.', 404);
  return rows[0];
}

function bytesOf(mime: ImageType, base64: string, max: number): Buffer {
  const bytes = Buffer.from(base64, 'base64');
  if (!bytes.length) throw new LedgerError('That picture came through empty. Try again.');
  if (bytes.length > max) throw new LedgerError('That picture is too large, even shrunk. Try a smaller one.', 413);
  if (!looksLike(mime, bytes)) throw new LedgerError('That file is not a picture the page can show. Use a JPEG, PNG, WebP or GIF.', 415);
  return bytes;
}

/** Forget the member's pictures other than `keep`: those named in `drop` now, any other once it is a day old. */
async function sweep(memberId: string, keep: (string | null)[], drop: (string | null)[] = []): Promise<void> {
  const kept = keep.filter((x): x is string => !!x), dropped = drop.filter((x): x is string => !!x && !kept.includes(x));
  const stale = lt(images.createdAt, new Date(Date.now() - 24 * 60 * 60 * 1000));
  const where = [eq(images.memberId, memberId), dropped.length ? or(inArray(images.id, dropped), stale)! : stale];
  if (kept.length) where.push(notInArray(images.id, kept));
  await db().delete(images).where(and(...where));
}

/** Keep the picture a portrait is to be framed from. Answers with its id; the framing editor loads it from `/images/<id>`. */
export async function uploadPortraitSource(actor: Actor, memberId: string, mime: ImageType, base64: string): Promise<{ id: string }> {
  const m = await memberRow(memberId);
  await mayTend(actor, m.warbandId);
  const bytes = bytesOf(mime, base64, IMAGE_MAX_BYTES);
  const id = crypto.randomUUID();
  await db().insert(images).values({ id, memberId, mime, data: bytes.toString('base64'), bytes: bytes.length, uploadedBy: actor.id });
  await sweep(memberId, [id, m.portraitImage, m.portraitSource]);
  return { id };
}

export interface PortraitInput { sourceId: string; crop: PortraitCrop; mime: ImageType; data: string }

/** Give the warrior the portrait framed from one of their pictures. The one they had before, and its picture, go. */
export async function setPortrait(actor: Actor, memberId: string, input: PortraitInput): Promise<Warband> {
  const m = await memberRow(memberId);
  await mayTend(actor, m.warbandId);
  const crop = normaliseCrop(input.crop);
  if (!crop) throw new LedgerError('That framing does not fit the picture. Frame it again.');
  const source = await db().select({ id: images.id }).from(images).where(and(eq(images.id, input.sourceId), eq(images.memberId, memberId))).limit(1);
  if (!source.length) throw new LedgerError('The picture to frame is no longer kept. Choose it again.', 409);
  const bytes = bytesOf(input.mime, input.data, PORTRAIT_MAX_BYTES);
  const image = crypto.randomUUID();
  await db().insert(images).values({ id: image, memberId, mime: input.mime, data: bytes.toString('base64'), bytes: bytes.length, uploadedBy: actor.id });
  await db().update(members).set({ portraitImage: image, portraitSource: input.sourceId, portraitCrop: crop, updatedAt: new Date() }).where(eq(members.id, memberId));
  await sweep(memberId, [image, input.sourceId], [m.portraitImage, m.portraitSource]);
  await touch(m.warbandId);
  return (await getWarband(m.warbandId))!;
}

/** Take the warrior's portrait down, and every picture kept for it. */
export async function removePortrait(actor: Actor, memberId: string): Promise<Warband> {
  const m = await memberRow(memberId);
  await mayTend(actor, m.warbandId);
  await db().update(members).set({ portraitImage: null, portraitSource: null, portraitCrop: null, updatedAt: new Date() }).where(eq(members.id, memberId));
  await db().delete(images).where(eq(images.memberId, memberId));
  await touch(m.warbandId);
  return (await getWarband(m.warbandId))!;
}
