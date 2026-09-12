---
name: curfew-engine
description: Change how the Curfew works - a rule of the night in engine.ts or ledger.ts, a new thing a player can do through the JSON API, a new game-master action in the Watch House, or the service's storage and reconciliation - while keeping resolution pure, deterministic and tested. Use for any change under src/curfew/, src/server/ or src/pages/api/.
user-invocable: true
argument-hint: "[the rule or action to add or change]"
---

# Change the Curfew

Read `docs/agents/architecture.md` ("Resolution: pure in the middle, storage at the edges") first; `docs/agents/glossary.md` gives every term its identifier. The layering below is what the server, the cron and the tests rely on.

## The rules that hold

1. **Resolution is a pure function of (campaign, night, warband, orders, location).** `src/curfew/engine.ts` and `ledger.ts` read no clock, no storage, no request, no DOM. `src/curfew/*` is also imported by browser scripts (`debug.ts` imports the engine), so it stays free of Node imports too.
2. **The seed is sacred.** Nights are seeded from `campaign.id`, the warband id, the night number and the orders; Omens and Moons from the campaign id per cycle; epithets per member. Do not change `campaign.id`, `start` or `timezone` once play has begun. Adding an `r()` call earlier in `resolveNight` changes every future draw; written nights are stored and unaffected, but say so in the commit body.
3. **Tonight is never resolved.** `reconcile` writes up to `today - 1`. `today` is a number passed in from `todayFor(url)`; never read the clock deeper than the route.
4. **The location of a night is `locationForNight(night, moves)`**, never the current place. Every engine function that depends on a place takes `location: Location = DEFAULT_LOCATION`.
5. **Refuse with `LedgerError(message, status)`.** The message is shown to the player as written, in the campaign's voice ("Only 2 go out a night.").
6. **The API always answers the whole `LedgerView`.** Pages re-render from it and never update optimistically.
7. **State shape belongs to `WarbandState`.** Add a field with a default in `freshState`, and let `coerceState`'s spread fill it for old rows. Do not write a migration for ledger JSON. The literal is `version: 2` and `coerceState` accepts 1 and 2; bump it, and teach `coerceState` the old number, only when an old state cannot be read at all. A dry run (`dry.ts`) goes through the same `withLedger` with a sandbox base and never saves: a new action needs no extra work for it beyond the optional `dry` argument.

## Recipes

**A rule of the night.** Change `resolveNight`, `applyNight` or `reconcile`; thread a new input through `ResolveInput` and, if the service must supply it, through `reconcile`'s parameters and `withLedger`/`reconcileAll`. Write the test beside it: a loop over 60 to 400 nights asserting a tolerant range, or an exact assertion for a deterministic fact.

**A new thing a player can do.**
1. `src/curfew/ledger.ts`: a function `(state, warband, night, ...)` that mutates `state` or throws `LedgerError`. Test it on `freshState(warband, 10)`.
2. `src/server/curfew/service.ts`: add to `actions`, as a `withLedger` wrapper.
3. `src/pages/api/curfew/[action].ts`: a kebab-case action name, a zod schema for the body, and the mapping to `actions.<camelCase>`.
4. The page's client script: `await act('name', body)`; render from the returned view; errors go to `toast`. `credentials: 'same-origin'`, forward `?date=`. Toggle visibility with the `hidden` attribute, never with classes.
5. `src/server/curfew/service.test.ts`: append a test at the end; the file is stateful and runs in order.

**A new game-master action.**
1. `src/server/admin/service.ts`: a function over the database or the auth tables. No new kinds of state; if it needs one, ask whether it is really the game master's to write rather than a commit.
2. `src/pages/api/admin/[action].ts`: kebab-case name, zod schema, an `{ ok: true, message }` answer.
3. `src/pages/admin/index.astro`: a button with `data-act`, `data-body` and a `data-confirm` sentence that says what will happen; the page reloads and shows the message.
4. `src/server/admin/service.test.ts`: append a test.

**Something the Cryer should print from a night.** `dispatchesForNight` or `happeningFor` in `src/curfew/cryer.ts`, with a key of the form `warband:night:<stable suffix>` so reconciling twice never prints twice. Test the key stability.

**A new table or column.** Use the `schema-change` skill.

## Conventions in this code

- Relative imports carry `.ts` in `src/curfew/` and `src/server/`; Astro pages and API routes import without the extension.
- Tests: `test()` from `node:test`, `assert` from `node:assert/strict`, an inline warband literal, night numbers as `today`, no mocks. Service tests apply the SQL under `drizzle/` to an in-memory PGlite and `useDb()` it.
- Comments and messages are in the campaign's voice; read a few before writing one.
- Never read `import.meta.env` outside `src/server/env.ts`; never send anything from `env` to the browser except through `boot`, deliberately.

## Verify

```sh
npm test && npm run check && npm run build
```

Then walk it in `npm run dev`: claim a warband as a local player, give orders, step a night with the Debug strip, read the Dawn Report and the Cryer on `/`. For anything touching `save`, open the ledger in two browsers and act in both. For anything touching a place, move the campaign from `/admin/` and step a night on each side of the move.

## Pitfalls

- Reading `new Date()` or `campaignMoves()` from inside the engine or the ledger.
- Resolving tonight, or reconciling from `firstSeen` instead of `lastResolved + 1`.
- Answering a partial object from a Curfew API action.
- A dispatch key that includes `Date.now()` for something the nights produce (only the Watch's notices do that, on purpose).
- Adding a required field to `WarbandState` without a default: every stored ledger becomes unreadable.
- Importing from `src/server/` inside `src/curfew/`: the client bundle would pull the server in, or fail.
