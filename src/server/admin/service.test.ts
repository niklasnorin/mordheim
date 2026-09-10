/** The Watch House against a real Postgres (PGlite), the checked-in migrations applied. */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { useDb } from '../db/client.ts';
import * as schema from '../db/schema.ts';
import { actions, claimWarband, recentDispatches } from '../curfew/service.ts';
import { burnLedger, deleteDispatch, ledgerDetail, listPlayers, overview, postNotice, releaseLedger, revokeSessions, runMidnight, LedgerError } from './service.ts';

const pg = new PGlite();
const db = drizzle(pg, { schema });
const GM = 'user-gm', PLAYER = 'user-player';

before(async () => {
  const dir = new URL('../../../drizzle/', import.meta.url);
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    for (const statement of readFileSync(new URL(file, dir), 'utf8').split('--> statement-breakpoint')) if (statement.trim()) await pg.exec(statement);
  }
  useDb(db as never);
  await db.insert(schema.user).values([
    { id: GM, name: 'Game Master', email: 'gm@example.com', emailVerified: true },
    { id: PLAYER, name: 'Player', email: 'player@example.com', emailVerified: true },
  ]);
  await db.insert(schema.account).values({ id: 'acc-1', accountId: PLAYER, providerId: 'credential', userId: PLAYER, password: 'hashed' });
  const soon = new Date(Date.now() + 3600_000);
  await db.insert(schema.session).values([
    { id: 's1', token: 't1', userId: PLAYER, expiresAt: soon },
    { id: 's2', token: 't2', userId: PLAYER, expiresAt: new Date(Date.now() - 1000) },
  ]);
  await claimWarband(PLAYER, 'nordost', 3);
  await actions.orders(PLAYER, 3, [{ memberId: 'agnar', errand: 'carouse' }]);
});

test('the overview knows the night, who keeps what, and who is behind', async () => {
  const o = await overview(6);
  assert.equal(o.today, 6);
  assert.ok(o.omen.title && o.moon.name);
  assert.equal(o.counts.warbands, 2);
  assert.equal(o.counts.ledgers, 1);
  assert.equal(o.counts.players, 2);
  assert.equal(o.counts.sessions, 1, 'expired sessions do not count');
  const nordost = o.ledgers.find((l) => l.warbandId === 'nordost')!;
  assert.equal(nordost.keeper?.name, 'Player');
  assert.equal(nordost.behind, 3, 'nights 3, 4 and 5 are due; the ledger opened on night 3 and has written nothing');
  assert.equal(nordost.tonight, 'standing');
  const bitterbrow = o.ledgers.find((l) => l.warbandId === 'bitterbrow-expedition')!;
  assert.equal(bitterbrow.keeper, undefined);
  assert.ok(o.health.some((h) => h.label === 'Last midnight' && h.detail === 'never run'));
});

test('players list their sessions, warband and last visit', async () => {
  const players = await listPlayers();
  const p = players.find((x) => x.id === PLAYER)!;
  assert.equal(p.sessions, 1);
  assert.ok(p.lastSeen instanceof Date);
  assert.equal(p.warband?.id, 'nordost');
  assert.equal(await revokeSessions(PLAYER), 2);
  assert.equal((await listPlayers()).find((x) => x.id === PLAYER)!.sessions, 0);
});

test('midnight by hand writes the dawns and is recorded', async () => {
  const r = await runMidnight(6);
  assert.equal(r.ledgers, 1);
  assert.equal(r.nights, 3, 'nights 3, 4 and 5');
  const o = await overview(6);
  assert.equal(o.runs.length, 1);
  assert.equal(o.runs[0].source, 'admin');
  assert.equal(o.ledgers.find((l) => l.warbandId === 'nordost')!.behind, 0);
  const detail = await ledgerDetail('nordost', 6);
  assert.equal(detail?.state.nights.length, 3);
  assert.equal(await ledgerDetail('bitterbrow-expedition', 6), null);
});

test('the Watch posts and pulls notices in the Cryer', async () => {
  await assert.rejects(postNotice('   ', 6), LedgerError);
  const notice = await postNotice('  Curfew  falls an hour earlier tonight. ', 6);
  assert.equal(notice.kind, 'notice');
  assert.equal(notice.headline, 'Curfew falls an hour earlier tonight.');
  assert.equal(notice.warbandName, 'The Watch');
  const printed = await recentDispatches(6, 20);
  assert.ok(printed.some((d) => d.id === notice.id));
  await deleteDispatch(notice.id);
  await assert.rejects(deleteDispatch(notice.id), LedgerError);
  assert.ok(!(await recentDispatches(6, 20)).some((d) => d.id === notice.id));
});

test('burning keeps the keeper; releasing frees the warband', async () => {
  await burnLedger('nordost', 6);
  const o = await overview(6);
  const nordost = o.ledgers.find((l) => l.warbandId === 'nordost')!;
  assert.equal(nordost.keeper?.name, 'Player');
  assert.equal(nordost.state?.nights.length, 0);
  await assert.rejects(burnLedger('bitterbrow-expedition', 6), LedgerError);
  await releaseLedger('nordost');
  assert.equal((await overview(6)).counts.ledgers, 0);
  await assert.rejects(releaseLedger('nordost'), LedgerError);
});
