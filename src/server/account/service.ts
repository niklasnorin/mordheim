/**
 * Reset words: the way back in when a password is forgotten, since no emails are ever sent.
 *
 * The game master issues a word for a player in the Watch House and passes it on however the group talks.
 * It is three words of the city and a short tail, shown once, stored only as a hash (the same scrypt
 * Better Auth uses for passwords), good for two days, and spent the moment it is traded for a new
 * password. Trading it also signs the player out everywhere. Nothing about this is self-service.
 */
import { randomInt } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { auth } from '../auth.ts';
import { db } from '../db/client.ts';
import { curfewRecovery, session, user } from '../db/schema.ts';
import { LedgerError } from '../../curfew/ledger.ts';

export { LedgerError };

export const RESET_WORD_HOURS = 48;

const WORDS = [
  'ash', 'bell', 'crow', 'lantern', 'rat', 'candle', 'river', 'gutter', 'ember', 'shard', 'hammer', 'rope', 'sleet', 'tallow', 'cellar', 'gate',
  'comet', 'shutter', 'wick', 'ledger', 'anvil', 'moth', 'fog', 'bone', 'coin', 'chain', 'quill', 'plaster', 'bread', 'salt', 'iron', 'thread',
  'ferry', 'tower', 'cradle', 'scale', 'dice', 'pit', 'sister', 'hood', 'stair', 'well', 'bridge', 'tannery', 'market', 'flint', 'oak', 'brass',
  'raven', 'cinder', 'grave', 'psalm', 'mortar', 'lamp', 'shroud', 'cobble', 'hourglass', 'sail', 'door', 'wall', 'crown', 'hound', 'frost', 'smoke',
];

export function newResetWord(): string {
  const words = Array.from({ length: 3 }, () => WORDS[randomInt(WORDS.length)]);
  return [...words, randomInt(36 ** 3).toString(36).padStart(3, '0')].join('-');
}

/** Words are compared after trimming, lower-casing, and treating any run of spaces or dashes as one dash. */
export function normalizeWord(input: string): string {
  return input.trim().toLowerCase().replace(/[\s-]+/g, '-');
}

/** Issue a reset word for a player, replacing any earlier one. Returns the word; it is not kept. */
export async function issueResetWord(userId: string): Promise<{ word: string; expiresAt: Date }> {
  const exists = await db().select({ id: user.id }).from(user).where(eq(user.id, userId)).limit(1);
  if (!exists.length) throw new LedgerError('No such player.', 404);
  const word = newResetWord();
  const ctx = await auth().$context;
  const phraseHash = await ctx.password.hash(normalizeWord(word));
  const expiresAt = new Date(Date.now() + RESET_WORD_HOURS * 3600_000);
  await db().insert(curfewRecovery).values({ userId, phraseHash, issuedBy: 'watch', expiresAt })
    .onConflictDoUpdate({ target: curfewRecovery.userId, set: { phraseHash, issuedBy: 'watch', issuedAt: new Date(), expiresAt } });
  return { word, expiresAt };
}

/** Players with an unspent, unexpired reset word. */
export async function pendingResets(): Promise<Map<string, Date>> {
  const rows = await db().select({ userId: curfewRecovery.userId, expiresAt: curfewRecovery.expiresAt }).from(curfewRecovery);
  const now = Date.now();
  return new Map(rows.filter((r) => r.expiresAt && r.expiresAt.getTime() > now).map((r) => [r.userId, r.expiresAt!]));
}

/**
 * Trade a reset word for a new password. Spends the word and signs the player out everywhere.
 * Wrong email, wrong word and a stale word all get the same answer, so nothing is learned about who exists.
 */
export async function resetWithWord(email: string, word: string, newPassword: string): Promise<void> {
  if (newPassword.length < 8) throw new LedgerError('The new password needs at least eight characters.');
  if (newPassword.length > 128) throw new LedgerError('The new password is too long.');
  const refusal = () => new LedgerError('That email and reset word do not open the gate together. Ask the game master for a fresh word.', 403);
  const ctx = await auth().$context;
  const found = await ctx.internalAdapter.findUserByEmail(email.trim().toLowerCase());
  if (!found) throw refusal();
  const rows = await db().select().from(curfewRecovery).where(eq(curfewRecovery.userId, found.user.id)).limit(1);
  const row = rows[0];
  if (!row || !row.expiresAt || row.expiresAt.getTime() < Date.now()) throw refusal();
  if (!(await ctx.password.verify({ hash: row.phraseHash, password: normalizeWord(word) }))) throw refusal();
  await ctx.internalAdapter.updatePassword(found.user.id, await ctx.password.hash(newPassword));
  await db().delete(session).where(eq(session.userId, found.user.id));
  await db().delete(curfewRecovery).where(eq(curfewRecovery.userId, found.user.id));
}
