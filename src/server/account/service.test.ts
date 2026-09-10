/** Reset words against a real Postgres (PGlite), with Better Auth's own hashing. */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { eq } from 'drizzle-orm';
import { useDb } from '../db/client.ts';
import * as schema from '../db/schema.ts';
import { auth } from '../auth.ts';
import { issueResetWord, newResetWord, normalizeWord, pendingResets, resetWithWord, LedgerError } from './service.ts';

const pg = new PGlite();
const db = drizzle(pg, { schema });

before(async () => {
  const dir = new URL('../../../drizzle/', import.meta.url);
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    for (const statement of readFileSync(new URL(file, dir), 'utf8').split('--> statement-breakpoint')) if (statement.trim()) await pg.exec(statement);
  }
  useDb(db as never);
});

test('a reset word is three words of the city and a tail, and compares loosely', () => {
  assert.match(newResetWord(), /^([a-z]+-){3}[0-9a-z]{3}$/);
  assert.notEqual(newResetWord(), newResetWord());
  assert.equal(normalizeWord('  Ash Bell  crow-7F3 '), 'ash-bell-crow-7f3');
});

test('the Watch issues a word; the player trades it for a new password, once, within two days', async () => {
  const email = 'agnar@example.com';
  const { user: created } = await auth().api.signUpEmail({ body: { email, password: 'longwinter1', name: 'Agnar' } });
  await auth().api.signInEmail({ body: { email, password: 'longwinter1' } });
  assert.ok((await db.select().from(schema.session).where(eq(schema.session.userId, created.id))).length >= 1);
  await assert.rejects(issueResetWord('nobody'), (e: unknown) => e instanceof LedgerError && e.status === 404);

  await assert.rejects(resetWithWord(email, 'ash-bell-crow-000', 'newwinter22'), (e: unknown) => e instanceof LedgerError && e.status === 403, 'no word issued yet');
  const { word, expiresAt } = await issueResetWord(created.id);
  assert.ok(expiresAt.getTime() > Date.now() + 47 * 3600_000);
  assert.ok((await pendingResets()).has(created.id));
  await assert.rejects(resetWithWord(email, 'wrong-words-here-000', 'newwinter22'), (e: unknown) => e instanceof LedgerError && e.status === 403);
  await assert.rejects(resetWithWord('stranger@example.com', word, 'newwinter22'), (e: unknown) => e instanceof LedgerError && e.status === 403, 'unknown email gets the same refusal');
  await assert.rejects(resetWithWord(email, word, 'short'), LedgerError);

  await resetWithWord(email.toUpperCase(), word.toUpperCase().replace(/-/g, ' '), 'newwinter22');
  assert.equal((await db.select().from(schema.session).where(eq(schema.session.userId, created.id))).length, 0, 'signed out everywhere');
  assert.ok(!(await pendingResets()).has(created.id), 'the word is spent');
  await assert.rejects(resetWithWord(email, word, 'another123'), LedgerError);
  await assert.rejects(auth().api.signInEmail({ body: { email, password: 'longwinter1' } }), 'the old password is gone');
  assert.equal((await auth().api.signInEmail({ body: { email, password: 'newwinter22' } })).user.id, created.id);

  // a stale word is no word
  const again = await issueResetWord(created.id);
  await db.update(schema.curfewRecovery).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(schema.curfewRecovery.userId, created.id));
  assert.ok(!(await pendingResets()).has(created.id));
  await assert.rejects(resetWithWord(email, again.word, 'thirdwinter3'), (e: unknown) => e instanceof LedgerError && e.status === 403);
});
