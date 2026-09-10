# Mordheim campaign site

Astro 7 on Vercel. Campaign pages are prerendered; the Town Cryer, the Curfew pages, `/api/*` and the cron are serverless functions. Postgres (Neon) via Drizzle; social login via Better Auth.

## Commands

- `npm run dev` — local dev with a PGlite database under `.pglite/`, a name-only dev sign-in, and the Debug strip (step nights with `?date=`). No `.env` needed.
- `npm test` — engine, ledger, Town Cryer and service tests (`node --test`, TypeScript run natively; relative imports need `.ts` extensions).
- `npm run check` — `astro check`. Keep it at 0 errors.
- `npm run build` — Vercel build. `npm run db:generate` after a schema change; `npm run db:reset` wipes the local database.

## Content model: source first, database for the nights

This is a hybrid. The campaign's record is source code, edited by people and by coding agents working in the repository: warbands and their members (`src/data/warbands.ts`), Town Cryer articles (`src/data/news.ts`), the Chronicle (`src/data/chronicle.ts`) and the battle reports (`src/data/history/*.json`). The database holds only what the Curfew nights generate: ledgers, dispatches, players, sessions, midnight runs. Pages merge the two at render time and must keep working when the database is absent:

- The Town Cryer prints `news.ts` and, beneath it, the dispatches the nights produced.
- A member's profile shows the roster entry, the battle reports, and "Nights in the City" from their ledger (`src/curfew/story.ts`); a warband card carries its tavern title.
- Never move source content into the database or make the admin console edit rosters, scenarios or articles; those changes are commits.
- When adding a Curfew feature, ask which half it belongs to. Deterministic story that a night produces is database; anything a game master would author is source.

## Where things are

- `src/curfew/engine.ts` pure Night engine (seeded, deterministic). `ledger.ts` pure ledger ops on `WarbandState`. `cryer.ts` turns a night into Town Cryer dispatches. All three have tests beside them.
- `src/server/` is server-only: `env.ts` config, `db/` schema and client, `auth.ts` Better Auth, `curfew/service.ts` load-reconcile-change-save with optimistic locking and the nightly `reconcileAll`.
- `src/pages/api/curfew/[action].ts` JSON API (same-origin, zod-validated, always answers with the whole ledger view). `src/pages/api/cron/midnight.ts` nightly cron.
- `/admin/` is the Watch House, the game master's console: `src/pages/admin/index.astro`, `src/server/admin/service.ts` (overview, players, burn/release, notices, midnight by hand), `src/pages/api/admin/[action].ts`. Admission by `ADMIN_EMAILS` (`isAdminEmail` in `env.ts`); under the dev sign-in everyone is admitted. Styles in `src/styles/admin.css` on top of Curfew's tokens.
- Content is data: `src/data/warbands.ts`, `news.ts`, `history/*.json`, `curfew/*.json`. Prose follows `src/data/curfew/STYLE.md`; the plan and status live in `src/data/curfew/PLAN.md`.

## Conventions

- Keep resolution a pure function of (campaign, night, warband, orders); the server and tests rely on it.
- The ledger refuses with `LedgerError`; its message is shown to the player as written.
- Never put secrets or `import.meta.env` reads in client scripts; go through `src/server/env.ts`.
- No backend for warband rosters, standings or battle reports yet; those stay content in the repo.
