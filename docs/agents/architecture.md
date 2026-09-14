# Architecture: how a request, a night and a place move through the code

`CLAUDE.md` says where things are. This says how they fit, so a change lands in the right layer. Line numbers drift; identifiers do not, so search by name.

## The record, the nights and the rules

Three kinds of thing live here, and every feature question starts by asking which one is being changed.

| Kind | Holds | Written by | Lives in |
| --- | --- | --- | --- |
| **The record** | Warbands and members, scenarios (upcoming and played) with every warband's telling and every warrior's part, the Cryer's articles, the Curfew's content documents (decks and packs) | Players for their own warband and their part of a scenario; game masters for everything; through the site's forms | Postgres, schema in `src/server/db/schema.ts`, services under `src/server/campaign/` and `src/server/content/` |
| **The nights** | Ledgers, dispatches, players and sessions, midnight runs, reset words, the log of where the campaign is | The engine, the players through the Curfew API, the game master through the Watch House | Postgres, `src/server/curfew/`, `src/server/admin/` |
| **The rules** | The engine and the ledger, the calendar, the campaign's constants (`campaign.json`), the pages, and the seed fixtures under `src/data/` | People and coding agents, as commits | The repository |

The seed is the record's first fill: when the warbands table is empty, `ensureSeeded()` imports `src/data/warbands.ts`, `news.ts`, `chronicle.ts` and `history/*.json`; when the content table is empty, `primeContent()` writes the JSON under `src/data/curfew/`. Both are memoised per process and then never read the files again. The engine still imports the JSON as its built-in defaults, so the pure tests and the pack linter run without a database, and `useContent()` swaps the live bindings for what the database holds before any night is resolved or page rendered.

Roles (`src/server/roles.ts`): a **player** keeps one warband (`warbands.owner_id`) and edits only it and its part of the scenarios it attends; a **game master** (`user.role = 'gm'`) does the same for every warband, sets up and writes up scenarios, writes articles, edits content documents and moves the campaign; an **admin** (`ADMIN_EMAILS`) is a game master who also grants the role, issues reset words, signs players out, burns and releases ledgers and runs midnight. Every service takes the `Actor` and refuses with `LedgerError(…, 403)` itself; `src/server/api.ts` checks the least role a route names and validates the body, nothing more.

Ownership and the ledger are one thing seen twice: claiming a ledger at `/curfew/` claims an unowned warband, giving up the ledger frees the warband, a game master handing a warband to another player carries the ledger along, and releasing from the Watch House drops both. Battles and victories are counted from the played scenarios; the last played scenario's `injured` warriors are the Curfew's recovering ones.

## Rendering modes

Astro is `output: 'static'` with the Vercel adapter (`astro.config.mjs`), but every page reads the record, so every page exports `prerender = false` and runs as a function.

| Route | Mode | Why |
| --- | --- | --- |
| `/` | function, edge-cached five minutes, `Cache-Control: public, s-maxage=300` | The whole campaign's record, but nothing personal. Signed-in links are revealed by the browser after asking `/api/account/me`, which also says the viewer's role and warband. |
| `/scenarios/`, `/scenarios/<id>/`, `/scenarios/<id>/battle/`, `/warbands/`, `/warbands/<id>/`, `/curfew/`, `/curfew/eve/`, `/admin/**` | function, `private, no-store` | They show the viewer's own pen: what they may edit depends on who they are. |
| `/api/**` | function | Same-origin JSON. |

The battle tracker is the one page that does not reload: `src/lib/tracker.ts` renders the turn, the tally and the log from the scenario the server last answered with, posts each tap to `api/scenarios/` (`turn`, `event`, `out-of-action`, `remove-event`) and re-renders from the answer, and while the page is visible asks `tracker` every few seconds whether another phone at the table has written (re-rendering only when `updatedAt` moved). Takedowns logged there are the record's own `scenario_out_of_action` rows, tagged with the turn; notes and scores are `scenario_events`. The page hands the client the roster once, in a JSON script tag; the log is what changes.

The management pages share one client script, `src/lib/manage.ts`: a `button[data-act="warbands/claim"]` posts its `data-body`, a `form[data-api="scenarios/update"]` posts its fields as nested JSON (`patch.lore`, `patch.stats.WS`; `data-list` textareas one line per entry, `data-paragraphs` one paragraph per blank line, checkbox groups arrays) merged over `data-json`, and on success the page reloads. Nothing is updated optimistically: the server's answer is the page.

Server-side data reaches a page's client script through a `boot` JSON blob in an inline `<script type="application/json" id="boot">` with `<` escaped. Client scripts are separate modules and cannot see `import.meta.env`; anything they need comes through `boot` or a `data-` attribute. The base path is `base` from `src/lib/site.ts` on the server and `root.dataset.base` in the browser.

Visibility in Curfew and Watch House interfaces is driven by the `hidden` attribute from script, never by toggling classes; `curfew.css` and `admin.css` make `[hidden]` win over every `display` rule for that reason.

## How a real day becomes a night, and a night a place

1. `localDate(now, campaign.timezone)` turns the wall clock into a `YYYY-MM-DD` in Europe/Stockholm. `nightForDate` counts nights from `campaign.json` `start`; night 1 is 2026-09-10, earlier dates are zero or negative and nothing happens on them.
2. `todayFor(url, viewer)` in `src/server/curfew/service.ts` is the only place the server decides which night is current. It honours `?date=` only when `env.CURFEW_DEBUG` is on and the viewer is a game master; a player always gets the real night. The cron, the home page and the whole Watch House pass `null`, so nothing that reaches other players' ledgers can be steered. With the Debug strip on, a game master's requests are dry runs (`src/server/curfew/dry.ts`): `withLedger` computes from a sandbox the browser carries and neither saves nor publishes.
3. Every service function takes `today: number`. Tests pass night numbers directly and never mock the clock.
4. `locationForNight(night, moves)` picks the latest move on or before that night; with no moves the campaign is in Mordheim. Moves come from `curfew_moves` via `campaignMoves()`, read fresh on every call. The location of a night is therefore a function of the move log, never of "now": a move takes effect from tonight and a written night is never rewritten. The places themselves are the `location:<id>` documents, put in force by `primeContent()` (read again at most every twenty seconds, at once after a save).
5. The Imperial date shown for any night is `imperialForDate(dateForNight(night))`, counted from the anchor in `campaign.json`.

## Resolution: pure in the middle, storage at the edges

```
orders ─┐
night ──┤
place ──┼─► resolveNight (engine.ts) ─► NightResult ─► applyNight ─► HandState + offers
band ───┤        ▲ seeded by hashSeed(campaign.id, warband.id, night, ...orders)
state ──┘
```

- **`src/curfew/engine.ts`** is pure: no clock, no storage, no DOM. The seed is the campaign id, the warband id, the night number and the orders (member, errand, standing or not). Changing an order re-rolls the night; the place is not in the seed but shapes the pools and the errands. Omens and Moons are seeded per cycle from the campaign id alone, so every warband sees the same portent. Epithets are seeded per member and never change.
- **`src/curfew/ledger.ts`** is pure over a serialisable `WarbandState` (`version: 2`; a version 1 row is kept whole by `coerceState`). `reconcile` walks from `lastResolved + 1` to `today - 1` (tonight is never resolved): before each night it decides any crossroads still waiting along its default road, then resolves given orders, standing orders or a quiet night, consuming a `carry` from a road taken, collapsing a gap longer than seven unordered nights into one Return, planting arrival and title headlines, awarding epithets, and letting rumours, curses and kept nights expire. `decide` takes a road at a crossroads (`takeRoad` in the engine reads the effects from the pack). Refusals are `LedgerError(message, status)`; the message is shown to the player as written.
- **`src/curfew/cryer.ts`** is pure: a resolved night becomes zero or more `Dispatch` rows with deterministic keys (`warband:night:h<i>` for headlines, `warband:night:e` for the one possible happening).
- **`src/server/curfew/service.ts`** owns storage. Every entry point first primes the content and loads the roster from the database (`loadRoster()` in `campaign/roster.ts`: the warbands with members, and who the last played scenario left injured). `withLedger(userId, today, change)` is the whole write path: load the row and the moves, coerce the state, reconcile, apply `change`, and save under `WHERE version = <read version>`. A version clash retries the whole cycle, three times, then answers 409. A read is `withLedger` with an empty change, so every read writes the dawns it finds due. `reconcileAll` does the same for every ledger without the retry, because two writers produce the same dawn. Dispatches are inserted with `onConflictDoNothing`, so reconciling twice never prints twice.
- **`src/pages/api/curfew/[action].ts`** validates with zod, maps kebab-case actions to `actions.*`, and always answers `{ view: LedgerView }` so the page re-renders from scratch. The pages never update optimistically.

To add a rule, put it in the engine or the ledger with a test beside it, thread any new input through `ResolveInput` or the `change` callback, and leave the service as bookkeeping. If a rule needs the clock, the database or the request, it is in the wrong layer.

## The Town Cryer's sources

`src/components/TownCryer.astro` prints what the home page hands it, in order: the masthead from the current place's `cryer` block; the published articles for the current place (`articlesFor(placeId)` in `campaign/news.ts`, written in the Watch House); the dispatches from `recentDispatches(today)`, which are the last thirty nights up to and including today, newest first, with "last night" pulled out. Notices from the Watch House carry the warband id `the-watch`.

## Auth, admission and the reset word

Better Auth with email and password, no email sending, sessions of thirty days with no cookie cache so a sign-out everywhere holds at once. Sign-up is gated by `CURFEW_INVITE_CODE` when set. `getActor(request)` is `getViewer` plus the role: admin by `ADMIN_EMAILS`, game master by `user.role`, else player. The Watch House admits game masters and admins and shows the account panels to admins only; under the dev sign-in with no list, everyone is an admin. A forgotten password is reset with a word the game master issues in the Watch House, hashed with the same scrypt as passwords, good for two days, and every failure at `POST /api/account/reset` gets the same 403 so nothing is learned about who exists.

## Environment and the local stack

`src/server/env.ts` reads configuration once and is the only place configuration is read (`import.meta.env.BASE_URL` for URL building is the one exception, in `src/lib/site.ts` and a few pages). Two conveniences default on in `astro dev` and can never be on where `VERCEL` is set: `LOCAL_DB` (PGlite under `.pglite/`, migrations applied on start) and `DEV_LOGIN` (a name-only sign-in). `CURFEW_DEBUG` (`?date=` and the Debug strip, for game masters only) defaults on everywhere, production included, because it can only steer a game master's own view and the strip runs dry. Their switches are `CURFEW_LOCAL_DB`, `CURFEW_DEV_LOGIN`, `CURFEW_DEBUG` in `.env.example`.

PGlite is loaded through a runtime-built `import()` so Vercel's file tracer never bundles it. It is a devDependency. The service tests use `new PGlite()` in memory and apply the checked-in SQL under `drizzle/` by hand, then call `useDb()` to point the service at it.

## Database changes

The schema is `src/server/db/schema.ts`; migrations under `drizzle/` are generated, never written by hand, and are what PGlite, the tests and Neon all run. `npm run build` runs `scripts/migrate.mjs` first, which applies pending migrations on a production deploy only; previews and local builds do not touch the database. A failed migration fails the build so a deploy never runs ahead of its schema. Ledger state is one JSON column owned by `WarbandState`; adding a field to the state is a code change with a default in `coerceState`, not a migration.

## Where a change usually lands

| Change | Files |
| --- | --- |
| A new rule of the night | `engine.ts` or `ledger.ts`, its test, sometimes `ResolveInput` |
| A new thing a player can do | `ledger.ts` function, `actions` in the service, the zod schema in the API route, the page's client script |
| A new thing a game master can do in the Watch House | `src/server/admin/service.ts`, a `route(schema, handler, 'gm' \| 'admin')` in `api/admin/[action].ts`, `src/pages/admin/index.astro` |
| A new thing a player or game master can do to a warband or a scenario | `src/server/campaign/roster.ts` or `scenarios.ts` (taking the `Actor`, refusing by role), a route in `api/warbands/` or `api/scenarios/`, a form or button on the page |
| Something the Cryer should print | `cryer.ts` if from a night, `admin/service.ts` if from the Watch, the Articles panel in the Watch House if authored |
| A new place, or more prose for one | On a seeded database: the document in `/admin/content/` (a pasted pack for a new place, plus its band and mark under `public/curfew/places/`). For the built-in set and the tests: `src/data/curfew/locations/*.json` and `BUILT_IN_DOCUMENTS` in `engine.ts` |
| A new table or column | `schema.ts`, `npm run db:generate`, the files under `drizzle/` |
| A battle played | On the site: at the table, the tracker at `/scenarios/<id>/battle/` logs the turns, the tally and the takedowns; afterwards the game master marks the scenario played and writes it up at `/scenarios/<id>/`; the players tell their part; the roster is changed at `/warbands/<id>/` |
| A change to the record's shape | `src/campaign/model.ts`, the service, the seed, the page |
