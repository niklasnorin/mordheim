# Mordheim campaign site

Astro 7 on Vercel. Campaign pages are prerendered; the Town Cryer, the Curfew pages, `/api/*` and the cron are serverless functions. Postgres (Neon) via Drizzle; email-and-password sign-in via Better Auth (no emails are sent; an optional `CURFEW_INVITE_CODE` gates sign-up).

## Start here

`AGENTS.md` is the one-minute version of this file for any tool. `docs/agents/` goes deeper: `workflow.md` (local stack, definition of done, tests, commits), `architecture.md` (how the halves and layers fit), `glossary.md` (the campaign's words mapped to code), `writing.md` (the four voices). The common tasks are skills under `.claude/skills/`: `record-battle`, `add-warband`, `town-cryer`, `curfew-pack`, `curfew-engine`, `schema-change`, `preflight`. Use the matching one before improvising.

## Commands

- `npm run dev` — local dev with a PGlite database under `.pglite/`, a name-only dev sign-in, and the Debug strip (step nights with `?date=`; with the strip on, a game master's requests are dry runs that save nothing, see `src/server/curfew/dry.ts`). No `.env` needed.
- `npm test` — engine, ledger, Town Cryer and service tests (`node --test`, TypeScript run natively; relative imports need `.ts` extensions).
- `npm run check` — `astro check`. Keep it at 0 errors.
- `npm run build` — Vercel build; on a production deploy it first applies any pending migration (`scripts/migrate.mjs`). `npm run db:generate -- --name <name>` after a schema change and commit the files under `drizzle/`; `npm run db:reset` wipes the local database.
- Done means all three pass (CI runs exactly them), plus `node .claude/skills/record-battle/scripts/check-history.mjs` after touching the archives or rosters and `node .claude/skills/curfew-pack/scripts/lint-pack.mjs` after touching a pack. The `preflight` skill runs the lot.

## Content model: source first, database for the nights

This is a hybrid. The campaign's record is source code, edited by people and by coding agents working in the repository: warbands and their members (`src/data/warbands.ts`), Town Cryer articles (`src/data/news.ts`), the Chronicle (`src/data/chronicle.ts`) and the battle reports (`src/data/history/*.json`). The database holds only what the Curfew nights generate: ledgers, dispatches, players, sessions, midnight runs, and the log of where the campaign is (`curfew_moves`). Pages merge the two at render time and must keep working when the database is absent:

- The Town Cryer prints `news.ts` and, beneath it, the dispatches the nights produced.
- A member's profile shows the roster entry, the battle reports, and "Nights in the City" from their ledger (`src/curfew/story.ts`); a warband card carries its tavern title.
- Never move source content into the database or make the admin console edit rosters, scenarios or articles; those changes are commits.
- When adding a Curfew feature, ask which half it belongs to. Deterministic story that a night produces is database; anything a game master would author is source.
- Locations follow the same split: a place is a content pack in `src/data/curfew/locations/*.json` (its errands, points of interest, templates, rumours, Cryer headlines, Moon tie-ins, crossroads and mark names, charms tagged with `location` in `tokens.json`); *which* place the campaign is in is a game master's switch in the Watch House, logged by night so earlier nights keep their place. The Crossroads follow it too: the roads and their effects are pack content; which crossroads a night met and which road was taken is the ledger's (`src/data/curfew/CROSSROADS.md`).

## Where things are

- `src/curfew/engine.ts` pure Night engine (seeded, deterministic; `Location`, `locationForNight`, `errandAt`, `tokensFor` say what a place offers; `takeRoad` resolves a road at a crossroads). `ledger.ts` pure ledger ops on `WarbandState` (`decide` takes a road; `reconcile` defaults a waiting crossroads before the next night). `cryer.ts` turns a night into Town Cryer dispatches, worded where the night happened, and waits for a crossroads to be decided. All three have tests beside them.
- `src/server/` is server-only: `env.ts` config, `db/` schema and client, `auth.ts` Better Auth, `curfew/service.ts` load-reconcile-change-save with optimistic locking and the nightly `reconcileAll`.
- `src/pages/api/curfew/[action].ts` JSON API (same-origin, zod-validated, always answers with the whole ledger view). `src/pages/api/cron/midnight.ts` nightly cron.
- `src/server/account/service.ts` reset words: issued only by the game master in the Watch House (hashed with Better Auth's scrypt, two-day expiry), traded for a new password at `POST /api/account/reset`, spent on use. Not self-service by design. There is no email anywhere in the system.
- `/admin/` is the Watch House, the game master's console: `src/pages/admin/index.astro`, `src/server/admin/service.ts` (overview, players, burn/release, notices, midnight by hand, moving the campaign), `src/pages/api/admin/[action].ts`. Admission by `ADMIN_EMAILS` (`isAdminEmail` in `env.ts`); under the dev sign-in everyone is admitted. Styles in `src/styles/admin.css` on top of Curfew's tokens.
- `src/lib/calendar.ts` is the Imperial Calendar (pure, tested): `imperialForDate` turns a real day into an Imperial one counted from the campaign anchor in `campaign.json` (the first game, `playedOn` in its record), `formatImperial`/`parseImperial` read and write "Marktag, 5th of Pflugzeit, 2007 IC". Every date shown to players goes through it; a scenario record carries both its written Imperial `date` and the real `playedOn`.
- Content is data: `src/data/warbands.ts`, `news.ts` (articles carry a `location`; the Cryer prints the ones for where the campaign is), `history/*.json`, `curfew/*.json`, `curfew/locations/*.json`. Prose follows `src/data/curfew/STYLE.md`; the plan and status live in `src/data/curfew/PLAN.md`.

## Conventions

- Keep resolution a pure function of (campaign, night, warband, orders, location); the server and tests rely on it. The location of a night comes from the move log, never from "now".
- The ledger refuses with `LedgerError`; its message is shown to the player as written.
- Never put secrets or `import.meta.env` reads in client scripts; go through `src/server/env.ts`.
- No backend for warband rosters, standings or battle reports yet; those stay content in the repo.
- Ids are forever: warband and member ids in `warbands.ts` key the archives, the ledgers and the dispatches; `campaign.json`'s `id`, `start`, `timezone` and `anchor` seed every draw and date. Do not rename or move them once play has begun.
- Tests are `node:test` with `.ts` extensions on relative imports in `src/curfew` and `src/server`; a rule change ships with its test. Service tests run on an in-memory PGlite and are ordered within a file.
- Prose is content: British spelling, typographic apostrophes, no exclamation marks, the voice of its surface (`docs/agents/writing.md`). Commit messages are sentence-case imperative with a body that says why.
- Work on the branch you were given; do not open a pull request unless asked; never commit `.env`, `.pglite/`, `dist/` or hand-written SQL under `drizzle/`.
