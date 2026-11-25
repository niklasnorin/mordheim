/** A warband kept by the builder, against a real Postgres (PGlite): founding, the stash, the trading post, the dead, the log. */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { actorOf, testDatabase } from '../testdb.ts';
import { bundleFor } from '../../builder/data.ts';
import { addNamed, findSelection, newRoster, optionNamed } from '../../builder/roster.ts';
import { stashItems, summarise, warriorsOf } from '../../builder/rules.ts';
import type { Roster } from '../../builder/evaluate.ts';
import { buyItem, changeRoster, drawUp, foundWarband, hire, income, keepView, keepViewFor, loseWarrior, moveGear, promote, proposalFor, recruit, sellItem, undoLast, wyrdstoneIncome, LedgerError } from './keep.ts';
import { getWarband, updateMember } from './roster.ts';

const gm = actorOf('user-gm', 'Game Master', 'gm');
const hilde = actorOf('user-hilde', 'Hilde');
const rival = actorOf('user-rival', 'Rival');
const reik = bundleFor('reiklanders')!;
const ids = () => { let n = 0; return () => `n${++n}`; };

before(async () => {
  const { db, schema } = await testDatabase();
  await db.insert(schema.user).values([gm, hilde, rival].map((a) => ({ id: a.id, name: a.name, email: a.email, emailVerified: true })));
});

function startingRoster(): { roster: Roster; names: Record<string, string[]> } {
  const id = ids();
  let r = newRoster(reik, 'reiklanders', id);
  const cap = addNamed(reik, r, null, 'Mercenary Captain', id); r = cap.roster;
  const kit = addNamed(reik, r, cap.id, 'Starting Equipment (Mercenaries)', id); r = kit.roster;
  r = addNamed(reik, r, kit.id, 'Sword', id).roster;
  const war = addNamed(reik, r, null, 'Warriors', id); r = war.roster;
  return { roster: r, names: { [cap.id]: ['Aldric Voss'], [war.id]: ['Bruno'] } };
}
let warbandId = '';

test('a player founds a warband from the builder: its warriors on the record, the rest of the 500 crowns in the stash', async () => {
  const { roster, names } = startingRoster();
  const spent = summarise(reik, roster).spent;
  const w = await foundWarband(hilde, { name: 'The Silver Hand', roster, names });
  warbandId = w.id;
  assert.equal(w.ownerId, hilde.id);
  assert.equal(w.type, 'Reiklanders');
  assert.ok(w.built);
  const aldric = w.members.find((m) => m.name === 'Aldric Voss')!;
  assert.equal(aldric.role, 'Mercenary Captain');
  assert.equal(aldric.rank, 'hero');
  assert.deepEqual(aldric.equipment, ['Sword']);
  assert.equal(aldric.experience, 20);
  assert.ok(w.members.some((m) => m.name === 'Bruno' && m.rank === 'henchman'));
  const v = await keepView(w.id);
  assert.equal(v.gold, 500 - spent);
  assert.equal(v.log[0].kind, 'found');
  await assert.rejects(foundWarband(hilde, { name: 'Another', ...startingRoster() }), (e: unknown) => e instanceof LedgerError && e.status === 409);
  const hidden = await keepViewFor(rival, w.id);
  assert.equal(hidden.log.length, 0, 'a rival does not read the stash');
});

test('a roster that breaks the rules or overspends is not founded', async () => {
  const id = ids();
  let r = newRoster(reik, 'reiklanders', id);
  r = addNamed(reik, r, null, 'Warriors', id).roster;
  await assert.rejects(foundWarband(gm, { name: 'Leaderless', roster: r, names: {} }), (e: unknown) => e instanceof LedgerError && /Captain|heroes/.test(e.message));
  const bad = structuredClone(startingRoster().roster);
  bad.selections[0].children.push({ id: 'x1', entry: bad.selections.find((s) => reik.nodes.get(s.entry)?.name === 'Mercenary Captain')!.entry, count: 1, children: [] });
  await assert.rejects(foundWarband(gm, { name: 'Odd', roster: bad, names: {} }), (e: unknown) => e instanceof LedgerError && /not offered where it stands/.test(e.message));
});

test('between games: hire and recruit from the stash, buy at the post, arm a warrior from the stash, sell the rest', async () => {
  let v = await keepView(warbandId);
  const gold0 = v.gold;
  const youngblood = optionNamed(reik, v.roster!, null, 'Youngblood')!;
  v = await hire(hilde, warbandId, v.version, youngblood.id, ['Kurt']);
  assert.equal(v.gold, gold0 - 15);
  assert.ok((await getWarband(warbandId))!.members.some((m) => m.name === 'Kurt' && m.role === 'Youngblood'));
  const group = warriorsOf(reik, v.roster!).find((w) => w.type === 'Warriors')!;
  v = await recruit(hilde, warbandId, v.version, group.id, 'Lotte');
  assert.equal(v.gold, gold0 - 15 - 25);
  assert.equal(warriorsOf(reik, v.roster!).find((w) => w.type === 'Warriors')!.count, 2);
  // two swords at the post, for the pair of warriors
  v = await buyItem(hilde, warbandId, v.version, 'sword', 2, 10);
  assert.equal(v.gold, gold0 - 40 - 20);
  await assert.rejects(buyItem(hilde, warbandId, v.version, 'sword', 1, 7), (e: unknown) => e instanceof LedgerError && /costs 10/.test(e.message));
  await assert.rejects(buyItem(hilde, warbandId, v.version, 'elven-cloak', 1, 120), (e: unknown) => e instanceof LedgerError && /does not have/.test(e.message), 'a rare item the post does not offer');
  const stashSword = stashItems(reik, v.roster!).find((i) => i.name === 'Sword')!;
  assert.equal(stashSword.count, 2);
  v = await moveGear(hilde, warbandId, v.version, stashSword.id, group.id);
  assert.deepEqual(stashItems(reik, v.roster!), [], 'both swords went to the group');
  assert.ok((await getWarband(warbandId))!.members.find((m) => m.name === 'Lotte')!.equipment.includes('Sword'));
  // the captain's sword back to the stash, and sold at half its price
  const captain = warriorsOf(reik, v.roster!).find((w) => w.type === 'Mercenary Captain')!;
  v = await changeRoster(hilde, warbandId, v.version, { kind: 'remove', id: captain.gear[0].id });
  const back = stashItems(reik, v.roster!).find((i) => i.name === 'Sword')!;
  const before = v.gold;
  v = await sellItem(hilde, warbandId, v.version, back.id, 1);
  assert.equal(v.gold, before + 5);
  await assert.rejects(sellItem(hilde, warbandId, v.version - 1, 'whatever', 1), (e: unknown) => e instanceof LedgerError && e.status === 409, 'an older roster is refused');
  await assert.rejects(hire(rival, warbandId, v.version, youngblood.id, ['Spy']), (e: unknown) => e instanceof LedgerError && e.status === 403);
});

test('wyrdstone sells at the rulebook’s rate, and experience costs nothing', async () => {
  assert.equal(wyrdstoneIncome(1, 5), 40);
  assert.equal(wyrdstoneIncome(3, 12), 60);
  assert.equal(wyrdstoneIncome(10, 20), 100);
  let v = await keepView(warbandId);
  const gold = v.gold;
  v = await income(hilde, warbandId, v.version, { found: 3, sold: 2 });
  assert.equal(v.shards, 1);
  assert.equal(v.gold, gold + wyrdstoneIncome(2, summarise(reik, v.roster!).size));
  const kurt = warriorsOf(reik, v.roster!).find((w) => w.type === 'Youngblood')!;
  const xpOption = optionNamed(reik, v.roster!, kurt.id, 'Experience')!;
  const g = v.gold;
  v = await changeRoster(hilde, warbandId, v.version, { kind: 'add', parent: kurt.id, entry: xpOption.id });
  assert.equal(v.gold, g);
  assert.equal(warriorsOf(reik, v.roster!).find((w) => w.type === 'Youngblood')!.experience, 1);
});

test('a warrior who falls leaves the roster and their gear is lost; the line can be struck and they come back', async () => {
  let v = await keepView(warbandId);
  const lotte = (await getWarband(warbandId))!.members.find((m) => m.name === 'Lotte')!;
  v = await loseWarrior(hilde, warbandId, v.version, lotte.id);
  const group = warriorsOf(reik, v.roster!).find((w) => w.type === 'Warriors')!;
  assert.equal(group.count, 1);
  assert.ok(!group.members.includes(lotte.id));
  assert.ok((await getWarband(warbandId))!.members.find((m) => m.id === lotte.id)!.dead);
  assert.equal(v.log[0].kind, 'lost');
  v = await undoLast(hilde, warbandId);
  assert.equal(warriorsOf(reik, v.roster!).find((w) => w.type === 'Warriors')!.count, 2);
  assert.ok(!(await getWarband(warbandId))!.members.find((m) => m.id === lotte.id)!.dead);
  // marking a warrior fallen on the muster roll does the same
  await updateMember(hilde, lotte.id, { dead: true });
  v = await keepView(warbandId);
  assert.equal(warriorsOf(reik, v.roster!).find((w) => w.type === 'Warriors')!.count, 1);
});

test('a henchman is promoted out of their group into one of their own, and the roster keeps the numbers', async () => {
  let v = await keepView(warbandId);
  const kurtRoster = warriorsOf(reik, v.roster!);
  const group = kurtRoster.find((w) => w.type === 'Warriors')!;
  v = await recruit(hilde, warbandId, v.version, group.id, 'Mats');
  const mats = (await getWarband(warbandId))!.members.find((m) => m.name === 'Mats')!;
  v = await promote(hilde, warbandId, v.version, mats.id);
  const now = warriorsOf(reik, v.roster!);
  const hero = now.find((w) => w.members.includes(mats.id))!;
  assert.equal(hero.kind, 'hero');
  assert.equal(hero.count, 1);
  assert.ok(hero.equipment.includes('Sword'), 'armed as the group was');
  assert.equal((await getWarband(warbandId))!.members.find((m) => m.id === mats.id)!.rank, 'hero');
  // the numbers are the roster's: the form cannot change them
  await updateMember(hilde, mats.id, { stats: { WS: 9 }, epithet: 'Who Was Noticed' });
  const after = (await getWarband(warbandId))!.members.find((m) => m.id === mats.id)!;
  assert.notEqual(after.stats.WS, 9);
  assert.equal(after.epithet, 'Who Was Noticed');
});

test('a written warband is drawn up from its record and confirmed by its keeper', async () => {
  const p = await proposalFor('nordost');
  assert.equal(p.catalogue, 'ostlanders');
  const agnarSel = Object.entries(p.names).find(([, n]) => n.includes('Agnar Nordost'))![0];
  assert.deepEqual(findSelection(p.roster.selections, agnarSel)!.members, ['agnar']);
  await assert.rejects(drawUp(hilde, 'nordost', { roster: p.roster, gold: 40 }), (e: unknown) => e instanceof LedgerError && e.status === 403);
  const v = await drawUp(gm, 'nordost', { roster: p.roster, gold: 40, shards: 2 });
  assert.equal(v.gold, 40);
  assert.equal(v.shards, 2);
  const w = (await getWarband('nordost'))!;
  assert.ok(w.built);
  assert.equal(w.members.find((m) => m.id === 'agnar')!.role, 'Elder');
  await assert.rejects(drawUp(gm, 'nordost', { roster: p.roster, gold: 0 }), (e: unknown) => e instanceof LedgerError && e.status === 409);
});

test('a played game’s experience goes onto the roster once, and the Fountain Post pays a built warband through its log', async () => {
  const { listScenarios } = await import('./scenarios.ts');
  const { payIn, awardExperience: award } = await import('./keep.ts');
  const game = (await listScenarios()).find((s) => s.status === 'played' && s.warbands.some((p) => p.warbandId === 'nordost'))!;
  assert.ok(game, 'the seed has a played game for the Kin');
  let v = await keepView('nordost');
  const b = bundleFor('ostlanders')!;
  const elder = warriorsOf(b, v.roster!).find((w) => w.type === 'Elder')!;
  v = await award(gm, 'nordost', v.version, game.id, { [elder.id]: 2 });
  assert.equal(warriorsOf(b, v.roster!).find((w) => w.type === 'Elder')!.experience, elder.experience + 2);
  assert.equal((await getWarband('nordost'))!.members.find((m) => m.id === 'agnar')!.experience, elder.experience + 2);
  await assert.rejects(award(gm, 'nordost', v.version, game.id, { [elder.id]: 1 }), (e: unknown) => e instanceof LedgerError && e.status === 409);
  const gold = v.gold;
  assert.equal(await payIn(gm, 'nordost', { gold: 15, xp: new Map([['agnar', 1]]), kind: 'job', text: 'The Fountain Post: a test' }), true);
  v = await keepView('nordost');
  assert.equal(v.gold, gold + 15);
  assert.equal(warriorsOf(b, v.roster!).find((w) => w.type === 'Elder')!.experience, elder.experience + 3);
  assert.equal(await payIn(gm, 'bitterbrow-expedition', { gold: 5, xp: new Map(), kind: 'job', text: 'x' }), false, 'a written warband is paid its own way');
});
