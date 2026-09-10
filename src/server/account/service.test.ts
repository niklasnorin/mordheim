/** Recovery phrases against a real Postgres (PGlite), with Better Auth's own hashing. */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { eq } from 'drizzle-orm';
import { useDb } from '../db/client.ts';
import * as schema from '../db/schema.ts';
import { auth } from '../auth.ts';
import { hasRecovery, issueRecovery, newPhrase, normalizePhrase, resetWithRecovery, LedgerError } from './service.ts';

const pg = new PGlite();
const db = drizzle(pg, { schema });

before(async () => {
  const dir = new URL('../../../drizzle/', import.meta.url);
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    for (const statement of readFileSync(new URL(file, dir), 'utf8').split('--> statement-breakpoint')) if (statement.trim()) await pg.exec(statement);
  }
  useDb(db as never);
});

test('a phrase is six words of the city and a tail, and compares loosely', () => {
  const p = newPhrase();
  assert.match(p, /^([a-z]+-){6}[0-9a-z]{3}$/);
  assert.notEqual(newPhrase(), newPhrase());
  assert.equal(normalizePhrase('  Ash Bell  crow-LANTERN '), 'ash-bell-crow-lantern');
});

test('sign up, lose the password, trade the phrase for a new one', async () => {
  const email = 'agnar@example.com';
  const signedUp = await auth().api.signUpEmail({ body: { email, password: 'longwinter1', name: 'Agnar' } });
  const userId = signedUp.user.id;
  assert.equal(await hasRecovery(userId), false);
  const phrase = await issueRecovery(userId, 'self');
  assert.equal(await hasRecovery(userId), true);
  await assert.rejects(issueRecovery('nobody', 'watch'), (e: unknown) => e instanceof LedgerError && e.status === 404);

  // a session that should not survive the reset
  await auth().api.signInEmail({ body: { email, password: 'longwinter1' } });
  assert.ok((await db.select().from(schema.session).where(eq(schema.session.userId, userId))).length >= 1);

  await assert.rejects(resetWithRecovery(email, 'wrong-words-here-nope-nope-nope-000', 'newwinter22'), (e: unknown) => e instanceof LedgerError && e.status === 403);
  await assert.rejects(resetWithRecovery('stranger@example.com', phrase, 'newwinter22'), (e: unknown) => e instanceof LedgerError && e.status === 403, 'unknown email gets the same refusal');
  await assert.rejects(resetWithRecovery(email, phrase, 'short'), LedgerError);

  const { phrase: next } = await resetWithRecovery(email.toUpperCase(), phrase.toUpperCase().replace(/-/g, ' '), 'newwinter22');
  assert.notEqual(next, phrase, 'a fresh phrase is issued');
  assert.equal((await db.select().from(schema.session).where(eq(schema.session.userId, userId))).length, 0, 'signed out everywhere');
  await assert.rejects(resetWithRecovery(email, phrase, 'another123'), LedgerError, 'the old phrase is spent');

  await assert.rejects(auth().api.signInEmail({ body: { email, password: 'longwinter1' } }), 'the old password is gone');
  const again = await auth().api.signInEmail({ body: { email, password: 'newwinter22' } });
  assert.equal(again.user.id, userId);
  const { phrase: third } = await resetWithRecovery(email, next, 'thirdwinter3');
  assert.ok(third);
});
