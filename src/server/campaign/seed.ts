/**
 * The first fill. The campaign's record used to live in source; the files under src/data/ are now the seed. When
 * the warbands table is empty the fixtures are imported once, so a fresh database (local PGlite, a new Neon) shows
 * the campaign as it was recorded. After that the database rules and the fixtures are never read again.
 */
import { eq, sql } from 'drizzle-orm';
import { db } from '../db/client.ts';
import { locationJobs, locationPoints, locations, members, newsArticles, scenarioMembers, scenarioOutOfAction, scenarioWarbands, scenarios, warbands } from '../db/schema.ts';
import { warbands as seedWarbands } from '../../data/warbands.ts';
import { locations as seedLocations } from '../../data/locations.ts';
import { news as seedNews } from '../../data/news.ts';
import { chronicle as seedChronicle } from '../../data/chronicle.ts';
import { history as seedHistory } from '../../data/history.ts';

let seeded: Promise<void> | undefined;

/** Import the fixtures if the campaign tables are empty. Memoised per process; a second call is free. */
export function ensureSeeded(): Promise<void> {
  seeded ??= seedIfEmpty().then(() => undefined, (e) => { seeded = undefined; throw e; });
  return seeded;
}

/** For tests and a reset: forget that the check was made. */
export function forgetSeeded(): void { seeded = undefined; locationsSeeded = undefined; jobsSeeded = undefined; }

let locationsSeeded: Promise<void> | undefined;

/**
 * Import the locations if their table is empty. Kept apart from the campaign's seed because the locations came later:
 * a database seeded before they existed still gets Fussenbach and Mordheim on its next read.
 */
export function ensureLocationsSeeded(): Promise<void> {
  locationsSeeded ??= seedLocationsIfEmpty().then(() => undefined, (e) => { locationsSeeded = undefined; throw e; });
  return locationsSeeded;
}

/**
 * Write the location fixtures if the table is empty. Two seeds may race (two cold starts, or the campaign's seed beside
 * the locations' own), so a location's points are written only by the seed that wrote the location.
 */
export async function seedLocationsIfEmpty(): Promise<boolean> {
  const d = db();
  const [{ n }] = await d.select({ n: sql<number>`count(*)::int` }).from(locations);
  if (n > 0) return false;
  for (const [i, l] of seedLocations.entries()) {
    const written = await d.insert(locations).values({ id: l.id, name: l.name, region: l.region, description: l.description, map: l.map ?? null, banner: l.banner ?? null, bannerFocus: l.bannerFocus ?? '50% 50%', sort: i + 1 }).onConflictDoNothing().returning({ id: locations.id });
    if (!written.length) continue;
    for (const [j, p] of l.points.entries()) await d.insert(locationPoints).values({ locationId: l.id, name: p.name, kind: p.kind, description: p.description, x: p.x ?? null, y: p.y ?? null, sort: j + 1 });
  }
  return true;
}

let jobsSeeded: Promise<void> | undefined;

/**
 * Nail the fixtures' jobs to the posts. Kept apart as the locations are: the boards came later still. An empty board is
 * given the whole seed; a board already nailed up is given the seed's jobs it lacks, by title, and a seed job nobody has
 * edited on the site (its `updated_at` still its `created_at`) follows the seed's words, scope, lean, point and order,
 * so a rewrite of the seed reaches a live board without touching what a game master has made their own. A job names
 * its point of interest by name, found among the location's points as they stand.
 */
export function ensureJobsSeeded(): Promise<void> {
  jobsSeeded ??= ensureLocationsSeeded().then(seedJobs).then(() => undefined, (e) => { jobsSeeded = undefined; throw e; });
  return jobsSeeded;
}

/** Bring the boards up to the seed, as `ensureJobsSeeded` says. Answers how many jobs were nailed up or brought up to date. */
export async function seedJobs(): Promise<number> {
  const d = db();
  const [placed, points, existing] = await Promise.all([d.select({ id: locations.id }).from(locations), d.select().from(locationPoints), d.select().from(locationJobs)]);
  const here = new Set(placed.map((l) => l.id));
  const wanted = seedLocations.filter((l) => here.has(l.id)).flatMap((l) => (l.jobs ?? []).map((j, i) => ({
    locationId: l.id, pointId: points.find((p) => p.locationId === l.id && p.name === j.point)?.id ?? null, title: j.title, text: j.text, lean: j.lean, scope: j.scope, sort: i + 1,
  })));
  const fresh = wanted.filter((w) => !existing.some((e) => e.locationId === w.locationId && e.title === w.title));
  // two cold starts may race; a job's title is its own on its board
  if (fresh.length) await d.insert(locationJobs).values(fresh).onConflictDoNothing();
  let changed = fresh.length;
  for (const w of wanted) {
    const e = existing.find((x) => x.locationId === w.locationId && x.title === w.title);
    if (!e || e.updatedAt.getTime() !== e.createdAt.getTime()) continue;
    if (e.text === w.text && e.lean === w.lean && e.scope === w.scope && e.pointId === w.pointId && e.sort === w.sort) continue;
    // still the seed's own: it follows the seed, and stays untouched for the next rewrite
    await d.update(locationJobs).set({ text: w.text, lean: w.lean, scope: w.scope, pointId: w.pointId, sort: w.sort, updatedAt: e.createdAt }).where(eq(locationJobs.id, e.id));
    changed++;
  }
  return changed;
}

/** Where the campaign began, and where the seeded battles were fought. */
const FIRST_LOCATION = 'mordheim';

export async function seedIfEmpty(): Promise<boolean> {
  const d = db();
  const [{ n }] = await d.select({ n: sql<number>`count(*)::int` }).from(warbands);
  if (n > 0) return false;
  await seedCampaign();
  return true;
}

/** Write every fixture. Only ever called on empty tables; `onConflictDoNothing` keeps a race harmless. */
export async function seedCampaign(): Promise<void> {
  const d = db();
  await ensureLocationsSeeded();
  for (const [i, w] of seedWarbands.entries()) {
    await d.insert(warbands).values({
      id: w.id, name: w.name, type: w.type, sigil: w.sigil, crest: w.crest ?? null, player: w.player, rating: w.rating, wyrdstone: w.wyrdstone, gold: w.gold, lore: w.lore, sort: i + 1,
    }).onConflictDoNothing();
    for (const [j, m] of w.members.entries()) {
      await d.insert(members).values({
        id: m.id, warbandId: w.id, name: m.name, role: m.role, rank: m.rank, portrait: m.portrait, epithet: m.epithet, dead: !!m.dead, death: m.death ?? null,
        stats: m.stats, experience: m.experience ?? null, skills: [...m.skills, ...(m.prayers ?? []).map((p) => `Prayer: ${p}`)], injuries: m.injuries ?? [], lore: m.lore, sort: j + 1,
      }).onConflictDoNothing();
    }
  }
  for (const record of seedHistory) {
    const chron = seedChronicle.find((c) => c.scenarioId === record.id);
    const r = record.report;
    await d.insert(scenarios).values({
      id: record.id, sequence: record.sequence, status: 'played', title: record.scenario, playedOn: record.playedOn ?? '2026-09-05',
      rulebookScenario: r.rulebookScenario, winCondition: r.winCondition ?? '', summary: record.summary, chronicle: chron?.body ?? '', outcome: r.outcome,
      prologue: r.prologue, battle: r.battle, epilogue: r.epilogue, loot: r.loot, campaignNotes: r.campaignNotes, puzzle: r.puzzle ?? null, locationId: FIRST_LOCATION,
    }).onConflictDoNothing();
    for (const w of record.warbands) {
      const p = r.perspectives.find((x) => x.warbandId === w.warbandId);
      await d.insert(scenarioWarbands).values({
        scenarioId: record.id, warbandId: w.warbandId, result: w.result, prologue: p?.prologue ?? '', epilogue: p?.epilogue ?? '', accomplishments: p?.accomplishments ?? '',
        highlights: w.highlights, lowlights: w.lowlights, rating: w.rating, wyrdstone: w.wyrdstone, gold: w.gold,
      }).onConflictDoNothing();
      for (const m of w.members) {
        await d.insert(scenarioMembers).values({
          scenarioId: record.id, memberId: m.memberId, warbandId: w.warbandId, status: m.status, highlight: m.highlight, lowlight: m.lowlight, stats: m.stats, experience: m.experience ?? null,
        }).onConflictDoNothing();
      }
    }
    for (const o of r.outOfAction) await d.insert(scenarioOutOfAction).values({ scenarioId: record.id, attackerId: o.attackerId, targetId: o.targetId ?? null, target: o.target, detail: o.detail });
  }
  for (const [i, a] of seedNews.entries()) {
    await d.insert(newsArticles).values({ headline: a.headline, byline: a.byline, body: a.body, notice: !!a.notice, locationId: a.location ?? 'mordheim', sort: i + 1 });
  }
}
