/**
 * Drizzle over Neon's HTTP driver: one fetch per query, no connection to keep warm, which suits a
 * function that wakes for a two-minute visit and sleeps again. The client is created lazily so that
 * a build, or a local `astro dev` without a database, does not fail at import time.
 */
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import * as schema from './schema.ts';
import { env } from '../env.ts';

/** Any Postgres-flavoured Drizzle database with this schema: Neon in production, PGlite in the tests. */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

let instance: Db | undefined;

export function db(): Db {
  if (instance) return instance;
  const url = env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set. See .env.example.');
  instance = drizzle({ client: neon(url), schema, casing: 'snake_case' });
  return instance;
}

/** Point the service at another database. For tests. */
export function useDb(other: Db): void { instance = other; }

export function hasDatabase(): boolean {
  return Boolean(env.DATABASE_URL) || Boolean(instance);
}

export { schema };
