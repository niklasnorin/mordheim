/**
 * A player's own account: their recovery phrase, and the reset that spends it. `recovery` needs a session;
 * `reset` is the one thing a signed-out player may do, and it answers the same way to every failure.
 */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { hasDatabase } from '../../../server/db/client';
import { getViewer } from '../../../server/session';
import { json, sameOrigin } from '../../../server/http';
import { LedgerError, issueRecovery, resetWithRecovery } from '../../../server/account/service';

export const prerender = false;

const schemas = {
  recovery: z.object({}),
  reset: z.object({ email: z.email().max(254), phrase: z.string().min(8).max(200), newPassword: z.string().min(8).max(128) }),
} as const;
type Action = keyof typeof schemas;

export const POST: APIRoute = async ({ request, params }) => {
  if (!hasDatabase()) return json({ error: 'The ledgers are not open on this deployment.' }, 503);
  if (!sameOrigin(request)) return json({ error: 'Not from here.' }, 403);
  const action = params.action as Action;
  const schema = schemas[action];
  if (!schema) return json({ error: 'No such errand.' }, 404);
  let body: unknown;
  try { body = await request.json(); } catch { return json({ error: 'The request could not be read.' }, 400); }
  const parsed = schema.safeParse(body ?? {});
  if (!parsed.success) return json({ error: action === 'reset' ? 'Email, the phrase, and a new password of at least eight characters.' : 'The request could not be read.' }, 400);

  try {
    switch (action) {
      case 'recovery': {
        const viewer = await getViewer(request);
        if (!viewer) return json({ error: 'Sign in first.' }, 401);
        return json({ phrase: await issueRecovery(viewer.id, 'self') });
      }
      case 'reset': {
        const { email, phrase, newPassword } = parsed.data as z.infer<typeof schemas.reset>;
        return json(await resetWithRecovery(email, phrase, newPassword));
      }
      default: return json({ error: 'No such errand.' }, 404);
    }
  } catch (e) {
    if (e instanceof LedgerError) return json({ error: e.message }, e.status);
    console.error(`[account] ${action} failed`, e);
    return json({ error: 'The city did not answer. Try again.' }, 500);
  }
};
