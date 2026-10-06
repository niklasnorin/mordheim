/**
 * The campaign's locations: the towns and cities the warbands fight in, as the record keeps them.
 *
 * A game master founds a location, writes it up, gives it a map (a picture uploaded here, or the seed's file under
 * public/), pins its points of interest and keeps its trading post: which of the rulebook's items are to be had,
 * at what price and rarity, and what else the post sells. Everyone reads. A scenario names the location it is fought
 * in and, on the map, where (campaign/scenarios.ts). Ids are forever and match the Curfew's packs where one exists.
 */
import { and, asc, eq, isNotNull, sql } from 'drizzle-orm';
import { db } from '../db/client.ts';
import { images, locationPoints, locationStock, locations, scenarios } from '../db/schema.ts';
import { LedgerError } from '../../curfew/ledger.ts';
import { positionOf, slugify, type CampaignLocation, type PointOfInterest } from '../../campaign/model.ts';
import { COMMON, tradeItemById, type StockEntry } from '../../campaign/trading.ts';
import { IMAGE_MAX_BYTES, looksLike, type ImageType } from './chapters.ts';
import { isGm, type Actor } from '../roles.ts';
import { ensureLocationsSeeded } from './seed.ts';

export { LedgerError };

const clean = (s: string | undefined | null, max: number) => (s ?? '').trim().slice(0, max);
function gmOnly(actor: Actor): void { if (!isGm(actor)) throw new LedgerError('Only a game master keeps the map.', 403); }

// ───────────────────────── reading ─────────────────────────

type Row = typeof locations.$inferSelect;
type PointRow = typeof locationPoints.$inferSelect;
type StockRow = typeof locationStock.$inferSelect;

const pointOf = (p: PointRow): PointOfInterest => ({ id: p.id, locationId: p.locationId, name: p.name, kind: p.kind, description: p.description, x: p.x, y: p.y, sort: p.sort });
const entryOf = (s: StockRow): StockEntry => ({ itemId: s.itemId, custom: s.custom, name: s.name, category: s.category, available: s.available, price: s.price, rarity: s.rarity, notes: s.notes, sort: s.sort });

function locationOf(r: Row, points: PointRow[], stock: StockRow[]): CampaignLocation {
  return {
    id: r.id, name: r.name, region: r.region, description: r.description, map: r.map, sort: r.sort, createdAt: r.createdAt, updatedAt: r.updatedAt,
    points: points.filter((p) => p.locationId === r.id).map(pointOf),
    stock: stock.filter((s) => s.locationId === r.id).map(entryOf),
  };
}

/** Every location, in the game master's order, with its points and its stock. */
export async function listLocations(): Promise<CampaignLocation[]> {
  await ensureLocationsSeeded();
  const d = db();
  const [rows, points, stock] = await Promise.all([
    d.select().from(locations).orderBy(asc(locations.sort), asc(locations.createdAt)),
    d.select().from(locationPoints).orderBy(asc(locationPoints.sort), asc(locationPoints.id)),
    d.select().from(locationStock).orderBy(asc(locationStock.sort), asc(locationStock.id)),
  ]);
  return rows.map((r) => locationOf(r, points, stock));
}

export async function getLocation(id: string): Promise<CampaignLocation | undefined> { return (await listLocations()).find((l) => l.id === id); }
/** The location, or a refusal the route can pass on. */
export async function requireLocation(id: string): Promise<CampaignLocation> {
  const l = await getLocation(id);
  if (!l) throw new LedgerError('No such place is on the map.', 404);
  return l;
}

async function row(id: string): Promise<Row> {
  await ensureLocationsSeeded();
  const rows = await db().select().from(locations).where(eq(locations.id, id)).limit(1);
  if (!rows.length) throw new LedgerError('No such place is on the map.', 404);
  return rows[0];
}

// ───────────────────────── the location itself ─────────────────────────

export interface LocationInput { name: string; region?: string; description?: string; map?: string | null }

/** A map path as it may be kept: a path on this site, nothing else. The seed's files and uploaded pictures both are. */
function mapOf(given: string | null | undefined): string | null {
  const s = clean(given, 300);
  if (!s) return null;
  if (!/^\/[\w\-./%]+$/.test(s) || s.startsWith('//')) throw new LedgerError('The map must be a picture on this site: upload one, or a path under public/.');
  return s;
}

export async function createLocation(actor: Actor, input: LocationInput): Promise<CampaignLocation> {
  gmOnly(actor);
  await ensureLocationsSeeded();
  const name = clean(input.name, 80);
  if (!name) throw new LedgerError('The place needs a name.');
  const d = db();
  const taken = new Set((await d.select({ id: locations.id }).from(locations)).map((r) => r.id));
  const [{ n }] = await d.select({ n: sql<number>`coalesce(max(${locations.sort}), 0)::int` }).from(locations);
  const stem = slugify(name) || 'place';
  let id = stem, k = 2;
  while (taken.has(id)) id = `${stem}-${k++}`;
  await d.insert(locations).values({ id, name, region: clean(input.region, 80), description: clean(input.description, 8000), map: mapOf(input.map), sort: n + 1 });
  return (await getLocation(id))!;
}

export async function updateLocation(actor: Actor, id: string, patch: Partial<LocationInput>): Promise<CampaignLocation> {
  gmOnly(actor);
  await row(id);
  const set: Partial<typeof locations.$inferInsert> = { updatedAt: new Date() };
  if (patch.name !== undefined) { const name = clean(patch.name, 80); if (!name) throw new LedgerError('The place needs a name.'); set.name = name; }
  if (patch.region !== undefined) set.region = clean(patch.region, 80);
  if (patch.description !== undefined) set.description = clean(patch.description, 8000);
  if (patch.map !== undefined) { set.map = mapOf(patch.map); await dropUploadedMap(id, set.map); }
  await db().update(locations).set(set).where(eq(locations.id, id));
  return (await getLocation(id))!;
}

/** Strike a location. One a battle was fought in stays: the Chronicle points at it. */
export async function deleteLocation(actor: Actor, id: string): Promise<void> {
  gmOnly(actor);
  await row(id);
  const fought = await db().select({ id: scenarios.id }).from(scenarios).where(eq(scenarios.locationId, id)).limit(1);
  if (fought.length) throw new LedgerError('A scenario is set there. Move it elsewhere first.', 409);
  await db().delete(locations).where(eq(locations.id, id));
}

// ───────────────────────── the map ─────────────────────────

const UPLOADED = /^\/images\/([0-9a-f-]{36})$/;

/** Forget the map picture uploaded for this location, if the map was one and is being replaced by something else. */
async function dropUploadedMap(id: string, next: string | null): Promise<void> {
  const current = (await row(id)).map;
  const m = current ? UPLOADED.exec(current) : null;
  if (m && current !== next) await db().delete(images).where(and(eq(images.id, m[1]), eq(images.locationId, id)));
}

/** Keep a picture as the location's map. The browser has shrunk it; the bytes must be the picture they claim to be. */
export async function uploadMap(actor: Actor, id: string, mime: ImageType, base64: string): Promise<CampaignLocation> {
  gmOnly(actor);
  await row(id);
  const bytes = Buffer.from(base64, 'base64');
  if (!bytes.length) throw new LedgerError('That picture came through empty. Try again.');
  if (bytes.length > IMAGE_MAX_BYTES) throw new LedgerError('That map is too large, even shrunk. Try a smaller one.', 413);
  if (!looksLike(mime, bytes)) throw new LedgerError('That file is not a picture the page can show. Use a JPEG, PNG, WebP or GIF.', 415);
  const imageId = crypto.randomUUID();
  const map = `/images/${imageId}`;
  await dropUploadedMap(id, map);
  await db().insert(images).values({ id: imageId, locationId: id, mime, data: bytes.toString('base64'), bytes: bytes.length, uploadedBy: actor.id });
  await db().update(locations).set({ map, updatedAt: new Date() }).where(eq(locations.id, id));
  return (await getLocation(id))!;
}

/** Take the map away. The points keep their positions, for when a map comes back. */
export async function removeMap(actor: Actor, id: string): Promise<CampaignLocation> {
  return updateLocation(actor, id, { map: null });
}

// ───────────────────────── points of interest ─────────────────────────

export interface PointInput { name: string; kind?: string; description?: string; x?: number | null; y?: number | null }

function pointValues(input: Partial<PointInput>, before?: PointRow): Pick<typeof locationPoints.$inferInsert, 'name' | 'kind' | 'description' | 'x' | 'y'> {
  const name = clean(input.name ?? before?.name, 80);
  if (!name) throw new LedgerError('The place needs a name.');
  const pos = positionOf(input.x === undefined ? before?.x : input.x, input.y === undefined ? before?.y : input.y);
  if (pos === 'invalid') throw new LedgerError('A pin needs both its distances across and down the map, between 0 and 100.');
  return { name, kind: clean(input.kind ?? before?.kind, 40), description: clean(input.description ?? before?.description, 2000), x: pos?.x ?? null, y: pos?.y ?? null };
}

async function pointRow(pointId: number): Promise<PointRow> {
  const rows = await db().select().from(locationPoints).where(eq(locationPoints.id, pointId)).limit(1);
  if (!rows.length) throw new LedgerError('No such place is marked there.', 404);
  return rows[0];
}

export async function addPoint(actor: Actor, locationId: string, input: PointInput): Promise<CampaignLocation> {
  gmOnly(actor);
  await row(locationId);
  const [{ n }] = await db().select({ n: sql<number>`coalesce(max(${locationPoints.sort}), 0)::int` }).from(locationPoints).where(eq(locationPoints.locationId, locationId));
  await db().insert(locationPoints).values({ locationId, ...pointValues(input), sort: n + 1 });
  return (await getLocation(locationId))!;
}

export async function updatePoint(actor: Actor, pointId: number, patch: Partial<PointInput>): Promise<CampaignLocation> {
  gmOnly(actor);
  const p = await pointRow(pointId);
  await db().update(locationPoints).set({ ...pointValues(patch, p), updatedAt: new Date() }).where(eq(locationPoints.id, pointId));
  return (await getLocation(p.locationId))!;
}

/** Strike a point. A scenario fought at it keeps its location and loses the point; its own marker, if it had one, stays. */
export async function removePoint(actor: Actor, pointId: number): Promise<CampaignLocation> {
  gmOnly(actor);
  const p = await pointRow(pointId);
  await db().delete(locationPoints).where(eq(locationPoints.id, pointId));
  return (await getLocation(p.locationId))!;
}

/** Move a point one place earlier (-1) or later (1) in the list. */
export async function movePoint(actor: Actor, pointId: number, by: -1 | 1): Promise<CampaignLocation> {
  gmOnly(actor);
  const p = await pointRow(pointId);
  const list = (await getLocation(p.locationId))!.points;
  const at = list.findIndex((x) => x.id === pointId), to = at + by;
  if (to >= 0 && to < list.length) {
    [list[at], list[to]] = [list[to], list[at]];
    for (const [i, x] of list.entries()) if (x.sort !== i + 1) await db().update(locationPoints).set({ sort: i + 1 }).where(eq(locationPoints.id, x.id));
  }
  return (await getLocation(p.locationId))!;
}

// ───────────────────────── the trading post ─────────────────────────

/** What a game master may change about a chart item here. Null puts a field back to the chart's own. */
export interface StockPatch { available?: boolean | null; price?: string | null; rarity?: number | null; notes?: string }
/** A custom item, wholly the game master's. */
export interface CustomItemInput { name: string; category?: string; price: string; rarity?: number; available?: boolean; notes?: string }

function rarityOf(given: number | null | undefined, fallback: number | null): number | null {
  if (given === undefined) return fallback;
  if (given === null) return null;
  if (!Number.isInteger(given) || given < COMMON || given > 12) throw new LedgerError('Rarity is Common (0) or the roll needed on two dice, 2 to 12.');
  return given;
}
const priceOf = (given: string | null | undefined, fallback: string | null): string | null => (given === undefined ? fallback : given === null ? null : clean(given, 40) || null);

/**
 * Amend a chart item at this location: whether it is to be had, its price, its rarity, a note. Fields left out keep
 * what was set; null returns one to the chart. When nothing differs from the chart any more, the row goes.
 */
export async function setStock(actor: Actor, locationId: string, itemId: string, patch: StockPatch): Promise<CampaignLocation> {
  gmOnly(actor);
  await row(locationId);
  if (!tradeItemById(itemId)) throw new LedgerError('That is not on the price chart. Add it as an item of the post’s own.', 404);
  const d = db();
  const existing = (await d.select().from(locationStock).where(and(eq(locationStock.locationId, locationId), eq(locationStock.itemId, itemId))).limit(1))[0];
  if (existing?.custom) throw new LedgerError('That is not on the price chart.', 409);
  const values = {
    available: patch.available === undefined ? existing?.available ?? null : patch.available,
    price: priceOf(patch.price, existing?.price ?? null),
    rarity: rarityOf(patch.rarity, existing?.rarity ?? null),
    notes: patch.notes === undefined ? existing?.notes ?? '' : clean(patch.notes, 500),
    updatedAt: new Date(),
  };
  const plain = values.available === null && values.price === null && values.rarity === null && !values.notes;
  if (plain) { if (existing) await d.delete(locationStock).where(eq(locationStock.id, existing.id)); }
  else if (existing) await d.update(locationStock).set(values).where(eq(locationStock.id, existing.id));
  else await d.insert(locationStock).values({ locationId, itemId, custom: false, ...values });
  return (await getLocation(locationId))!;
}

export async function addItem(actor: Actor, locationId: string, input: CustomItemInput): Promise<CampaignLocation> {
  gmOnly(actor);
  await row(locationId);
  const name = clean(input.name, 80);
  if (!name) throw new LedgerError('The item needs a name.');
  const price = clean(input.price, 40);
  if (!price) throw new LedgerError('The item needs a price, even if it is a roll of the dice.');
  const d = db();
  const taken = new Set((await d.select({ itemId: locationStock.itemId }).from(locationStock).where(eq(locationStock.locationId, locationId))).map((r) => r.itemId));
  const stem = `custom-${slugify(name) || 'item'}`;
  let itemId = stem, k = 2;
  while (taken.has(itemId) || tradeItemById(itemId)) itemId = `${stem}-${k++}`;
  const [{ n }] = await d.select({ n: sql<number>`coalesce(max(${locationStock.sort}), 0)::int` }).from(locationStock).where(and(eq(locationStock.locationId, locationId), eq(locationStock.custom, true)));
  await d.insert(locationStock).values({
    locationId, itemId, custom: true, name, category: clean(input.category, 60) || 'Miscellaneous equipment', price, rarity: rarityOf(input.rarity, COMMON) ?? COMMON,
    available: input.available ?? true, notes: clean(input.notes, 500), sort: n + 1,
  });
  return (await getLocation(locationId))!;
}

export async function updateItem(actor: Actor, locationId: string, itemId: string, patch: Partial<CustomItemInput>): Promise<CampaignLocation> {
  gmOnly(actor);
  await row(locationId);
  const existing = (await db().select().from(locationStock).where(and(eq(locationStock.locationId, locationId), eq(locationStock.itemId, itemId), eq(locationStock.custom, true))).limit(1))[0];
  if (!existing) throw new LedgerError('That item is not the post’s own.', 404);
  const set: Partial<typeof locationStock.$inferInsert> = { updatedAt: new Date() };
  if (patch.name !== undefined) { const name = clean(patch.name, 80); if (!name) throw new LedgerError('The item needs a name.'); set.name = name; }
  if (patch.category !== undefined) set.category = clean(patch.category, 60) || 'Miscellaneous equipment';
  if (patch.price !== undefined) { const price = clean(patch.price, 40); if (!price) throw new LedgerError('The item needs a price, even if it is a roll of the dice.'); set.price = price; }
  if (patch.rarity !== undefined) set.rarity = rarityOf(patch.rarity, COMMON) ?? COMMON;
  if (patch.available !== undefined) set.available = !!patch.available;
  if (patch.notes !== undefined) set.notes = clean(patch.notes, 500);
  await db().update(locationStock).set(set).where(eq(locationStock.id, existing.id));
  return (await getLocation(locationId))!;
}

/** Take an item of the post's own off the list. A chart item is put back to the chart with `setStock` instead. */
export async function removeItem(actor: Actor, locationId: string, itemId: string): Promise<CampaignLocation> {
  gmOnly(actor);
  await row(locationId);
  const gone = await db().delete(locationStock).where(and(eq(locationStock.locationId, locationId), eq(locationStock.itemId, itemId), eq(locationStock.custom, true))).returning({ id: locationStock.id });
  if (!gone.length) throw new LedgerError('That item is not the post’s own.', 404);
  return (await getLocation(locationId))!;
}

/** The scenarios set in each location, for the cards. */
export async function scenarioCounts(): Promise<Record<string, number>> {
  const rows = await db().select({ locationId: scenarios.locationId, n: sql<number>`count(*)::int` }).from(scenarios).where(isNotNull(scenarios.locationId)).groupBy(scenarios.locationId);
  return Object.fromEntries(rows.map((r) => [r.locationId!, r.n]));
}
