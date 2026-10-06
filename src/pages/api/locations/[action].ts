/**
 * The campaign's locations: a game master founds and writes them up, gives them a map, pins their points of interest
 * and keeps their trading posts. Every answer carries the location as it now stands, so the page can reload from it.
 */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { dispatch, route } from '../../../server/api';
import { IMAGE_TYPES } from '../../../server/campaign/chapters';
import { addItem, addPoint, createLocation, deleteLocation, movePoint, removeItem, removeMap, removePoint, setStock, updateItem, updateLocation, updatePoint, uploadMap } from '../../../server/campaign/locations';

export const prerender = false;

const id = z.string().min(1).max(64);
const pointId = z.number().int().positive();
const coordinate = z.number().min(0).max(100).nullable();
const locationFields = { name: z.string().max(80), region: z.string().max(80), description: z.string().max(8000), map: z.string().max(300).nullable() };
const pointFields = { name: z.string().max(80), kind: z.string().max(40), description: z.string().max(2000), x: coordinate, y: coordinate };
const rarity = z.number().int().min(0).max(12);
const itemFields = { name: z.string().max(80), category: z.string().max(60), price: z.string().max(40), rarity, available: z.boolean(), notes: z.string().max(500) };
const wrap = (p: Promise<unknown>) => p.then((location) => ({ location }));

const routes = {
  create: route(z.object(locationFields).partial().required({ name: true }), (i, a) => wrap(createLocation(a, i)), 'gm'),
  update: route(z.object({ locationId: id, patch: z.object(locationFields).partial() }), (i, a) => wrap(updateLocation(a, i.locationId, i.patch)), 'gm'),
  delete: route(z.object({ locationId: id }), (i, a) => deleteLocation(a, i.locationId).then(() => ({ ok: true })), 'gm'),
  // base64 of a picture the browser has already shrunk; the service caps the decoded size
  'upload-map': route(z.object({ locationId: id, mime: z.enum(IMAGE_TYPES), data: z.string().min(1).max(3_500_000) }), (i, a) => wrap(uploadMap(a, i.locationId, i.mime, i.data)), 'gm'),
  'remove-map': route(z.object({ locationId: id }), (i, a) => wrap(removeMap(a, i.locationId)), 'gm'),
  'add-point': route(z.object({ locationId: id, point: z.object(pointFields).partial().required({ name: true }) }), (i, a) => wrap(addPoint(a, i.locationId, i.point)), 'gm'),
  'update-point': route(z.object({ pointId, patch: z.object(pointFields).partial() }), (i, a) => wrap(updatePoint(a, i.pointId, i.patch)), 'gm'),
  'remove-point': route(z.object({ pointId }), (i, a) => wrap(removePoint(a, i.pointId)), 'gm'),
  'move-point': route(z.object({ pointId, by: z.union([z.literal(-1), z.literal(1)]) }), (i, a) => wrap(movePoint(a, i.pointId, i.by)), 'gm'),
  // the trading post
  stock: route(z.object({ locationId: id, itemId: z.string().max(80), patch: z.object({ available: z.boolean().nullable(), price: z.string().max(40).nullable(), rarity: rarity.nullable(), notes: z.string().max(500) }).partial() }), (i, a) => wrap(setStock(a, i.locationId, i.itemId, i.patch)), 'gm'),
  'add-item': route(z.object({ locationId: id, item: z.object(itemFields).partial().required({ name: true, price: true }) }), (i, a) => wrap(addItem(a, i.locationId, i.item)), 'gm'),
  'update-item': route(z.object({ locationId: id, itemId: z.string().max(80), patch: z.object(itemFields).partial() }), (i, a) => wrap(updateItem(a, i.locationId, i.itemId, i.patch)), 'gm'),
  'remove-item': route(z.object({ locationId: id, itemId: z.string().max(80) }), (i, a) => wrap(removeItem(a, i.locationId, i.itemId)), 'gm'),
};

export const POST: APIRoute = ({ request, params }) => dispatch(routes, params.action, request, 'locations');
