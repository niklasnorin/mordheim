# Mordheim campaign site

Astro 7 on Vercel. Campaign pages are prerendered; the Town Cryer, the Curfew pages, `/api/*` and the cron are serverless functions. Postgres (Neon) via Drizzle; social login via Better Auth.

## Commands

- `npm run dev` — local dev with a PGlite database under `.pglite/`, a name-only dev sign-in, and the Debug strip (step nights with `?date=`). No `.env` needed.
- `npm test` — engine, ledger, Town Cryer and service tests (`node --test`, TypeScript run natively; relative imports need `.ts` extensions).
- `npm run check` — `astro check`. Keep it at 0 errors.
- `npm run build` — Vercel build. `npm run db:generate` after a schema change; `npm run db:reset` wipes the local database.

## Where things are

- `src/curfew/engine.ts` pure Night engine (seeded, deterministic). `ledger.ts` pure ledger ops on `WarbandState`. `cryer.ts` turns a night into Town Cryer dispatches. All three have tests beside them.
- `src/server/` is server-only: `env.ts` config, `db/` schema and client, `auth.ts` Better Auth, `curfew/service.ts` load-reconcile-change-save with optimistic locking and the nightly `reconcileAll`.
- `src/pages/api/curfew/[action].ts` JSON API (same-origin, zod-validated, always answers with the whole ledger view). `src/pages/api/cron/midnight.ts` nightly cron.
- Content is data: `src/data/warbands.ts`, `news.ts`, `history/*.json`, `curfew/*.json`. Prose follows `src/data/curfew/STYLE.md`; the plan and status live in `src/data/curfew/PLAN.md`.

## Conventions

- Keep resolution a pure function of (campaign, night, warband, orders); the server and tests rely on it.
- The ledger refuses with `LedgerError`; its message is shown to the player as written.
- Never put secrets or `import.meta.env` reads in client scripts; go through `src/server/env.ts`.
- No backend for warband rosters, standings or battle reports yet; those stay content in the repo.
