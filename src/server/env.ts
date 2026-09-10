/**
 * Server-side configuration, read once. Vercel's Neon integration may name the connection string
 * either DATABASE_URL or POSTGRES_URL; both are accepted. Nothing here is ever sent to the browser.
 */
const read = (key: string): string | undefined => {
  const v = (import.meta.env?.[key] as string | undefined) ?? process.env[key];
  return v && v.length ? v : undefined;
};

const productionUrl = read('BETTER_AUTH_URL') ?? (read('VERCEL_PROJECT_PRODUCTION_URL') ? `https://${read('VERCEL_PROJECT_PRODUCTION_URL')}` : undefined);

export const env = {
  DATABASE_URL: read('DATABASE_URL') ?? read('POSTGRES_URL'),
  BETTER_AUTH_SECRET: read('BETTER_AUTH_SECRET'),
  /** Public origin of the deployment, used for OAuth callbacks. */
  BASE_URL: productionUrl ?? 'http://localhost:4321',
  /** Preview deployments get their own origin; allow it so a sign-in there is not rejected as cross-site. */
  VERCEL_URL: read('VERCEL_URL') ? `https://${read('VERCEL_URL')}` : undefined,
  CRON_SECRET: read('CRON_SECRET'),
  CURFEW_DEBUG: read('CURFEW_DEBUG') === 'true' || read('CURFEW_DEBUG') === '1',
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
