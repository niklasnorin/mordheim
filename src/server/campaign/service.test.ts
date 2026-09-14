/** The campaign's record against a real Postgres (PGlite): the seed, the roster, the scenarios, the articles and the Curfew's content. */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { actorOf, testDatabase } from '../testdb.ts';
import { addMember, assignWarband, claimWarband, createWarband, deleteWarband, getWarband, listWarbands, loadRoster, releaseWarband, removeMember, updateMember, updateWarband, LedgerError } from './roster.ts';
import { addEvent, addOutOfAction, createScenario, deleteScenario, getScenario, listScenarios, markPlayed, mayTrack, memberStories, removeEvent, removeOutOfAction, reopenScenario, revisionsOf, setBrought, setParticipants, setTurn, updateScenario, writeBattle, writePerspective } from './scenarios.ts';
import { articlesFor, createArticle, deleteArticle, listArticles, updateArticle } from './news.ts';
import { deleteDocument, getDocument, listDocuments, primeContent, saveDocument, documentRevisions } from '../content/curfew.ts';
import { seedIfEmpty } from './seed.ts';
import { carriedForward, scoresOf, summaryOf, tallyOf } from '../../campaign/model.ts';
import { claimWarband as claimLedger, loadOwnLedger, releaseWarband as giveUp } from '../curfew/service.ts';
import { LOCATIONS, OMENS, locationById } from '../../curfew/engine.ts';
import { warbands as fixtures } from '../../data/warbands.ts';
import { history } from '../../data/history.ts';
import { setRole } from '../roles.ts';
import { getSettings, setSetting } from './settings.ts';

const gm = actorOf('user-gm', 'Game Master', 'gm');
const niklas = actorOf('user-niklas', 'Niklas');
const rival = actorOf('user-rival', 'Rival');
const stranger = actorOf('user-stranger', 'Stranger');

before(async () => {
  const { db, schema } = await testDatabase();
  await db.insert(schema.user).values([gm, niklas, rival, stranger].map((a) => ({ id: a.id, name: a.name, email: a.email, emailVerified: true })));
});

test('an empty database is seeded once from the fixtures, and never again', async () => {
  assert.equal(await seedIfEmpty(), true);
  assert.equal(await seedIfEmpty(), false);
  const list = await listWarbands();
  assert.deepEqual(list.map((w) => w.id), fixtures.map((w) => w.id));
  const nordost = list.find((w) => w.id === 'nordost')!;
  assert.equal(nordost.members.length, 7);
  assert.equal(nordost.battles, 1, 'battles are counted from the played scenarios');
  assert.equal(nordost.victories, 1);
  assert.ok(nordost.members.find((m) => m.id === 'skalle')!.skills.some((s) => /Stag/.test(s)), 'prayers fold into skills');
  const scenarios = await listScenarios();
  assert.equal(scenarios.length, history.length);
  assert.equal(scenarios[0].status, 'played');
  assert.equal(scenarios[0].warbands.length, 2);
  assert.equal(scenarios[0].outOfAction.length, 7);
  assert.ok(scenarios[0].chronicle.length > 50, 'the Chronicle entry rides on the scenario');
  const roster = await loadRoster();
  assert.deepEqual(roster.injured.nordost!.sort(), ['mjolnir', 'skalle']);
  assert.equal((await listArticles()).length, 12);
});

test('a player claims a warband, edits it and its warriors, and a stranger may not', async () => {
  const w = await claimWarband(niklas, 'nordost');
  assert.equal(w.ownerId, niklas.id);
  assert.equal(w.player, 'Niklas', 'the card names the keeper');
  await assert.rejects(claimWarband(rival, 'nordost'), (e: unknown) => e instanceof LedgerError && e.status === 409);
  await assert.rejects(claimWarband(niklas, 'welling-rune'), (e: unknown) => e instanceof LedgerError && /already keep/.test(e.message));
  await assert.rejects(updateWarband(stranger, 'nordost', { lore: 'Mine now.' }), (e: unknown) => e instanceof LedgerError && e.status === 403);
  const edited = await updateWarband(niklas, 'nordost', { lore: 'A holding of longhouses.', type: 'Ostlanders' });
  assert.equal(edited.lore, 'A holding of longhouses.');
  assert.equal(edited.version, w.version + 1);
  await assert.rejects(updateWarband(niklas, 'nordost', { name: '  ' }), LedgerError);
  const withNew = await addMember(niklas, 'nordost', { name: 'Ulf Nordost', role: 'Jaeger', stats: { BS: 4 }, skills: ['Quick Shot', ''] });
  const ulf = withNew.members.find((m) => m.name === 'Ulf Nordost')!;
  assert.equal(ulf.id, 'ulf');
  assert.equal(ulf.stats.BS, 4);
  assert.equal(ulf.stats.M, 4);
  assert.deepEqual(ulf.skills, ['Quick Shot']);
  assert.equal(ulf.portrait, 'UN');
  const grown = await updateMember(niklas, 'ulf', { stats: { S: 4 }, experience: 3 });
  assert.equal(grown.members.find((m) => m.id === 'ulf')!.stats.S, 4);
  await assert.rejects(updateMember(niklas, 'ulf', { stats: { S: 11 } }), LedgerError);
  const fallen = await updateMember(niklas, 'ulf', { dead: true, death: { epitaph: 'He counted his arrows.' } });
  assert.equal(fallen.members.find((m) => m.id === 'ulf')!.death?.epitaph, 'He counted his arrows.');
  await assert.rejects(removeMember(niklas, 'agnar'), (e: unknown) => e instanceof LedgerError && /archives/.test(e.message));
  const fewer = await removeMember(niklas, 'ulf');
  assert.ok(!fewer.members.some((m) => m.id === 'ulf'));
  await assert.rejects(updateMember(rival, 'agnar', { role: 'Fool' }), (e: unknown) => e instanceof LedgerError && e.status === 403);
});

test('a game master founds, hands out and strikes warbands; the ledger follows the owner', async () => {
  const founded = await createWarband(gm, { name: 'The Ratcatchers of Cutthroat’s Haven', type: 'Reiklanders', player: 'Somebody' });
  assert.equal(founded.id, 'ratcatchers-of-cutthroat-s-haven');
  assert.equal(founded.ownerId, null);
  assert.equal(founded.sigil, 'RO');
  await assert.rejects(createWarband(niklas, { name: 'Another', type: 'Skaven' }), (e: unknown) => e instanceof LedgerError && /already keep/.test(e.message));
  const own = await createWarband(rival, { name: 'The Grey Hand', type: 'Skaven' });
  assert.equal(own.ownerId, rival.id);
  // the Curfew ledger follows the warband
  const view = await claimLedger(rival.id, own.id, 5);
  assert.equal(view.warbandId, own.id);
  await assert.rejects(assignWarband(gm, 'nordost', rival.id), (e: unknown) => e instanceof LedgerError && /already keep/.test(e.message));
  await assignWarband(gm, own.id, stranger.id);
  assert.equal((await loadOwnLedger(stranger.id, 5))!.warbandId, own.id, 'the nights already written go to the new keeper');
  assert.equal(await loadOwnLedger(rival.id, 5), null);
  await assert.rejects(assignWarband(niklas, own.id, null), (e: unknown) => e instanceof LedgerError && e.status === 403);
  await giveUp(stranger.id);
  assert.equal((await getWarband(own.id))!.ownerId, null, 'giving up the ledger frees the warband');
  await releaseWarband(gm, 'nordost');
  assert.equal((await getWarband('nordost'))!.ownerId, null);
  await assert.rejects(deleteWarband(gm, 'nordost'), (e: unknown) => e instanceof LedgerError && e.status === 409);
  await deleteWarband(gm, founded.id);
  assert.equal(await getWarband(founded.id), undefined);
  await claimWarband(niklas, 'nordost');
  await claimWarband(rival, 'bitterbrow-expedition');
});

test('a game master sets up an upcoming scenario and the players tell their side; then it is played', async () => {
  await assert.rejects(createScenario(niklas, { title: 'Nope', playedOn: '2026-10-01' }), (e: unknown) => e instanceof LedgerError && e.status === 403);
  const s = await createScenario(gm, { title: 'The Drowned Bell', playedOn: '2026-10-03', rulebookScenario: 'hidden treasure', customRules: 'The bell tolls on a 6.', prologue: 'A bell where no belfry stands.', warbandIds: ['nordost', 'bitterbrow-expedition'] });
  assert.equal(s.id, 'scenario-02-the-drowned-bell');
  assert.equal(s.status, 'upcoming');
  assert.equal(s.rulebookScenario, 'Hidden Treasure', 'rulebook names are spelled as the book does');
  assert.equal(s.prologueAsSummary, true, 'the prologue stands under the title until the game is played');
  assert.equal((await updateScenario(gm, s.id, { prologueAsSummary: false })).prologueAsSummary, false);
  await updateScenario(gm, s.id, { prologueAsSummary: true });
  assert.deepEqual(s.warbands.map((w) => w.warbandId).sort(), ['bitterbrow-expedition', 'nordost']);
  const list = await listScenarios();
  assert.deepEqual(list.map((x) => x.status), ['played', 'upcoming']);
  // the players' own tellings
  await assert.rejects(writePerspective(niklas, s.id, 'bitterbrow-expedition', { prologue: 'Ours.' }), (e: unknown) => e instanceof LedgerError && e.status === 403);
  await assert.rejects(writePerspective(niklas, s.id, 'welling-rune', { prologue: 'Ours.' }), (e: unknown) => e instanceof LedgerError && e.status === 404);
  let t = await writePerspective(niklas, s.id, 'nordost', { prologue: 'Agnar heard the bell first.' });
  assert.equal(t.warbands.find((w) => w.warbandId === 'nordost')!.prologue, 'Agnar heard the bell first.');
  t = await setBrought(niklas, s.id, 'nordost', [{ memberId: 'agnar', status: 'active', highlight: 'Stood.' }, { memberId: 'torgrim', status: 'injured', lowlight: 'Fell.' }, { memberId: 'jorgrim' }]);
  const mine = t.warbands.find((w) => w.warbandId === 'nordost')!.members;
  assert.deepEqual(mine.map((m) => m.memberId).sort(), ['agnar', 'torgrim'], 'only the warband’s own warriors count');
  t = await setBrought(gm, s.id, 'bitterbrow-expedition', [{ memberId: 'jorgrim' }, { memberId: 'norri' }]);
  // out of action: the one who struck or the one who fell may record it
  await assert.rejects(addOutOfAction(niklas, s.id, { attackerId: 'jorgrim', targetId: 'norri' }), (e: unknown) => e instanceof LedgerError && e.status === 403);
  t = await addOutOfAction(rival, s.id, { attackerId: 'jorgrim', targetId: 'agnar', detail: 'At the bell rope.' });
  assert.equal(t.outOfAction.length, 1);
  assert.equal(t.outOfAction[0].target, 'Agnar Nordost');
  t = await addOutOfAction(niklas, s.id, { attackerId: 'norri', targetId: 'torgrim' });
  assert.equal(t.outOfAction.length, 2, 'the one who fell may record it too');
  await assert.rejects(removeOutOfAction(stranger, s.id, t.outOfAction[0].id), (e: unknown) => e instanceof LedgerError && e.status === 403);
  t = await removeOutOfAction(niklas, s.id, t.outOfAction[1].id);
  assert.equal(t.outOfAction.length, 1);
  // the battle narrative: the game master first, the players when opened, every telling kept
  await assert.rejects(writeBattle(niklas, s.id, ['Mine.']), (e: unknown) => e instanceof LedgerError && e.status === 403);
  t = await writeBattle(gm, s.id, ['The bell tolled.', 'Nobody counted.']);
  await updateScenario(gm, s.id, { battleOpen: true });
  await assert.rejects(writeBattle(stranger, s.id, ['Mine.']), (e: unknown) => e instanceof LedgerError && e.status === 403);
  t = await writeBattle(niklas, s.id, ['The bell tolled.', 'Agnar counted.']);
  assert.deepEqual(t.battle, ['The bell tolled.', 'Agnar counted.']);
  const revisions = await revisionsOf(s.id);
  assert.equal(revisions[0].authorName, 'Niklas');
  assert.deepEqual(revisions.at(-1)!.battle, ['The bell tolled.', 'Nobody counted.']);
  // played
  await assert.rejects(markPlayed(gm, s.id, [{ warbandId: 'nordost', result: 'victory' }]), (e: unknown) => e instanceof LedgerError && /result/.test(e.message));
  await assert.rejects(markPlayed(stranger, s.id, []), (e: unknown) => e instanceof LedgerError && e.status === 403);
  await assert.rejects(markPlayed(niklas, s.id, []), (e: unknown) => e instanceof LedgerError && /result/.test(e.message), 'the table may call the game, but must say how it ended');
  t = await markPlayed(niklas, s.id, [{ warbandId: 'nordost', result: 'defeat' }, { warbandId: 'bitterbrow-expedition', result: 'victory' }]);
  assert.equal(t.status, 'played');
  assert.equal(t.sequence, 2);
  const bitterbrow = (await listWarbands()).find((w) => w.id === 'bitterbrow-expedition')!;
  assert.equal(bitterbrow.battles, 2);
  assert.equal(bitterbrow.victories, 1);
  const stories = memberStories(await listScenarios());
  assert.equal(stories.agnar!.length, 2);
  assert.equal(stories.agnar![1].snapshot.highlight, 'Stood.');
  const roster = await loadRoster();
  assert.deepEqual(roster.injured.nordost, ['torgrim'], 'the last played scenario says who is still hurt');
  await assert.rejects(deleteScenario(gm, s.id), (e: unknown) => e instanceof LedgerError && e.status === 409);
  const later = await createScenario(gm, { title: 'Later', playedOn: '2026-11-01' });
  await setParticipants(gm, later.id, ['nordost']);
  assert.equal((await getScenario(later.id))!.warbands.length, 1);
  await deleteScenario(gm, later.id);
  assert.equal(await getScenario(later.id), undefined);
});

test('the battle tracker: the table keeps the turn, the log and the tally; the record gets the takedowns', async () => {
  const s = await createScenario(gm, { title: 'The Shard Field', playedOn: '2026-10-10', rulebookScenario: 'Wyrdstone Hunt', warbandIds: ['nordost', 'bitterbrow-expedition'] });
  assert.equal(s.turn, 0, 'the game has not begun');
  assert.equal(tallyOf(s), 'Shards', 'the rulebook scenario says what is counted');
  assert.equal(tallyOf({ ...s, tally: 'Relics' }), 'Relics', 'the game master may name it');
  assert.equal(tallyOf({ tally: '', rulebookScenario: 'Skirmish' }), '', 'a skirmish counts nothing but the fallen');
  assert.equal(tallyOf({ tally: '', rulebookScenario: null }), '');
  assert.equal(await mayTrack(niklas, s.id), true, 'the keeper of an attending warband sits at the table');
  assert.equal(await mayTrack(stranger, s.id), false);
  assert.equal(await mayTrack(null, s.id), false);
  // the turn: anyone at the table, never a stranger, never past the game
  await assert.rejects(setTurn(stranger, s.id, 1), (e: unknown) => e instanceof LedgerError && e.status === 403);
  await assert.rejects(setTurn(niklas, s.id, 100), LedgerError);
  let t = await setTurn(niklas, s.id, 1);
  assert.equal(t.turn, 1);
  // the log: a note needs words, a score needs a warband and a count, both take the turn the table is on
  await assert.rejects(addEvent(stranger, s.id, { kind: 'note', text: 'Nope.' }), (e: unknown) => e instanceof LedgerError && e.status === 403);
  await assert.rejects(addEvent(niklas, s.id, { kind: 'note', text: '   ' }), (e: unknown) => e instanceof LedgerError && /what happened/.test(e.message));
  await assert.rejects(addEvent(niklas, s.id, { kind: 'score', points: 1 }), (e: unknown) => e instanceof LedgerError && /which warband/.test(e.message));
  await assert.rejects(addEvent(niklas, s.id, { kind: 'score', warbandId: 'nordost', points: 0 }), (e: unknown) => e instanceof LedgerError && /how much/.test(e.message));
  await assert.rejects(addEvent(niklas, s.id, { kind: 'score', warbandId: 'welling-rune', points: 1 }), (e: unknown) => e instanceof LedgerError && e.status === 404);
  t = await addEvent(niklas, s.id, { kind: 'note', text: 'Agnar charged the wall.' });
  assert.equal(t.events.length, 1);
  assert.equal(t.events[0].turn, 1);
  assert.equal(t.events[0].authorName, 'Niklas');
  t = await setTurn(gm, s.id, 2);
  t = await addEvent(niklas, s.id, { kind: 'score', warbandId: 'nordost', points: 2, text: 'Two shards from the fountain.' });
  t = await addEvent(rival, s.id, { kind: 'score', warbandId: 'bitterbrow-expedition', points: 1 });
  t = await addEvent(rival, s.id, { kind: 'score', warbandId: 'bitterbrow-expedition', points: -1, text: 'Dropped it running.', turn: 1 });
  assert.deepEqual(t.events.map((e) => e.turn), [1, 1, 2, 2], 'the log reads in turn order');
  assert.deepEqual(scoresOf(t), [{ warbandId: 'nordost', points: 2 }, { warbandId: 'bitterbrow-expedition', points: 0 }]);
  // a takedown logged at the table is the record's own row, with its turn
  t = await addOutOfAction(rival, s.id, { attackerId: 'jorgrim', targetId: 'agnar', turn: 2 });
  assert.equal(t.outOfAction[0].turn, 2);
  await assert.rejects(addOutOfAction(rival, s.id, { attackerId: 'jorgrim', targetId: 'torgrim', turn: 0 }), LedgerError);
  t = await addOutOfAction(gm, s.id, { attackerId: 'norri', targetId: 'torgrim' });
  assert.equal(t.outOfAction[1].turn, null, 'written up afterwards, it has no turn');
  // striking a line: the one who wrote it, or a game master
  const mine = t.events.find((e) => e.authorName === 'Niklas' && e.kind === 'note')!;
  await assert.rejects(removeEvent(rival, s.id, mine.id), (e: unknown) => e instanceof LedgerError && e.status === 403);
  t = await removeEvent(niklas, s.id, mine.id);
  assert.equal(t.events.length, 3);
  t = await removeEvent(gm, s.id, t.events[0].id);
  assert.equal(t.events.length, 2);
  await assert.rejects(removeEvent(gm, s.id, 999999), (e: unknown) => e instanceof LedgerError && e.status === 404);
  // the tally's name is the game master's to change; the turn survives the game being marked played
  t = await updateScenario(gm, s.id, { tally: 'Green shards' });
  assert.equal(tallyOf(t), 'Green shards');
  await assert.rejects(reopenScenario(niklas, s.id), (e: unknown) => e instanceof LedgerError && e.status === 403, 'reopening stays a game master’s');
  t = await markPlayed(gm, s.id, [{ warbandId: 'nordost', result: 'victory' }, { warbandId: 'bitterbrow-expedition', result: 'defeat' }]);
  assert.equal(t.turn, 2);
  assert.equal(t.events.length, 2);
});

test('the summary swallows the Chronicle entry, and the notes swallow the loot', async () => {
  const played = (await listScenarios()).find((x) => x.id === 'scenario-01-the-merchants-debt')!;
  assert.ok(played.chronicle.trim() && played.summary.trim(), 'the seeded record was written when they were two fields');
  assert.ok(played.loot.length && played.campaignNotes.length);
  assert.deepEqual(carriedForward(played), [...played.loot, ...played.campaignNotes], 'both lists read as one');
  assert.equal(summaryOf(played), played.summary, 'the summary wins where there is one');

  const after = await updateScenario(gm, played.id, { summary: 'Three buildings decide their first battle.', campaignNotes: ['Mjølnir lost a hand.', 'The cellar stays shut.'] });
  assert.equal(after.chronicle, '', 'saving the summary empties the older field');
  assert.deepEqual(after.loot, [], 'saving the notes empties the older list');
  assert.deepEqual(carriedForward(after), ['Mjølnir lost a hand.', 'The cellar stays shut.']);
  assert.equal(summaryOf(after), 'Three buildings decide their first battle.');
});

test('game masters write the Cryer; the broadsheet prints only the published articles for a place', async () => {
  await assert.rejects(createArticle(niklas, { headline: 'No', body: 'No.' }), (e: unknown) => e instanceof LedgerError && e.status === 403);
  const a = await createArticle(gm, { headline: 'Bell Heard Beneath the Ash; Nobody Claims It', byline: 'By our correspondent', body: 'A bell was heard.', locationId: 'fussenbach' });
  assert.ok((await articlesFor('fussenbach')).some((x) => x.id === a.id));
  assert.ok(!(await articlesFor('mordheim')).some((x) => x.id === a.id));
  const hidden = await updateArticle(gm, a.id, { published: false });
  assert.equal(hidden.published, false);
  assert.ok(!(await articlesFor('fussenbach')).some((x) => x.id === a.id));
  await assert.rejects(createArticle(gm, { headline: 'Nowhere', body: 'x', locationId: 'atlantis' }), LedgerError);
  await deleteArticle(gm, a.id);
  await assert.rejects(deleteArticle(gm, a.id), (e: unknown) => e instanceof LedgerError && e.status === 404);
});

test('the Curfew’s content lives in the database: seeded from the files, checked before saving, versioned', async () => {
  await primeContent(true);
  const docs = await listDocuments();
  assert.deepEqual(docs.map((d) => d.id).sort(), ['location:fussenbach', 'location:mordheim', 'moons', 'omens', 'tokens']);
  const omens = (await getDocument('omens'))!;
  await assert.rejects(saveDocument(niklas, 'omens', JSON.stringify(omens.document), omens.version), (e: unknown) => e instanceof LedgerError && e.status === 403);
  await assert.rejects(saveDocument(gm, 'omens', '{not json', omens.version), (e: unknown) => e instanceof LedgerError && /JSON/.test(e.message));
  await assert.rejects(saveDocument(gm, 'omens', JSON.stringify({ omens: [{ id: 'x', title: 'X', reading: 'x', image: '/x.png', tilt: { scavenge: 5 } }] }), omens.version), (e: unknown) => e instanceof LedgerError && e.status === 422);
  const edited = { ...(omens.document as { omens: { title: string }[] }) };
  edited.omens = edited.omens.map((o, i) => (i === 0 ? { ...o, title: 'The Ash Wind, Renamed' } : o));
  const saved = await saveDocument(gm, 'omens', JSON.stringify(edited), omens.version);
  assert.equal(saved.version, omens.version + 1);
  assert.equal(OMENS[0].title, 'The Ash Wind, Renamed', 'the engine reads the saved content at once');
  await assert.rejects(saveDocument(gm, 'omens', JSON.stringify(edited), omens.version), (e: unknown) => e instanceof LedgerError && e.status === 409);
  const revisions = await documentRevisions('omens');
  assert.equal(revisions.length, 1);
  assert.equal((revisions[0].document as { omens: { title: string }[] }).omens[0].title, 'The Ash Wind');
  // a new place is a pasted pack
  const village = LOCATIONS.find((l) => l.id === 'fussenbach')!;
  const newPlace = { ...village, id: 'kleinfeld', name: 'Kleinfeld' };
  await assert.rejects(saveDocument(gm, 'location:kleinfeld', JSON.stringify({ ...newPlace, id: 'wrong' }), null), (e: unknown) => e instanceof LedgerError && e.status === 422);
  await saveDocument(gm, 'location:kleinfeld', JSON.stringify(newPlace), null);
  assert.equal(locationById('kleinfeld').name, 'Kleinfeld');
  assert.equal(LOCATIONS.length, 3);
  await assert.rejects(deleteDocument(gm, 'location:mordheim', 'mordheim'), LedgerError);
  await assert.rejects(deleteDocument(gm, 'location:kleinfeld', 'kleinfeld'), (e: unknown) => e instanceof LedgerError && /Move it first/.test(e.message));
  await deleteDocument(gm, 'location:kleinfeld', 'mordheim');
  assert.equal(LOCATIONS.length, 2);
  // roles
  await setRole(niklas.id, 'gm');
  await assert.rejects(setRole('nobody', 'gm'));
});

test('the standings are hidden until the admin shows them', async () => {
  const admin = actorOf('user-gm', 'Game Master', 'admin');
  assert.equal((await getSettings()).standingsVisible, false, 'hidden by default');
  await assert.rejects(setSetting(gm, 'standingsVisible', true), (e: unknown) => e instanceof LedgerError && e.status === 403, 'a game master may not');
  assert.equal((await setSetting(admin, 'standingsVisible', true)).standingsVisible, true);
  assert.equal((await setSetting(admin, 'standingsVisible', false)).standingsVisible, false);
});
