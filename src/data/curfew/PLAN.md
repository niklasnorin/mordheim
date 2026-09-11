# CURFEW

## Nights in the City of the Damned — a between-games companion for the Mordheim campaign

### Implementation plan, revised after Phase 1

Revision 4, 11 September 2026. Phases 0 and 1 are built; the server arrived (see §9) and the ledgers moved from the browser to Postgres on Vercel; the campaign can now leave the city (see §2a). Sections below keep the original plan's shape and mark what shipped, what changed, and what is still to come. Status markers: **Shipped**, **Changed**, **Open**.

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

The game master moves the campaign from the Watch House. Moves are logged by night (`curfew_moves`), so a night resolves where the campaign *was*: earlier nights keep their place, orders already given for an errand the new place lacks go where the place sends them (`redirect`), standing orders translate the same way, and the first night in a new place plants an arrival headline in the Cryer. The Ledger names the place, lists its errands first and the missing ones greyed with the reason, and the Eve deals from its charms. The Town Cryer prints from wherever the campaign is: its own masthead, banner, price and watch heading, the `news.ts` articles tagged for that place, and the nights' dispatches headlined in the place's words.

Rival warbands cross paths lightly: now and then (about one night in seven, never on standing orders) a member's vignette ends with a line about the rival, by warband and by a living member's name. Nothing is decided between them.

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

**Changed.** Curses are content only (`tokens.json`) and never drop from dice nights. They arrive with opt-in risk in the mini-games. A boon always brings a token, a fair night sometimes, a poor night never. Standing orders never bring tokens.

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
- **Town Cryer plants.** **Shipped** as "From the Night Watch", now for every warband: epithets, title changes, headline flourishes and arrivals in a new place are always printed, and the broadsheet occasionally picks up one member's night as a happening (a boon or a poor night more often than a fair one, never a night on standing orders), under a headline from the place's pack. Dispatches are written when a night resolves and are keyed so nothing prints twice.
- **Epitaphs, the Ashen Quarter, Patrons, the Comet's Wane.** **Open.** Patrons and Jobs exist as content (`patrons.json`, `jobs.json`).

---

## 6. Time scales

| Scale | Length | Status |
|---|---|---|
| Night | 1 day, local midnight | Shipped |
| Moon | 7 nights | Shipped: eight Moons in `moons.json`, drawn as a seeded shuffle per cycle. **Changed:** a Moon favours one errand by a single point and is otherwise narrative; each Moon carries a tie-in line per errand that is woven into the Dawn Report on some nights. A place may reword the tie-ins (`moonTies`) and redirect a Moon whose errand it lacks (`moonBoost`) |
| Job | 3–5 nights | Content only |
| Season | 12 Moons | Recorded in `campaign.json`; the finale is Phase 5 |

Night 1 is 10 September 2026.

---

## 7. The Eve of Battle

**Shipped** at `/curfew/eve/`, opened by the player rather than by scenario creation (battle reports are written after the fact in this repo).

1. The Hand is laid out; each charm is brought unless the player leaves it behind. What is left behind is lost.
2. One flourish for 25 Favour: name the field, plant a headline, add a weather line, or dedicate the fight to one of the dead.
3. A ticket such as `EVE-2-K7Q1P` is shown to the rival. Entering the rival's ticket reveals how many charms they carry, not which. **Changed:** this replaces the server-side glimpse for now.
4. "The fight is done" consumes the charms and writes a line in the Chronicle. "Put the charms back" reopens the table; spent Favour does not return.

The token table is the first plan's (`tokens.json`), plus six Fussenbach charms that only turn up there.

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
- `src/pages/api/curfew/[action].ts` is the JSON API the pages call (claim, release, reset, orders, heal, offer, the Eve). Same-origin, signed-in, validated with zod; the answer is always the whole ledger view. `src/pages/api/cron/midnight.ts` is the cron, guarded by `CRON_SECRET`.
- The pages render on the server from the session and the ledger; the browser keeps only the rendering and calls the API for every change. `?date=` overrides are honoured only where `CURFEW_DEBUG` is set.
- Content is data in `src/data/curfew/*.json` and `locations/*.json`; adding a card, a Moon, a headline or a whole place is a text edit.
- Tests: `npm test` (engine, ledger, Cryer, and the service on an in-memory Postgres).

### Integration points today
- **Members:** `dead` and `stats` from the roster; `injured` from the latest battle report until healed by the player.
- **Town Cryer:** reads the dispatch table on every request (cached at the edge for a few minutes).
- **Navigation:** none. Curfew is reached by direct URL for now.

### The Watch House
`/admin/` is the game master's console: tonight at a glance, where the campaign is (and the button to move it), every ledger with its keeper and backlog, the players and their sessions, the Town Cryer's dispatches (pull one, or post a notice from the Watch), and midnight by hand with the history of runs. Admission by `ADMIN_EMAILS`.

### What the server does not do yet
Warband rosters, standings and battle reports are still content in the repository. Rival glimpses at the Eve still go by ticket, though the server could now answer with the count. PvP and the mini-games are unchanged in scope.

## 10. Build phases

| Phase | Scope | Status |
|---|---|---|
| **0 — Content bible** | 30 Omens, 12 tokens, 8 Moons, 3 Jobs, 3 Patrons, vignette templates, style guide | **Shipped** |
| **1 — The Night** | Engine, ledger, Omen, Watch, Dawn Report, Chronicle, the Hand, Eve of Battle, Town Cryer hook, standing orders, The City Provides, The Return | **Shipped** |
| **1a — The server** | Vercel, Postgres, email-and-password sign-in, ledgers per player, nightly cron, Town Cryer dispatches for every warband | **Shipped** |
| **1c — The road out** | Locations as content packs; Fussenbach with Dredge, its charms and its plots; the campaign moved from the Watch House; the Cryer printed where the campaign is; light rival encounters | **Shipped** |
| **1b — First Moon of play** | Let a real week of nights shape the odds, the copy, and the offer rule | **Next** |
| **2 — Hands-on** | Sifting, The Shrine, The Bazaar as optional mini-games with opt-in risk and curses; the Market Moon multiplier | Open |
| **3 — Rivalry** | Crooked Bones and The Pit as async PvP, wagers, weekly ladders, banner marks; needs a server | Open |
| **4 — Depth** | Whispers, Jobs, Moon events, Patrons and contracts, Sigmar's Mercy | Open |
| **5 — The City** | The Ashen Quarter map, naming, landmarks into scenarios, the Comet's Wane and finale | Open |
| **6 — Atmosphere** | Optional sound, epitaphs, shareable and printable season Chronicle | Open |
| **Housekeeping** | WebP card images for phones; skip the main site's fonts on Curfew pages; record the incumbent design system (`/impeccable document`) | Open |

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
- Curses only from opt-in risk, never from dice or absence.
- No navigation link to Curfew until the first Moon has been played.
- A move takes effect from tonight, never retroactively; the log of moves decides a night's place, so a written night is never rewritten.
- The Omen deck is the same everywhere: portents are portents. Places reword the Moons' tie-ins instead.

Still open:
- Whether the Eve should be opened automatically when a scenario is recorded.
- How many members per night when more warbands and larger rosters join.
- Whether the Eve's glimpse should ask the server for the rival's count instead of a ticket.
- When warband rosters and battle reports move to the server.

---

*The city takes nothing from those who stay away. It only keeps what they might have found.*
