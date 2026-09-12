---
name: preflight
description: Run everything CI runs, plus the content checks and a diff review, before committing or pushing to this repository. Use before any commit, when asked to "verify", "run the checks", "make sure it builds", or after finishing a task.
user-invocable: true
argument-hint: "[optional: content | code | all]"
---

# Preflight

`.github/workflows/ci.yml` runs the tests, the type check and the build on every push and pull request. Run the same here, plus the content checks that CI does not know about, and read your own diff once as a reviewer would.

## 1. The gate

```sh
npm test            # node --test over src/**/*.test.ts, about 20 seconds; expect every test to pass
npm run check       # astro check; 0 errors (hints are fine)
npm run build       # completes offline; scripts/migrate.mjs says it is not on Vercel and skips
```

If `npm test` fails at import, Node is older than 22.12 (`nvm use`) or a relative import in `src/curfew` or `src/server` lacks its `.ts` extension. If `astro check` wants `.astro/types.d.ts`, run `npx astro sync`.

## 2. Content, when touched

```sh
node .claude/skills/record-battle/scripts/check-history.mjs   # archives, rosters, Chronicle, dates (0 errors)
node .claude/skills/curfew-pack/scripts/lint-pack.mjs         # packs, Moons, Omens, charms (0 errors; read the warnings)
```

## 3. The diff, read as a reviewer

```sh
git status --short
git diff --stat
git diff | grep -nE '^\+.*(import\.meta\.env|process\.env)' | grep -vE 'src/server/env.ts|BASE_URL'   # should print nothing
git status --short | grep -E '\.env|\.pglite|^\?\? dist|\.vercel'                              # should print nothing
```

Then, by eye:

- Every change belongs to the half it should (source versus database) and to the layer it should (engine or ledger for rules, service for storage, route for validation).
- A rule change has a test in the same commit. A schema change has its generated files under `drizzle/`.
- Prose reads in its voice (`docs/agents/writing.md`): no exclamation marks, British spelling, typographic apostrophes, nights and Moons in Curfew copy.
- Player-facing messages are in the campaign's voice and come from `LedgerError` where they are refusals.
- Nothing renamed an id in `warbands.ts`, and `campaign.json`'s `id`, `start`, `timezone` and `anchor` are untouched.
- No dependency added without a sentence in the commit body saying why.

## 4. Smoke test in the browser, when the change is visible

`npm run dev`, then: `/` (Town Cryer, cards, standings, Chronicle, a member dialog), `/scenarios/<id>/`, `/curfew/` as a local player (claim, orders, a stepped night with the Debug strip, the Hand), `/curfew/eve/`, `/admin/` (overview, a move and back, midnight by hand). Check a phone width once; the site is mobile first.

## 5. Commit

Sentence-case imperative subject, a body that says why, one logical change per commit, on the branch you were given. Attribution lines as your harness requires. Do not open a pull request unless asked.
