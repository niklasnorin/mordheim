/**
 * The one thing a signed-out player may do: trade a reset word from the game master for a new password.
 * Every failure gets the same answer.
 */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { hasDatabase } from '../../../server/db/client';
import { json, sameOrigin } from '../../../server/http';
import { LedgerError, resetWithWord } from '../../../server/account/service';

export const prerender = false;

const schema = z.object({ email: z.email().max(254), word: z.string().min(6).max(120), newPassword: z.string().min(8).max(128) });

export const POST: APIRoute = async ({ request, params }) => {
  if (!hasDatabase()) return json({ error: 'The ledgers are not open on this deployment.' }, 503);
  if (!sameOrigin(request)) return json({ error: 'Not from here.' }, 403);
  if (params.action !== 'reset') return json({ error: 'No such errand.' }, 404);
  let body: unknown;
  try { body = await request.json(); } catch { return json({ error: 'The request could not be read.' }, 400); }
  const parsed = schema.safeParse(body ?? {});
  if (!parsed.success) return json({ error: 'Email, the reset word, and a new password of at least eight characters.' }, 400);
  try {
    await resetWithWord(parsed.data.email, parsed.data.word, parsed.data.newPassword);
    return json({ ok: true });
  } catch (e) {
    if (e instanceof LedgerError) return json({ error: e.message }, e.status);
    console.error('[account] reset failed', e);
    return json({ error: 'The city did not answer. Try again.' }, 500);
  }
};
