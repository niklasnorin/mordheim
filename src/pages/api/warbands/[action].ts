/**
 * Warbands and warriors: a player tends their own, a game master any. Every answer carries the warband as it now
 * stands, so the page can re-render from it or simply reload.
 */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { dispatch, route } from '../../../server/api';
import { addChapter, IMAGE_TYPES, moveChapter, removeChapter, updateChapter, uploadImage } from '../../../server/campaign/chapters';
import { addMember, assignWarband, claimWarband, createWarband, deleteWarband, releaseWarband, removeMember, reorderMembers, updateMember, updateWarband } from '../../../server/campaign/roster';

export const prerender = false;

const id = z.string().min(1).max(64);
const stat = z.number().int().min(0).max(10);
const stats = z.object({ M: stat, WS: stat, BS: stat, S: stat, T: stat, W: stat, I: stat, A: stat, Ld: stat }).partial();
const lines = z.array(z.string().max(200)).max(30);
const death = z.object({ date: z.string().max(80).optional(), epitaph: z.string().max(200).optional(), order: z.number().int().optional() }).nullable();
const memberFields = {
  name: z.string().max(80), role: z.string().max(60), rank: z.enum(['hero', 'henchman']), epithet: z.string().max(120), stats, experience: z.number().int().min(0).max(999).nullable(),
  skills: lines, injuries: lines, lore: z.string().max(4000), dead: z.boolean(), death,
};
const block = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('text'), text: z.string().max(20000) }),
  z.object({ kind: z.literal('image'), imageId: z.uuid(), align: z.enum(['left', 'centre', 'right']), size: z.number().min(0).max(5000), unit: z.enum(['%', 'px']), caption: z.string().max(300) }),
]);
const chapterFields = { title: z.string().max(120), blocks: z.array(block).max(60) };
const chapterId = z.number().int().positive();
const warbandFields = { name: z.string().max(80), type: z.string().max(60), sigil: z.string().max(3), lore: z.string().max(4000), player: z.string().max(40), crest: z.string().max(120) };

const routes = {
  create: route(z.object({ ...warbandFields }).partial().required({ name: true, type: true }), (i, a) => createWarband(a, i).then((warband) => ({ warband }))),
  update: route(z.object({ warbandId: id, patch: z.object(warbandFields).partial() }), (i, a) => updateWarband(a, i.warbandId, i.patch).then((warband) => ({ warband }))),
  claim: route(z.object({ warbandId: id }), (i, a) => claimWarband(a, i.warbandId).then((warband) => ({ warband }))),
  release: route(z.object({ warbandId: id }), (i, a) => releaseWarband(a, i.warbandId).then(() => ({ ok: true }))),
  assign: route(z.object({ warbandId: id, userId: z.string().max(128).nullable() }), (i, a) => assignWarband(a, i.warbandId, i.userId).then((warband) => ({ warband })), 'gm'),
  delete: route(z.object({ warbandId: id }), (i, a) => deleteWarband(a, i.warbandId).then(() => ({ ok: true })), 'gm'),
  'add-member': route(z.object({ warbandId: id, member: z.object(memberFields).partial().required({ name: true }) }), (i, a) => addMember(a, i.warbandId, i.member).then((warband) => ({ warband }))),
  'update-member': route(z.object({ memberId: id, patch: z.object(memberFields).partial() }), (i, a) => updateMember(a, i.memberId, i.patch).then((warband) => ({ warband }))),
  'remove-member': route(z.object({ memberId: id }), (i, a) => removeMember(a, i.memberId).then((warband) => ({ warband }))),
  'add-chapter': route(z.object({ warbandId: id, chapter: z.object(chapterFields) }), (i, a) => addChapter(a, i.warbandId, i.chapter).then((chapters) => ({ chapters }))),
  'update-chapter': route(z.object({ chapterId, chapter: z.object(chapterFields).partial() }), (i, a) => updateChapter(a, i.chapterId, i.chapter).then((chapters) => ({ chapters }))),
  'remove-chapter': route(z.object({ chapterId }), (i, a) => removeChapter(a, i.chapterId).then((chapters) => ({ chapters }))),
  'move-chapter': route(z.object({ chapterId, by: z.union([z.literal(-1), z.literal(1)]) }), (i, a) => moveChapter(a, i.chapterId, i.by).then((chapters) => ({ chapters }))),
  // base64 of a picture the browser has already shrunk; the service caps the decoded size
  'upload-image': route(z.object({ warbandId: id, mime: z.enum(IMAGE_TYPES), data: z.string().min(1).max(3_500_000) }), (i, a) => uploadImage(a, i.warbandId, i.mime, i.data)),
  reorder: route(z.object({ warbandId: id, order: z.array(id).max(60) }), (i, a) => reorderMembers(a, i.warbandId, i.order).then((warband) => ({ warband }))),
};

export const POST: APIRoute = ({ request, params }) => dispatch(routes, params.action, request, 'warbands');
