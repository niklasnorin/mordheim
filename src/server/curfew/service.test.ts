/**
 * The service against a real Postgres: PGlite in memory, the checked-in migration applied, Neon swapped out.
 * What is tested is the SQL and the bookkeeping around the pure ledger; the ledger itself has its own tests.
 */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { useDb } from '../db/client.ts';
import * as schema from '../db/schema.ts';
import { actions, claimWarband, listClaims, loadOwnLedger, recentDispatches, reconcileAll, releaseWarband, LedgerError } from './service.ts';
import { dispatchesForNight } from '../../curfew/cryer.ts';
import { warbands } from '../../data/warbands.ts';
import { restingMembers } from '../../curfew/ledger.ts';

const pg = new PGlite();
const db = drizzle(pg, { schema });
const NIKLAS = 'user-niklas', RIVAL = 'user-rival';

before(async () => {
  const dir = new URL('../../../drizzle/', import.meta.url);
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    for (const statement of readFileSync(new URL(file, dir), 'utf8').split('--> statement-breakpoint')) if (statement.trim()) await pg.exec(statement);
  }
  useDb(db as never);
  await db.insert(schema.user).values([
    { id: NIKLAS, name: 'Niklas', email: 'niklas@example.com', emailVerified: true },
    { id: RIVAL, name: 'Rival', email: 'rival@example.com', emailVerified: true },
  ]);
});

test('a player claims one warband, and a warband has one keeper', async () => {
  assert.equal(await loadOwnLedger(NIKLAS, 5), null);
  const view = await claimWarband(NIKLAS, 'nordost', 5);
  assert.equal(view.state.firstSeen, 5);
  assert.equal(view.state.lastResolved, 4);
  await assert.rejects(claimWarband(NIKLAS, 'bitterbrow-expedition', 5), (e: unknown) => e instanceof LedgerError && e.status === 409);
  await assert.rejects(claimWarband(RIVAL, 'nordost', 5), (e: unknown) => e instanceof LedgerError && e.status === 409);
  await assert.rejects(claimWarband(RIVAL, 'nobody', 5), (e: unknown) => e instanceof LedgerError && e.status === 404);
  assert.deepEqual(await listClaims(), [{ warbandId: 'nordost', ownerId: NIKLAS, ownerName: 'Niklas' }]);
});

test('orders are saved, the next visit writes the dawn, and the Town Cryer gets its dispatches', async () => {
  const given = await actions.orders(NIKLAS, 5, [{ memberId: 'agnar', errand: 'carouse' }, { memberId: 'torgrim', errand: 'scavenge' }]);
  assert.equal(given.state.orders[5].length, 2);
  assert.equal(given.fresh, false);
  await assert.rejects(actions.orders(NIKLAS, 5, [{ memberId: 'agnar', errand: 'carouse' }, { memberId: 'skalle', errand: 'pray' }, { memberId: 'torgrim', errand: 'scavenge' }]), LedgerError);

  const dawn = await loadOwnLedger(NIKLAS, 6);
  assert.ok(dawn && dawn.fresh, 'night 5 was written by this visit');
  assert.equal(dawn.state.nights.length, 1);
  assert.equal(dawn.state.nights[0].night, 5);
  const again = await loadOwnLedger(NIKLAS, 6);
  assert.equal(again!.fresh, false, 'a second look writes nothing new');

  const nordost = warbands.find((w) => w.id === 'nordost')!;
  const expected = dispatchesForNight(nordost, dawn.state.nights[0], dawn.state.headlines);
  const printed = await recentDispatches(6);
  assert.deepEqual(printed.map((d) => d.key).sort(), expected.map((d) => d.key).sort(), 'exactly what the dice chose, once');
  for (const d of printed) assert.equal(d.warbandName, 'The Nordost Kin');
});

test('the midnight cron writes every ledger and is harmless to run twice', async () => {
  await claimWarband(RIVAL, 'bitterbrow-expedition', 6);
  const first = await reconcileAll(9);
  assert.equal(first.ledgers, 2);
  assert.equal(first.nights, 3 + 3, 'nights 6, 7, 8 for both');
  const second = await reconcileAll(9);
  assert.equal(second.nights, 0);
  const view = await loadOwnLedger(RIVAL, 9);
  assert.equal(view!.state.lastResolved, 8);
  assert.ok(view!.state.nights.every((n) => n.results.every((r) => r.standing)), 'nobody gave orders: standing orders at half yield');
  const printed = await recentDispatches(9, 50);
  assert.ok(printed.every((d) => d.night <= 8));
});

test('two writes racing on the same ledger both land', async () => {
  const before = (await loadOwnLedger(NIKLAS, 9))!;
  const resting = restingMembers(before.state, 9);
  const nordost = warbands.find((w) => w.id === 'nordost')!;
  const free = nordost.members.find((m) => !m.dead && !resting.includes(m.id) && !before.recovering.includes(m.id))!;
  await Promise.all([
    actions.orders(NIKLAS, 9, [{ memberId: free.id, errand: 'pray' }]),
    actions.heal(NIKLAS, 9, 'mjolnir'),
  ]);
  const view = await loadOwnLedger(NIKLAS, 9);
  assert.deepEqual(view!.state.orders[9].map((o) => o.memberId), [free.id]);
  assert.ok(view!.state.healed.includes('mjolnir'));
});

test('the Eve: the City Provides, the table is laid, the fight is recorded', async () => {
  let view = await actions.eveOpen(RIVAL, 9);
  assert.equal(view.state.hand.length, 1, 'an empty Hand is dealt one charm');
  assert.equal(view.state.provided?.night, 9);
  view = await actions.eveLay(RIVAL, 9, view.state.hand.map((h) => h.id));
  assert.match(view.state.eve!.ticket, /^EVE-1-/);
  await assert.rejects(actions.eveLay(RIVAL, 9, []), LedgerError);
  view = await actions.eveUndo(RIVAL, 9);
  assert.equal(view.state.eve, undefined);
  view = await actions.eveLay(RIVAL, 9, []);
  assert.match(view.state.eve!.ticket, /^EVE-0-/);
  view = await actions.eveDone(RIVAL, 9);
  assert.equal(view.state.fights.length, 1);
  assert.match(view.state.nights.at(-1)!.header, /the fight/);
  assert.equal(view.state.hand.length, 0);
});

test('burning starts afresh; giving up frees the warband', async () => {
  const burnt = await actions.reset(NIKLAS, 9);
  assert.equal(burnt.state.nights.length, 0);
  assert.equal(burnt.state.firstSeen, 9);
  await releaseWarband(NIKLAS);
  assert.equal(await loadOwnLedger(NIKLAS, 9), null);
  assert.deepEqual((await listClaims()).map((c) => c.warbandId), ['bitterbrow-expedition']);
  const taken = await claimWarband(NIKLAS, 'nordost', 9);
  assert.equal(taken.warbandId, 'nordost');
});
