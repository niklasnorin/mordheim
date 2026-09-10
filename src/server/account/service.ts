/**
 * Recovery phrases: the way back in when a password is forgotten, since no emails are ever sent.
 *
 * A phrase is six words from the city and a short tail, shown once when issued and stored only as a
 * hash (the same scrypt Better Auth uses for passwords). Trading it for a new password consumes it and
 * signs the player out everywhere; a fresh phrase is issued right after. The Watch can issue one for a
 * player who has lost theirs, which is the only path that does not need the old one.
 */
import { randomInt } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { auth } from '../auth.ts';
import { db } from '../db/client.ts';
import { curfewRecovery, session, user } from '../db/schema.ts';
import { LedgerError } from '../../curfew/ledger.ts';

export { LedgerError };

const WORDS = [
  'ash', 'bell', 'crow', 'lantern', 'rat', 'candle', 'river', 'gutter', 'ember', 'shard', 'hammer', 'rope', 'sleet', 'tallow', 'cellar', 'gate',
  'comet', 'shutter', 'wick', 'ledger', 'anvil', 'moth', 'fog', 'bone', 'coin', 'chain', 'quill', 'plaster', 'bread', 'salt', 'iron', 'thread',
  'ferry', 'tower', 'cradle', 'scale', 'dice', 'pit', 'sister', 'hood', 'stair', 'well', 'bridge', 'tannery', 'market', 'flint', 'oak', 'brass',
  'raven', 'cinder', 'grave', 'psalm', 'mortar', 'lamp', 'shroud', 'cobble', 'hourglass', 'sail', 'door', 'wall', 'crown', 'hound', 'frost', 'smoke',
];

export function newPhrase(): string {
  const words = Array.from({ length: 6 }, () => WORDS[randomInt(WORDS.length)]);
  const tail = randomInt(36 ** 3).toString(36).padStart(3, '0');
  return [...words, tail].join('-');
}

/** Phrases are compared after trimming, lower-casing, and treating any run of spaces or dashes as one dash. */
export function normalizePhrase(input: string): string {
  return input.trim().toLowerCase().replace(/[\s-]+/g, '-');
}

/** Issue a fresh phrase for a player, replacing any earlier one. Returns the phrase; it is not kept. */
export async function issueRecovery(userId: string, issuedBy: 'self' | 'watch'): Promise<string> {
  const exists = await db().select({ id: user.id }).from(user).where(eq(user.id, userId)).limit(1);
  if (!exists.length) throw new LedgerError('No such player.', 404);
  const phrase = newPhrase();
  const ctx = await auth().$context;
  const phraseHash = await ctx.password.hash(normalizePhrase(phrase));
  await db().insert(curfewRecovery).values({ userId, phraseHash, issuedBy }).onConflictDoUpdate({ target: curfewRecovery.userId, set: { phraseHash, issuedBy, issuedAt: new Date() } });
  return phrase;
}

export async function hasRecovery(userId: string): Promise<boolean> {
  const rows = await db().select({ userId: curfewRecovery.userId }).from(curfewRecovery).where(eq(curfewRecovery.userId, userId)).limit(1);
  return rows.length > 0;
}

/**
 * Trade a phrase for a new password. Consumes the phrase, signs the player out everywhere, and returns a
 * new phrase. Wrong email and wrong phrase get the same answer, so nothing is learned about who exists.
 */
export async function resetWithRecovery(email: string, phrase: string, newPassword: string): Promise<{ phrase: string }> {
  if (newPassword.length < 8) throw new LedgerError('The new password needs at least eight characters.');
  if (newPassword.length > 128) throw new LedgerError('The new password is too long.');
  const refusal = () => new LedgerError('That email and phrase do not open the gate together.', 403);
  const ctx = await auth().$context;
  const found = await ctx.internalAdapter.findUserByEmail(email.trim().toLowerCase());
  if (!found) throw refusal();
  const rows = await db().select().from(curfewRecovery).where(eq(curfewRecovery.userId, found.user.id)).limit(1);
  if (!rows.length) throw refusal();
  const ok = await ctx.password.verify({ hash: rows[0].phraseHash, password: normalizePhrase(phrase) });
  if (!ok) throw refusal();
  await ctx.internalAdapter.updatePassword(found.user.id, await ctx.password.hash(newPassword));
  await db().delete(session).where(eq(session.userId, found.user.id));
  await db().delete(curfewRecovery).where(eq(curfewRecovery.userId, found.user.id));
  return { phrase: await issueRecovery(found.user.id, 'self') };
}
