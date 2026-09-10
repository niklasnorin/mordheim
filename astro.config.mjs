// @ts-check
import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';

// The site is served from the root of its Vercel domain. Pages stay prerendered by default; the
// Town Cryer, the Curfew pages and the API opt out with `prerender = false` and run as functions.
export default defineConfig({
  site: process.env.SITE_URL ?? (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : 'http://localhost:4321'),
  output: 'static',
  adapter: vercel({
    webAnalytics: { enabled: false },
    // a nightly reconcile for every ledger fits comfortably; the Hobby plan allows up to 60s
    maxDuration: 30,
  }),
});
