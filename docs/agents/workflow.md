# Workflow: from a request to a pushed branch

## Before you start

1. Read `CLAUDE.md`. If the task touches Curfew, read `docs/agents/glossary.md` for the words and `docs/agents/architecture.md` for the layers. If it is prose, read `docs/agents/writing.md`.
2. Check for a matching skill under `.claude/skills/`: `record-battle`, `add-warband`, `town-cryer`, `curfew-pack`, `curfew-engine`, `schema-change`, `preflight`. Each is a checklist that has been run against this repository.
3. Decide which half the change belongs to, source or database (see the architecture note). If it is something a game master would author, it is source and the answer is a commit, not a console feature.
4. Do not relitigate the decisions in `src/data/curfew/PLAN.md` §11 or the "Conventions" in `CLAUDE.md`. If a request conflicts with one, say so in a sentence and then do what was asked.

## The local stack

```sh
nvm use            # Node 22.12 or newer; .nvmrc says which
npm ci
npm run dev        # http://localhost:4321, no .env needed
```

`astro dev` gives you PGlite under `.pglite/`, the name-only "Local player" sign-in, and the Debug strip. Sign in twice with two names in two browsers to hold two warbands. Claim a warband at `/curfew/`, give orders, then step nights with `?date=YYYY-MM-DD` or the strip. `/admin/` is open to every local player. `npm run db:reset` wipes the local database when a state gets odd.

## Definition of done

Everything below is what `.github/workflows/ci.yml` runs on every push and pull request, so run it first.

| Check | Command | Expect |
| --- | --- | --- |
| Tests | `npm test` | all pass, about 20 seconds, 70 tests today |
| Types | `npm run check` | 0 errors; hints are fine |
| Build | `npm run build` | completes offline; `scripts/migrate.mjs` prints that it is not on Vercel and skips |
| Content | `node .claude/skills/record-battle/scripts/check-history.mjs` after touching the archives or rosters; `node .claude/skills/curfew-pack/scripts/lint-pack.mjs` after touching a pack | 0 errors |
| Schema | `git status drizzle/` after any change to `schema.ts` | a generated migration and snapshot are staged |

Also, before pushing: no `.env`, `.pglite/`, `dist/` or `.vercel/` in the diff; no `import.meta.env` in a client script; no new dependency without a reason in the commit body; a prose change read once more against the voice it belongs to.

The `preflight` skill runs the whole table.

## Tests

`npm test` is `node --test "src/**/*.test.ts"` with Node's native TypeScript stripping. Conventions:

- Flat `test('a sentence that reads as a claim', ...)` from `node:test`; `assert` from `node:assert/strict`. No `describe`, no other runner.
- Relative imports in tests and in `src/curfew`, `src/server` carry the `.ts` extension. Astro pages and API routes import without it.
- Pure tests build their warband as an inline object literal and pass night numbers; probabilistic behaviour is asserted as a count over a loop of nights with a tolerant range, never an exact value.
- Service tests spin up `new PGlite()` in memory, apply the SQL under `drizzle/` split on `--> statement-breakpoint`, and call `useDb()`. They are stateful within a file and run in order; add to the end.
- The clock is never mocked. `today` is a parameter.

A test file sits beside the module it tests. A new engine or ledger rule ships with a test in the same commit.

## Commits and branches

- Work on the branch you were given. Do not push to another branch or to `main`.
- Commit style is in `docs/agents/writing.md`: sentence-case imperative subject, no prefix, a body that explains why. Follow whatever attribution lines your harness asks for.
- Pushes to `main` deploy production and run the migrations. Pull requests get a preview deployment that shares the production database but never migrates it, so a schema change is only live once merged.
- Do not open a pull request unless asked. When asked, the body describes the change and its verification; there is no template.

## When something fails

- **`npm test` fails on import**: Node is older than 22.12, or an import lacks its `.ts` extension.
- **`npm run check` complains about missing `.astro/types.d.ts`**: run `npx astro sync` once.
- **PGlite errors in dev**: `npm run db:reset`, then start again; the migrations rerun.
- **A ledger 409s repeatedly in tests**: two writes raced on the same row; the service already retries three times, so the test is probably reusing a stale `version`.
- **The Town Cryer prints nothing from the nights**: no dispatches exist for the last thirty nights up to today; run midnight by hand from `/admin/` or visit a ledger.
- **A page shows a hidden field as an empty box**: an author `display` rule beat `[hidden]`; scope the element under `.curfew` or `.wh`, or add a `[hidden] { display: none }` for it.
