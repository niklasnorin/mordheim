/**
 * Carrying a warband into another campaign (`docs/campaigns.md` §5). The rule is pure in `campaign/carry.ts`; this
 * reads the warband as it stands, checks who may carry it where, and writes the copy: a new warband with new warriors
 * (`carried_from_id` on both), their portraits copied, the roster put through the new ids. The old campaign's record is
 * never written.
 *
 * As is, the copy stands at once. A built warband adjusted, and any warband started over, comes in pending: the
 * campaign's proposal is kept on `warbands.carry`, the roster's draw-up opens on it, the keeper changes whatever they
 * like and approves it there (`drawUp` in keep.ts), and the log keeps both what was proposed and what was approved.
 */
import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../db/client.ts';
import { images, members, scenarioMembers, scenarioOutOfAction, scenarios, warbands } from '../db/schema.ts';
import { LedgerError } from '../../curfew/ledger.ts';
import type { Roster } from '../../builder/evaluate.ts';
import { carryPlan, needsApproval, newIdFor, remapRoster, type CarryChoices, type CarryMember, type CarryPlan } from '../../campaign/carry.ts';
import { CARRY_MODES, type CampaignConfig, type CarryMode, type CarryPolicy } from '../../campaign/campaign.ts';
import { isGm, type Actor } from '../roles.ts';
import { getCampaign, listCampaigns } from './campaigns.ts';
import { writableCampaign } from './guard.ts';
import { getWarband } from './roster.ts';
import { bundleOrRefuse, catalogueForType, log, project, sums } from './keep.ts';
import type { Warband } from '../../campaign/model.ts';

/** A warband on the road, kept on `warbands.carry` until its keeper approves the roster. */
export interface PendingCarry {
  fromId: string;
  fromCampaignId: string;
  fromCampaignName: string;
  mode: CarryMode;
  /** The roster the new campaign proposes (the new warriors' ids); null for a start over, drawn up from the record. */
  proposed: Roster | null;
  gold: number;
  shards: number;
  notes: string[];
}

export function pendingOf(raw: unknown): PendingCarry | null {
  const c = raw as PendingCarry | null;
  return c && typeof c === 'object' && typeof c.fromId === 'string' ? c : null;
}

export interface CarryPreview {
  from: { campaignId: string; campaignName: string; warbandId: string; name: string };
  to: { id: string; name: string; slug: string; policy: CarryPolicy; startingCrowns: number };
  mode: CarryMode;
  plan: CarryPlan;
  /** Whether the keeper approves it in the new campaign's draw-up before it stands there. */
  pending: boolean;
}

type WarbandRow = typeof warbands.$inferSelect;

async function warbandRow(id: string): Promise<WarbandRow> {
  const [w] = await db().select().from(warbands).where(eq(warbands.id, id)).limit(1);
  if (!w) throw new LedgerError('No such warband has entered the gates.', 404);
  return w;
}

/** The campaigns a warband may be carried into by this actor: another campaign, open to them, that takes warbands in. */
export async function carryTargets(actor: Actor, warbandId: string): Promise<CampaignConfig[]> {
  const w = await warbandRow(warbandId);
  return (await listCampaigns()).filter((c) => c.id !== w.campaignId && c.options.carry.modes.length > 0 && (c.status === 'live' || (c.status === 'draft' && isGm(actor))));
}

async function checked(actor: Actor, warbandId: string, toCampaignId: string, mode: CarryMode, choices: CarryChoices): Promise<{ row: WarbandRow; warband: Warband; from: CampaignConfig; to: CampaignConfig; plan: CarryPlan }> {
  if (!CARRY_MODES.includes(mode)) throw new LedgerError('A warband comes as it is, adjusted, or started over.');
  const row = await warbandRow(warbandId);
  if (!isGm(actor) && row.ownerId !== actor.id) throw new LedgerError('Only its keeper, or a game master, carries a warband away.', 403);
  if (pendingOf(row.carry)) throw new LedgerError('They are still on the road here; approve their roster first.', 409);
  const from = await getCampaign(row.campaignId);
  const to = await writableCampaign(actor, toCampaignId);
  if (!from) throw new LedgerError('No such campaign.', 404);
  if (from.id === to.id) throw new LedgerError('They are in that campaign already.', 409);
  if (to.status !== 'live' && to.status !== 'draft') throw new LedgerError(`${to.name} is over; nobody joins it now.`, 409);
  if (!to.options.carry.modes.includes(mode)) throw new LedgerError(`${to.name} does not take warbands ${mode === 'as-is' ? 'as they are' : mode === 'adjusted' ? 'adjusted' : 'started over'}.`, 409);
  if (row.ownerId) {
    const [there] = await db().select({ name: warbands.name }).from(warbands).where(and(eq(warbands.campaignId, to.id), eq(warbands.ownerId, row.ownerId))).limit(1);
    if (there) throw new LedgerError(`Their keeper keeps ${there.name} in ${to.name} already.`, 409);
  }
  const roster = (row.roster as Roster | null) ?? null;
  const slug = roster?.catalogue ?? catalogueForType(row.type);
  if (mode !== 'start-over' && to.options.catalogues && (!slug || !to.options.catalogues.includes(slug))) throw new LedgerError(`${to.name} does not take ${row.type}; they may only start over, under a list it takes.`, 409);
  const warband = (await getWarband(warbandId))!;
  const stash = roster ? await sums(warbandId) : { gold: row.gold, shards: row.wyrdstone };
  const source = {
    members: warband.members.map((m): CarryMember => ({ id: m.id, name: m.name, rank: m.rank, role: m.role, dead: m.dead, experience: m.experience ?? null, skills: m.skills, injuries: m.injuries, equipment: m.equipment ?? [] })),
    roster, gold: stash.gold, shards: stash.shards,
  };
  const plan = carryPlan(source, to.options.carry, mode, choices, roster ? bundleOrRefuse(roster.catalogue) : null);
  return { row, warband, from, to, plan };
}

/** What would go across, and how, without writing anything. */
export async function previewCarry(actor: Actor, warbandId: string, toCampaignId: string, mode: CarryMode, choices: CarryChoices = {}): Promise<CarryPreview> {
  const { row, from, to, plan } = await checked(actor, warbandId, toCampaignId, mode, choices);
  return {
    from: { campaignId: from.id, campaignName: from.name, warbandId: row.id, name: row.name },
    to: { id: to.id, name: to.name, slug: to.slug, policy: to.options.carry, startingCrowns: to.options.startingCrowns },
    mode, plan, pending: needsApproval(mode, !!row.roster),
  };
}

/** Copy a warrior's portrait and the picture it was framed from, as new pictures of the new warrior. */
async function copyPortrait(fromId: string, toId: string, actor: Actor): Promise<void> {
  const [m] = await db().select({ image: members.portraitImage, source: members.portraitSource, crop: members.portraitCrop }).from(members).where(eq(members.id, fromId)).limit(1);
  if (!m?.image || !m.source) return;
  const rows = await db().select().from(images).where(inArray(images.id, [m.image, m.source]));
  const fresh = new Map<string, string>();
  for (const r of rows) {
    const id = crypto.randomUUID();
    fresh.set(r.id, id);
    await db().insert(images).values({ id, memberId: toId, mime: r.mime, data: r.data, bytes: r.bytes, uploadedBy: actor.id });
  }
  if (fresh.has(m.image) && fresh.has(m.source)) await db().update(members).set({ portraitImage: fresh.get(m.image)!, portraitSource: fresh.get(m.source)!, portraitCrop: m.crop }).where(eq(members.id, toId));
}

/**
 * Carry a warband into another campaign. Answers the new warband, and whether it waits on its keeper's approval of the
 * roster in the new campaign's draw-up.
 */
export async function carryWarband(actor: Actor, warbandId: string, toCampaignId: string, mode: CarryMode, choices: CarryChoices = {}): Promise<{ warband: Warband; pending: boolean }> {
  const { row, warband, from, to, plan } = await checked(actor, warbandId, toCampaignId, mode, choices);
  const d = db();
  const built = !!row.roster;
  const pending = needsApproval(mode, built);
  // the copy's ids: the old ones with the new campaign's address after them
  const takenWarbands = new Set((await d.select({ id: warbands.id }).from(warbands)).map((r) => r.id));
  const takenMembers = new Set((await d.select({ id: members.id }).from(members)).map((r) => r.id));
  const id = newIdFor(row.id, to.slug, takenWarbands);
  const ids = new Map(plan.members.map((m) => [m.fromId, newIdFor(m.fromId, to.slug, takenMembers)]));
  const [{ n }] = await d.select({ n: sql<number>`coalesce(max(${warbands.sort}), 0)::int` }).from(warbands).where(eq(warbands.campaignId, to.id));
  const roster = plan.roster ? remapRoster(plan.roster, ids) : null;
  const carry: PendingCarry | null = pending
    ? { fromId: row.id, fromCampaignId: from.id, fromCampaignName: from.name, mode, proposed: mode === 'adjusted' ? roster : null, gold: mode === 'start-over' ? to.options.startingCrowns : plan.gold, shards: mode === 'start-over' ? 0 : plan.shards, notes: plan.notes }
    : null;
  await d.insert(warbands).values({
    id, campaignId: to.id, carriedFromId: row.id, name: row.name, type: row.type, sigil: row.sigil, crest: row.crest, ownerId: row.ownerId, player: row.player, lore: row.lore,
    // a warband written by hand keeps its books on the row; a built one in its log
    rating: built || mode === 'start-over' ? 0 : row.rating, gold: built || mode === 'start-over' ? 0 : plan.gold, wyrdstone: built || mode === 'start-over' ? 0 : plan.shards,
    carry, sort: n + 1,
  });
  const source = new Map(warband.members.map((m) => [m.id, m]));
  for (const [i, p] of plan.members.entries()) {
    const m = source.get(p.fromId)!;
    const [r] = await d.select().from(members).where(eq(members.id, p.fromId)).limit(1);
    await d.insert(members).values({
      id: ids.get(p.fromId)!, warbandId: id, carriedFromId: p.fromId, name: p.name, role: m.role, rank: p.rank, portrait: m.portrait, epithet: m.epithet,
      stats: r.stats, experience: p.experience, skills: p.skills, injuries: p.injuries, equipment: p.equipment, lore: m.lore, sort: i + 1,
    });
    await copyPortrait(p.fromId, ids.get(p.fromId)!, actor);
  }
  const whence = `Brought from ${from.name}`;
  if (built && roster && mode === 'as-is') {
    const b = bundleOrRefuse(roster.catalogue);
    await d.update(warbands).set({ roster }).where(eq(warbands.id, id));
    await project(b, roster);
    await log(id, actor, { kind: 'carried', gold: plan.gold, shards: plan.shards, text: `${whence} as they were: ${plan.members.length} warriors, ${plan.gold} crowns and ${plan.shards} shards of wyrdstone.` });
  }
  return { warband: (await getWarband(id))!, pending };
}

/**
 * Approving a warband on the road: called by the draw-up when it writes the roster. The log keeps what came across and,
 * if the keeper changed the campaign's proposal, a line holding the proposal as the roster before their changes.
 */
export async function approveCarry(actor: Actor, warbandId: string, approved: Roster, gold: number, shards: number): Promise<boolean> {
  const row = await warbandRow(warbandId);
  const carry = pendingOf(row.carry);
  if (!carry) return false;
  const how = carry.mode === 'start-over' ? 'started over' : carry.mode === 'adjusted' ? 'adjusted' : 'as they were';
  await log(warbandId, actor, { kind: 'carried', gold, shards, text: `Brought from ${carry.fromCampaignName}, ${how}, with ${gold} crowns and ${shards} shards of wyrdstone${carry.mode !== 'start-over' && (gold !== carry.gold || shards !== carry.shards) ? ` (the campaign proposed ${carry.gold} and ${carry.shards})` : ''}.` });
  if (carry.proposed && JSON.stringify(carry.proposed) !== JSON.stringify(approved)) {
    await log(warbandId, actor, { kind: 'carry-edited', text: `The keeper changed the roster ${carry.fromCampaignName}’s warband was proposed with; striking this line puts the proposal back.`, before: carry.proposed });
  }
  await db().update(warbands).set({ carry: null, updatedAt: new Date() }).where(eq(warbands.id, warbandId));
  return true;
}

// ───────────────────────── lineage ─────────────────────────

export interface EarlierLife { campaignId: string; campaignName: string; campaignSlug: string; warbandId: string; memberId: string; battles: number; takedowns: number }

/** Where each warrior came from, campaign by campaign, nearest first, with what they did there. */
export async function earlierLives(memberIds: string[]): Promise<Record<string, EarlierLife[]>> {
  const out: Record<string, EarlierLife[]> = {};
  if (!memberIds.length) return out;
  const d = db();
  const campaigns = await listCampaigns();
  let frontier = (await d.select({ id: members.id, from: members.carriedFromId }).from(members).where(inArray(members.id, memberIds))).filter((r) => r.from).map((r) => ({ origin: r.id, id: r.from! }));
  for (let depth = 0; frontier.length && depth < 8; depth++) {
    const rows = await d.select({ id: members.id, from: members.carriedFromId, warbandId: members.warbandId, campaignId: warbands.campaignId }).from(members).innerJoin(warbands, eq(warbands.id, members.warbandId)).where(inArray(members.id, frontier.map((f) => f.id)));
    const ids = rows.map((r) => r.id);
    const [fought, downs] = ids.length ? await Promise.all([
      d.select({ id: scenarioMembers.memberId, n: sql<number>`count(*)::int` }).from(scenarioMembers).innerJoin(scenarios, eq(scenarios.id, scenarioMembers.scenarioId)).where(and(inArray(scenarioMembers.memberId, ids), eq(scenarios.status, 'played'))).groupBy(scenarioMembers.memberId),
      d.select({ id: scenarioOutOfAction.attackerId, n: sql<number>`count(*)::int` }).from(scenarioOutOfAction).where(inArray(scenarioOutOfAction.attackerId, ids)).groupBy(scenarioOutOfAction.attackerId),
    ]) : [[], []];
    const next: typeof frontier = [];
    for (const f of frontier) {
      const r = rows.find((x) => x.id === f.id);
      if (!r) continue;
      const c = campaigns.find((x) => x.id === r.campaignId);
      (out[f.origin] ??= []).push({ campaignId: r.campaignId, campaignName: c?.name ?? r.campaignId, campaignSlug: c?.slug ?? '', warbandId: r.warbandId, memberId: r.id, battles: fought.find((x) => x.id === r.id)?.n ?? 0, takedowns: downs.find((x) => x.id === r.id)?.n ?? 0 });
      if (r.from) next.push({ origin: f.origin, id: r.from });
    }
    frontier = next;
  }
  return out;
}

/** The warbands a warband came from, nearest first, for the story's link back to its earlier chapters. */
export async function earlierWarbands(warbandId: string): Promise<{ campaignName: string; campaignSlug: string; warbandId: string; name: string }[]> {
  const out: { campaignName: string; campaignSlug: string; warbandId: string; name: string }[] = [];
  const campaigns = await listCampaigns();
  let at = (await warbandRow(warbandId)).carriedFromId;
  for (let depth = 0; at && depth < 8; depth++) {
    const [w] = await db().select().from(warbands).where(eq(warbands.id, at)).limit(1);
    if (!w) break;
    const c = campaigns.find((x) => x.id === w.campaignId);
    out.push({ campaignName: c?.name ?? w.campaignId, campaignSlug: c?.slug ?? '', warbandId: w.id, name: w.name });
    at = w.carriedFromId;
  }
  return out;
}

/** The warband's road, if it is still on it. */
export async function pendingFor(warbandId: string): Promise<PendingCarry | null> {
  const [r] = await db().select({ carry: warbands.carry }).from(warbands).where(eq(warbands.id, warbandId)).limit(1);
  return pendingOf(r?.carry);
}
