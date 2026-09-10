/**
 * Better Auth with email and password. No emails are ever sent: the address is only the name a player
 * signs in with, there is no verification and no reset link; a recovery phrase stands in for one (see
 * account/service.ts). Sessions live in Postgres. When CURFEW_INVITE_CODE is set, signing up needs the
 * invite word; signing in never does.
 */
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import { db } from './db/client.ts';
import { authSchema } from './db/schema.ts';
import { env } from './env.ts';

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
    // No cookie cache: a reset or a "sign out everywhere" must hold at once, so every request asks the database.
    session: { expiresIn: 60 * 60 * 24 * 30, updateAge: 60 * 60 * 24 },
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
