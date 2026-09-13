/**
 * The first fill. The campaign's record used to live in source; the files under src/data/ are now the seed. When
 * the warbands table is empty the fixtures are imported once, so a fresh database (local PGlite, a new Neon) shows
 * the campaign as it was recorded. After that the database rules and the fixtures are never read again.
 */
import { sql } from 'drizzle-orm';
import { db } from '../db/client.ts';
import { members, newsArticles, scenarioMembers, scenarioOutOfAction, scenarioWarbands, scenarios, warbands } from '../db/schema.ts';
import { warbands as seedWarbands } from '../../data/warbands.ts';
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
export function forgetSeeded(): void { seeded = undefined; }

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
      prologue: r.prologue, battle: r.battle, epilogue: r.epilogue, loot: r.loot, campaignNotes: r.campaignNotes, puzzle: r.puzzle ?? null,
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
