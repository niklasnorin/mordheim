/**
 * Who is looking, for the campaign site's header. The home page is cached at the edge for everyone, so the
 * signed-in links are revealed by the browser after asking here; the answer itself is never cached.
 */
import type { APIRoute } from 'astro';
import { hasDatabase } from '../../../server/db/client';
import { isAdminEmail } from '../../../server/env';
import { json } from '../../../server/http';
import { getViewer } from '../../../server/session';

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  if (!hasDatabase()) return json({ signedIn: false, admin: false });
  const viewer = await getViewer(request);
  return json({ signedIn: Boolean(viewer), admin: Boolean(viewer && isAdminEmail(viewer.email)), name: viewer?.name ?? null });
};
