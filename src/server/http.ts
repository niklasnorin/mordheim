/** Small helpers shared by the JSON API routes. */

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });

/**
 * Same-origin only. The session cookie is SameSite, and this closes the door on the rest. Behind Vercel's
 * proxy the request URL may carry an internal host, so the forwarded host counts too.
 */
export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  const url = new URL(request.url);
  const hosts = [url.host, request.headers.get('x-forwarded-host'), request.headers.get('host')].filter(Boolean);
  try { return hosts.includes(new URL(origin).host); } catch { return false; }
}
