# Architecture: how a request, a night and a place move through the code

`CLAUDE.md` says where things are. This says how they fit, so a change lands in the right layer. Line numbers drift; identifiers do not, so search by name.

## The record, the nights and the rules

Three kinds of thing live here, and every feature question starts by asking which one is being changed.

| Kind | Holds | Written by | Lives in |
| --- | --- | --- | --- |
| **The record** | Warbands and members, scenarios (upcoming and played) with every warband's telling and every warrior's part, the locations with their maps, points of interest and trading posts, the Cryer's articles, the Curfew's content documents (decks and packs) | Players for their own warband and their part of a scenario; game masters for everything; through the site's forms | Postgres, schema in `src/server/db/schema.ts`, services under `src/server/campaign/` and `src/server/content/` |
| **The nights** | Ledgers, dispatches, players and sessions, midnight runs, reset words, the log of where the campaign is | The engine, the players through the Curfew API, the game master through the Watch House | Postgres, `src/server/curfew/`, `src/server/admin/` |
| **The rules** | The engine and the ledger, the calendar, the campaign's constants (`campaign.json`), the pages, and the seed fixtures under `src/data/` | People and coding agents, as commits | The repository |

The seed is the first campaign's first fill: when its warbands are none, `ensureSeeded()` imports `src/data/warbands.ts`, `news.ts`, `chronicle.ts` and `history/*.json`; when a campaign has no content documents, `worldFor()` writes its setting's (the JSON under `src/data/curfew/` for the City of the Damned). Both are memoised per process and then never read the files again. The engine still imports the JSON as its built-in defaults, so the pure tests and the pack linter run without a database; the server never reads those defaults, but builds each campaign's engine from what the database holds (below).

## Campaigns: which one a request is in

The site keeps several campaigns at once (`docs/campaigns.md`). Everything a campaign owns carries its `campaign_id`: warbands (and through them members, logs, chapters and jobs taken), scenarios (and everything under them), articles, ledgers, dispatches, moves, midnight runs, content documents (`curfew_documents`), trading-post stock and job boards. The locations and their points are an atlas shared by all; `campaign_locations` says which a campaign fights in. `ensureCampaigns()` (memoised) wrote the first campaign's row from `campaign.json` and carried the single campaign's switches and documents into it; every older row already named it through the column's default.

1. **The request.** `src/middleware.ts` reads `/c/<slug>/…`, loads the campaign by its slug (a draft only for a game master; anyone else gets a 404), puts it in `locals.campaign` and `/c/<slug>` in `locals.base`, and rewrites to the rest of the path with `ctx.rewrite`, so pages and endpoints get the params of the path they serve. Any other path gets the front door (`frontDoor()`: the admin's choice, else the first live campaign) and `locals.base = ''`. A draft's responses are `private, no-store` and `noindex`.
2. **Links.** Pages build links from `Astro.locals.base` and hand it to their scripts as `data-base`, so every link and API call stays in the campaign; files under `public/` keep the site's own `base` from `src/lib/site.ts` (imported as `siteRoot`). `herePath()` gives a page its own address, prefix included, for `?next=`.
3. **Services.** List and create take a `campaignId`; anything acting on an id reads the campaign from the row. `writableCampaign()` (`src/server/campaign/guard.ts`) refuses players in a draft or a finished campaign. A page reading a warband, scenario or location by id answers 404 when it is another campaign's.
4. **The rules in force.** `worldFor(campaignId)` (`src/server/content/curfew.ts`) builds a `World` (the campaign and its documents) into its own engine, ledger, Cryer and odds (`createEngine` and the rest), cached for twenty seconds and rebuilt at once after a save. One serverless process serves every campaign, so nothing is shared: the server calls `world.engine.*` and never the modules' default exports, which read the world `useWorld()` put in force, the browser's alone (the Curfew pages send `boot.campaign` and `boot.content`).
5. **Settings and the lifecycle.** A setting (`src/data/settings/`) is the template a campaign is drawn up from: its dials, documents, places, lists and crowns. `createCampaign()` makes a draft with its own copies; `launchCampaign()` opens it once `launchChecklist()` is met; `moveStatus()` finishes, reopens and archives; `setFrontDoor()` is the admin's.
6. **Carry-over.** `carryPlan()` (pure, `src/campaign/carry.ts`) says what goes across; `carryWarband()` writes a copy with new ids and `carried_from_id`; a pending one waits on `warbands.carry` until the keeper approves its roster through `drawUp`, which calls `approveCarry()`.

Roles (`src/server/roles.ts`): a **player** keeps one warband (`warbands.owner_id`) and edits only it and its part of the scenarios it attends; a **game master** (`user.role = 'gm'`) does the same for every warband, sets up and writes up scenarios, writes articles, edits content documents and moves the campaign; an **admin** (`ADMIN_EMAILS`) is a game master who also grants the role, issues reset words, signs players out, burns and releases ledgers and runs midnight. Every service takes the `Actor` and refuses with `LedgerError(…, 403)` itself; `src/server/api.ts` checks the least role a route names and validates the body, nothing more.

Ownership and the ledger are one thing seen twice: claiming a ledger at `/curfew/` claims an unowned warband, giving up the ledger frees the warband, a game master handing a warband to another player carries the ledger along, and releasing from the Watch House drops both. Battles and victories are counted from the played scenarios; the last played scenario's `injured` warriors are the Curfew's recovering ones.

The Fountain Post (`docs/fountain-post.md`) follows the same split: the match, the draw, the pay and its limits are a rule, pure in `src/campaign/jobs.ts`; each location's board of jobs is the game master's, in `location_jobs`; what was taken is the record, in `warband_jobs`, with the pay written into `members.experience` and `warbands.gold`. An offer is never stored: it is reckoned from the record whenever it is read, against the warbands on the game's muster as they stand. For a warband the warband builder keeps, the pay goes through its log instead (`payIn`), and its books are read from its roster and stash.

The warband builder splits the same way. The rules of each warband are the community's BattleScribe data, a rule kept outside the repository and brought in as committed JSON (`scripts/builder/normalise.mjs` → `src/data/builder/`); the engine that reads them and the campaign's own rules on top (the 500 crowns, the stash, the sale price, the size of a warband) are pure in `src/builder/`. A warband's roster is the record: `warbands.roster`, written by its keeper on `/warbands/<id>/roster/`, with every change a line in `warband_log` that holds the gold and wyrdstone it moved and the roster as it stood before. Gold, wyrdstone and rating are never stored: the first two are sums of the log, the third is read from the roster. The warriors' numbers are written from the roster onto their `members` rows (`project` in `src/server/campaign/keep.ts`), so every page that reads a warrior reads them as before; names, portraits and stories stay the record's.

## Rendering modes

Astro is `output: 'static'` with the Vercel adapter (`astro.config.mjs`), but every page reads the record, so every page exports `prerender = false` and runs as a function.

| Route | Mode | Why |
| --- | --- | --- |
| `/` | function, edge-cached five minutes, `Cache-Control: public, s-maxage=300` | The whole campaign's record, but nothing personal. Signed-in links are revealed by the browser after asking `/api/account/me`, which also says the viewer's role and warband. |
| `/scenarios/`, `/scenarios/<id>/`, `/scenarios/<id>/battle/`, `/warbands/`, `/warbands/<id>/`, `/locations/`, `/locations/<id>/`, `/curfew/`, `/curfew/eve/`, `/admin/**` | function, `private, no-store` | They show the viewer's own pen: what they may edit depends on who they are. |
| `/api/**` | function | Same-origin JSON. |

The battle tracker is the one page that does not reload: `src/lib/tracker.ts` renders the turn, the tally and the log from the scenario the server last answered with, posts each tap to `api/scenarios/` (`turn`, `event`, `out-of-action`, `remove-event`) and re-renders from the answer, and while the page is visible asks `tracker` every few seconds whether another phone at the table has written (re-rendering only when `updatedAt` moved). Takedowns logged there are the record's own `scenario_out_of_action` rows, tagged with the turn; notes, scores and the checks of a custom scenario's objective (`check`, one `control` row per warband counted) are `scenario_events`. A picture from the camera is one too (`photo`): the browser draws it at up to 4096 pixels with a small one for the log (`src/lib/photo.ts`) and sends both as a form, the one tracker request that is not JSON, and the two are kept in `images` against the scenario. The page hands the client the roster once, in a JSON script tag; the log is what changes. When the Tarot of the Damned is in play (`scenarios.tarot`), the page also says whose hands this phone may hold, and `src/lib/tarot.ts` fetches each hand on its own (`hand`, reckoned against the table's turn by `src/server/campaign/tarot.ts`) and plays a card (`play`): the hand is the one thing at a scenario the other side must not see, so it never rides on the scenario the tracker answers with.

The management pages share one client script, `src/lib/manage.ts`: a `button[data-act="warbands/claim"]` posts its `data-body`, a `form[data-api="scenarios/update"]` posts its fields as nested JSON (`patch.lore`, `patch.stats.WS`; `data-list` textareas one line per entry, `data-paragraphs` one paragraph per blank line, checkbox groups arrays) merged over `data-json`, and on success the page reloads. Nothing is updated optimistically: the server's answer is the page.

Long-form prose accepts CommonMark: warband overviews, warriors' tales, chapter prose, scenario rules and tellings, location and point descriptions, and article bodies. Mark their textareas `data-markdown`; `src/lib/markdown-editor.ts` adds syntax guidance and a live preview through the management script (the dynamic chapter editor wires its own fields). `src/components/Markdown.astro` and the preview share `renderMarkdown` in `src/lib/markdown.ts`, using micromark's safe defaults: raw HTML is escaped and unsafe URL protocols are disabled. Use `markdownText` for metadata and excerpts inside linked cards, never rendered links inside links. Keep the source in the database, not HTML: `proseSource` preserves indentation and hard breaks; a Markdown `data-paragraphs` field retains its line breaks and empty array entries so the battle and its revisions round-trip through `join('\n\n')`. Structured one-per-line lists, short notices and JSON content editors remain plain text.

Server-side data reaches a page's client script through a `boot` JSON blob in an inline `<script type="application/json" id="boot">` with `<` escaped. Client scripts are separate modules and cannot see `import.meta.env`; anything they need comes through `boot` or a `data-` attribute. The base path is `base` from `src/lib/site.ts` on the server and `root.dataset.base` in the browser.

Visibility in Curfew and Watch House interfaces is driven by the `hidden` attribute from script, never by toggling classes; `curfew.css` and `admin.css` make `[hidden]` win over every `display` rule for that reason.

## How a real day becomes a night, and a night a place

1. `localDateIn(campaign.timezone, now)` turns the wall clock into a `YYYY-MM-DD` where the campaign is played. `nightOn(campaign, date)` counts nights from the campaign's `start` (`src/campaign/campaign.ts`, the same arithmetic as the engine's `nightForDate`, held to it by a test); for the first campaign night 1 is 2026-09-10, and earlier dates are zero or negative and nothing happens on them.
2. `todayFor(campaign, url, viewer)` in `src/server/curfew/service.ts` is the only place the server decides which night is current in a campaign. It honours `?date=` only when `env.CURFEW_DEBUG` is on and the viewer is a game master; a player always gets the real night. The cron, the home page and the whole Watch House pass `null`, so nothing that reaches other players' ledgers can be steered. With the Debug strip on, a game master's requests are dry runs (`src/server/curfew/dry.ts`): `withLedger` computes from a sandbox the browser carries and neither saves nor publishes.
3. Every service function takes `today: number`. Tests pass night numbers directly and never mock the clock.
4. `locationForNight(night, moves)` picks the latest move on or before that night; with no moves the campaign is in Mordheim. Moves come from `curfew_moves` via `campaignMoves(campaignId)`, read fresh on every call. The location of a night is therefore a function of the move log, never of "now": a move takes effect from tonight and a written night is never rewritten. The places themselves are the campaign's `location:<id>` documents, in its world from `worldFor()`.
5. The Imperial date shown for any night is `imperialForDate(dateForNight(night), anchorFor(campaign))`, counted from the campaign's anchor. The Empire keeps one week, counted from the first campaign's anchor, so a later anchor only says which Imperial day its night 1 was.

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
- **`src/server/curfew/service.ts`** owns storage. Everything is in one campaign, named first. Every entry point first builds the campaign's world (`worldFor`) and loads its roster from the database (`loadRoster(campaignId)` in `campaign/roster.ts`: the warbands with members, and who its last played scenario left injured). `withLedger(campaignId, userId, today, change)` is the whole write path: load the row and the moves, coerce the state, reconcile, apply `change`, and save under `WHERE version = <read version>`. A version clash retries the whole cycle, three times, then answers 409. A read is `withLedger` with an empty change, so every read writes the dawns it finds due. `reconcileAll` runs `reconcileCampaign` for every live campaign with the Curfew on, each by its own clock, without the retry, because two writers produce the same dawn; a finished or archived campaign writes no more nights and refuses changes to its ledgers. Dispatches are inserted with `onConflictDoNothing`, so reconciling twice never prints twice.
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
| A location, a point of interest, the trading post | On the site: `/locations/` founds one, `/locations/<id>/` writes it up, uploads the map, pins the points and keeps the post (`src/server/campaign/locations.ts`, `api/locations/`). The rulebook's price chart is a rule: `src/campaign/trading.ts`. The seed for an empty table: `src/data/locations.ts` and `public/locations/` |
| Where a scenario is fought | The Where fieldset on `/scenarios/<id>/`: a location, a point of interest there or a spot tapped on the map (`whereOf` in `campaign/scenarios.ts`; `fightPosition` in `model.ts`) |
| A battle played | On the site: at the table, the tracker at `/scenarios/<id>/battle/` logs the turns, the tally and the takedowns; afterwards the game master marks the scenario played and writes it up at `/scenarios/<id>/`; the players tell their part; the roster is changed at `/warbands/<id>/` |
| A change to the record's shape | `src/campaign/model.ts`, the service, the seed, the page |
