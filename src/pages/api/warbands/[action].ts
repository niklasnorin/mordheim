/**
 * Warbands and warriors: a player tends their own, a game master any. Every answer carries the warband as it now
 * stands, so the page can re-render from it or simply reload.
 */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { dispatch, route } from '../../../server/api';
import { addChapter, IMAGE_TYPES, moveChapter, removeChapter, updateChapter, uploadImage } from '../../../server/campaign/chapters';
import { removePortrait, setPortrait, uploadPortraitSource } from '../../../server/campaign/portraits';
import { awardExperience, buyItem, changeRoster, drawUp, dropRoster, foundWarband, hire, income, keepViewFor, loseWarrior, moveGear, promote, recruit, sellItem, undoLast } from '../../../server/campaign/keep';
import type { Roster, Selection } from '../../../builder/evaluate';
import { addMember, assignWarband, claimWarband, createWarband, deleteWarband, releaseWarband, removeMember, reorderMembers, updateMember, updateWarband } from '../../../server/campaign/roster';

export const prerender = false;

const id = z.string().min(1).max(64);
const stat = z.number().int().min(0).max(10);
const stats = z.object({ M: stat, WS: stat, BS: stat, S: stat, T: stat, W: stat, I: stat, A: stat, Ld: stat }).partial();
const lines = z.array(z.string().max(200)).max(30);
const death = z.object({ date: z.string().max(80).optional(), epitaph: z.string().max(200).optional(), order: z.number().int().optional() }).nullable();
const memberFields = {
  name: z.string().max(80), role: z.string().max(60), rank: z.enum(['hero', 'henchman']), epithet: z.string().max(120), stats, experience: z.number().int().min(0).max(999).nullable(),
  skills: lines, equipment: lines, injuries: lines, lore: z.string().max(4000), dead: z.boolean(), death,
};
const block = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('text'), text: z.string().max(20000) }),
  z.object({ kind: z.literal('image'), imageId: z.uuid(), align: z.enum(['left', 'centre', 'right']), size: z.number().min(0).max(5000), unit: z.enum(['%', 'px']), caption: z.string().max(300) }),
]);
const chapterFields = { title: z.string().max(120), blocks: z.array(block).max(60) };
const chapterId = z.number().int().positive();
const crop = z.object({ x: z.number().min(-50).max(50), y: z.number().min(-50).max(50), w: z.number().positive().max(50), h: z.number().positive().max(50) });
const warbandFields = { name: z.string().max(80), type: z.string().max(60), sigil: z.string().max(3), lore: z.string().max(4000), player: z.string().max(40), crest: z.string().max(120) };

// a roster as the builder sends it; the service checks it against the catalogue
const selection: z.ZodType<Selection> = z.lazy(() => z.object({ id: z.string().min(1).max(40), entry: z.string().min(1).max(80), count: z.number().int().min(1).max(999), children: z.array(selection).max(200), members: z.array(z.string().max(64)).max(5).optional() }));
const roster: z.ZodType<Roster> = z.object({ catalogue: z.string().min(1).max(60), selections: z.array(selection).max(200) });
const names = z.record(z.string().max(40), z.array(z.string().max(80)).max(5));
const op = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('add'), parent: z.string().max(40).nullable(), entry: z.string().max(80), count: z.number().int().min(1).max(999).optional() }),
  z.object({ kind: z.literal('count'), id: z.string().max(40), count: z.number().int().min(1).max(999) }),
  z.object({ kind: z.literal('remove'), id: z.string().max(40) }),
  z.object({ kind: z.literal('move'), id: z.string().max(40), to: z.string().max(40).nullable(), entry: z.string().max(80) }),
]);
const kept = { warbandId: id, version: z.number().int().min(0) };

const routes = {
  // the warband builder: founding, drawing up a written roster, and keeping it between games
  found: route(z.object({ name: z.string().max(80), player: z.string().max(40).optional(), roster, names }), (i, a, _r, c) => foundWarband(a, c.id, i).then((warband) => ({ warband }))),
  keep: route(z.object({ warbandId: id }), (i, a) => keepViewFor(a, i.warbandId).then((keep) => ({ keep }))),
  'draw-up': route(z.object({ warbandId: id, roster, names: names.optional(), gold: z.number().int().min(0).max(100000), shards: z.number().int().min(0).max(999).optional() }), (i, a) => drawUp(a, i.warbandId, i).then((keep) => ({ keep }))),
  'roster-op': route(z.object({ ...kept, op, free: z.boolean().optional() }), (i, a) => changeRoster(a, i.warbandId, i.version, i.op, !!i.free).then((keep) => ({ keep }))),
  hire: route(z.object({ ...kept, entry: z.string().max(80), names: z.array(z.string().max(80)).max(5) }), (i, a) => hire(a, i.warbandId, i.version, i.entry, i.names).then((keep) => ({ keep }))),
  recruit: route(z.object({ ...kept, groupId: z.string().max(40), name: z.string().max(80) }), (i, a) => recruit(a, i.warbandId, i.version, i.groupId, i.name).then((keep) => ({ keep }))),
  'move-gear': route(z.object({ ...kept, itemId: z.string().max(40), to: z.string().max(40) }), (i, a) => moveGear(a, i.warbandId, i.version, i.itemId, i.to).then((keep) => ({ keep }))),
  sell: route(z.object({ ...kept, itemId: z.string().max(40), count: z.number().int().min(1).max(99) }), (i, a) => sellItem(a, i.warbandId, i.version, i.itemId, i.count).then((keep) => ({ keep }))),
  buy: route(z.object({ ...kept, itemId: z.string().max(64), count: z.number().int().min(1).max(20), price: z.number().int().min(0).max(100000) }), (i, a) => buyItem(a, i.warbandId, i.version, i.itemId, i.count, i.price).then((keep) => ({ keep }))),
  lose: route(z.object({ ...kept, memberId: id, scenarioId: z.string().max(64).nullable().optional() }), (i, a) => loseWarrior(a, i.warbandId, i.version, i.memberId, i.scenarioId ?? null).then((keep) => ({ keep }))),
  promote: route(z.object({ ...kept, memberId: id }), (i, a) => promote(a, i.warbandId, i.version, i.memberId).then((keep) => ({ keep }))),
  income: route(z.object({ ...kept, found: z.number().int().min(0).max(99).optional(), sold: z.number().int().min(0).max(99).optional(), gold: z.number().int().min(-100000).max(100000).optional(), text: z.string().max(200).optional(), scenarioId: z.string().max(64).nullable().optional() }), (i, a) => income(a, i.warbandId, i.version, i).then((keep) => ({ keep }))),
  award: route(z.object({ ...kept, scenarioId: z.string().max(64), awards: z.record(z.string().max(40), z.number().int().min(0).max(20)) }), (i, a) => awardExperience(a, i.warbandId, i.version, i.scenarioId, i.awards).then((keep) => ({ keep }))),
  undo: route(z.object({ warbandId: id }), (i, a) => undoLast(a, i.warbandId).then((keep) => ({ keep }))),
  'drop-roster': route(z.object({ warbandId: id }), (i, a) => dropRoster(a, i.warbandId).then((keep) => ({ keep })), 'gm'),

  create: route(z.object({ ...warbandFields }).partial().required({ name: true, type: true }), (i, a, _r, c) => createWarband(a, c.id, i).then((warband) => ({ warband }))),
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
  // a portrait: the picture to frame goes up first, then the portrait the browser framed from it, with the framing
  'portrait-source': route(z.object({ memberId: id, mime: z.enum(IMAGE_TYPES), data: z.string().min(1).max(3_500_000) }), (i, a) => uploadPortraitSource(a, i.memberId, i.mime, i.data)),
  portrait: route(z.object({ memberId: id, sourceId: z.uuid(), crop, mime: z.enum(IMAGE_TYPES), data: z.string().min(1).max(1_100_000) }), (i, a) => setPortrait(a, i.memberId, i).then((warband) => ({ warband }))),
  'remove-portrait': route(z.object({ memberId: id }), (i, a) => removePortrait(a, i.memberId).then((warband) => ({ warband }))),
  reorder: route(z.object({ warbandId: id, order: z.array(id).max(60) }), (i, a) => reorderMembers(a, i.warbandId, i.order).then((warband) => ({ warband }))),
};

export const POST: APIRoute = ({ request, params, locals }) => dispatch(routes, params.action, request, 'warbands', locals.campaign);
