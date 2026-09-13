# Agents

Instructions for any coding agent working in this repository. `CLAUDE.md` is the canonical short map and is kept in step with this file; read it first, whatever tool you are.

## In one minute

- Astro 7 on Vercel, TypeScript, Postgres (Neon) through Drizzle, Better Auth for email-and-password sign-in. Node 22.12 or newer.
- `npm run dev` works with no `.env`: a local Postgres under `.pglite/`, a name-only dev sign-in, a Debug strip to step nights with `?date=`.
- The campaign's record is in the database and managed on the site: warbands and members by their owner or a game master, scenarios by game masters and the players who fought, the Cryer's articles and the Curfew's content documents by game masters in the Watch House. The files under `src/data/` are the seed for an empty database and the engine's built-in fixture; editing them changes nothing on a seeded database. Rules, the campaign's constants and code stay source. Three roles: player, game master (`user.role`), admin (`ADMIN_EMAILS`).
- Night resolution (`src/curfew/engine.ts`, `ledger.ts`, `cryer.ts`) is pure and deterministic; the server (`src/server/`) only loads, reconciles, changes and saves. Keep it that way.
- Done means `npm test`, `npm run check` and `npm run build` pass, the content checkers pass when content changed, and generated migrations are committed when the schema changed.

## Read next

| Need | File |
| --- | --- |
| The map of the repository and its conventions | `CLAUDE.md` |
| How to work here: local stack, definition of done, tests, commits, failures | `docs/agents/workflow.md` |
| How the code fits: the two halves, nights and places, the resolution pipeline, env | `docs/agents/architecture.md` |
| What the campaign's words mean in code | `docs/agents/glossary.md` |
| How to write for each surface, and commit messages | `docs/agents/writing.md` |
| Product intent, the Curfew plan and its decisions, the prose rules | `PRODUCT.md`, `src/data/curfew/PLAN.md`, `src/data/curfew/STYLE.md` |

## Skills for the common tasks

Each is a checklist in `.claude/skills/<name>/SKILL.md`, written for Claude Code but readable by anyone; the scripts run with plain Node from the repository root.

| Task | Skill |
| --- | --- |
| Record a real game on the site: the scenario, each warband's telling, the roster afterwards | `record-battle` |
| Add a warband or member, on the site or as seed | `add-warband` |
| Write a Town Cryer article or notice, in the Watch House | `town-cryer` |
| Extend a Curfew content pack or create a new place, charm, Moon or Omen | `curfew-pack` |
| Change the engine, ledger, API, service or Watch House | `curfew-engine` |
| Change the database schema | `schema-change` |
| Run every check before committing | `preflight` |
| Design work on the interface | `impeccable` (third-party, see the README) |
