# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

A Mordheim tabletop game group. Each player owns one warband and, between real games, checks the CURFEW ledger for a couple of minutes a day, usually on a phone. Two warbands are registered today (the Nordost Kin and the Bitterbrow Expedition); the group expects more players and warbands to join this season, so ledgers, standings and the Town Cryer must read well with several warbands. The same players also read the main campaign site (Town Cryer, rosters, standings, Chronicle, battle reports) at the table and between sessions.

## Product Purpose

The site is the group's campaign chronicle: a grimdark record of warbands, news, battles and the dead for the City of the Damned. CURFEW extends it into the gaps between games: every real day is one night in Mordheim. At dusk a player gives up to two members an errand, at midnight the dice decide, at dawn a short vignette and a ledger line say what it cost. Favour, shards and Renown accrue; the Hand holds up to three charms that are laid on the table the night before a real game and spent whether used or not.

Success is a daily visit that feels like a two-minute ritual: read last night, decide tonight, leave. Story first, numbers second. A month of nights becomes a story instead of a silence, and each player arrives at the table with three small, expiring advantages and a Chronicle nobody else has.

## Positioning

The city takes nothing from the absent. Missing a night, a week or a month costs only opportunity: standing orders run at half yield, a long absence collapses into one vignette, there is no decay, no streak, no shame screen. Power is capped and story is not: combat buffs are few, small and consumed by the next game, while everything beyond the cap flows into names, titles, headlines and map ink. Every result is a story; no number is shown without a sentence in front of it.

## Operating Context

- Astro site on Vercel (Hobby plan), served from the root of its domain. Campaign pages are prerendered; the Town Cryer, the Curfew pages, the API and a nightly cron run as serverless functions. Deploys on push to `main`; pull requests get previews.
- CURFEW has a server: players sign in with Google, Discord or GitHub and each keeps one warband's ledger in Postgres (Neon, via Drizzle). The Omen and Moon for a date are still a seeded function of the campaign id and a night's result is still a deterministic function of the orders given; the same pure engine now runs on the server, once a night by cron and again on any visit that finds a dawn due. Nights turn at midnight in the campaign's time zone. Rival glimpses and PvP mini-games remain future work; the Eve still exchanges tickets.
- The Town Cryer prints what the ledgers saw: every title change, epithet and planted headline, and occasionally one member's night, chosen by the same seeded dice when the night resolves.
- Real games are recorded afterwards as JSON battle reports in `src/data/history/`; member status there (`active`, `injured`, `dead`) is what CURFEW reads for who stays home.
- Nights turn at local midnight. Night 1 is 2026-09-10. A Moon is seven nights; a season is about twelve Moons.
- The Ledger is reached by direct URL only for now (`/curfew/`, `/curfew/eve/`); no navigation link from the main site.
- Warband rosters, standings and battle reports are still content in the repository; there is no backend for editing them yet.

## Capabilities and Constraints

- Errands: Scavenge, Carouse, Train, Spy, Pray, Trade. Two members per night. Dead members and members injured in the last recorded battle stay home until the player marks them fit.
- Currencies: Favour (0–100, soft cap 60, spent at the Eve on one flourish), Shards (never rot, five convert to a Market token at Trade), Renown (permanent, buys titles and names only).
- The Hand: at most three tokens, one per type (Fortune, Ground, Market, Sight). Surplus tokens are offered against a held one; the Hand is curated, not grown.
- The Eve of Battle: choose which charms to bring, spend Favour on a flourish (name the field, plant a headline, weather line, dedication), show the rival a ticket that reveals how many charms, not which. The City Provides one token to an empty Hand. Charms are consumed when the fight is recorded.
- Curses exist as content only; they are reserved for opt-in risk in the later mini-games, never from dice nights or absence.
- Content is data: `src/data/curfew/*.json` (omens, moons, tokens, patrons, jobs, vignette templates) and `STYLE.md` (writing rules). Adding a card or a Moon is a text edit.
- Undecided: whether the Eve later hooks into scenario creation automatically; how rivals' Hands are glimpsed once a server exists; how many members per night for larger warbands.

## Brand Commitments

- Name: Mordheim, City of the Damned (campaign site); CURFEW, Nights in the City of the Damned (companion). Fan-made, non-commercial; Mordheim is © Games Workshop.
- Voice (binding, from `src/data/curfew/STYLE.md`): short declaratives, present tense, name the members, one physical detail per vignette, no exclamation marks, dry gallows humour allowed, jokes forbidden. Mechanics live only in the ledger line beneath the prose. Nights, Moons and the Season, never days, weeks and months in prose.
- Visual constraints the user made binding for CURFEW: dark theme only; palette Soot `#0E0D0C`, Ash `#2A2724`, Bone `#D9CDB8`, Dried Blood `#6B1F1F`, Candle `#E0A34A`, Wyrd Green `#6FCF7A` reserved for wyrdstone; blackletter for titles only, humanist serif for body, condensed sans for numerals and labels; motion respects reduced-motion settings.
- Assets: the Tarot of the Damned deck (30 Omen cards and a back) in `public/curfew/omens/`, regenerated from `scripts/curfew/`; warband crests in `public/`.

## Evidence on Hand

- Real campaign content: two warband rosters with lore (`src/data/warbands.ts`), one recorded battle (`src/data/history/scenario-01-the-merchants-debt.json`), Town Cryer articles (`src/data/news.ts`).
- The full CURFEW design plan lives in the conversation that produced it; its content bible is in `src/data/curfew/`.
- No usage data, testimonials or playtest results exist yet. The first real Moon of play has not happened; do not claim otherwise.

## Product Principles

1. One night per day. Real time is the clock; nothing is rushed and nothing is grindable.
2. The city takes nothing from the absent. Absence costs opportunity only, never progress, never a scolding.
3. Power is capped, story is not. Advantages are small and expire; names, titles and headlines are permanent.
4. Every result is a story. Prose leads, the ledger line follows, numbers never stand alone.
5. Two minutes, top to bottom. A daily visit reads in the order the night happens: finish last night, then plan tonight, then everything else.

## Accessibility & Inclusion

Mobile first, one-handed use on a phone. Motion is decorative only and honours `prefers-reduced-motion`. Text on the dark theme must meet WCAG AA contrast. Controls stay at least 44px tall. Pronouns for members default to they/them unless the roster says otherwise.
