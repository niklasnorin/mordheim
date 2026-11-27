/**
 * Starting and keeping campaigns, from the Watch House (`docs/campaigns.md`). A game master makes a campaign from a
 * setting as a draft, sketches it in private under its own address, launches it when the checklist is met, and
 * finishes and archives it when it is over. The admin chooses which campaign the site's plain addresses show.
 *
 * A campaign's id seeds its dice and its start, time zone and anchor say which night and which Imperial day a real day
 * is; all four are fixed once it is live. Its name and address may change; its options and dials are the game
 * master's while it is a draft, and the options stay theirs after.
 */
import { eq, inArray, sql } from 'drizzle-orm';
import { db } from '../db/client.ts';
import { campaignLocations, campaignSettings, campaigns, cryerDispatches, curfewLedgers, curfewMoves, locationJobs, locationPoints, locations, scenarios, warbands } from '../db/schema.ts';
import { LedgerError } from '../../curfew/ledger.ts';
import { isLocationDoc, validateDocument } from '../../curfew/packs.ts';
import { anchorOf } from '../../lib/calendar.ts';
import {
  CARRY_MODES, isIsoDate, isTimeZone, optionsOf, slugError, slugify, tuningFrom, tuningOf,
  type CampaignConfig, type CampaignOptions, type CampaignStatus, type CampaignTuning,
} from '../../campaign/campaign.ts';
import { SETTINGS, settingFor, type Setting } from '../../data/settings/index.ts';
import type { LocationFixture } from '../../data/locations.ts';
import { isAdmin, isGm, type Actor } from '../roles.ts';
import { campaignBySlug, ensureCampaigns, getCampaign, invalidateCampaigns, listCampaigns } from '../campaign/campaigns.ts';
import { invalidateWorld, listDocuments, worldFor } from '../content/curfew.ts';

function gmOnly(actor: Actor): void { if (!isGm(actor)) throw new LedgerError('Only a game master starts and keeps campaigns.', 403); }
const clean = (s: string | undefined | null, max: number) => (s ?? '').trim().slice(0, max);

export interface CampaignInput {
  name: string;
  slug?: string;
  /** The id that seeds the dice; proposed from the slug and the year when left out. */
  id?: string;
  setting?: string;
  start: string;
  timezone?: string;
  /** The Imperial day the start falls on, as written ("Festag, 1st of Nachexen, 2005 IC"); the weekday may be left out. */
  anchor?: string;
  /** Any of the campaign's options (`CampaignOptions`); what is malformed keeps its default. */
  options?: { carry?: Record<string, unknown> } & Record<string, unknown>;
  tuning?: Partial<CampaignTuning>;
}

/** The campaigns' settings, for the form. */
export const settingsOffered = (): Pick<Setting, 'id' | 'name' | 'description' | 'timezone' | 'year' | 'startingCrowns'>[] =>
  SETTINGS.map(({ id, name, description, timezone, year, startingCrowns }) => ({ id, name, description, timezone, year, startingCrowns }));

/** An anchor read and checked, or a refusal in words a game master can act on. */
function anchorFrom(start: string, written: string | undefined, setting: Setting): { date: string; imperial: string } {
  const imperial = clean(written, 80) || `1st of Nachexen, ${setting.year} IC`;
  try { anchorOf({ date: start, imperial }); } catch (e) { throw new LedgerError(`The Imperial day is not one the calendar knows: ${(e as Error).message}`); }
  return { date: start, imperial };
}

/** Merge given options over a campaign's, the defaults filling the rest. */
function mergeOptions(base: CampaignOptions, given: CampaignInput['options'] = {}): CampaignOptions {
  const defined = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
  return optionsOf({ ...base, ...defined(given), carry: { ...base.carry, ...defined(given.carry ?? {}) } });
}

/** A place of a setting's in the atlas: written with its points if the atlas lacks it. Answers whether it was written. */
async function placeInAtlas(l: LocationFixture, sort: number): Promise<boolean> {
  const d = db();
  const written = await d.insert(locations).values({ id: l.id, name: l.name, region: l.region, description: l.description, map: l.map ?? null, banner: l.banner ?? null, bannerFocus: l.bannerFocus ?? '50% 50%', sort }).onConflictDoNothing().returning({ id: locations.id });
  if (!written.length) return false;
  for (const [j, p] of l.points.entries()) await d.insert(locationPoints).values({ locationId: l.id, name: p.name, kind: p.kind, description: p.description, x: p.x ?? null, y: p.y ?? null, sort: j + 1 });
  return true;
}

/** A campaign's own copies of a place's seed jobs, each at its point of interest by name. */
async function copySeedJobs(campaignId: string, l: LocationFixture): Promise<void> {
  if (!l.jobs?.length) return;
  const points = await db().select().from(locationPoints).where(eq(locationPoints.locationId, l.id));
  const rows = l.jobs.map((j, i) => ({ campaignId, locationId: l.id, pointId: points.find((p) => p.name === j.point)?.id ?? null, title: j.title, text: j.text, lean: j.lean, scope: j.scope, sort: i + 1 }));
  await db().insert(locationJobs).values(rows).onConflictDoNothing();
}

/**
 * Make a campaign from a setting, as a draft: its row, its Curfew documents, its places (the atlas gains any it lacks)
 * with their job boards, and the place its nights start in. Nobody but a game master sees it until it is launched.
 */
export async function createCampaign(actor: Actor, input: CampaignInput): Promise<CampaignConfig> {
  gmOnly(actor);
  await ensureCampaigns();
  const setting = settingFor(input.setting ?? SETTINGS[0].id);
  if (!setting) throw new LedgerError('No such setting.', 404);
  const name = clean(input.name, 80);
  if (!name) throw new LedgerError('The campaign needs a name.');
  const slug = clean(input.slug, 48) || slugify(name);
  const bad = slugError(slug);
  if (bad) throw new LedgerError(bad);
  if (await campaignBySlug(slug)) throw new LedgerError('Another campaign has that address already.', 409);
  if (!isIsoDate(input.start)) throw new LedgerError('Say which day night 1 falls on, as YYYY-MM-DD.');
  const timezone = clean(input.timezone, 64) || setting.timezone;
  if (!isTimeZone(timezone)) throw new LedgerError('That time zone is not one the calendar knows (try Europe/Stockholm).');
  const anchor = anchorFrom(input.start, input.anchor, setting);
  const year = Number(/(\d{3,4})\s*IC/.exec(anchor.imperial)?.[1] ?? setting.year);
  const known = new Set((await listCampaigns()).map((c) => c.id));
  let id = clean(input.id, 64) || `${slug}-${year}`, k = 2;
  if (slugError(id)) throw new LedgerError('The id is lower-case letters and digits, joined by single hyphens.');
  if (input.id && known.has(id)) throw new LedgerError('Another campaign has that id already.', 409);
  while (known.has(id)) id = `${slug}-${year}-${k++}`;
  const options = mergeOptions(optionsOf({ catalogues: setting.catalogues, startingCrowns: setting.startingCrowns, carry: { modes: [...CARRY_MODES] } }), input.options);
  const tuning = tuningOf({ ...setting.tuning, ...(input.tuning ?? {}) }, setting.tuning);
  const [{ n }] = await db().select({ n: sql<number>`coalesce(max(${campaigns.sort}), 0)::int` }).from(campaigns);
  await db().insert(campaigns).values({ id, slug, name, setting: setting.id, status: 'draft', start: input.start, timezone, anchor, tuning, options, sort: n + 1, createdBy: actor.id });
  invalidateCampaigns();
  // the places: the atlas gains any it lacks, and the campaign fights in each with its own board
  for (const [i, l] of setting.locations.entries()) {
    await placeInAtlas(l, 100 + i);
    await db().insert(campaignLocations).values({ campaignId: id, locationId: l.id, sort: i + 1 }).onConflictDoNothing();
    await copySeedJobs(id, l);
  }
  await db().insert(curfewMoves).values({ campaignId: id, locationId: setting.firstPlace, fromNight: 1 });
  // the documents are written from the setting the first time the world is asked for
  await worldFor(id, true);
  return (await getCampaign(id))!;
}

export interface CampaignPatch {
  name?: string;
  slug?: string;
  start?: string;
  timezone?: string;
  anchor?: string;
  options?: CampaignInput['options'];
  tuning?: Partial<CampaignTuning>;
}

/** Change a campaign. The start, time zone, anchor and dials are fixed once it is live; the id never changes. */
export async function updateCampaign(actor: Actor, id: string, patch: CampaignPatch): Promise<CampaignConfig> {
  gmOnly(actor);
  const c = await getCampaign(id);
  if (!c) throw new LedgerError('No such campaign.', 404);
  const draft = c.status === 'draft';
  const set: Partial<typeof campaigns.$inferInsert> = { updatedAt: new Date() };
  if (patch.name !== undefined) { const name = clean(patch.name, 80); if (!name) throw new LedgerError('The campaign needs a name.'); set.name = name; }
  if (patch.slug !== undefined && patch.slug !== c.slug) {
    const slug = clean(patch.slug, 48), bad = slugError(slug);
    if (bad) throw new LedgerError(bad);
    if (await campaignBySlug(slug)) throw new LedgerError('Another campaign has that address already.', 409);
    set.slug = slug;
  }
  const clock = patch.start !== undefined || patch.timezone !== undefined || patch.anchor !== undefined || patch.tuning !== undefined;
  if (clock && !draft) throw new LedgerError('Its nights have begun: the start, the time zone, the Imperial day and the dials stay as they are.', 409);
  const start = patch.start ?? c.start;
  if (patch.start !== undefined) { if (!isIsoDate(patch.start)) throw new LedgerError('Say which day night 1 falls on, as YYYY-MM-DD.'); set.start = patch.start; }
  if (patch.timezone !== undefined) { if (!isTimeZone(patch.timezone)) throw new LedgerError('That time zone is not one the calendar knows.'); set.timezone = patch.timezone; }
  if (patch.anchor !== undefined || patch.start !== undefined) set.anchor = anchorFrom(start, patch.anchor ?? c.anchor.imperial, settingFor(c.setting) ?? SETTINGS[0]);
  if (patch.tuning !== undefined) set.tuning = tuningOf({ ...tuningFrom(c), ...patch.tuning }, tuningFrom(c));
  if (patch.options !== undefined) set.options = mergeOptions(c.options, patch.options);
  await db().update(campaigns).set({ ...set, version: sql`${campaigns.version} + 1` }).where(eq(campaigns.id, id));
  invalidateCampaigns();
  invalidateWorld(id);
  return (await getCampaign(id))!;
}

export interface ChecklistItem { label: string; ok: boolean; detail: string }

/** What a draft must have before it is launched, and what it has. */
export async function launchChecklist(id: string): Promise<ChecklistItem[]> {
  const c = await getCampaign(id);
  if (!c) throw new LedgerError('No such campaign.', 404);
  const [docs, places, moves] = await Promise.all([
    listDocuments(id),
    db().select({ id: campaignLocations.locationId }).from(campaignLocations).where(eq(campaignLocations.campaignId, id)),
    db().select({ id: curfewMoves.locationId }).from(curfewMoves).where(eq(curfewMoves.campaignId, id)),
  ]);
  const placeIds = docs.filter((d) => isLocationDoc(d.id)).map((d) => d.id.slice('location:'.length));
  const moonIds = ((docs.find((d) => d.id === 'moons')?.document as { moons?: { id: string }[] } | undefined)?.moons ?? []).map((m) => m.id);
  const problems = docs.flatMap((d) => validateDocument(d.id, d.document, { moonIds, locationIds: placeIds }).map((e) => `${d.id}: ${e}`));
  const first = moves[0]?.id ?? 'mordheim';
  return [
    { label: 'Night 1', ok: isIsoDate(c.start), detail: `Night 1 falls on ${c.start}, at midnight in ${c.timezone}.` },
    { label: 'The calendar', ok: true, detail: `${c.start} is ${c.anchor.imperial}.` },
    { label: 'Where it begins', ok: !c.options.curfew || placeIds.includes(first), detail: c.options.curfew ? (placeIds.includes(first) ? `The nights begin in ${first}.` : `The nights begin in ${first}, which has no pack.`) : 'The campaign runs without the Curfew.' },
    { label: 'The Curfew’s content', ok: !c.options.curfew || problems.length === 0, detail: problems.length ? `${problems.length} problems, the first: ${problems[0]}` : `${docs.length} documents, every one sound.` },
    { label: 'The map', ok: places.length > 0, detail: places.length ? `${places.length} ${places.length === 1 ? 'location' : 'locations'} to fight in.` : 'No location to fight in yet.' },
  ];
}

/** Which way a campaign may go from where it is, and who may send it. */
const MOVES: Record<CampaignStatus, CampaignStatus[]> = { draft: ['live'], live: ['finished'], finished: ['live', 'archived'], archived: ['finished'] };

/**
 * Launch a draft: its pages open to everyone and its nights start to run. `strikeSketches` first strikes the warbands
 * and scenarios a game master made while sketching it, with their ledgers and dispatches. Refused while the checklist
 * says no.
 */
export async function launchCampaign(actor: Actor, id: string, opts: { strikeSketches?: boolean } = {}): Promise<CampaignConfig> {
  gmOnly(actor);
  const c = await getCampaign(id);
  if (!c) throw new LedgerError('No such campaign.', 404);
  if (c.status !== 'draft') throw new LedgerError('Only a draft is launched.', 409);
  const missing = (await launchChecklist(id)).filter((i) => !i.ok);
  if (missing.length) throw new LedgerError(`Not yet: ${missing.map((i) => i.detail).join(' ')}`, 409);
  if (opts.strikeSketches) {
    const d = db();
    const sketched = (await d.select({ id: warbands.id }).from(warbands).where(eq(warbands.campaignId, id))).map((r) => r.id);
    await d.delete(scenarios).where(eq(scenarios.campaignId, id));
    if (sketched.length) await d.delete(warbands).where(inArray(warbands.id, sketched));
    await d.delete(curfewLedgers).where(eq(curfewLedgers.campaignId, id));
    await d.delete(cryerDispatches).where(eq(cryerDispatches.campaignId, id));
  }
  return setStatus(id, 'live');
}

/** Finish a live campaign, reopen a finished one, archive it or bring it back from the archive. */
export async function moveStatus(actor: Actor, id: string, to: CampaignStatus): Promise<CampaignConfig> {
  gmOnly(actor);
  const c = await getCampaign(id);
  if (!c) throw new LedgerError('No such campaign.', 404);
  if (to === 'live' && c.status === 'draft') return launchCampaign(actor, id);
  if (!MOVES[c.status].includes(to)) throw new LedgerError(`A ${c.status} campaign is not made ${to}.`, 409);
  if (to !== 'live' && (await frontDoorId()) === id) throw new LedgerError('It is the front door. Open another campaign there first.', 409);
  return setStatus(id, to);
}

async function setStatus(id: string, status: CampaignStatus): Promise<CampaignConfig> {
  await db().update(campaigns).set({ status, updatedAt: new Date(), version: sql`${campaigns.version} + 1` }).where(eq(campaigns.id, id));
  invalidateCampaigns();
  invalidateWorld(id);
  return (await getCampaign(id))!;
}

async function frontDoorId(): Promise<string | undefined> {
  const [r] = await db().select().from(campaignSettings).where(eq(campaignSettings.key, 'frontDoor'));
  return typeof r?.value === 'string' ? r.value : undefined;
}

/** Choose the campaign the site's plain addresses show. The admin alone, and only a campaign that is open to everyone. */
export async function setFrontDoor(actor: Actor, id: string): Promise<CampaignConfig> {
  if (!isAdmin(actor)) throw new LedgerError('That is for the admin alone.', 403);
  const c = await getCampaign(id);
  if (!c) throw new LedgerError('No such campaign.', 404);
  if (c.status === 'draft' || c.status === 'archived') throw new LedgerError('Only a live or finished campaign may be the front door.', 409);
  await db().insert(campaignSettings).values({ key: 'frontDoor', value: id }).onConflictDoUpdate({ target: campaignSettings.key, set: { value: id, updatedAt: new Date() } });
  invalidateCampaigns();
  return c;
}

/** Whether a slug is free, for the form's hint. */
export async function slugTaken(slug: string): Promise<boolean> { return !!(await campaignBySlug(slug)); }

