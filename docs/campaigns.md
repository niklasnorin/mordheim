# Proposal: campaigns as a first-class concept

Status: proposal, approved as a plan, not yet started. Nothing here is built.

## Why

The site is built around one campaign. Its identity lives in `src/data/curfew/campaign.json` (id `mordheim-2000`, which seeds every roll, plus the start date, timezone, Imperial anchor and tuning), and that file is imported straight into the engine, the calendar, the Fountain Post and several pages. None of the tables (warbands, scenarios, ledgers, dispatches, moves, articles, content, stock, jobs, settings) say which campaign a row belongs to. Uniqueness rules like "one warband per player" (`warbands_owner_idx`) and "one ledger per player" (`curfew_ledgers_owner_idx`) are site-wide.

The campaign should be able to:
- start a completely new campaign, possibly in a new world (still Mordheim rules: new places, Curfew packs, calendar, warband lists, starting crowns, news);
- run **several campaigns side by side**;
- let a game master **sketch a campaign in private** before it goes public;
- **bring warbands over** from another campaign: as they are, adjusted, or started over;
- keep game masters site-wide for now.

The aim: the existing campaign carries on unchanged (same dice, same dates, same addresses), and every new campaign is a database row, not a code fork.

---

## 1. Two concepts: Setting (code) and Campaign (database)

This follows the project's rule of asking who writes the thing.

| | **Setting** | **Campaign** |
|---|---|---|
| What | A template: a world's defaults and built-in content | One run of play: warbands, scenarios, nights |
| Written by | Code, as a commit | A game master, on the site |
| Lives in | `src/data/settings/<id>/` plus a registry `src/data/settings/index.ts` | `campaigns` table |
| Holds | Default tuning (today's `campaign.json` fields), default timezone, a suggested Imperial year, Curfew documents (omens, moons, tokens, one pack per place), seed locations, allowed warband catalogues, starting crowns, seed articles | id (permanent, seeds the dice), slug, name, setting id, status, start, timezone, anchor, tuning, options |

Today's `src/data/` becomes the setting `city-of-the-damned`. The registry points at the existing files, so nothing has to move. The seeded warbands, history and news stay as the record of campaign `mordheim-2000` alone.

### Campaign lifecycle (`campaigns.status`)

- **draft**: only game masters can see it. Under `/c/<slug>/` they can use everything: scenarios, locations, articles, content packs, test warbands, carry-overs. No cron runs, and nights before `start` resolve to nothing, as today. Pages are `private, no-store` and `noindex`; everyone else gets a 404.
- **live**: public. The cron reconciles it, and players can join it or bring a warband in.
- **finished**: nights stop (the cron skips it, ledgers become read-only) and players can no longer change the record. Game masters can still correct it. It stays browsable.
- **archived**: like finished, but hidden from the campaign switcher. It can still be reached by its link.

Launching (draft → live) shows a checklist first: start date set, a first place chosen, Curfew content valid (`packs.ts` validators), at least one location. Launch can optionally strike the test warbands and test scenarios made while sketching.

### Campaign options (JSON on the row, typed and defaulted in pure code)

- `curfew: boolean`: whether the Curfew runs in this campaign at all.
- `standingsVisible`: moves here from `campaign_settings`.
- `catalogues: string[] | null`: which builder warband lists are allowed.
- `startingCrowns`: replaces the hard-coded 500 in `src/builder/rules.ts`.
- `carry`: the carry-over policy (§5).
- `frontDoor` is a separate site-wide setting: which live campaign the unprefixed addresses show.

---

## 2. Data model

**New table `campaigns`**: `id` (text PK, permanent), `slug` (unique), `name`, `setting`, `status`, `start`, `timezone`, `anchor` (jsonb), `tuning` (jsonb: the rest of `campaign.json`), `options` (jsonb), `createdBy`, timestamps, `version`.

**Tables that get a `campaign_id`**: warbands, scenarios, news_articles, curfew_ledgers, cryer_dispatches, curfew_moves, curfew_runs, curfew_content (plus revisions), campaign_settings, location_stock, location_jobs.

**Tables that inherit the campaign** through their parent and need no column: members, warband_log, warband_chapters, warband_jobs, scenario_*, images.

**Shared atlas** (no campaign column): `locations` and `location_points` hold the geography, so Mordheim is the same city in any campaign. A new join table `campaign_locations(campaign_id, location_id, sort)` says which places a campaign uses. Trading-post stock and job boards are per campaign, because they are game-master choices for that run.

**Uniqueness changes**:
- `warbands_owner_idx` becomes (campaign_id, owner_id): one warband per player *per campaign*.
- `curfew_ledgers_owner_idx` becomes (campaign_id, owner_id).
- The dispatch `key` becomes unique per (campaign_id, key). The `the-watch` notices would otherwise collide.
- `location_stock` and `location_jobs` uniques gain campaign_id.
- `scenarios.sequence` counts within a campaign.

**Ids stay global.** Warband, member and scenario ids remain single-column text PKs, because their foreign keys run everywhere. A warband carried into another campaign gets a **new id** (for example `nordost-kin-lustria`) with `carried_from_id`. Its warriors get new ids with `carried_from_id` as well. This keeps the "ids are forever" rule: nothing is renamed, only copied. A composite (campaign, id) key was considered and rejected; it would touch every foreign key in the schema.

**Lineage**: `warbands.carried_from_id` and `members.carried_from_id` (soft references).

**Migration without hand-written SQL**:
1. Migration A (generated) creates `campaigns` and adds `campaign_id text not null default 'mordheim-2000'` everywhere, with no foreign key yet. The default backfills every existing row.
2. `ensureCampaigns()`, a memoised code path like `ensureSeeded()`, inserts the `mordheim-2000` row from `campaign.json` on first boot.
3. Migration B (generated, next release) drops the defaults and adds the foreign keys to `campaigns`.

---

## 3. Making the campaign an explicit input (the big refactor)

Running campaigns in parallel means no process-wide campaign state. Today there are two kinds of hidden global:

- `import campaign from '../data/curfew/campaign.json'` in `src/curfew/engine.ts`, `src/lib/calendar.ts`, `src/campaign/jobs.ts`, `src/components/Header.astro` and the Curfew and odds pages.
- The engine's live bindings: `OMENS`, `MOONS`, `TOKENS`, `CURSES`, `TOKEN_TYPES`, `LOCATIONS`, set by `useContent()` from `primeContent()`. Two campaigns with different packs in one serverless process would overwrite each other's.

**What changes:**
- A new pure module, `src/campaign/campaign.ts`, defines `CampaignConfig` (id, start, timezone, anchor, tuning, options), `configOf(row)`, and `DEFAULT_CAMPAIGN`, which is built from `campaign.json` so the tests and the pack linter keep working.
- A `World = { campaign: CampaignConfig; content: CurfewDocuments }` is passed explicitly to `resolveNight`, `omenFor`/`moonFor`, `nightForDate`/`dateForNight`, `locationForNight`, `takeRoad`, `reconcile`/`decide` (ledger), `cryer`, `odds` and `jobSeed`. Every `hashSeed(campaign.id, …)` becomes `hashSeed(world.campaign.id, …)`.
- The calendar takes the anchor: `imperialForDate(date, anchor = DEFAULT_ANCHOR)`.
- `useContent` and the live bindings go away. On the server, `primeContent(campaignId)` returns a per-campaign cached `World`, keyed by id and refreshed every 20 seconds as today. The browser receives its slimmed `World` through `boot`.
- **A golden test locks in the existing campaign.** Before the refactor, record a set of dawns, omens, moons and job seeds for `mordheim-2000`. After it, assert they are byte-identical. Running nights must not re-roll.

---

## 4. Server, routing and pages

**Resolving the campaign per request** (`src/middleware.ts`, new):
- `/c/<slug>/…` is rewritten (Astro `context.rewrite`) to the same page, with `locals.campaign` set.
- An unprefixed path resolves to the front-door campaign, so every existing link and bookmark keeps working.
- A draft campaign for a non-game-master gives a 404.
- **Per-request `base`**: `locals.base` is `''` or `/c/<slug>`. Pages already build links from `base` (`src/lib/site.ts`), and client scripts already post to `root.dataset.base + '/api/…'`. So once `base` carries the prefix, the API calls and links follow with almost no client changes. The work is swapping the module constant `base` for `Astro.locals.base` in pages and components.
- Edge caching stays per path. Draft pages are always `no-store`.

**Services take the campaign.** Every service under `src/server/campaign/`, `src/server/curfew/`, `src/server/content/` and `src/server/admin/` gains a `campaignId` (or `World`) argument next to the `Actor`, and filters by it:
- `listWarbands`, `ownWarband(userId, campaignId)`, `loadRoster`, `listScenarios`, `articlesFor`, `campaignMoves`, `getSettings`, the stock and jobs services.
- `withLedger` and `todayFor(campaign, url, viewer)`.
- `api.ts` passes `locals.campaign` to every handler.
- Finished campaigns refuse player writes with a `LedgerError(…, 409)` in one guard (`mayWrite(actor, campaign)`).

**Seeding per campaign.** `ensureSeeded(campaignId)` memoises per id. The existing seed fixtures seed only `mordheim-2000`. A new campaign is filled from its setting when it is created (§6), not lazily.

**Cron.** `reconcileAll` loops over the live campaigns with the Curfew on, each by its own clock (`localDate(now, campaign.timezone)`). The Hobby plan allows one daily cron, so a campaign whose midnight falls after 23:15 UTC catches up on the next visit or the next run. That is already how dawns work.

**Pages:**
- A campaign index at `/campaigns/` lists live and finished campaigns, plus drafts for game masters, and highlights the campaigns where the viewer keeps a warband.
- The header shows the campaign's name and a switcher.
- `/api/account/me` answers with the viewer's warband in *this* campaign.
- The Imperial year in the header comes from the campaign's anchor.

---

## 5. Carrying warbands over

The old campaign's record never changes: carrying a warband over **copies** it. The pure rule is `src/campaign/carry.ts` (tested); the service is `src/server/campaign/carry.ts`; the API action is `carry` on `api/warbands/`.

`carryPlan(source, policy, mode, choices) → CarryPlan` is pure. It says which warriors, gear, gold and wyrdstone go across and what is adjusted, so the keeper sees a preview before confirming.

**Modes**, as allowed by the target campaign's `options.carry`:
1. **As is**: the warband row, crest, overview, the living warriors (with stats, experience, skills, injuries, equipment, epithets and portraits) and the builder roster. Gold and wyrdstone become one opening log line ("Brought from Mordheim, 2004 IC"), because the stash is the sum of the log. Dead warriors stay behind.
2. **Adjusted**: the same copy, put through the campaign's policy: a gold cap, a rating cap, heroes only or at most N henchman groups, an experience cap or reset, old wounds healed or kept, rare items sold back. The result lands as a draft for the keeper to review in the existing roster-confirm flow (as `propose.ts` does today). There, the keeper can make **any** adjustment before approving: warriors added, dropped or changed, stats, experience, skills, injuries, gear, gold and wyrdstone. The policy only shapes the first proposal; it does not limit the keeper's edits. On approval, the log records what the policy proposed and what the keeper changed (a line with the roster before the edits), so a game master can see the difference. Nothing is written to the new campaign until the keeper approves.
3. **Start over**: name, crest, sigil, overview and player carry over. The roster is founded fresh at the builder with the campaign's `startingCrowns`. The keeper may name **veterans**: a new recruit that takes an old hero's name, portrait and epithet and is linked by `carried_from_id`, but starts on fresh stats and experience.

**Rules around a carry-over:**
- The keeper can carry their own warband into a live or draft campaign that allows it. A game master can carry any warband.
- The player must not already keep a warband in the target campaign.
- Chapters stay in the old campaign. The new warband's Story tab links back to them ("Earlier chapters: Mordheim, 2004 IC").
- `WarriorStory.astro` follows `carried_from_id` to show the earlier tally ("Before: 4 battles, 2 takedowns in Mordheim").
- Portrait images are copied as new `images` rows (small, and it keeps the cleanup logic per warrior). Story pictures are not copied.
- The Curfew ledger starts fresh in the new campaign. Epithets travel on the warrior; Renown and titles do not.
- The builder checks the target campaign's allowed catalogues. A warband whose list is not allowed can only start over under a list that is.

---

## 6. Creating a campaign (Watch House)

`/admin/campaigns/` is a new page (`src/pages/admin/campaigns.astro`), backed by `src/server/admin/campaigns.ts`, with `campaign-*` actions on `api/admin/[action].ts`:
- **New campaign from a setting**: name, slug (permanent), id (proposed from the slug and year, permanent), start date, timezone, Imperial anchor, tuning overrides, options. This creates a draft and copies the setting's Curfew documents into `curfew_content` for that campaign. It also adopts the setting's locations into `campaign_locations` (adding any missing atlas rows) and copies their seed jobs and stock. The first place goes into `curfew_moves`.
- **Edit config**: everything except `id`. `start`, `timezone` and `anchor` lock at launch, because they seed the dates and dice.
- **Launch**, **finish**, **archive**, **set as front door**.
- **Copy content from another campaign**: a pack improved in one campaign can be reused in another.
- The existing Watch House panels (players, notices, midnight by hand, moving the campaign, content, jobs, odds, Tarot) act on the campaign being viewed.

---

## 7. Phases (each phase ships green: `npm test`, `npm run check`, `npm run build`)

1. **Foundation, no behaviour change.** The `campaigns` table, `campaign_id` columns with the default, `ensureCampaigns()`, and the new unique indexes. Update `src/server/testdb.ts`. Done when the existing tests pass untouched.
2. **Explicit campaign in the pure code.** `CampaignConfig`, `World`, the engine, ledger, cryer, calendar, jobs and odds take it; the live bindings are removed; the golden test proves `mordheim-2000` is unchanged. This is the largest and riskiest phase, so it goes in alone.
3. **Server scoping.** Services take `campaignId`; content and seeding are per campaign; the cron loops over campaigns; settings move into campaign options; per-campaign `ownWarband`. Service tests run two campaigns in one PGlite.
4. **Routing and UI.** Middleware, per-request `base`, the front door, the switcher, `/campaigns/`, draft gating.
5. **Settings registry and campaign lifecycle.** `src/data/settings/`, the Watch House campaigns panel, create, launch, finish.
6. **Carry-over.** `carry.ts` (pure, plus tests), the service, the warband page's "Take this warband to…" drawer, game-master carry in the Watch House, lineage on the warrior story.
7. **Builder per campaign.** `startingCrowns` and the catalogue filter through `rules.ts` and `/builder/`. The stash's trading post becomes the campaign's current place.
8. **Docs and skills.** CLAUDE.md, `docs/agents/architecture.md` and `glossary.md` (Setting and Campaign), `AGENTS.md`, and the `add-warband`, `record-battle`, `curfew-pack`, `curfew-engine` and `schema-change` skills (campaign scope, migration in two steps), plus `preflight`.

Phases 1 to 3 are invisible to players. After phase 4 the existing campaign looks the same at the same addresses.

---

## 8. Files most affected

- Schema and migration: `src/server/db/schema.ts`, `drizzle/`, `src/server/testdb.ts`, `scripts/migrate.mjs` (unchanged; it simply runs A, then B later).
- Pure: `src/curfew/engine.ts`, `ledger.ts`, `cryer.ts`, `odds.ts`, `packs.ts`, `src/lib/calendar.ts`, `src/campaign/jobs.ts`, `src/builder/rules.ts`, `src/builder/stash.ts`; new `src/campaign/campaign.ts`, `src/campaign/carry.ts`.
- Server: `src/server/content/curfew.ts` (`primeContent` per campaign), `src/server/curfew/service.ts` (`todayFor`, `withLedger`, `reconcileAll`, `campaignMoves`), `src/server/campaign/{seed,roster,scenarios,news,settings,locations,jobs,keep}.ts`, `src/server/admin/service.ts`, `src/server/api.ts`; new `src/server/campaign/campaigns.ts`, `carry.ts`.
- Routing and UI: new `src/middleware.ts`; `src/lib/site.ts`; `src/components/Header.astro`; `src/components/WarriorStory.astro`; `src/pages/admin/campaigns.astro` (new), `src/pages/campaigns/index.astro` (new); `src/pages/api/cron/midnight.ts`.
- Content: new `src/data/settings/index.ts`, which registers today's data as `city-of-the-damned`.

---

## 9. Risks and open points

- **Engine refactor size.** Mitigated by the golden test and by doing it as its own phase.
- **Database size.** Copied portraits and per-campaign content documents add a little to Neon. They are small, but worth a look on the free tier.
- **Anchors (`#agnar`) and ids for carried warriors** gain a suffix. Lineage keeps the story joined up.
- **Per-campaign game masters** are deliberately left out. When they come, a `campaign_roles(campaign_id, user_id, role)` table can feed `getActor` without touching the services, because they already take the `Actor` and the campaign.
- **Players running a warband in two live campaigns at once** have two ledgers and two dawns a day. That is allowed by design. The Curfew page should say which campaign it is.

---

## 10. Verification

- `npm test`:
  - the golden test for `mordheim-2000`;
  - new pure tests for `carry.ts` and `campaign.ts`;
  - service tests with two campaigns in one PGlite: warbands and scenarios are invisible across campaigns; one warband and one ledger per player per campaign; `reconcileAll` resolves live campaigns only; a draft gives a 404 and refuses non-game-masters; a finished campaign refuses player writes; carry as is, adjusted and start over each produce the expected rows and log line, and leave the source untouched; an adjusted carry writes nothing until approved, and the keeper's edits beyond the policy are kept and logged.
- `npm run check`, `npm run build`, `node scripts/builder/normalise.mjs --check`, `check-history.mjs`, `lint-pack.mjs`: the `preflight` skill runs them all.
- Manual walk on `npm run dev` with Playwright:
  1. The existing home page, a warband page and `/curfew/` look the same.
  2. As a game master, create a draft from `city-of-the-damned` and visit `/c/<slug>/`.
  3. As a player, the same address gives a 404.
  4. Launch it; carry a warband "adjusted", change a warrior and the gold in the confirm flow, approve; the new roster has the edits, the log shows both, and the old campaign's warband is unchanged.
  5. Step nights with `?date=` in both campaigns and see different omens.
