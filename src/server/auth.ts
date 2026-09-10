/**
 * Better Auth with email and password. No emails are ever sent: the address is only the name a player
 * signs in with, there is no verification and no reset link. Sessions live in Postgres with a short signed
 * cookie cache so an ordinary page view does not hit the database. When CURFEW_INVITE_CODE is set, signing
 * up needs the invite word; signing in never does.
 */
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { APIError, createAuthMiddleware } from 'better-auth/api';
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
    emailAndPassword: { enabled: true, minPasswordLength: 8, maxPasswordLength: 128, autoSignIn: true, requireEmailVerification: false },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path !== '/sign-up/email' || !env.INVITE_CODE) return;
        const given = String((ctx.body as { inviteCode?: unknown } | undefined)?.inviteCode ?? '').trim();
        if (given.toLowerCase() !== env.INVITE_CODE.trim().toLowerCase()) throw new APIError('FORBIDDEN', { message: 'That is not the word at the gate.' });
      }),
    },
    session: {
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24,
      cookieCache: { enabled: true, maxAge: 5 * 60 },
    },
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
