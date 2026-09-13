/**
 * The frame every JSON route shares: a database, a same-origin POST, a signed-in actor with their role, a zod-checked
 * body, and a refusal that reaches the browser as written. The route itself is only the switch on the action.
 */
import type { z } from 'zod';
import { hasDatabase } from './db/client.ts';
import { json, sameOrigin } from './http.ts';
import { getActor, isAdmin, isGm, type Actor, type Role } from './roles.ts';
import { LedgerError } from '../curfew/ledger.ts';

export type Handler<S extends z.ZodTypeAny> = (input: z.infer<S>, actor: Actor, request: Request) => Promise<unknown>;
export interface Route<S extends z.ZodTypeAny> { schema: S; /** The least role that may call it. */ role?: Role; handle: Handler<S> }

export function route<S extends z.ZodTypeAny>(schema: S, handle: Handler<S>, role: Role = 'player'): Route<S> { return { schema, role, handle }; }

const allows = (actor: Actor, role: Role) => (role === 'admin' ? isAdmin(actor) : role === 'gm' ? isGm(actor) : true);

/** Run a routing table for a request; `action` is the path segment. */
export async function dispatch(routes: Record<string, Route<z.ZodTypeAny>>, action: string | undefined, request: Request, log: string): Promise<Response> {
  if (!hasDatabase()) return json({ error: 'The ledgers are not open on this deployment.' }, 503);
  if (!sameOrigin(request)) return json({ error: 'Not from here.' }, 403);
  const r = action ? routes[action] : undefined;
  if (!r) return json({ error: 'No such order.' }, 404);
  const actor = await getActor(request);
  if (!actor) return json({ error: 'Sign in first.' }, 401);
  if (!allows(actor, r.role ?? 'player')) return json({ error: r.role === 'admin' ? 'That is for the admin alone.' : 'That is for a game master.' }, 403);
  let body: unknown;
  try { body = await request.json(); } catch { return json({ error: 'The order could not be read.' }, 400); }
  const parsed = r.schema.safeParse(body ?? {});
  if (!parsed.success) return json({ error: 'The order could not be read.' }, 400);
  try {
    const out = await r.handle(parsed.data, actor, request);
    return json(out ?? { ok: true });
  } catch (e) {
    if (e instanceof LedgerError) return json({ error: e.message }, e.status);
    console.error(`[${log}] ${action} failed`, e);
    return json({ error: 'The city did not answer. Try again.' }, 500);
  }
}
