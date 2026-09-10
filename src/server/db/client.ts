/**
 * The database handle.
 *
 * In production, Drizzle over Neon's HTTP driver: one fetch per query, no connection to keep warm, which
 * suits a function that wakes for a two-minute visit and sleeps again. The client is created lazily so
 * that a build without a database does not fail at import time.
 *
 * On a laptop with no DATABASE_URL, a real Postgres runs in-process instead (PGlite) and keeps its files
 * under .pglite/, with the checked-in migrations applied on start. It is loaded by name at runtime so the
 * Vercel bundle never carries it; it is a devDependency and the branch is unreachable there.
 */
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import * as schema from './schema.ts';
import { env } from '../env.ts';

/** Any Postgres-flavoured Drizzle database with this schema: Neon in production, PGlite locally and in the tests. */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

let instance: Db | undefined;

if (env.LOCAL_DB) instance = await localDatabase();

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

async function localDatabase(): Promise<Db> {
  // Loaded through a runtime-built import so that neither Vite nor Vercel's file tracer (which follows even
  // string constants) can see PGlite from here: the 10 MB of wasm stays out of the deployed function.
  const importAtRuntime = new Function('specifier', 'return import(specifier)') as (specifier: string) => Promise<any>;
  const [{ PGlite }, { drizzle: drizzlePglite }, { migrate }] = await Promise.all([
    importAtRuntime('@electric-sql/pglite'), importAtRuntime('drizzle-orm/pglite'), importAtRuntime('drizzle-orm/pglite/migrator'),
  ]);
  const local = drizzlePglite({ client: new PGlite('.pglite'), schema }) as Db;
  await migrate(local, { migrationsFolder: 'drizzle' });
  console.info('[db] local Postgres (PGlite) at .pglite/ — set DATABASE_URL to use Neon instead');
  return local;
}

export { schema };
