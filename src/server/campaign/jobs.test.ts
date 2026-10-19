/** The Fountain Post against a real Postgres (PGlite): the seeded boards, the dry run, taking the jobs, and undoing them. */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { eq, inArray } from 'drizzle-orm';
import { actorOf, testDatabase } from '../testdb.ts';
import { db } from '../db/client.ts';
import { members, scenarios, warbandJobs, warbands } from '../db/schema.ts';
import { claimWarband, getWarband } from './roster.ts';
import { createScenario } from './scenarios.ts';
import { getLocation } from './locations.ts';
import { addJob, jobsTaken, listJobs, loadRecord, offer, postOverview, removeJob, takeJobs, undoJobs, updateJob, withBooks, LedgerError } from './jobs.ts';
import { locations as fixtures } from '../../data/locations.ts';
import { numberBoard, powerOf, totalExperience } from '../../campaign/jobs.ts';

const gm = actorOf('user-gm', 'Game Master', 'gm');
const player = actorOf('user-player', 'Player');
let game = '';

before(async () => {
  const { db, schema } = await testDatabase();
  await db.insert(schema.user).values([gm, player].map((a) => ({ id: a.id, name: a.name, email: a.email, emailVerified: true })));
});

const refused = (status: number) => (e: unknown) => e instanceof LedgerError && e.status === status;
const gold = async (id: string) => (await db().select({ gold: warbands.gold }).from(warbands).where(eq(warbands.id, id)))[0].gold;
const setBooks = (id: string, rating: number, gold: number) => db().update(warbands).set({ rating, gold }).where(eq(warbands.id, id));
const xpOf = async (id: string) => totalExperience({ warriors: (await getWarband(id))!.members.filter((m) => !m.dead).map((m) => ({ id: m.id, name: m.name, rank: m.rank, experience: m.experience ?? 0 })) });

test('the boards are nailed up from the fixtures, each job at its point of interest', async () => {
  const fussenbach = await listJobs('fussenbach');
  assert.equal(fussenbach.length, fixtures.find((l) => l.id === 'fussenbach')!.jobs!.length);
  const bridge = (await getLocation('fussenbach'))!.points.find((p) => p.name === 'The bridge')!;
  assert.equal(fussenbach.find((j) => j.title === 'Keeping the bridge')!.pointId, bridge.id);
  assert.equal(fussenbach.find((j) => j.title === 'Wading for the algae men')!.pointId, null, 'the silt flats are not pinned');
  assert.ok((await listJobs('mordheim')).length > 0);
  for (const l of fixtures) for (const j of l.jobs ?? []) if (j.point) assert.ok(l.points.some((p) => p.name === j.point), `${j.title}: ${j.point} is not a point of ${l.name}`);
  assert.equal(fussenbach.filter((j) => j.pointId != null).length, fixtures.find((l) => l.id === 'fussenbach')!.jobs!.filter((j) => j.point).length, 'every named point was found');
});

test('the books are set for the ceiling: the Bitterbrows logged, the Welling Rune behind and kept by a player', async () => {
  await claimWarband(player, 'welling-rune');
  // the Bitterbrows have fought once beside the Nordost Kin; give them a little experience to be measured against
  const bitter = (await getWarband('bitterbrow-expedition'))!;
  for (const m of bitter.members) await db().update(members).set({ experience: m.rank === 'hero' ? 20 : 4 }).where(eq(members.id, m.id));
  await setBooks('bitterbrow-expedition', 160, 40);
  const welling = (await getWarband('welling-rune'))!;
  for (const m of welling.members) await db().update(members).set({ experience: m.rank === 'hero' ? 2 : 0 }).where(eq(members.id, m.id));
  await setBooks('welling-rune', 0, 0);
  const r = await loadRecord();
  const s = r.standings.find((x) => x.warbandId === 'welling-rune')!;
  assert.equal(s.active, true, 'kept by a player');
  assert.equal(s.played, 0);
});

test('a game master may reckon with figures of their own for the books, and nothing is saved', async () => {
  const logged = await loadRecord();
  const lifted = withBooks(logged, { 'bitterbrow-expedition': { rating: 400, gold: 7 }, nowhere: { rating: 1 } });
  assert.equal(lifted.standings.find((s) => s.warbandId === 'bitterbrow-expedition')!.rating, 400);
  assert.equal(lifted.standings.find((s) => s.warbandId === 'bitterbrow-expedition')!.gold, 7);
  assert.equal(logged.standings.find((s) => s.warbandId === 'bitterbrow-expedition')!.rating, 160, 'the loaded record is not changed');
  const o = await postOverview(gm, 'fussenbach', { 'nordost': { rating: 999 } });
  assert.equal(o.record.standings.find((s) => s.warbandId === 'nordost')!.rating, 999);
  assert.equal(o.logged.find((s) => s.warbandId === 'nordost')!.rating, (await loadRecord()).standings.find((s) => s.warbandId === 'nordost')!.rating, 'the logged books are what the database holds');
  assert.equal((await db().select({ rating: warbands.rating }).from(warbands).where(eq(warbands.id, 'nordost')))[0].rating, 124, 'nothing written');
  await assert.rejects(postOverview(player, 'fussenbach'), refused(403));
});

test('a dry run reckons the offer and writes nothing; a player may not look', async () => {
  const before = await gold('welling-rune');
  const o = await offer(gm, { warbandId: 'welling-rune', locationId: 'fussenbach' });
  assert.match(o.shut!, /As if a game were scheduled/);
  assert.equal(o.reckoning.pace, 1);
  assert.equal(o.reckoning.owed, 1);
  assert.ok(o.reckoning.ceiling);
  assert.deepEqual(o.reckoning.payout?.jobs.map((p) => p.owed), [true, false], 'the owed job, then the usual work');
  assert.equal(await gold('welling-rune'), before);
  await assert.rejects(offer(player, { warbandId: 'welling-rune', locationId: 'fussenbach' }), refused(403));
  await assert.rejects(takeJobs(gm, 'nowhere', 'welling-rune'), refused(404));
});

test('a scheduled game opens the post; the jobs are paid into the roster once, and never the next field', async () => {
  const bridge = (await getLocation('fussenbach'))!.points.find((p) => p.name === 'The bridge')!;
  const s = await createScenario(gm, { title: 'At the bridge', playedOn: '2026-11-01', warbandIds: ['welling-rune', 'nordost'], locationId: 'fussenbach', pointId: bridge.id });
  game = s.id;
  const o = await offer(gm, { warbandId: 'welling-rune', scenarioId: game });
  assert.equal(o.shut, null);
  const pay = o.reckoning.payout!;
  assert.ok(pay.gold > 0 && pay.experience > 0, `something is paid: ${pay.gold} gc, ${pay.experience} experience`);
  for (let i = 0; i < 5; i++) assert.notEqual((await offer(gm, { warbandId: 'welling-rune', scenarioId: game })).reckoning.payout!.jobs[0].job.pointId, bridge.id, 'nobody sweeps the bridge before the fight there');
  const [goldBefore, xpBefore] = [await gold('welling-rune'), await xpOf('welling-rune')];
  const after = await takeJobs(gm, game, 'welling-rune');
  assert.equal(after.taken.length, pay.jobs.length);
  assert.equal(after.taken[0].title, pay.jobs[0].job.title, 'what was offered is what was taken');
  assert.deepEqual(after.taken.map((t) => [t.dice, t.byHand]), pay.jobs.map((p) => [p.dice, false]), 'the post’s roll, kept with the job');
  assert.equal(await gold('welling-rune'), goldBefore + pay.gold);
  assert.equal(await xpOf('welling-rune'), xpBefore + pay.experience);
  assert.match(after.shut!, /already/);
  await assert.rejects(takeJobs(gm, game, 'welling-rune'), refused(409));
  // the Nordost Kin are at the pace: the usual work alone, a few crowns and, on a 6, a point each to two
  const nordostGold = await gold('nordost'), nordostXp = await xpOf('nordost');
  const usual = await takeJobs(gm, game, 'nordost', undefined, { dice: [12], experience: [6] });
  assert.equal(usual.taken.length, 1);
  assert.deepEqual([usual.taken[0].dice, usual.taken[0].byHand], [12, true], 'the table rolled a 12');
  assert.equal(usual.taken[0].owed, false);
  assert.ok(usual.taken[0].gold > 0 && usual.taken[0].gold <= 25, `${usual.taken[0].gold} gc`);
  assert.equal(await gold('nordost'), nordostGold + usual.taken[0].gold);
  assert.equal(usual.taken[0].grants.reduce((n, g) => n + g.experience, 0), 2);
  assert.equal(await xpOf('nordost'), nordostXp + 2);
  // the ceiling held: no stronger than the weakest warband ahead
  const r = await loadRecord();
  const me = r.standings.find((x) => x.warbandId === 'welling-rune')!;
  const ahead = r.standings.filter((x) => x.warbandId !== 'welling-rune');
  assert.ok(powerOf(me) <= Math.max(Math.min(...ahead.map(powerOf)), powerOf({ ...me, gold: goldBefore })));
  assert.equal(me.jobs, pay.jobs.filter((p) => p.owed).length, 'only the owed jobs count towards the pace');
  assert.equal(r.standings.find((x) => x.warbandId === 'nordost')!.jobs, 0, 'the usual work does not count');
  assert.equal((await offer(gm, { warbandId: 'welling-rune', locationId: 'fussenbach' })).reckoning.owed, 0, 'the gap is closed');
});

test('the table may roll D66 for which notice; a number it may not have is refused, to roll again', async () => {
  const board = await listJobs('fussenbach');
  const numbers = numberBoard(board);
  const bridge = board.find((j) => j.title === 'Keeping the bridge')!;
  const flagon = board.find((j) => j.title === 'Closing time at the Flagon')!;
  const o = await offer(gm, { warbandId: 'bitterbrow-expedition', locationId: 'fussenbach', rolls: { picks: [numbers.get(flagon.id)!] } });
  assert.equal(o.reckoning.payout!.jobs[0].job.id, flagon.id);
  assert.equal(o.reckoning.payout!.jobs[0].slot?.byHand, true);
  // the bridge is where the game is set: rolled at the table, it is refused
  const barred = await offer(gm, { warbandId: 'bitterbrow-expedition', locationId: 'fussenbach', rolls: { picks: [numbers.get(bridge.id)!] } });
  assert.match(barred.reckoning.payout!.jobs[0].slot!.refused!, /game is set/);
  assert.notEqual(barred.reckoning.payout!.jobs[0].job.id, bridge.id, 'the post drew another');
});

test('the table may roll the dice and say the totals; the post rolls the rest', async () => {
  const post = (await offer(gm, { warbandId: 'bitterbrow-expedition', locationId: 'fussenbach' })).reckoning.payout!;
  assert.ok(post.jobs.every((p) => !p.byHand));
  const hand = (await offer(gm, { warbandId: 'bitterbrow-expedition', locationId: 'fussenbach', rolls: { dice: [11] } })).reckoning.payout!;
  assert.deepEqual(hand.jobs.map((p) => [p.job.id, p.dice, p.byHand]), [[post.jobs[0].job.id, 11, true]], 'the same job, the table’s roll');
  await assert.rejects(takeJobs(gm, game, 'welling-rune', undefined, { dice: [13] }), (e) => e instanceof LedgerError && /2 to 12/.test(e.message));
  await assert.rejects(takeJobs(gm, game, 'welling-rune', undefined, { experience: [7] }), (e) => e instanceof LedgerError && /1 to 6/.test(e.message));
  await assert.rejects(takeJobs(gm, game, 'welling-rune', undefined, { picks: [17] }), (e) => e instanceof LedgerError && /D66/.test(e.message));
});

test('the jobs can be undone, and the post shuts once the game has begun', async () => {
  const goldBefore = await gold('welling-rune');
  const taken = (await jobsTaken('welling-rune')).filter((t) => t.scenarioId === game);
  await undoJobs(gm, game, 'welling-rune');
  assert.equal(await gold('welling-rune'), goldBefore - taken.reduce((n, t) => n + t.gold, 0));
  assert.equal((await db().select().from(warbandJobs).where(inArray(warbandJobs.id, taken.map((t) => t.id)))).length, 0);
  await assert.rejects(undoJobs(gm, game, 'welling-rune'), refused(404));
  await db().update(scenarios).set({ turn: 1 }).where(eq(scenarios.id, game));
  await assert.rejects(takeJobs(gm, game, 'welling-rune'), (e) => e instanceof LedgerError && /has begun/.test(e.message));
});

test('the game master keeps the board; a player may not', async () => {
  const before = (await listJobs('fussenbach')).length;
  const list = await addJob(gm, 'fussenbach', { title: 'Eel-weirs at dawn', text: 'Cleared the eel-weirs.', lean: 'gold' });
  assert.equal(list.length, before + 1);
  const added = list.find((j) => j.title === 'Eel-weirs at dawn')!;
  await assert.rejects(addJob(gm, 'fussenbach', { title: 'Eel-weirs at dawn' }), refused(409));
  await assert.rejects(addJob(player, 'fussenbach', { title: 'Mine' }), refused(403));
  assert.equal((await updateJob(gm, added.id, { withheld: true })).find((j) => j.id === added.id)!.withheld, true);
  const mordheimPoint = (await getLocation('mordheim'))!.points[0];
  await assert.rejects(updateJob(gm, added.id, { pointId: mordheimPoint.id }), refused(404), 'a point of another place');
  assert.equal((await removeJob(gm, added.id)).length, before);
});
