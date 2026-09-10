# Mordheim — City of the Damned

A grimdark, interactive campaign chronicle for our Mordheim game group, built with [Astro](https://astro.build) and hosted on [Vercel](https://vercel.com).

## Features

- 🌧 Rainy, moody atmosphere — canvas rain, flying crows, drifting fog, and distant lightning
- 📰 **Town Cryer** — a parchment broadsheet with news from the City of the Damned, and dispatches from the Night Watch: what the Curfew ledgers saw last night
- ⚔ **Warbands** — rosters with clickable warrior profiles (statlines, equipment, skills, and lore)
- **Quick reference** — persistent section navigation, compact mobile rosters, scrollable standings with pinned warband names, and accessible warrior dialogs with stat definitions
- 🏆 **Campaign Standings** — ratings, battles, wyrdstone, and gold
- 📜 **The Chronicle** — a timeline of campaign events
- ⚔ **Battle reports** — open any Chronicle chapter or warrior story entry for scenario outcomes, paired warband prologues and epilogues, the battle narrative, campaign consequences, and every participant's accomplishments

## CURFEW — nights between games

`/curfew/` is a between-games companion. Every real day is one night in Mordheim: at dusk a player gives up to two warband members an errand, at midnight the dice decide, at dawn a short vignette and a ledger line say what it cost. Favour, shards and Renown accrue; the Hand holds up to three charms (one per type) that are laid on the table at `/curfew/eve/` the night before a real game and spent whether used or not.

Players sign in with Google, Discord or GitHub and take up one warband each. The ledger is kept on the server, so it follows the player from phone to laptop, and the Town Cryer can print what happened to every warband. Nights turn at midnight in the campaign's time zone (`timezone` in `campaign.json`). A night's result is still a deterministic function of the orders given: the server runs the same pure engine the browser used to.

Resolution happens twice over, and both ways agree: a nightly cron writes every ledger's dawn just after midnight (so the Town Cryer has last night before anyone looks in), and any visit to a ledger first writes whatever dawns are still due. Missed nights run on standing orders at half yield; a gap longer than a week collapses into a single Return vignette and nothing is lost but opportunity.

| File | Contents |
| --- | --- |
| `src/data/curfew/campaign.json` | Start date (night 1), time zone, members per night, soft caps, thresholds |
| `src/data/curfew/omens.json` | The 30 Omens of the Tarot of the Damned, with readings and errand tilts |
| `src/data/curfew/moons.json`, `tokens.json`, `patrons.json`, `jobs.json` | The weekly Moons, the 12 tokens and 4 curses, and Phase 4 content |
| `src/data/curfew/vignettes.json`, `cryer.json`, `STYLE.md`, `PLAN.md` | Dawn Report templates, rumours, epithets, Renown titles; Town Cryer headline templates; the writing style guide; the implementation plan with phase status |
| `src/curfew/engine.ts` | The pure Night engine: calendar, seeded draws, errand resolution, the Hand |
| `src/curfew/ledger.ts` | The ledger as pure functions: orders, reconciliation of passed nights, absence rules, offers, the Eve |
| `src/curfew/cryer.ts` | What a resolved night gives the Town Cryer: every headline, and occasionally one member's night |
| `src/server/curfew/service.ts` | Ledgers in Postgres: claims, load-reconcile-save with optimistic locking, the nightly run, dispatches |
| `src/pages/api/curfew/[action].ts`, `src/pages/api/cron/midnight.ts` | The JSON API the Ledger and Eve pages call, and the cron endpoint |
| `public/curfew/omens/` | Card images, regenerated with `scripts/curfew/` |

In `astro dev` (or with `CURFEW_DEBUG=true`, never in production) `?date=YYYY-MM-DD` is allowed on Curfew URLs and the dim **Debug** toggle in the Ledger's footer adds previous/next-night buttons and a date picker.

## The Watch House — admin console

`/admin/` is the game master's console, in Curfew's dark dress. It shows tonight at a glance (the Omen and Moon, who keeps which warband, who is behind on their dawns, the last midnight run, and a health check of database, secrets and sign-in), and lets the game master:

- inspect any ledger (last night, the Hand, pending offers, the Eve, the raw record), burn one to start it afresh, or release a warband from its keeper;
- moderate the Town Cryer: pull a dispatch, or post a notice from the Watch that prints in the broadsheet;
- see every player with their sign-in provider, sessions and last visit, and sign one out everywhere;
- run midnight by hand and read the history of runs.

Admission is by `ADMIN_EMAILS`, a comma-separated list of sign-in emails. Locally, with the dev sign-in and no list, every player is admitted.

## Development

Node 22 or newer (`.nvmrc` says which; `nvm use` picks it up). Then:

```sh
npm install
npm run dev            # http://localhost:4321 — no .env needed
```

`astro dev` is a complete local setup on its own:

- **A local database.** With no `DATABASE_URL`, a real Postgres runs in-process ([PGlite](https://pglite.dev)) and keeps its files under `.pglite/`, with the checked-in migrations applied on start. `npm run db:reset` wipes it. Paste the Neon connection string into `.env` to work against the real database instead (`npx vercel env pull .env` fetches it).
- **A dev sign-in.** The Ledger offers "Local player": type a name and you are signed in, no OAuth app needed. Two names make two players, so both warbands can be tried side by side in two browsers or a private window.
- **Stepping through nights.** The Debug strip in the Ledger's footer and `?date=YYYY-MM-DD` are on, so a whole Moon of nights can be played through in a minute.

None of the three can switch on where Vercel runs the site; `.env.example` lists the switches that turn them off locally.

```sh
npm test               # engine, ledger, Town Cryer and service tests (the service tests run on an in-memory Postgres)
npm run check          # type-check pages and scripts
npm run build          # build for Vercel into ./dist and ./.vercel/output
```

VS Code users get the Astro extension recommended on opening the folder. There is a `CLAUDE.md` for Claude Code with the same map of the repository.

### Database

Postgres, managed with [Drizzle](https://orm.drizzle.team). The schema is `src/server/db/schema.ts`; migrations are checked in under `drizzle/` and are what both PGlite and Neon run.

```sh
npm run db:generate    # write a new migration after changing the schema
npm run db:migrate     # apply migrations to DATABASE_URL (Neon); the local database migrates itself on start
npm run db:studio      # browse DATABASE_URL
npm run db:reset       # delete the local .pglite/ database
```

### Design skill

The [Impeccable](https://impeccable.style) design skill is checked in under `.claude/skills/impeccable/` for Claude Code. Start a design task with `/impeccable init` once, then `/impeccable <command> <target>` (for example `/impeccable audit src/pages/curfew/index.astro`). Its launcher downloads a small engine binary on first run. Update it with `npx impeccable update`.

## Updating campaign content

All content lives in plain TypeScript data files — no HTML editing required:

| File | Contents |
| --- | --- |
| `src/data/warbands.ts` | Warbands, members, statlines, equipment, lore |
| `src/data/news.ts` | Town Cryer articles and notices |
| `src/data/chronicle.ts` | Campaign timeline entries |
| `src/data/history/*.json` | Per-scenario battle reports and snapshots: narratives, outcomes, loot, campaign consequences, and every participant's stats, highlights and lowlights |
| `src/data/history.ts` | Types and helpers (`getMemberStory`, `getWarbandStory`) to follow any warrior or warband across the campaign |
| `src/data/curfew/omens.json` | The CURFEW Omen deck: 30 Tarot of the Damned cards with readings and errand tilts; images in `public/curfew/omens/`, regenerated with `scripts/curfew/` |

### Campaign history database

Each scenario played gets one JSON file in `src/data/history/` recording a snapshot of both warbands as they stood after the battle — rating, gold, wyrdstone, and a per-member snapshot of stats, equipment, skills, and status (`active`, `injured`, or `dead`), plus a highlight and a lowlight for every warrior and each warband. Add a new file per scenario and register it in `src/data/history.ts` to extend the storyline.

Each record also includes a `report`:

- `rulebookScenario` is the actual rulebook scenario title, distinct from the campaign chapter title. `winCondition` records its victory requirement, and `outcome` explains who won and how. Use `null` for rulebook details that were not recorded, rather than guessing from the narrative.
- `prologue`, `battle` (a list of paragraphs), and `epilogue` give the neutral account. `perspectives` contains one entry per participating `warbandId`, with its own `prologue`, `epilogue`, and `accomplishments`.
- `loot` records noteworthy rewards and costs; `campaignNotes` preserves deaths, recurring items, lasting consequences, and unresolved or conflicting accounts. Treasury snapshots are totals, not battle rewards.
- `outOfAction` records confirmed takedowns with `attackerId` (a participating member ID), `target` (the opponent's name or a description if unnamed), `detail`, and optionally `targetId` (another participating member ID, for a link). An empty list means no confirmed results were recorded, not necessarily that nobody was taken out. Do not infer a takedown from a hit, a bow notch, or an environmental casualty.

Detail pages are generated automatically at `/scenarios/<id>/`. Set the matching `scenarioId` in `src/data/chronicle.ts` to link a listing to its report. Warrior story entries link to the same pages. Existing reports retell the recorded history; unrecorded rulebook details remain explicitly marked as missing.

## Deployment

The site runs on Vercel's Hobby plan: the campaign pages are prerendered, and the Town Cryer, the Curfew pages, the API and the cron run as serverless functions.

1. **Import the repository** at vercel.com. Astro is detected; no build settings need changing. Pushes to `main` deploy to production and every pull request gets a preview URL.
2. **Add a database.** In the project's *Storage* tab, add **Neon** from the Marketplace (free plan). It sets `DATABASE_URL` on the project. Pull it locally with `vercel env pull` and run `npm run db:migrate` once to create the tables; repeat after any new migration.
3. **Set the secrets** under *Settings → Environment Variables*: `BETTER_AUTH_SECRET` (`openssl rand -base64 32`), `CRON_SECRET` (another random string) and `ADMIN_EMAILS` (the game masters' sign-in emails). `BETTER_AUTH_URL` can be left unset; the production domain is used.
4. **Register OAuth apps** with whichever providers the group uses and set their `*_CLIENT_ID` and `*_CLIENT_SECRET`. Only providers with both values set get a button. The redirect URI to register is `https://<your-domain>/api/auth/callback/<provider>`, for example `.../api/auth/callback/google`. Preview deployments have their own hostnames; to sign in on one, register its callback too, or test sign-in on production only.
5. **The nightly cron** is declared in `vercel.json` and needs no further setup. Hobby plans run crons once a day within the hour of the schedule; it is set for 23:15 UTC so that it lands after midnight in Stockholm summer or winter. A visit to a ledger writes any dawn that is still due, so a late cron costs nothing but the Town Cryer's punctuality.

The GitHub Actions workflow in `.github/workflows/ci.yml` runs the tests, the type check and a build on every push and pull request.

---

*A fan-made, non-commercial hobby project. Mordheim is © Games Workshop.*
