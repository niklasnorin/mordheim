/**
 * A picture from a warband's story, served from the database. An id never changes what it points at, so the
 * answer is cached for a year; the headers keep a browser from reading the bytes as anything but the image they are.
 */
import type { APIRoute } from 'astro';
import { hasDatabase } from '../../server/db/client';
import { getImage } from '../../server/campaign/chapters';

export const prerender = false;

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export const GET: APIRoute = async ({ params }) => {
  const id = params.id ?? '';
  if (!hasDatabase() || !ID.test(id)) return new Response('Not found', { status: 404 });
  const image = await getImage(id).catch((e) => { console.error('[images] unavailable', e); return undefined; });
  if (!image) return new Response('Not found', { status: 404, headers: { 'cache-control': 'no-store' } });
  return new Response(new Uint8Array(image.bytes), {
    headers: {
      'content-type': image.mime,
      'content-length': String(image.bytes.length),
      'cache-control': 'public, max-age=31536000, immutable',
      'x-content-type-options': 'nosniff',
      'content-security-policy': "default-src 'none'",
    },
  });
};
