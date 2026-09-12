# CURFEW

## Nights in the City of the Damned — a between-games companion for the Mordheim campaign

### Implementation plan, revised after Phase 1

Revision 5, 12 September 2026 (Night 3). Phases 0 and 1 are built; the server arrived (see §9) and the ledgers moved from the browser to Postgres on Vercel; the campaign can now leave the city (see §2a); the Empire's calendar dates everything (see §6). This revision is a sanity check of the plan against the code: every **Shipped** claim below was read against the source on this date, and what had drifted is marked **Changed** or listed under §12. Sections keep the original plan's shape and mark what shipped, what changed, and what is still to come. Status markers: **Shipped**, **Changed**, **Open**.

---

## 0. The pitch

Every real day is one night in Mordheim. At dusk a player gives their warband its orders. At midnight the city answers. At dawn they read what it cost them.

Two minutes a day. A month of nights between games becomes a story instead of a silence — and when the warbands finally meet on the table, each carries three small, expiring advantages and a Chronicle nobody else has.

---

## 1. Design pillars

1. **One night per day.** Real time is the clock. Nothing is rushed, nothing is grindable.
2. **The city takes nothing from the absent.** Missing a night, a week, or a month costs only opportunity. There is no decay below the floor, no lost progress, no shame screen.
3. **Power is capped. Story is not.** Combat buffs are few, small, and consumed by the next game. Everything beyond the cap flows into narrative: names, titles, headlines, map ink.
4. **Every result is a story.** No number is shown without a sentence in front of it.
5. **Moody, terse, legible.** Grimdark is a tone, not a wall of text. Dark theme only, mobile first.
6. **Two minutes, top to bottom.** *Added after the audit.* A daily visit reads in the order the night happens: finish last night, then plan tonight, then everything else.

---

## 2. The Night — core loop

**Shipped.** Resolved on the server; see §9.

### Dusk (whenever the player logs in)
- **The Omen.** One card is drawn from the Tarot of the Damned. The draw is a seeded function of the campaign id and the date, so every warband sees the same omen. Each run of thirty nights is a fresh shuffle, so no card repeats within a cycle.
- **The Watch.** One control per member: stays home, or one of the six errands. Changing it saves the night's orders at once; there is no separate confirm. Up to two go out, and nobody two nights running: whoever went out last night is marked **Resting**. The dead stay home. Members injured in the last recorded battle stay home until the player marks them "back on their feet" (the roster has no current-wound field; this is the honest substitute).
- Mini-games are Phase 2. Tonight the dice decide.

### Midnight
- **Changed.** A cron runs just after midnight in the campaign's time zone and writes every ledger's dawn. A visit that finds a dawn still due writes it too, so a late or missed cron costs nothing. The same orders always produce the same dawn either way.

### Dawn (next login)
- **The Dawn Report.** One or two sentences per member sent, one physical detail, sometimes a closing line, then the ledger line. It inks in line by line unless the reader prefers reduced motion.

### The Omen deck
**Shipped.** Thirty cards plus a back, rendered procedurally as PNG images (`public/curfew/omens/`, renderer in `scripts/curfew/`). Content in `omens.json`: numeral, title, reading, notes, and a per-errand tilt from −2 to +2. Six omens from the first plan plus twenty-four new ones.

---

## 2a. Where the campaign is

**Shipped.** The campaign is not always in Mordheim. A **location** is a content pack (`src/data/curfew/locations/<place>.json`): which errands are open and why the others are not, points of interest, Dawn Report templates, rumours, epithets, Moon tie-ins, rival encounters, and the Town Cryer's masthead and headlines. Charms may belong to a place (`location` in `tokens.json`) and only turn up there, alongside the common ones. Two places today:

- **Mordheim** — the six errands as before.
- **Fussenbach** — a village of 1,300 on the Fussen in north-east Ostermark. No rubble and no Pit, so **Scavenge** and **Train** are greyed out; in their place **Dredge**, the village's own errand: work the algae basins for what glows in the silt (shards, and Ground charms; leans on S and T; takes Scavenge's Omen tilt and Moon favour). The pack hints at five plots (the Baron's business at Warehouse 4, what chatters under Morr's Garden, what jams the mill wheel, who walks the cemetery in the old Baron's coat, and the Watch House on the edge of mutiny) and never tells them.

Both Curfew pages carry the place as a letterhead: a band cut from its own painting with the place's name over it, and a small tile of the same art beside the night line, which follows the reader down the page from the width where the top bar is one line. The art is content like the rest of a pack (`scripts/curfew/render-places.py` cuts it; `art.focus` in the pack frames it), so a new place brings its own.

The game master moves the campaign from the Watch House. Moves are logged by night (`curfew_moves`), so a night resolves where the campaign *was*: earlier nights keep their place, orders already given for an errand the new place lacks go where the place sends them (`redirect`), standing orders translate the same way, and the first night in a new place plants an arrival headline in the Cryer. The Ledger names the place, lists its errands first and the missing ones greyed with the reason, and the Eve deals from its charms. The Town Cryer prints from wherever the campaign is: its own masthead, banner, price and watch heading, the `news.ts` articles tagged for that place, and the nights' dispatches headlined in the place's words.

Rival warbands cross paths lightly: now and then (about one night in seven, never on standing orders) a member's vignette ends with a line about the rival, by warband and by a living member's name; with several other warbands the night picks which one. Nothing is decided between them.

The Fussenbach pack is sized for a month of nightly play by four warbands: twelve to sixteen templates per errand and outcome, six standing lines, forty-odd rumours and details, three Moon tie-in lines per Moon and errand, eighteen encounters, ten epithets per errand and eight Cryer headlines per errand and outcome. A first sentence repeating within one warband's month should be the exception: the ledger hands the engine the lines of the last ten nights and the draw is retaken, a few times, when it lands on one of them (`avoid` on `resolveNight`, `line` on each result).

**Open.** The Mordheim pack is still the first plan's: four templates per errand and outcome, two standing lines, three Cryer headlines per errand and outcome, four epithets per errand, four encounters, twelve rumours, sixteen districts and details. It will repeat itself within a Moon. Size it like Fussenbach before the campaign returns to the city.

---

## 2b. The Crossroads

**Shipped** (12 September 2026), from the proposal in `CROSSROADS.md`. About one night in three (`crossroadsChance` is the raw draw of one in two; the rest after a crossroads brings it to a third), one member out on real orders comes to a crossroads: the Dawn Report stops at that moment and two or three roads say what {first} could do. The player decides at dawn, in the offer's two-step dress, and the report finishes with the road's outcome and its ledger line. Never on standing orders, never two nights running, never in The Return, and not the same crossroads again while others are unmet. At this rate a pack's crossroads are all met within a season; then the least recently met come round again. Writing more is on the housekeeping list.

- **Kinds.** Moral, risk, loyalty, lore and light, weighted so most are hard and not all. A risk road is opt-in risk without a mini-game: the player chooses the risk, seeded dice choose the branch, and the bad branch is where the four curses in `tokens.json` now come from (Hungover keeps a member home a night, Marked costs Renown and prints a notice, Swindled costs a shard, Wyrdstone Cough is cosmetic for three nights). They stand on the ledger as `afflictions`, and the Eve names any still standing.
- **What a road does.** Favour, shards and Renown within a good night's reach; a charm through the offer rule; a rumour; a **mark** on the warrior, permanent and named in the pack's words, shown in their story and able to open or close later crossroads (`requires.mark`, `requires.notMark`); and a **carry** into tonight: a tilt on that member's errand, or a night kept home (`kept`, shown in the Watch with the reason).
- **The absent.** A crossroads nobody decides is decided by the character at the next midnight, along the road marked `default`, which never carries a curse and never costs. The outcome then opens with one of the pack's `undecided` lines. With many nights written at once every crossroads but the last is defaulted on the spot, so only one ever waits.
- **Where it lives.** Content in the packs (`crossroads`, `undecided`, `markNames`): twenty-four in Fussenbach, twelve in Mordheim. The night stores only what was met and, once decided, the road, its words and its ledger line; effects are read from the pack when the road is taken (`takeRoad`), so nothing a player could peek at reaches the browser. The ledger is `version: 2` and a version 1 ledger is kept whole. The Cryer prints a night's happening only once its crossroads is decided, and a road may carry its own headline. The Watch House flags a ledger whose crossroads waits and lists the roads taken.
- **Still to come** from the proposal: standing with the place's names (step C) and roads that touch the rival (step D). Forced errands were left out of `carry` on purpose; a tilt and a night at home first.

---

## 3. Errands and mini-games

| Errand | Mini-game (Phase 2–4) | Dice yield today |
|---|---|---|
| **Scavenge** | Sifting | Shards (0–2), Favour |
| **Carouse** | Crooked Bones | Favour, Renown on a boon, a Fortune token |
| **Train** | The Pit | Renown, a Ground token |
| **Spy** | Whispers | A rumour (warm seven nights), a Sight token |
| **Pray** | The Shrine | Favour, a Fortune token |
| **Trade** | The Bazaar | Favour, a Market token; five shards convert to one |
| **Dredge** (Fussenbach only) | The Basins | Shards (0–2), Favour, a Ground token |

**Changed.** Curses are content only (`tokens.json`) and never drop from dice nights. They arrive with opt-in risk in the mini-games. A boon brings a charm about half the time, a fair night about one time in ten, a poor night never; the Omen, the Moon and the edge push the odds a little (`TOKEN_CHANCE` in the engine). Two out a night finds a charm about one night in three. Standing orders never bring tokens. (Until 12 September a boon always brought one, which came to a charm a night.)

Outcome odds: a base of roughly a quarter boon, a third poor, the rest fair, shifted eight points per point of tilt. Tilt is the Omen's tilt plus one point for the Moon's favoured errand plus the warrior's edge, clamped to ±3. The tilts are listed under the card in the app, not printed on it.

### The edge
**Shipped.** Each errand leans on one or two characteristics: Scavenge on M and I, Carouse on T and Ld, Train on WS and T, Spy on I and BS, Pray on Ld and W, Trade on Ld and I, Dredge on S and T. A warrior who is their own warband's best hand for an errand, by the sum of those characteristics and ahead of at least one other living member, adds one point of tilt (▲); two (▲▲) when they also stand a full point or more above the warband's mean in them. Ties share the edge. Never a penalty. The measure is within the warband, so a band of Dwarfs and a band of Sisters each have their strong and weak hands and neither is favoured over the other; a uniformly stronger roster gets exactly the same edges. Standing orders ignore it. The Watch shows a discreet chip beside each control with the characteristics tonight's errand leans on and the arrows, and the errand names in the control carry the arrows too.

---

## 4. Currencies, the Hand, and the floor

**Shipped.**

- **Favour** 0–100, soft cap 60. Past the cap the night's yield halves and the surplus becomes Renown. Spent at the Eve on one flourish (25).
- **Shards** never rot. Five convert to a Market token when Trade succeeds.
- **Renown** is permanent and buys titles only: Newcomers · Sifters (10) · Ratcatchers (25) · Confessors (50) · Pit-Dogs (80) · The Named (120) · Those Who Stayed (200).
- **The Hand** holds at most three tokens, one per type across four types (Fortune, Ground, Market, Sight). A token that does not fit is offered against the held one of its type, or against the oldest charm when a fourth type arrives. **Changed after the audit:** offers collapse to one decision per type, the newest find wins, and a charm is never offered against itself. Settling one takes two steps: mark the charm to keep, then confirm a sentence that names what goes in the river. Nothing is decided until the confirm, and a reload clears the mark.

### The floor
- **Standing orders.** **Changed.** There is no separate setting. The last selection the player made stands: on a night without a change the same members go out on the same errands at half yield, no tokens, no risk, and the Ledger says so with a one-tap way to send them in full. Whoever went out the night before rests, so a standing selection runs every other night; the rest are quiet nights. Before any selection, the first two available members go out on the errand their role suggests. The Chronicle still writes.
- **The City Provides.** An empty Hand at the Eve is dealt one random token.
- **The Return.** A gap longer than seven nights collapses into one vignette and Favour primed to 20. No summary of what was missed.
- **Sigmar's Mercy.** **Open.** Needs a shared campaign rating; the server now exists, the rating does not.

---

## 5. Narrative rewards

- **The Chronicle.** **Shipped** as the ledger's scroll of nights, newest first, with the current report shown separately above it. Shareable and printable versions are Phase 6.
- **Epithets.** **Shipped.** A member who features in five entries earns one, flavoured by the errand they did most, and the Town Cryer prints it.
- **Renown titles.** **Shipped** as text. Banner marks are Phase 3.
- **Town Cryer plants.** **Shipped** as "From the Night Watch", now for every warband: epithets, title changes, headline flourishes and arrivals in a new place are always printed, and the broadsheet occasionally picks up one member's night as a happening (a boon or a poor night more often than a fair one, never a night on standing orders), under a headline from the place's pack. Dispatches are written when a night resolves and are keyed so nothing prints twice. The game master can pull a dispatch or post a notice from the Watch, which prints under the same heading.
- **The nights on the campaign site.** **Shipped.** A warband's card carries its tavern title and a link to its ledger; a warrior's profile lays battles and nights on one line by date, with an epithet and a count of nights out (`src/curfew/story.ts`). Both render without a database.
- **Epitaphs, the Ashen Quarter, Patrons, the Comet's Wane.** **Open.** Patrons and Jobs exist as content (`patrons.json`, `jobs.json`).

---

## 6. Time scales

| Scale | Length | Status |
|---|---|---|
| Night | 1 day, local midnight | Shipped |
| Moon | 7 nights | Shipped: eight Moons in `moons.json`, drawn as a seeded shuffle per cycle. **Changed:** a Moon favours one errand by a single point and is otherwise narrative; each Moon carries a tie-in line per errand that is woven into the Dawn Report on some nights. A place may reword the tie-ins (`moonTies`) and redirect a Moon whose errand it lacks (`moonBoost`) |
| Job | 3–5 nights | Content only |
| Season | 12 Moons | Recorded in `campaign.json`; the finale is Phase 5 |

Night 1 is 10 September 2026, which is Festag, 10th of Pflugzeit, 2007 IC.

### The Imperial Calendar
**Shipped.** `src/lib/calendar.ts` keeps the Empire's calendar: a 400-day year of twelve months of 32 or 33 days and six holy days that belong to no month and no weekday, and an eight-day week that runs on uninterrupted across them. The campaign is anchored on its first game (`anchor` in `campaign.json`: 5 September 2026 was Marktag, 5th of Pflugzeit, 2007 IC) and every real day since is one Imperial day. The Town Cryer dates its issue and its dispatches with it, the Ledger names each night's date under the Dawn Report header and in the nightline, the Watch House shows both calendars, and a warrior's story lays battles and nights on one line by date, the nights folded between the battles until asked for.

---

## 7. The Eve of Battle

**Shipped** at `/curfew/eve/`, opened by the player rather than by scenario creation (battle reports are written after the fact in this repo).

1. The Hand is laid out; each charm is brought unless the player leaves it behind. What is left behind is lost.
2. One flourish for 25 Favour: name the field, plant a headline, add a weather line, or dedicate the fight to one of the dead.
3. A ticket such as `EVE-2-K7Q1P` is shown to the rival. Entering the rival's ticket reveals how many charms they carry, not which. **Changed:** this replaces the server-side glimpse for now.
4. "The fight is done" consumes the charms and writes a line in the Chronicle. "Put the charms back" reopens the table; spent Favour does not return.

The token table is the first plan's (`tokens.json`), plus fourteen Fussenbach charms that only turn up there.

---

## 8. Visual and tonal direction

Palette, type, and motion are as first planned and now binding (recorded in `PRODUCT.md`). **Changed after the audit:** no eyebrow labels above headings; decorative glows removed except the candle flicker behind the Omen card; the site's day/night toggle is hidden on Curfew pages; prose is capped at a 68-character measure. The writing style guide lives in `STYLE.md`.

### The Ledger, top to bottom
1. Identity line (the picker folds away once a warband is chosen).
2. **Last night.** The report and any keep-or-let-go decision.
3. **Tonight.** The Omen and Moon, then who goes out, with a summary once orders are given.

On a phone this is one column. From 1100px the night is laid out side by side: in Last night the prose keeps its measure on the left while the ledger line and what came home stand in a rail on the right, with any keep-or-let-go decision across the full width beneath; in Tonight the Omen card holds the left at up to 460px, staying in view on tall screens, while the Moon and the Watch fill the right. The reading order is unchanged.
4. **The Hand** and meters, with the link to the Eve.
5. **Rumours**, then **the Chronicle** from the night before last.
6. Standing orders, folded away. Footer with "Burn this ledger".

---

## 9. Architecture and integration

**Changed.** The site runs on Vercel with a Postgres database (Neon) and email-and-password sign-in (Better Auth; no emails are sent, an invite word gates sign-up). The engine did not change; the ledger moved.

- `src/curfew/engine.ts` is pure: calendar (in the campaign's time zone), seeded draws (FNV-1a hash, mulberry32), errand resolution, the Hand. Every result is a deterministic function of (campaign, night, warband, orders).
- `src/curfew/ledger.ts` is the ledger as pure functions on a serialisable `WarbandState`: orders by night, resolved nights, standing orders, healed members, rumours, epithets, headlines, pending offers, the Eve. It refuses bad orders with a `LedgerError` the page can show as written.
- `src/curfew/cryer.ts` turns a resolved night into Town Cryer dispatches; headline templates live in the place's pack, and a night is headlined where it happened.
- `src/server/curfew/service.ts` keeps one ledger per warband in Postgres as JSON, owned by the player who claimed it. Every read reconciles first; every write is load, reconcile, change, save under a version check, then publish dispatches. `reconcileAll` is what the cron calls.
- `src/pages/api/curfew/[action].ts` is the JSON API the pages call (claim, release, reset, orders, heal, offer, the Eve). Same-origin, signed-in, validated with zod; the answer is always the whole ledger view. `src/pages/api/cron/midnight.ts` is the cron, guarded by `CRON_SECRET`, scheduled in `vercel.json` for a quarter past midnight in the campaign's time zone in winter (a quarter past one in summer); every run, by cron or by hand, is recorded in `curfew_runs`.
- Migrations are Drizzle files under `drizzle/`, generated from the schema and applied by `scripts/migrate.mjs` at the start of a production build, so a schema change ships with the code that needs it.
- Forgotten passwords: the game master issues a reset word from the Watch House (`src/server/account/service.ts`; hashed like a password, two-day expiry, spent on use) and the player trades it for a new password at the Ledger. There is no email anywhere in the system.
- The pages render on the server from the session and the ledger; the browser keeps only the rendering and calls the API for every change. `?date=` overrides are honoured only for game masters (`CURFEW_DEBUG` is on by default, production included; players and the Watch House always get the real night), and with the Debug strip on a game master's requests are **dry runs** (`src/server/curfew/dry.ts`): computed in memory from a sandbox the browser carries, saved nowhere, published nowhere. Stepping nights for debugging never writes one.
- Content is data in `src/data/curfew/*.json` and `locations/*.json`; adding a card, a Moon, a headline or a whole place is a text edit.
- Tests: `npm test` (engine, ledger, Cryer, story, calendar, and the Curfew, admin and account services on an in-memory Postgres); seventy tests on this date. CI runs the tests, `astro check` and the build on every pull request.

### Integration points today
- **Members:** `dead` and `stats` from the roster; `injured` from the latest battle report until healed by the player.
- **Town Cryer:** reads the dispatch table on every request (cached at the edge for a few minutes).
- **Navigation:** **Changed.** The header shows a Curfew link to signed-in players and a Watch House link to the game master, filled in after the page loads (the campaign pages are prerendered for everyone). Warband cards and warrior profiles link to the ledger where a ledger is kept. A visitor who is not signed in still sees no link.

### The Watch House
`/admin/` is the game master's console: tonight at a glance, where the campaign is (and the button to move it), every ledger with its keeper and backlog (inspect, burn, or release it), the players and their sessions (sign one out everywhere, issue a reset word), the Town Cryer's dispatches (pull one, or post a notice from the Watch), midnight by hand with the history of runs, and a health check of database, secrets and sign-in. Admission by `ADMIN_EMAILS`; under the dev sign-in everyone is admitted.

**The Odds** (`/admin/odds/`, shipped 12 September) is the game designer's page: outcome, charm, crossroads and Cryer odds by tilt from −3 to +3 with a regular night at 0 and special ones at ±1 and ±2, expected yield per errand and on standing orders, the crossroads pool per place with its risk roads, a simulation of real nights for any warband and place, and a table of where every dial lives. It reads the engine's own constants (`outcomeOdds`, `TOKEN_CHANCE`, `FAVOUR`, `YIELDS`, `PRINT_CHANCE`, `crossroadsChance`), so it cannot drift from the dice, and the dials stay code on purpose.

### What the server does not do yet
Warband rosters, standings and battle reports are still content in the repository. Rival glimpses at the Eve still go by ticket, though the server could now answer with the count. PvP and the mini-games are unchanged in scope.

## 10. Build phases

| Phase | Scope | Status |
|---|---|---|
| **0 — Content bible** | 30 Omens, 12 tokens, 8 Moons, 3 Jobs, 3 Patrons, vignette templates, style guide | **Shipped** |
| **1 — The Night** | Engine, ledger, Omen, Watch, Dawn Report, Chronicle, the Hand, Eve of Battle, Town Cryer hook, standing orders, The City Provides, The Return | **Shipped** |
| **1a — The server** | Vercel, Postgres, email-and-password sign-in, ledgers per player, nightly cron, Town Cryer dispatches for every warband | **Shipped** |
| **1c — The road out** | Locations as content packs; Fussenbach with Dredge, its charms and its plots; the campaign moved from the Watch House; the Cryer printed where the campaign is; light rival encounters | **Shipped** |
| **1d — The Imperial Calendar** | The Empire's calendar anchored on the first game; every date on the site goes through it; battles and nights on one line in a warrior's story | **Shipped** |
| **1e — The Crossroads** | Choices a member met last night, decided by the player at dawn; marks, carries, risk roads and the curses; content for both places (§2b, `CROSSROADS.md`) | **Shipped** |
| **1b — First Moon of play** | Let a real week of nights (Nights 1–7, 10–16 September) shape the odds, the copy, and the offer rule; watch for repeated first sentences, the standing-orders rhythm with two-member nights, whether the happenings print too often or too rarely, and whether one crossroads in five nights is the right weight | **Now** (Night 3) |
| **2 — Hands-on** | Sifting, The Shrine, The Bazaar as optional mini-games with opt-in risk; the Market Moon multiplier. Curses already arrive through the Crossroads' risk roads | Open |
| **3 — Rivalry** | Crooked Bones and The Pit as async PvP, wagers, weekly ladders, banner marks; the server it needed now exists | Open |
| **4 — Depth** | Whispers, Jobs, Moon events, Patrons and contracts, Sigmar's Mercy | Open |
| **5 — The City** | The Ashen Quarter map, naming, landmarks into scenarios, the Comet's Wane and finale | Open |
| **6 — Atmosphere** | Optional sound, epitaphs, shareable and printable season Chronicle | Open |
| **Housekeeping** | More crossroads for both packs, since at one night in three they are all met within a season (§2b); size the Mordheim pack like Fussenbach's (§2a); WebP card images for phones (the deck is 36 MB of PNG, about 1.1 MB a card, and the Ledger loads two at 1050×1800); skip the main site's three font families on Curfew pages (both sets load today; `Base.astro` has no way to leave them out); record the incumbent design system (`/impeccable document`; `PRODUCT.md` exists, a design record does not); bring `PRODUCT.md` up to date (**done** in revision 5) | Open |

---

## 11. Decisions

Taken:
- Nightly reset at midnight in the campaign's time zone (`campaign.json`), on the server.
- One player keeps one warband's ledger; a warband has one keeper. Sign-in is email and password; no emails are sent.
- Two members per night, regardless of warband size. Revisit for larger warbands.
- Rival's Hand at the Eve: count only, via ticket.
- No token gifting between warbands in season one.
- Templates only for prose; no LLM pass.
- Season length twelve Moons, in `campaign.json`.
- Curses only from opt-in risk, never from dice or absence. The risk roads at the Crossroads are that opt-in.
- The Crossroads: one a morning at most; the default road risks nothing; marks are public in the warrior's story; a carry is a tilt or a night at home, never a forced errand for now.
- **Changed.** Signed-in players get a Curfew link in the header, and the game master a Watch House link; visitors who are not signed in see neither. The first plan held the link back until the first Moon had been played; a player who has claimed a ledger needs the way back to it more than the site needs the secret.
- A move takes effect from tonight, never retroactively; the log of moves decides a night's place, so a written night is never rewritten.
- The Omen deck is the same everywhere: portents are portents. Places reword the Moons' tie-ins instead.

Still open:
- Whether the Crossroads should go on to standing with the place's names, and to roads that touch the rival (`CROSSROADS.md` §9, steps C and D).
- Whether Curfew should be shown to visitors who are not signed in once the first Moon has been played.
- Whether the Eve should be opened automatically when a scenario is recorded.
- How many members per night when more warbands and larger rosters join.
- Whether the Eve's glimpse should ask the server for the rival's count instead of a ticket.
- When warband rosters and battle reports move to the server.

## 12. What the sanity check found

Read against the code on 12 September 2026, Night 3. `npm test` passes (70 tests) and `astro check` reports no errors.

Held up as written: the Night loop, the Omen deck and its thirty cards, the edge, the currencies and titles (`campaign.json`), the Hand and the one-offer-per-type rule, standing orders and the resting rule, The Return, the Eve with its ticket, Fussenbach's pack sizes, the move log, the Imperial Calendar, the cron and the reconcile-on-visit, and every "Open" item (Sigmar's Mercy, the server-side glimpse, mini-games, PvP, epitaphs, the map, the finale) is indeed unbuilt.

Corrected in this revision:
- Curfew has had a navigation link for signed-in players since 10 September; §9 and §11 said it had none.
- The Mordheim pack is a quarter the size of Fussenbach's and was not marked as work to do (§2a, Housekeeping).
- Migrations on deploy, reset words, the run log, the health check and the Watch's notices had shipped without a line in the plan (§5, §9).
- The nights' presence on the campaign site (warband cards, warrior profiles) was only implied (§5).
- The Imperial Calendar had no row in the phase table (§10).
- `PRODUCT.md`, which §8 calls binding, had drifted: two warbands, six errands, no navigation link, and nothing of the Watch House, the places or the Imperial Calendar. Brought up to date in this revision.

Three warbands are registered on this date: the Nordost Kin, the Bitterbrow Expedition and the Order of the Welling Rune. One battle is recorded.

---

*The city takes nothing from those who stay away. It only keeps what they might have found.*
