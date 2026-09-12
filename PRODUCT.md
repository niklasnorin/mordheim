# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

A Mordheim tabletop game group. Each player owns one warband and, between real games, checks the CURFEW ledger for a couple of minutes a day, usually on a phone. Three warbands are registered today (the Nordost Kin, the Bitterbrow Expedition and the Order of the Welling Rune); the group expects more players and warbands to join this season, so ledgers, standings and the Town Cryer must read well with several warbands. The same players also read the main campaign site (Town Cryer, rosters, standings, Chronicle, battle reports) at the table and between sessions.

One of them is the game master, who keeps the Watch House at `/admin/`: they move the campaign from place to place, watch the ledgers and the nightly run, moderate the broadsheet, and issue a reset word when a player forgets their password. Admission is by a list of sign-in addresses (`ADMIN_EMAILS`).

## Product Purpose

The site is the group's campaign chronicle: a grimdark record of warbands, news, battles and the dead for the City of the Damned. CURFEW extends it into the gaps between games: every real day is one night wherever the campaign is. At dusk a player gives up to two members an errand, at midnight the dice decide, at dawn a short vignette and a ledger line say what it cost. Favour, shards and Renown accrue; the Hand holds up to three charms that are laid on the table the night before a real game and spent whether used or not.

The campaign is not always in Mordheim. A place is a content pack with its own errands, vignettes, rumours, charms and broadsheet; the game master moves the campaign and every night after the move is read in the new place's words, while the nights already written keep theirs.

Success is a daily visit that feels like a two-minute ritual: read last night, decide tonight, leave. Story first, numbers second. A month of nights becomes a story instead of a silence, and each player arrives at the table with three small, expiring advantages and a Chronicle nobody else has.

## Positioning

The city takes nothing from the absent. Missing a night, a week or a month costs only opportunity: standing orders run at half yield, a long absence collapses into one vignette, there is no decay, no streak, no shame screen. Power is capped and story is not: combat buffs are few, small and consumed by the next game, while everything beyond the cap flows into names, titles, headlines and map ink. Every result is a story; no number is shown without a sentence in front of it.

## Operating Context

- Astro site on Vercel (Hobby plan), served from the root of its domain. Campaign pages are prerendered; the Town Cryer, the Curfew pages, the API and a nightly cron run as serverless functions. Deploys on push to `main`; pull requests get previews.
- CURFEW has a server: players sign in with an email and a password (no emails are sent; an invite word gates sign-up) and each keeps one warband's ledger in Postgres (Neon, via Drizzle). The Omen and Moon for a date are still a seeded function of the campaign id and a night's result is still a deterministic function of the orders given, and now of where the campaign was that night; the same pure engine runs on the server, once a night by cron and again on any visit that finds a dawn due. Nights turn at midnight in the campaign's time zone. Rival glimpses and PvP mini-games remain future work; the Eve still exchanges tickets.
- Schema changes ship as Drizzle migrations under `drizzle/`, applied at the start of a production build. A forgotten password is reset by a word the game master issues in the Watch House, hashed like a password and good for two days; there is no email anywhere in the system.
- The Town Cryer prints what the ledgers saw: every title change, epithet and planted headline, and occasionally one member's night, chosen by the same seeded dice when the night resolves.
- Real games are recorded afterwards as JSON battle reports in `src/data/history/`; member status there (`active`, `injured`, `dead`) is what CURFEW reads for who stays home.
- Nights turn at local midnight. Night 1 is 2026-09-10. A Moon is seven nights; a season is about twelve Moons.
- Every date shown to a player is an Imperial one. The Empire's calendar (a 400-day year of twelve long months, six holy days outside them all, an eight-day week running on across them) is anchored on the first game, 5 September 2026, which was Marktag, 5th of Pflugzeit, 2007 IC. The broadsheet, the nights and the battle reports are all dated by it.
- The Ledger is at `/curfew/` and the Eve at `/curfew/eve/`. A signed-in player sees a Curfew link in the site header, and the game master a Watch House link; a visitor who is not signed in sees neither. Warband cards and warrior profiles link to the ledger where one is kept.
- The product is deliberately hybrid. Warband rosters, standings, battle reports, the Chronicle and the Town Cryer's articles are content in the repository, authored by the group and by a coding agent working on the source; the database holds only what the Curfew nights generate. Pages merge both: the Town Cryer prints the articles and the nights' dispatches, a warrior's profile shows the roster entry, the battle reports and their nights in the city. This is the intended shape, not a stopgap.

## Capabilities and Constraints

- Errands: Scavenge, Carouse, Train, Spy, Pray, Trade, and Dredge in Fussenbach. Which of them are open depends on where the campaign is: the village has no rubble and no Pit, so Scavenge and Train are greyed out with a line saying why, and Dredge takes their place. Two members per night. Dead members and members injured in the last recorded battle stay home until the player marks them fit, and nobody goes out two nights running.
- The edge: each errand leans on one or two characteristics, and a warrior who is their warband's best hand for it tilts the odds by a point, two when they also stand well above their own warband's mean. The measure is always within the warband, so no roster is favoured over another. Never a penalty, and standing orders ignore it.
- Currencies: Favour (0–100, soft cap 60, spent at the Eve on one flourish), Shards (never rot, five convert to a Market token at Trade), Renown (permanent, buys titles and names only).
- The Hand: at most three tokens, one per type (Fortune, Ground, Market, Sight). Surplus tokens are offered against a held one; the Hand is curated, not grown.
- The Eve of Battle: choose which charms to bring, spend Favour on a flourish (name the field, plant a headline, weather line, dedication), show the rival a ticket that reveals how many charms, not which. The City Provides one token to an empty Hand. Charms are consumed when the fight is recorded.
- Curses exist as content only; they are reserved for opt-in risk in the later mini-games, never from dice nights or absence.
- Content is data: `src/data/curfew/*.json` (omens, moons, tokens, patrons, jobs) and one pack per place in `locations/`, which is where the vignette templates, rumours, epithets and the broadsheet's headlines live. `STYLE.md` holds the writing rules. Adding a card, a Moon, a headline or a whole new place is a text edit.
- Undecided: whether the Eve later hooks into scenario creation automatically; whether the rival's charm count should come from the server instead of a ticket, now that there is a server; how many members per night for larger warbands; whether Curfew should be shown to visitors who are not signed in.

## Brand Commitments

- Name: Mordheim, City of the Damned (campaign site); CURFEW, Nights in the City of the Damned (companion). Fan-made, non-commercial; Mordheim is © Games Workshop.
- Voice (binding, from `src/data/curfew/STYLE.md`): short declaratives, present tense, name the members, one physical detail per vignette, no exclamation marks, dry gallows humour allowed, jokes forbidden. Mechanics live only in the ledger line beneath the prose. Nights, Moons and the Season, never days, weeks and months in prose.
- Visual constraints the user made binding for CURFEW: dark theme only; palette Soot `#0E0D0C`, Ash `#2A2724`, Bone `#D9CDB8`, Dried Blood `#6B1F1F`, Candle `#E0A34A`, Wyrd Green `#6FCF7A` reserved for wyrdstone; blackletter for titles only, humanist serif for body, condensed sans for numerals and labels; motion respects reduced-motion settings.
- Assets: the Tarot of the Damned deck (30 Omen cards and a back) in `public/curfew/omens/`, regenerated from `scripts/curfew/`; warband crests in `public/`. The deck is the same everywhere the campaign goes: portents are portents.

## Evidence on Hand

- Real campaign content: three warband rosters with lore (`src/data/warbands.ts`), one recorded battle (`src/data/history/scenario-01-the-merchants-debt.json`), Town Cryer articles tagged by place (`src/data/news.ts`).
- The CURFEW plan and its status live in `src/data/curfew/PLAN.md`; its content bible is the rest of `src/data/curfew/`.
- No usage data, testimonials or playtest results exist yet. The first Moon of play is being played now and is not finished; do not claim otherwise.

## Product Principles

1. One night per day. Real time is the clock; nothing is rushed and nothing is grindable.
2. The city takes nothing from the absent. Absence costs opportunity only, never progress, never a scolding.
3. Power is capped, story is not. Advantages are small and expire; names, titles and headlines are permanent.
4. Every result is a story. Prose leads, the ledger line follows, numbers never stand alone.
5. Two minutes, top to bottom. A daily visit reads in the order the night happens: finish last night, then plan tonight, then everything else.

## Accessibility & Inclusion

Mobile first, one-handed use on a phone. Motion is decorative only and honours `prefers-reduced-motion`. Text on the dark theme must meet WCAG AA contrast. Controls stay at least 44px tall. Pronouns for members default to they/them unless the roster says otherwise. Nothing the city does to a warband is ever framed as the player's failing.
