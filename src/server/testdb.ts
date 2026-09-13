/**
 * A real Postgres for the service tests: PGlite in memory with every checked-in migration applied, and the
 * service pointed at it. Each test file gets its own database, so the files never see each other's rows.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { useDb } from './db/client.ts';
import * as schema from './db/schema.ts';
import { forgetSeeded } from './campaign/seed.ts';
import { forgetContentSeeded } from './content/curfew.ts';

export async function testDatabase() {
  const pg = new PGlite();
  const db = drizzle(pg, { schema });
  const dir = new URL('../../drizzle/', import.meta.url);
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    for (const statement of readFileSync(new URL(file, dir), 'utf8').split('--> statement-breakpoint')) if (statement.trim()) await pg.exec(statement);
  }
  useDb(db as never);
  forgetSeeded();
  forgetContentSeeded();
  return { pg, db, schema };
}

/** A signed-in user for the services that ask who is acting. */
export const actorOf = (id: string, name: string, role: 'player' | 'gm' | 'admin' = 'player') => ({ id, name, email: `${id}@example.com`, role });
