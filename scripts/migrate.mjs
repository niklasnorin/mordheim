/**
 * Migrate the database on deploy. Vercel runs `npm run build`, which runs this first: every migration under
 * drizzle/ that the database has not seen is applied, in order, and a database that is current is left alone.
 *
 * Only a production deploy migrates, so a preview branch cannot change the shared database's schema before
 * it is merged. Locally the database is PGlite and migrates itself on start; to migrate Neon from a laptop,
 * `npm run db:migrate` is explicit and asks for DATABASE_URL.
 */
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { migrate } from 'drizzle-orm/neon-http/migrator';

const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
if (process.env.VERCEL_ENV !== 'production') {
  console.log(`[migrate] ${process.env.VERCEL ? `${process.env.VERCEL_ENV} deployment` : 'not on Vercel'}; the database is not touched`);
  process.exit(0);
}
if (!url) {
  console.warn('[migrate] production deploy without DATABASE_URL: nothing to migrate. Add the Neon integration to the project.');
  process.exit(0);
}
try {
  await migrate(drizzle({ client: neon(url) }), { migrationsFolder: 'drizzle' });
  console.log('[migrate] the database is current');
} catch (e) {
  console.error('[migrate] failed; the build stops so a deploy never runs ahead of its schema', e);
  process.exit(1);
}
