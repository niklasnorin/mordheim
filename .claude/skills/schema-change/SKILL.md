---
name: schema-change
description: Change the Postgres schema safely - edit src/server/db/schema.ts, generate the Drizzle migration under drizzle/, and know how it reaches PGlite, the tests and Neon on deploy. Use when adding a table, column or index, or when asked to "add a migration" or "run the migrations".
user-invocable: true
argument-hint: "[what to add or change in the schema]"
---

# Change the schema

The schema is `src/server/db/schema.ts` (Drizzle, Postgres, `casing: 'snake_case'`). Migrations under `drizzle/` are generated, committed, and run by everything: PGlite on `npm run dev`, the service tests, and Neon on a production deploy through `scripts/migrate.mjs`. Nothing writes SQL by hand.

## Before you add a table

Ask which half the data belongs to (`CLAUDE.md`, "Content model"). Anything a game master authors is source, not a table. A new field on a ledger goes in `WarbandState` with a default in `coerceState`, not in the schema; the ledger is one JSON column on purpose. The four `user`, `session`, `account`, `verification` tables belong to Better Auth; change them only as its upgrade notes say.

## Steps

1. Edit `schema.ts`. Name columns explicitly in snake_case as the file does, add indexes where a query will filter, and write the table's purpose in a comment in the file's voice.
2. Generate the migration with a name, so the file reads like its neighbours (`0004_moves.sql`):

   ```sh
   npm run db:generate -- --name <short-name>
   ```

   No database is needed; drizzle-kit reads the schema. Review the SQL it wrote and the new files under `drizzle/meta/` (a snapshot and the journal entry). Do not edit the SQL except to reject it and regenerate.
3. Use it in code, then test. The service tests apply every `drizzle/*.sql` in order to an in-memory PGlite, so a broken migration fails `npm test` before it reaches anyone.
4. Locally, `npm run dev` applies the new migration to `.pglite/` on the next start. If a hand-made local state conflicts, `npm run db:reset` and start again.
5. Commit the schema change, the SQL, the snapshot and the journal together with the code that needs them.

## How it reaches production

`npm run build` runs `scripts/migrate.mjs` first. On a production deploy (`VERCEL_ENV=production`) it applies pending migrations and fails the build if one fails, so a deploy never runs ahead of its schema. Preview deployments and local builds print that they skip. Pull requests therefore share the production database without changing its schema; a schema change is live only once merged to `main`. To migrate Neon from a laptop instead, `DATABASE_URL='postgresql://…' npm run db:migrate` with the pooled string from the Neon console.

## Verify

```sh
npm test && npm run check && npm run build
git status drizzle/          # one new .sql, one new meta snapshot, the journal modified
```

## Pitfalls

- Running `db:generate` without `--name`: a random two-word file name that does not match the others. Regenerate.
- A destructive change (dropping a column that ledgers still reference): the migration runs before the new code is warm; make the code tolerate both shapes for one deploy.
- Rewriting ledger JSON in SQL: the shape is owned by `coerceState`; a data fix is a code path, not a migration.
- Adding `@electric-sql/pglite` to `dependencies`: it is a devDependency, loaded by a runtime-built import so the Vercel bundle never carries it.
