# Mordheim — City of the Damned

A grimdark, interactive campaign chronicle for our Mordheim game group, built with [Astro](https://astro.build) and hosted on [Vercel](https://vercel.com).

## Features

- 🌧 Rainy, moody atmosphere — canvas rain, flying crows, drifting fog, and distant lightning
- 📰 **Town Cryer** — a parchment broadsheet with news from wherever the campaign is (the City of the Damned, or the village of Fussenbach), and dispatches from the Watch: what the Curfew ledgers saw last night
- ⚔ **Warbands** — rosters with clickable warrior profiles (statlines, skills, old wounds and lore), each kept by its player at `/warbands/<id>/`: the story, the standings, every warrior's characteristics, experience and tale, the fallen and their epitaphs
- **Quick reference** — persistent section navigation, compact mobile rosters, scrollable standings with pinned warband names, and accessible warrior dialogs with stat definitions
- 🏆 **Campaign Standings** — battles and victories, counted from the played scenarios, shown when the admin turns them on. Rating, gold and wyrdstone are not tracked for now
- 📜 **The Chronicle** — a timeline of campaign events, with the upcoming games above it
- ⚔ **Scenarios** — a game master sets up the next game at `/scenarios/` (when, in both the real and the Imperial calendar; which warbands; which rulebook scenario, or custom rules; a prologue) and it is marked **Upcoming** everywhere. After the game they mark it played with each warband's result, write the battle, the epilogue and the campaign notes, and may open the battle to be retold by those who fought (earlier tellings are kept). Every player who fought adds their own prologue and epilogue, which warriors they brought and how each fared (with a finest and a darkest moment), and who put whom out of action
- 📱 **Battle tracker** — from an upcoming scenario, anyone whose warband fights (or a game master) opens `/scenarios/<id>/battle/` on their phone at the table: the turn, the scenario's tally per warband (shards, warriors through, buildings held, or whatever the game master names), and a log of notes, scores and out-of-action results by turn. Every phone at the table sees the same log; the scenario page reads it back afterwards
- **Roles** — a player keeps one warband; a game master (granted in the Watch House) runs the campaign; an admin (`ADMIN_EMAILS`) keeps the accounts too

## CURFEW — nights between games

`/curfew/` is a between-games companion. Every real day is one night in Mordheim: at dusk a player gives up to two warband members an errand, at midnight the dice decide, at dawn a short vignette and a ledger line say what it cost. Favour, shards and Renown accrue; the Hand holds up to three charms (one per type) that are laid on the table at `/curfew/eve/` the night before a real game and spent whether used or not.

Players sign in with an email and a password (no emails are sent; the admin issues a reset word when one is forgotten) and take up one warband each: taking up the ledger takes up the warband, and the same player keeps both. The ledger is kept on the server, so it follows the player from phone to laptop, and the Town Cryer can print what happened to every warband. Nights turn at midnight in the campaign's time zone (`timezone` in `campaign.json`). A night's result is still a deterministic function of the orders given: the server runs the same pure engine the browser used to.

Resolution happens twice over, and both ways agree: a nightly cron writes every ledger's dawn just after midnight (so the Town Cryer has last night before anyone looks in), and any visit to a ledger first writes whatever dawns are still due. Missed nights run on standing orders at half yield; a gap longer than a week collapses into a single Return vignette and nothing is lost but opportunity.

Some nights one member comes to a **crossroads**: the Dawn Report stops there and the player decides at dawn what the character did. Roads cost or bring Favour, shards, Renown, a charm or a rumour, leave a permanent mark in the warrior's story, can reach into tonight, and on a risk road may bring a curse home. A crossroads nobody decides is decided by the character at the next midnight, along the road that risks nothing. See `src/data/curfew/CROSSROADS.md`.

| File | Contents |
| --- | --- |
| `src/data/curfew/campaign.json` | Start date (night 1), time zone, members per night, soft caps, thresholds, and the calendar anchor: the first game's real date and its Imperial date |
| `src/lib/calendar.ts` | The Imperial Calendar: 400-day year, eight-day week, six holy days outside both; every real day since the first game is one Imperial day. Dates the Town Cryer's issues, the Curfew's nights and the archives' battles |
| `src/data/curfew/omens.json` | The 30 Omens of the Tarot of the Damned, with readings and errand tilts. Seed and built-in default; the live deck is the `omens` document in `/admin/content/` |
| `src/data/curfew/moons.json`, `tokens.json`, `patrons.json`, `jobs.json` | The weekly Moons, the tokens (some belong to one place) and 4 curses, and Phase 4 content. Seed and built-in defaults for the `moons` and `tokens` documents |
| `src/data/curfew/locations/*.json` | One pack per place the campaign can be in: its errands and why the others are not to be had, points of interest, Dawn Report templates, rumours, epithets, Moon tie-ins, its crossroads and the names of the marks they leave, and the Town Cryer's masthead and headlines. `mordheim.json` and `fussenbach.json` today; on a live campaign the packs are the `location:<id>` documents, edited by game masters |
| `src/data/curfew/STYLE.md`, `PLAN.md`, `CROSSROADS.md` | The writing style guide; the implementation plan with phase status; the Crossroads, proposed and built |
| `src/curfew/engine.ts` | The pure Night engine: calendar, seeded draws, errand resolution, the Hand. Its content bindings are swapped for the database's documents by `useContent` |
| `src/curfew/packs.ts` | Checks a content document before it is saved; slims a pack for the browser |
| `src/curfew/ledger.ts` | The ledger as pure functions: orders, reconciliation of passed nights, absence rules, offers, the Eve |
| `src/curfew/cryer.ts` | What a resolved night gives the Town Cryer: every headline, and occasionally one member's night |
| `src/server/curfew/service.ts` | Ledgers in Postgres: claims, load-reconcile-save with optimistic locking, the nightly run, dispatches. Reads the roster and the content from the database first |
| `src/server/content/curfew.ts` | The content documents: seeded from the files, put in force for the engine, saved with validation and a kept version |
| `src/pages/api/curfew/[action].ts`, `src/pages/api/cron/midnight.ts` | The JSON API the Ledger and Eve pages call, and the cron endpoint |
| `public/curfew/omens/`, `public/curfew/places/` | Omen card images, and the band and mark of each place the campaign can be in; both regenerated with `scripts/curfew/` |

For game masters, `?date=YYYY-MM-DD` is allowed on Curfew URLs and the dim **Debug** toggle in the Ledger's footer adds previous/next-night buttons and a date picker. A player's clock is never steered, whatever the URL says, and the Watch House always acts on the real night, so debugging cannot touch anyone else's ledger. This is on everywhere, production included; `CURFEW_DEBUG=false` turns it off. While the toggle is on, every request is a **dry run**: the server computes the night in memory and saves nothing, the browser keeps the sandbox between steps (in `sessionStorage`, sent back as `dry.base`), the strip says how many nights the sandbox is ahead of the real ledger and what the Cryer would have printed, and turning the toggle off drops the sandbox. The real ledger is exactly as it was.

## The Watch House — admin console

`/admin/` is the game masters' console, in Curfew's dark dress. It shows tonight at a glance (the Omen and Moon, who keeps which warband, who is behind on their dawns, the last midnight run) and lets a game master:

- inspect any ledger (last night, the Hand, pending offers, the Eve, the raw record);
- moderate the Town Cryer: pull a dispatch, post a notice from the Watch that prints tonight, and write, correct, hold back or pull the broadsheet's own **articles**, each for the place it prints in;
- move the campaign between the places on the map. The move takes effect from tonight: earlier nights keep their place, the Curfew greys out the errands the new place has none of and offers its own, and the Town Cryer prints from there;
- edit the Curfew's **content** at `/admin/content/`: the Omens, the Moons, the charms and curses, and one pack per place, as JSON documents checked against the pack rules before saving, with every earlier version kept. A new place is a pasted pack (its band and mark still go under `public/curfew/places/` in the repository);
- read **the Odds** at `/admin/odds/`: outcome, charm, crossroads and Cryer chances by tilt, expected yield per errand, standing orders, a simulation of real nights for any warband and place, and where each dial lives in the code. Computed from the engine's own constants, so it cannot drift from the dice.

The admin sees the same and also keeps the accounts and the campaign's switches: whether the **standings** are shown (battles and victories; hidden by default); a health check of database, secrets and sign-in; every player with their role, sessions and last visit; granting or taking the game master's role; signing a player out everywhere and issuing a reset word when a password is forgotten; burning a ledger to start it afresh or releasing a warband from its keeper; running midnight by hand and reading the history of runs.

Game masters are granted on the site. Admins are named by `ADMIN_EMAILS`, a comma-separated list of sign-in emails. Locally, with the dev sign-in and no list, every player is an admin.

## Development

Node 22 or newer (`.nvmrc` says which; `nvm use` picks it up). Then:

```sh
npm install
npm run dev            # http://localhost:4321 — no .env needed
```

`astro dev` is a complete local setup on its own:

- **A local database.** With no `DATABASE_URL`, a real Postgres runs in-process ([PGlite](https://pglite.dev)) and keeps its files under `.pglite/`, with the checked-in migrations applied on start. `npm run db:reset` wipes it. Paste the Neon connection string into `.env` to work against the real database instead (`npx vercel env pull .env` fetches it).
- **A dev sign-in.** The Ledger offers "Local player": type a name and you are signed in, no password needed. Two names make two players, so both warbands can be tried side by side in two browsers or a private window. The real email-and-password form is there too.
- **Stepping through nights.** The Debug strip in the Ledger's footer and `?date=YYYY-MM-DD` are on, so a whole Moon of nights can be played through in a minute.

None of the three can switch on where Vercel runs the site; `.env.example` lists the switches that turn them off locally.

```sh
npm test               # engine, ledger, Town Cryer and service tests (the service tests run on an in-memory Postgres)
npm run check          # type-check pages and scripts
npm run build          # build for Vercel into ./dist and ./.vercel/output
```

VS Code users get the Astro extension recommended on opening the folder. Coding agents start at `AGENTS.md` and `CLAUDE.md` (the same map of the repository), go deeper in `docs/agents/`, and have checklists for the common tasks under `.claude/skills/`.

### Database

Postgres, managed with [Drizzle](https://orm.drizzle.team). The schema is `src/server/db/schema.ts`; migrations are checked in under `drizzle/` and are what both PGlite and Neon run.

```sh
npm run db:generate    # write a new migration after changing the schema
npm run db:migrate     # apply migrations to DATABASE_URL (Neon) by hand; the local database migrates itself on start
npm run db:studio      # browse DATABASE_URL
npm run db:reset       # delete the local .pglite/ database
```

### Design skill

The [Impeccable](https://impeccable.style) design skill is checked in under `.claude/skills/impeccable/` for Claude Code. Start a design task with `/impeccable init` once, then `/impeccable <command> <target>` (for example `/impeccable audit src/pages/curfew/index.astro`). Its launcher downloads a small engine binary on first run. Update it with `npx impeccable update`.

## Updating campaign content

The campaign's record is kept in the database and managed on the site: warbands and warriors at `/warbands/<id>/` by their owner or a game master, scenarios at `/scenarios/` by game masters and the players who fought, the Town Cryer's articles and the Curfew's content documents by game masters in the Watch House. Battles and victories are counted from the played scenarios; the last played scenario's injured warriors are the ones the Curfew keeps home.

The repository keeps the rules, the code and the **seed**: when a database has no warbands yet (a fresh Neon, or `npm run dev` after `npm run db:reset`) it is filled once from the files below, and after that they are only the tests' fixture. Editing them changes nothing on a seeded database.

| File | Contents |
| --- | --- |
| `src/campaign/model.ts` | The record's shape: `Warband`, `Member`, `Scenario`, `ScenarioWarband`, `ScenarioMember`, `OutOfAction`, `NewsArticle` |
| `src/data/warbands.ts` | Seed: warbands, members, statlines, lore as they stood |
| `src/data/news.ts` | Seed: Town Cryer articles and notices |
| `src/data/chronicle.ts` | Seed: the Chronicle's paragraphs, one per scenario |
| `src/data/history/*.json`, `src/data/history.ts` | Seed: per-scenario battle reports and snapshots (narratives, outcomes, loot, campaign consequences, every participant's status, highlights and lowlights, confirmed out-of-action results). `check-history.mjs` under `.claude/skills/record-battle/scripts/` keeps them consistent |
| `src/data/curfew/*.json`, `src/data/curfew/locations/*.json` | Seed and built-in defaults for the Curfew's content documents |
| `src/server/campaign/seed.ts`, `src/server/content/curfew.ts` | The seeding itself |

Detail pages are served at `/scenarios/<id>/` (an upcoming scenario is marked as such and shows when, who and by what rules) and `/warbands/<id>/`. Warrior story entries link to the same pages.

## Deployment

The site runs on Vercel's Hobby plan: every page reads the database, so they all run as serverless functions, the home page and the scenario pages cached at the edge for a few minutes.

1. **Import the repository** at vercel.com. Astro is detected; no build settings need changing. Pushes to `main` deploy to production and every pull request gets a preview URL.
2. **Add a database.** In the project's *Storage* tab, add **Neon** from the Marketplace (free plan). It sets `DATABASE_URL` on the project. The tables are created and kept current by the deploy itself: `npm run build` runs `scripts/migrate.mjs` first, which applies any migration under `drizzle/` the database has not seen, on production deploys only (a preview branch never changes the shared database's schema). Nothing to do by hand; to migrate from a laptop instead, copy the pooled connection string from the Neon console (`vercel env pull` cannot read it; the integration marks it sensitive) and run `DATABASE_URL='postgresql://…' npm run db:migrate`.
3. **Set the secrets** under *Settings → Environment Variables*: `BETTER_AUTH_SECRET` (`openssl rand -base64 32`), `CRON_SECRET` (another random string), `ADMIN_EMAILS` (the admins' sign-in emails; game masters are granted on the site) and `CURFEW_INVITE_CODE` (the word new players must give to sign up). `BETTER_AUTH_URL` can be left unset; the production domain is used.
4. **Sign-in is email and password**, handled by Better Auth. No emails are sent: the address is only the name a player signs in with, so there is no verification and no reset link. A player who forgets their password asks the game master, who issues a **reset word** in the Watch House (three words and a tail, shown once, stored hashed, good for two days) and passes it on. "Forgotten your password?" at the Ledger trades the word for a new password and signs every device out. Redeploy after setting the variables so the functions start with them.
5. **The nightly cron** is declared in `vercel.json` and needs no further setup. Hobby plans run crons once a day within the hour of the schedule; it is set for 23:15 UTC so that it lands after midnight in Stockholm summer or winter. A visit to a ledger writes any dawn that is still due, so a late cron costs nothing but the Town Cryer's punctuality.

The GitHub Actions workflow in `.github/workflows/ci.yml` runs the tests, the type check and a build on every push and pull request.

---

*A fan-made, non-commercial hobby project. Mordheim is © Games Workshop.*
