/**
 * Server-side configuration, read once. Vercel's Neon integration may name the connection string
 * either DATABASE_URL or POSTGRES_URL; both are accepted. Nothing here is ever sent to the browser.
 *
 * On a laptop, `astro dev` with no .env at all is a working setup: a local Postgres (PGlite) lives under
 * .pglite/, a password-free dev sign-in stands in for the social providers, and the Debug strip is on.
 * None of those three can switch on where VERCEL is set, whatever the other variables say.
 */
const read = (key: string): string | undefined => {
  const v = (import.meta.env?.[key] as string | undefined) ?? process.env[key];
  return v && v.length ? v : undefined;
};
const flag = (key: string, fallback: boolean): boolean => {
  const v = read(key);
  return v === undefined ? fallback : v === 'true' || v === '1';
};

/** `astro dev`, as opposed to a build. */
const DEV = Boolean(import.meta.env?.DEV);
const ON_VERCEL = Boolean(read('VERCEL'));
const DATABASE_URL = read('DATABASE_URL') ?? read('POSTGRES_URL');

const productionUrl = read('BETTER_AUTH_URL') ?? (read('VERCEL_PROJECT_PRODUCTION_URL') ? `https://${read('VERCEL_PROJECT_PRODUCTION_URL')}` : undefined);

export const env = {
  DEV,
  ON_VERCEL,
  DATABASE_URL,
  /** No connection string and not on Vercel: keep a local Postgres under .pglite/ (default in `astro dev`). */
  LOCAL_DB: !DATABASE_URL && !ON_VERCEL && flag('CURFEW_LOCAL_DB', DEV),
  BETTER_AUTH_SECRET: read('BETTER_AUTH_SECRET') ?? (ON_VERCEL ? undefined : 'curfew-local-development-secret-do-not-deploy'),
  /** Public origin of the deployment, used for OAuth callbacks. */
  BASE_URL: productionUrl ?? 'http://localhost:4321',
  /** Preview deployments get their own origin; allow it so a sign-in there is not rejected as cross-site. */
  VERCEL_URL: read('VERCEL_URL') ? `https://${read('VERCEL_URL')}` : undefined,
  CRON_SECRET: read('CRON_SECRET'),
  /** `?date=` overrides and the Debug strip. On by default in `astro dev`, never by default on Vercel. */
  CURFEW_DEBUG: flag('CURFEW_DEBUG', DEV && !ON_VERCEL),
  /** A name-only sign-in for local development. Cannot be enabled on Vercel. */
  DEV_LOGIN: !ON_VERCEL && flag('CURFEW_DEV_LOGIN', DEV),
  providers: {
    google: pair('GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'),
    discord: pair('DISCORD_CLIENT_ID', 'DISCORD_CLIENT_SECRET'),
    github: pair('GITHUB_CLIENT_ID', 'GITHUB_CLIENT_SECRET'),
  },
};

function pair(idKey: string, secretKey: string): { clientId: string; clientSecret: string } | undefined {
  const clientId = read(idKey), clientSecret = read(secretKey);
  return clientId && clientSecret ? { clientId, clientSecret } : undefined;
}

export type ProviderId = keyof typeof env.providers;
export const PROVIDER_LABEL: Record<ProviderId, string> = { google: 'Google', discord: 'Discord', github: 'GitHub' };

/** The providers with credentials configured, in the order the sign-in buttons appear. */
export function enabledProviders(): ProviderId[] {
  return (Object.keys(env.providers) as ProviderId[]).filter((p) => env.providers[p]);
}

/** The password behind the dev sign-in. Not a secret: the sign-in itself only exists off Vercel. */
export const DEV_LOGIN_PASSWORD = 'curfew-local-development';
