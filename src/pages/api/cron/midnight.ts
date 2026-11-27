/**
 * Midnight. Vercel calls this once a night (see vercel.json) with `Authorization: Bearer $CRON_SECRET`
 * and every ledger gets its dawn written, so the Town Cryer can print last night before anyone looks in.
 * Idempotent: a second run finds nothing due.
 */
import type { APIRoute } from 'astro';
import { hasDatabase } from '../../../server/db/client';
import { env } from '../../../server/env';
import { reconcileAll } from '../../../server/curfew/service';

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  const expected = env.CRON_SECRET;
  const given = request.headers.get('authorization');
  if (!expected || given !== `Bearer ${expected}`) return new Response('Unauthorized', { status: 401 });
  if (!hasDatabase()) return new Response('No database', { status: 503 });
  try {
    // every campaign whose nights run, each by its own clock
    const campaigns = await reconcileAll('cron');
    return new Response(JSON.stringify({ ok: true, campaigns }), { headers: { 'content-type': 'application/json' } });
  } catch (e) {
    console.error('[curfew] midnight failed', e);
    return new Response(JSON.stringify({ ok: false }), { status: 500, headers: { 'content-type': 'application/json' } });
  }
};
