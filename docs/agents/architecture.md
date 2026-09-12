# Architecture: how a request, a night and a place move through the code

`CLAUDE.md` says where things are. This says how they fit, so a change lands in the right layer. Line numbers drift; identifiers do not, so search by name.

## The two halves

The site is a hybrid, on purpose, and every feature question starts by asking which half it belongs to.

| Half | Holds | Edited by | Lives in |
| --- | --- | --- | --- |
| **Source** | Warbands and members, Town Cryer articles, the Chronicle of battles, battle reports, every Curfew content pack, the campaign's constants | People and coding agents, as commits | `src/data/**` |
| **Database** | What the nights generate: ledgers, dispatches, players and sessions, midnight runs, reset words, the log of where the campaign is | The engine, the players through the API, the game master through the Watch House | Postgres (Neon), schema in `src/server/db/schema.ts` |

Pages merge the two at render time and must keep working with no database at all. The three fallbacks differ in shape and are all deliberate: the home page renders the roster without the "Nights in the City" lines, the Town Cryer prints the articles without dispatches, and `/curfew/` and `/admin/` show a "the ledgers are not open" panel. The check is `hasDatabase()` from `src/server/db/client.ts`; new pages follow one of the three.

Never move source content into the database, never make the Watch House edit rosters, scenarios or articles, and never compute standings from the ledgers. A game master's authored change is a commit.

## Rendering modes

Astro is `output: 'static'` with the Vercel adapter (`astro.config.mjs`). A page is prerendered unless it exports `prerender = false`.

| Route | Mode | Why |
| --- | --- | --- |
| `/` | function, edge-cached five minutes, `Cache-Control: public, s-maxage=300` | The Town Cryer and the warband cards read the database, but nothing on the page is personal. Signed-in links are revealed by the browser after asking `/api/account/me`. |
| `/scenarios/<id>/` | prerendered via `getStaticPaths` over `history` | Pure source. |
| `/curfew/`, `/curfew/eve/`, `/admin/` | function, `private, no-store` | Personal. |
| `/api/**` | function | Same-origin JSON. |

Server-side data reaches a page's client script through a `boot` JSON blob in an inline `<script type="application/json" id="boot">` with `<` escaped. Client scripts are separate modules and cannot see `import.meta.env`; anything they need comes through `boot` or a `data-` attribute. The base path is `base` from `src/lib/site.ts` on the server and `root.dataset.base` in the browser.

Visibility in Curfew and Watch House interfaces is driven by the `hidden` attribute from script, never by toggling classes; `curfew.css` and `admin.css` make `[hidden]` win over every `display` rule for that reason.

## How a real day becomes a night, and a night a place

1. `localDate(now, campaign.timezone)` turns the wall clock into a `YYYY-MM-DD` in Europe/Stockholm. `nightForDate` counts nights from `campaign.json` `start`; night 1 is 2026-09-10, earlier dates are zero or negative and nothing happens on them.
2. `todayFor(url)` in `src/server/curfew/service.ts` is the only place the server decides which night is current. It honours `?date=` only when `env.CURFEW_DEBUG` is on. The cron passes `null`, so it can never be steered.
3. Every service function takes `today: number`. Tests pass night numbers directly and never mock the clock.
4. `locationForNight(night, moves)` picks the latest move on or before that night; with no moves the campaign is in Mordheim. Moves come from `curfew_moves` via `campaignMoves()`, read fresh on every call. The location of a night is therefore a function of the move log, never of "now": a move takes effect from tonight and a written night is never rewritten.
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
- **`src/curfew/ledger.ts`** is pure over a serialisable `WarbandState`. `reconcile` walks from `lastResolved + 1` to `today - 1` (tonight is never resolved), resolving given orders, standing orders or a quiet night per night, collapsing a gap longer than seven unordered nights into one Return, planting arrival and title headlines, awarding epithets, and letting rumours go cold. Refusals are `LedgerError(message, status)`; the message is shown to the player as written.
- **`src/curfew/cryer.ts`** is pure: a resolved night becomes zero or more `Dispatch` rows with deterministic keys (`warband:night:h<i>` for headlines, `warband:night:e` for the one possible happening).
- **`src/server/curfew/service.ts`** owns storage. `withLedger(userId, today, change)` is the whole write path: load the row and the moves, coerce the state, reconcile, apply `change`, and save under `WHERE version = <read version>`. A version clash retries the whole cycle, three times, then answers 409. A read is `withLedger` with an empty change, so every read writes the dawns it finds due. `reconcileAll` does the same for every ledger without the retry, because two writers produce the same dawn. Dispatches are inserted with `onConflictDoNothing`, so reconciling twice never prints twice.
- **`src/pages/api/curfew/[action].ts`** validates with zod, maps kebab-case actions to `actions.*`, and always answers `{ view: LedgerView }` so the page re-renders from scratch. The pages never update optimistically.

To add a rule, put it in the engine or the ledger with a test beside it, thread any new input through `ResolveInput` or the `change` callback, and leave the service as bookkeeping. If a rule needs the clock, the database or the request, it is in the wrong layer.

## The Town Cryer's sources

`src/components/TownCryer.astro` prints, in order: the masthead from the current place's `cryer` block; the `news.ts` articles whose `location` is the current place (Mordheim when unsaid); the dispatches from `recentDispatches(today)`, which are the last thirty nights up to and including today, newest first, with "last night" pulled out. Notices from the Watch House carry the warband id `the-watch`. The issue line is `issueFor(place, imperialDate)` in `news.ts`.

## Auth, admission and the reset word

Better Auth with email and password, no email sending, sessions of thirty days with no cookie cache so a sign-out everywhere holds at once. Sign-up is gated by `CURFEW_INVITE_CODE` when set. The Watch House admits by `ADMIN_EMAILS`; under the dev sign-in with no list, everyone. A forgotten password is reset with a word the game master issues in the Watch House, hashed with the same scrypt as passwords, good for two days, and every failure at `POST /api/account/reset` gets the same 403 so nothing is learned about who exists.

## Environment and the local stack

`src/server/env.ts` reads configuration once and is the only place configuration is read (`import.meta.env.BASE_URL` for URL building is the one exception, in `src/lib/site.ts` and a few pages). Three conveniences default on in `astro dev`: `LOCAL_DB` (PGlite under `.pglite/`, migrations applied on start), `DEV_LOGIN` (a name-only sign-in), `CURFEW_DEBUG` (`?date=` and the Debug strip). The first two can never be on where `VERCEL` is set; the third defaults off there and the Watch House health check flags it if forced on. Their switches are `CURFEW_LOCAL_DB`, `CURFEW_DEV_LOGIN`, `CURFEW_DEBUG` in `.env.example`.

PGlite is loaded through a runtime-built `import()` so Vercel's file tracer never bundles it. It is a devDependency. The service tests use `new PGlite()` in memory and apply the checked-in SQL under `drizzle/` by hand, then call `useDb()` to point the service at it.

## Database changes

The schema is `src/server/db/schema.ts`; migrations under `drizzle/` are generated, never written by hand, and are what PGlite, the tests and Neon all run. `npm run build` runs `scripts/migrate.mjs` first, which applies pending migrations on a production deploy only; previews and local builds do not touch the database. A failed migration fails the build so a deploy never runs ahead of its schema. Ledger state is one JSON column owned by `WarbandState`; adding a field to the state is a code change with a default in `coerceState`, not a migration.

## Where a change usually lands

| Change | Files |
| --- | --- |
| A new rule of the night | `engine.ts` or `ledger.ts`, its test, sometimes `ResolveInput` |
| A new thing a player can do | `ledger.ts` function, `actions` in the service, the zod schema in the API route, the page's client script |
| A new thing the game master can do | `src/server/admin/service.ts`, the zod schema in `api/admin/[action].ts`, `src/pages/admin/index.astro` |
| Something the Cryer should print | `cryer.ts` if from a night, `admin/service.ts` if from the Watch, `news.ts` if authored |
| A new place, or more prose for one | `src/data/curfew/locations/*.json` and, for a new place, `LOCATIONS` in `engine.ts` and `editions` in `news.ts` |
| A new table or column | `schema.ts`, `npm run db:generate`, the files under `drizzle/` |
| A battle played | `src/data/history/*.json`, `history.ts`, `chronicle.ts`, `warbands.ts` |
