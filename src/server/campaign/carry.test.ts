/** Carrying warbands between campaigns, against a real Postgres (PGlite). */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { eq } from 'drizzle-orm';
import { actorOf, testDatabase } from '../testdb.ts';
import * as schema from '../db/schema.ts';
import { bundleFor } from '../../builder/data.ts';
import { addNamed, newRoster } from '../../builder/roster.ts';
import { warriorsOf } from '../../builder/rules.ts';
import type { Roster } from '../../builder/evaluate.ts';
import { claimWarband, getWarband, listWarbands, LedgerError } from './roster.ts';
import { drawUp, foundWarband, keepView, proposalFor, undoLast } from './keep.ts';
import { carryTargets, carryWarband, earlierLives, earlierWarbands, previewCarry } from './carry.ts';
import { createCampaign, launchCampaign, updateCampaign } from '../admin/campaigns.ts';

const A = 'mordheim-2000';
const gm = actorOf('user-gm', 'Game Master', 'gm');
const hilde = actorOf('user-hilde', 'Hilde');
const niklas = actorOf('user-niklas', 'Niklas');
const reik = bundleFor('reiklanders')!;
let db: Awaited<ReturnType<typeof testDatabase>>['db'];
let B = '', silver = '';

function startingRoster(): { roster: Roster; names: Record<string, string[]> } {
  let n = 0; const id = () => `n${++n}`;
  let r = newRoster(reik, 'reiklanders', id);
  const cap = addNamed(reik, r, null, 'Mercenary Captain', id); r = cap.roster;
  const kit = addNamed(reik, r, cap.id, 'Starting Equipment (Mercenaries)', id); r = kit.roster;
  r = addNamed(reik, r, kit.id, 'Sword', id).roster;
  const war = addNamed(reik, r, null, 'Warriors', id); r = war.roster;
  return { roster: r, names: { [cap.id]: ['Aldric Voss'], [war.id]: ['Bruno'] } };
}

before(async () => {
  ({ db } = await testDatabase());
  await db.insert(schema.user).values([gm, hilde, niklas].map((a) => ({ id: a.id, name: a.name, email: a.email, emailVerified: true })));
  await listWarbands(A);
  silver = (await foundWarband(hilde, A, { name: 'The Silver Hand', ...startingRoster() })).id;
  await claimWarband(niklas, 'nordost');
  const c = await createCampaign(gm, { name: 'Lustria', start: '2027-01-01', options: { carry: { heroesOnly: true, goldCap: 40, experienceCap: 5 } } });
  B = c.id;
});

test('only another open campaign that takes warbands in is offered; a draft only to a game master', async () => {
  assert.deepEqual((await carryTargets(hilde, silver)).map((c) => c.id), []);
  assert.deepEqual((await carryTargets(gm, silver)).map((c) => c.id), [B]);
  await assert.rejects(previewCarry(hilde, silver, B, 'as-is'), (e: unknown) => e instanceof LedgerError && e.status === 403, 'a player may not write in a draft');
  await launchCampaign(gm, B);
  assert.deepEqual((await carryTargets(hilde, silver)).map((c) => c.id), [B]);
  await assert.rejects(previewCarry(niklas, silver, B, 'as-is'), (e: unknown) => e instanceof LedgerError && e.status === 403, 'not their warband');
  await assert.rejects(previewCarry(hilde, silver, A, 'as-is'), (e: unknown) => e instanceof LedgerError && e.status === 409, 'they are there already');
});

test('the preview says what goes across and writes nothing', async () => {
  const before = await db.select().from(schema.warbands);
  const p = await previewCarry(hilde, silver, B, 'adjusted');
  assert.equal(p.pending, true);
  assert.deepEqual(p.plan.members.map((m) => m.name), ['Aldric Voss'], 'heroes only');
  assert.ok(p.plan.gold <= 40);
  assert.equal((await db.select().from(schema.warbands)).length, before.length);
});

test('adjusted: on the road until the keeper approves; the draw-up opens on the proposal, edits are kept and logged', async () => {
  const sourceBefore = JSON.stringify(await getWarband(silver));
  const r = await carryWarband(hilde, silver, B, 'adjusted');
  assert.equal(r.pending, true);
  const w = r.warband;
  assert.equal(w.campaignId, B);
  assert.equal(w.carriedFromId, silver);
  assert.equal(w.ownerId, hilde.id, 'the keeper keeps it in the new campaign too');
  assert.equal(w.built, false, 'no roster until it is approved');
  assert.equal(w.members.length, 1);
  assert.equal(w.members[0].name, 'Aldric Voss');
  await assert.rejects(carryWarband(hilde, silver, B, 'as-is'), (e: unknown) => e instanceof LedgerError && /keeps/.test(e.message), 'one warband per player in a campaign');
  const proposal = await proposalFor(w.id);
  assert.equal(proposal.carried?.from, 'Mordheim, City of the Damned');
  assert.ok(proposal.carried!.gold <= 40);
  assert.equal(warriorsOf(reik, proposal.roster).find((x) => x.kind === 'hero')!.experience, 5, 'the proposal is the campaign’s');
  // the keeper changes it: more crowns than proposed, and a warrior hired on the spot
  let n = 100; const id = () => `k${++n}`;
  const edited = addNamed(reik, proposal.roster, null, 'Warriors', id);
  const v = await drawUp(hilde, w.id, { roster: edited.roster, names: { [edited.id]: ['New Blood'] }, gold: 75, shards: 0 });
  assert.equal(v.gold, 75);
  assert.deepEqual(v.log.slice(0, 2).map((l) => l.kind), ['carry-edited', 'carried']);
  assert.match(v.log[1].text, /proposed/);
  const approved = (await getWarband(w.id))!;
  assert.ok(approved.built);
  assert.ok(approved.members.some((m) => m.name === 'New Blood'));
  const [row] = await db.select().from(schema.warbands).where(eq(schema.warbands.id, w.id));
  assert.equal(row.carry, null, 'the road is behind them');
  // striking the keeper's changes puts the proposal back
  const undone = await undoLast(hilde, w.id);
  assert.deepEqual(undone.roster, proposal.roster);
  assert.equal(JSON.stringify(await getWarband(silver)), sourceBefore, 'the old campaign’s warband is untouched');
});

test('as is: a warband written by hand stands at once, every living warrior and its books', async () => {
  await updateCampaign(gm, B, { options: { carry: { heroesOnly: false } } });
  const nordost = (await getWarband('nordost'))!;
  const r = await carryWarband(niklas, 'nordost', B, 'as-is');
  assert.equal(r.pending, false);
  assert.equal(r.warband.id, 'nordost-lustria');
  assert.equal(r.warband.members.length, nordost.members.filter((m) => !m.dead).length);
  assert.ok(r.warband.members.every((m) => m.id.endsWith('-lustria')));
  const lives = await earlierLives(r.warband.members.map((m) => m.id));
  const agnar = lives['agnar-lustria'];
  assert.equal(agnar?.[0].memberId, 'agnar');
  assert.ok(agnar[0].battles >= 1, 'the seed has Agnar in a played battle');
  assert.deepEqual((await earlierWarbands(r.warband.id)).map((x) => x.warbandId), ['nordost']);
});

test('start over: a shell with the veterans, drawn up afresh with the campaign’s crowns', async () => {
  // a game master carries an unowned warband
  const bitter = (await getWarband('bitterbrow-expedition'))!;
  const hero = bitter.members.find((m) => m.rank === 'hero' && !m.dead)!;
  const r = await carryWarband(gm, 'bitterbrow-expedition', B, 'start-over', { veterans: [hero.id] });
  assert.equal(r.pending, true);
  assert.deepEqual(r.warband.members.map((m) => [m.name, m.experience, m.injuries.length, m.skills.length]), [[hero.name, 0, 0, 0]]);
  const p = await proposalFor(r.warband.id);
  assert.equal(p.carried?.mode, 'start-over');
  assert.equal(p.carried?.gold, 500, 'the campaign’s crowns');
});

test('a campaign that takes only some lists takes the others only started over', async () => {
  const c = await createCampaign(gm, { name: 'Lists', start: '2027-01-01', options: { catalogues: ['averlanders'] } });
  await assert.rejects(previewCarry(gm, silver, c.id, 'as-is'), (e: unknown) => e instanceof LedgerError && /start over/.test(e.message));
  const p = await previewCarry(gm, silver, c.id, 'start-over');
  assert.equal(p.mode, 'start-over');
  const view = await keepView(silver);
  assert.ok(view.roster, 'still the source, still kept');
});
