/**
 * The Curfew API. Every action is a POST with a JSON body, needs a signed-in player, and answers with the
 * player's whole ledger view so the page can simply re-render. Refusals come back as `{ error }` with the
 * status the ledger chose; anything unexpected is a plain 500 with no detail leaked.
 */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { ERRANDS } from '../../../curfew/engine';
import { hasDatabase } from '../../../server/db/client';
import { getViewer } from '../../../server/session';
import { LedgerError, actions, claimWarband, releaseWarband, todayFor, type DryRun } from '../../../server/curfew/service';
import { isDryRun } from '../../../server/curfew/dry';
import { json, sameOrigin } from '../../../server/http';

export const prerender = false;

const errand = z.enum(ERRANDS as [string, ...string[]]);
const schemas = {
  look: z.object({}),
  claim: z.object({ warbandId: z.string().min(1).max(64) }),
  release: z.object({}),
  reset: z.object({}),
  orders: z.object({ orders: z.array(z.object({ memberId: z.string().min(1).max(64), errand })).max(12) }),
  heal: z.object({ memberId: z.string().min(1).max(64) }),
  offer: z.object({ offer: z.object({ night: z.number().int(), incoming: z.string().max(64), held: z.string().max(64) }), keep: z.enum(['incoming', 'held']) }),
  decide: z.object({ night: z.number().int(), roadId: z.string().min(1).max(64) }),
  'eve-open': z.object({}),
  'eve-lay': z.object({ bring: z.array(z.string().max(64)).max(3), flourish: z.object({ kind: z.enum(['field', 'headline', 'weather', 'dedication']), text: z.string().max(120) }).optional() }),
  'eve-done': z.object({}),
  'eve-undo': z.object({}),
} as const;
type Action = keyof typeof schemas;

export const POST: APIRoute = async ({ request, params }) => {
  if (!hasDatabase()) return json({ error: 'The ledgers are not open on this deployment.' }, 503);
  const url = new URL(request.url);
  if (!sameOrigin(request)) return json({ error: 'Not from here.' }, 403);

  const action = params.action as Action;
  const schema = schemas[action];
  if (!schema) return json({ error: 'No such errand.' }, 404);
  const viewer = await getViewer(request);
  if (!viewer) return json({ error: 'Sign in to keep a ledger.' }, 401);

  let body: unknown;
  try { body = await request.json(); } catch { return json({ error: 'The orders could not be read.' }, 400); }
  // a dry run: the browser carries the sandbox in `dry.base`; only the Watch, with debug on, may ask for one
  const { dry: dryBody, ...rest } = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const dryRun = isDryRun(request, viewer);
  if (dryBody !== undefined && !dryRun) return json({ error: 'Dry runs are for the Watch, with debug on.' }, 403);
  const dry: DryRun | undefined = dryRun ? { base: (dryBody as { base?: unknown } | undefined)?.base } : undefined;
  if (dry && (action === 'claim' || action === 'release')) return json({ error: 'Not in a dry run. Turn debug off first.' }, 400);
  const parsed = schema.safeParse(rest);
  if (!parsed.success) return json({ error: 'The orders could not be read.' }, 400);
  const input = parsed.data as z.infer<typeof schema>;
  const today = todayFor(url);

  try {
    switch (action) {
      case 'look': return json({ view: await actions.look(viewer.id, today, dry) });
      case 'claim': return json({ view: await claimWarband(viewer.id, (input as z.infer<typeof schemas.claim>).warbandId, today) });
      case 'release': await releaseWarband(viewer.id); return json({ view: null });
      case 'reset': return json({ view: await actions.reset(viewer.id, today, dry) });
      case 'orders': return json({ view: await actions.orders(viewer.id, today, (input as z.infer<typeof schemas.orders>).orders as Parameters<typeof actions.orders>[2], dry) });
      case 'heal': return json({ view: await actions.heal(viewer.id, today, (input as z.infer<typeof schemas.heal>).memberId, dry) });
      case 'offer': { const i = input as z.infer<typeof schemas.offer>; return json({ view: await actions.offer(viewer.id, today, i.offer, i.keep, dry) }); }
      case 'decide': { const i = input as z.infer<typeof schemas.decide>; return json({ view: await actions.decide(viewer.id, today, i.night, i.roadId, dry) }); }
      case 'eve-open': return json({ view: await actions.eveOpen(viewer.id, today, dry) });
      case 'eve-lay': { const i = input as z.infer<typeof schemas['eve-lay']>; return json({ view: await actions.eveLay(viewer.id, today, i.bring, i.flourish, dry) }); }
      case 'eve-done': return json({ view: await actions.eveDone(viewer.id, today, dry) });
      case 'eve-undo': return json({ view: await actions.eveUndo(viewer.id, today, dry) });
      default: return json({ error: 'No such errand.' }, 404);
    }
  } catch (e) {
    if (e instanceof LedgerError) return json({ error: e.message }, e.status);
    console.error(`[curfew] ${action} failed`, e);
    return json({ error: 'The city did not answer. Try again.' }, 500);
  }
};
