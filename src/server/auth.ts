/**
 * Better Auth, configured for social login. There are no passwords to keep: a player signs in with
 * Google, Discord or GitHub, whichever of them has credentials in the environment. Sessions live in
 * Postgres with a short signed cookie cache so an ordinary page view does not hit the database.
 * Off Vercel, a password-free dev sign-in can be switched on for local development.
 */
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { db } from './db/client';
import { authSchema } from './db/schema';
import { env } from './env';

function createAuth() {
  return betterAuth({
    appName: 'Mordheim — City of the Damned',
    baseURL: env.BASE_URL,
    secret: env.BETTER_AUTH_SECRET,
    basePath: '/api/auth',
    database: drizzleAdapter(db(), { provider: 'pg', schema: authSchema }),
    // local development only: a name is enough to sign in (see env.DEV_LOGIN; never on Vercel)
    emailAndPassword: { enabled: env.DEV_LOGIN, minPasswordLength: 8, autoSignIn: true },
    socialProviders: {
      ...(env.providers.google ? { google: { ...env.providers.google, prompt: 'select_account' as const } } : {}),
      ...(env.providers.discord ? { discord: env.providers.discord } : {}),
      ...(env.providers.github ? { github: env.providers.github } : {}),
    },
    session: {
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24,
      cookieCache: { enabled: true, maxAge: 5 * 60 },
    },
    account: { accountLinking: { enabled: true, trustedProviders: ['google', 'discord', 'github'] } },
    trustedOrigins: [env.BASE_URL, ...(env.VERCEL_URL ? [env.VERCEL_URL] : [])],
    advanced: { useSecureCookies: env.BASE_URL.startsWith('https://') },
  });
}

export type Auth = ReturnType<typeof createAuth>;

let instance: Auth | undefined;

export function auth(): Auth {
  instance ??= createAuth();
  return instance;
}
