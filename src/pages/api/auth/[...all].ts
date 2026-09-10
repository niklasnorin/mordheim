import type { APIRoute } from 'astro';
import { auth } from '../../../server/auth';
import { hasDatabase } from '../../../server/db/client';

export const prerender = false;

export const ALL: APIRoute = async ({ request }) => {
  if (!hasDatabase()) return new Response('Sign-in is not configured on this deployment.', { status: 503 });
  return auth().handler(request);
};
