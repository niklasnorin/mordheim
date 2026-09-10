/**
 * The Watch House's API. Every action is a POST with a JSON body from a signed-in admin. Answers are
 * small: the page reloads its overview after a change, so nothing here has to describe the whole state.
 */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { hasDatabase } from '../../../server/db/client';
import { admission } from '../../../server/admin/guard';
import { json, sameOrigin } from '../../../server/http';
import { todayFor } from '../../../server/curfew/service';
import { LedgerError, burnLedger, deleteDispatch, postNotice, releaseLedger, revokeSessions, runMidnight } from '../../../server/admin/service';
import { issueResetWord } from '../../../server/account/service';

export const prerender = false;

const schemas = {
  burn: z.object({ warbandId: z.string().min(1).max(64) }),
  release: z.object({ warbandId: z.string().min(1).max(64) }),
  'revoke-sessions': z.object({ userId: z.string().min(1).max(128) }),
  'issue-reset': z.object({ userId: z.string().min(1).max(128) }),
  'delete-dispatch': z.object({ id: z.number().int().positive() }),
  'post-notice': z.object({ text: z.string().min(1).max(200) }),
  'run-midnight': z.object({}),
} as const;
type Action = keyof typeof schemas;

export const POST: APIRoute = async ({ request, params }) => {
  if (!hasDatabase()) return json({ error: 'The ledgers are not open on this deployment.' }, 503);
  if (!sameOrigin(request)) return json({ error: 'Not from here.' }, 403);
  const action = params.action as Action;
  const schema = schemas[action];
  if (!schema) return json({ error: 'No such order.' }, 404);
  const { viewer, admin } = await admission(request);
  if (!viewer) return json({ error: 'Sign in first.' }, 401);
  if (!admin) return json({ error: 'The Watch House is not open to you.' }, 403);

  let body: unknown;
  try { body = await request.json(); } catch { return json({ error: 'The order could not be read.' }, 400); }
  const parsed = schema.safeParse(body ?? {});
  if (!parsed.success) return json({ error: 'The order could not be read.' }, 400);
  const today = todayFor(new URL(request.url));

  try {
    switch (action) {
      case 'burn': await burnLedger((parsed.data as z.infer<typeof schemas.burn>).warbandId, today); return json({ ok: true, message: 'The ledger is ash. The keeper keeps the warband.' });
      case 'release': await releaseLedger((parsed.data as z.infer<typeof schemas.release>).warbandId); return json({ ok: true, message: 'The warband is nobody’s now.' });
      case 'revoke-sessions': { const n = await revokeSessions((parsed.data as z.infer<typeof schemas['revoke-sessions']>).userId); return json({ ok: true, message: n ? `Signed out of ${n} ${n === 1 ? 'device' : 'devices'}.` : 'They were not signed in anywhere.' }); }
      case 'issue-reset': { const r = await issueResetWord((parsed.data as z.infer<typeof schemas['issue-reset']>).userId); return json({ ok: true, message: 'A reset word, good for two days. Pass it on; it is not shown again.', word: r.word, expiresAt: r.expiresAt }); }
      case 'delete-dispatch': await deleteDispatch((parsed.data as z.infer<typeof schemas['delete-dispatch']>).id); return json({ ok: true, message: 'Pulled from the broadsheet.' });
      case 'post-notice': { const d = await postNotice((parsed.data as z.infer<typeof schemas['post-notice']>).text, today); return json({ ok: true, message: 'The Cryer will print it.', dispatch: d }); }
      case 'run-midnight': { const r = await runMidnight(today); return json({ ok: true, message: r.nights ? `Midnight ran: ${r.nights} ${r.nights === 1 ? 'night' : 'nights'} written across ${r.ledgers} ${r.ledgers === 1 ? 'ledger' : 'ledgers'}, ${r.dispatches} for the Cryer.` : `Midnight ran: every ledger was already current.`, run: r }); }
      default: return json({ error: 'No such order.' }, 404);
    }
  } catch (e) {
    if (e instanceof LedgerError) return json({ error: e.message }, e.status);
    console.error(`[watch-house] ${action} failed`, e);
    return json({ error: 'The city did not answer. Try again.' }, 500);
  }
};
