/**
 * Which campaign a request is in (`docs/campaigns.md`). `/c/<slug>/…` names one: the request is served by the page at
 * the rest of the path, with that campaign in `locals.campaign` and `/c/<slug>` in `locals.base`, so every link the
 * page draws and every API call its scripts make stays in the campaign. Any other path is the front door: the campaign
 * the admin chose for the site's plain addresses, so the links and bookmarks from before there were campaigns still
 * work. A draft is the game masters' alone; anyone else is told there is no such page.
 */
import { defineMiddleware } from 'astro:middleware';
import { hasDatabase } from './server/db/client';
import { campaignBySlug, frontDoor } from './server/campaign/campaigns';
import { getActor, isGm } from './server/roles';
import { DEFAULT_CAMPAIGN, mayView } from './campaign/campaign';
import { base } from './lib/site';

const PREFIX = /^\/c\/([a-z0-9]+(?:-[a-z0-9]+)*)(\/.*)?$/;
/** Paths that belong to the site, not to a campaign. */
const SITEWIDE = /^\/(api\/auth|api\/cron|images)\//;

const notFound = () => new Response('No such page is posted in this city.', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'private, no-store' } });

export const onRequest = defineMiddleware(async (ctx, next) => {
  // a rewritten request comes through again already placed
  if (ctx.locals.campaign) return next();
  const path = base && ctx.url.pathname.startsWith(base) ? ctx.url.pathname.slice(base.length) || '/' : ctx.url.pathname;
  if (SITEWIDE.test(path) || !hasDatabase()) {
    ctx.locals.campaign = DEFAULT_CAMPAIGN;
    ctx.locals.base = base;
    return next();
  }
  const m = PREFIX.exec(path);
  if (!m) {
    ctx.locals.campaign = await frontDoor();
    ctx.locals.base = base;
    return next();
  }
  const campaign = await campaignBySlug(m[1]);
  if (!campaign) return notFound();
  if (!mayView(campaign.status, campaign.status === 'draft' ? isGm(await getActor(ctx.request)) : false)) return notFound();
  ctx.locals.campaign = campaign;
  ctx.locals.base = `${base}/c/${campaign.slug}`;
  const url = new URL(`${base}${m[2] ?? '/'}${ctx.url.search}`, ctx.url);
  // a fresh pass through the pipeline, so the page or endpoint gets the params of the path it serves; locals carry over
  const res = await ctx.rewrite(new Request(url, ctx.request));
  if (campaign.status !== 'draft') return res;
  // a sketch is nobody's business but the game masters': never cached, never indexed
  const out = new Response(res.body, res);
  out.headers.set('cache-control', 'private, no-store');
  out.headers.set('x-robots-tag', 'noindex');
  return out;
});
