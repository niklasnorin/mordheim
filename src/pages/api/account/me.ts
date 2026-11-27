/**
 * Who is looking, for the campaign site's header. The home page is cached at the edge for everyone, so the
 * signed-in links are revealed by the browser after asking here; the answer itself is never cached.
 */
import type { APIRoute } from 'astro';
import { hasDatabase } from '../../../server/db/client';
import { json } from '../../../server/http';
import { getActor, isAdmin, isGm } from '../../../server/roles';
import { ownWarband, warbandsKeptBy } from '../../../server/campaign/roster';

export const prerender = false;

/** Who is looking, in the campaign the request is in: their warband there, and the campaigns where they keep one. */
export const GET: APIRoute = async ({ request, locals }) => {
  if (!hasDatabase()) return json({ signedIn: false, admin: false, gm: false, role: null, warbandId: null, name: null, kept: [] });
  const actor = await getActor(request);
  const warband = actor ? await ownWarband(actor.id, locals.campaign.id).catch(() => undefined) : undefined;
  const kept = actor ? await warbandsKeptBy(actor.id).catch(() => []) : [];
  return json({ signedIn: Boolean(actor), admin: isAdmin(actor), gm: isGm(actor), role: actor?.role ?? null, name: actor?.name ?? null, warbandId: warband?.id ?? null, campaignId: locals.campaign.id, kept });
};
