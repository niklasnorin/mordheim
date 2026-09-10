# CURFEW

## Nights in the City of the Damned — a between-games companion for the Mordheim campaign

### Implementation plan, revised after Phase 1

Revision 2, 10 September 2026. Phases 0 and 1 are built and live on `main`. Sections below keep the original plan's shape and mark what shipped, what changed, and what is still to come. Status markers: **Shipped**, **Changed**, **Open**.

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

**Shipped.** Runs in the browser; see §9 for why.

### Dusk (whenever the player logs in)
- **The Omen.** One card is drawn from the Tarot of the Damned. The draw is a seeded function of the campaign id and the date, so every warband sees the same omen. Each run of thirty nights is a fresh shuffle, so no card repeats within a cycle.
- **The Watch.** Assign up to two members to an errand. The dead stay home. Members injured in the last recorded battle stay home until the player marks them "back on their feet" (the roster has no current-wound field; this is the honest substitute).
- Mini-games are Phase 2. Tonight the dice decide.

### Midnight
- There is no server clock. When the date turns, the next visit resolves every night that has passed, in order, from the orders that were given. The same orders always produce the same dawn.

### Dawn (next login)
- **The Dawn Report.** One or two sentences per member sent, one physical detail, sometimes a closing line, then the ledger line. It inks in line by line unless the reader prefers reduced motion.

### The Omen deck
**Shipped.** Thirty cards plus a back, rendered procedurally as PNG images (`public/curfew/omens/`, renderer in `scripts/curfew/`). Content in `omens.json`: numeral, title, reading, notes, and a per-errand tilt from −2 to +2. Six omens from the first plan plus twenty-four new ones.

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

**Changed.** Curses are content only (`tokens.json`) and never drop from dice nights. They arrive with opt-in risk in the mini-games. A boon always brings a token, a fair night sometimes, a poor night never. Standing orders never bring tokens.

Outcome odds: a base of roughly a quarter boon, a third poor, the rest fair, shifted eight points per point of tilt. Tilt is Omen plus Moon, clamped to ±3; the Silent Moon mutes the Omen.

---

## 4. Currencies, the Hand, and the floor

**Shipped.**

- **Favour** 0–100, soft cap 60. Past the cap the night's yield halves and the surplus becomes Renown. Spent at the Eve on one flourish (25).
- **Shards** never rot. Five convert to a Market token when Trade succeeds.
- **Renown** is permanent and buys titles only: Newcomers · Sifters (10) · Ratcatchers (25) · Confessors (50) · Pit-Dogs (80) · The Named (120) · Those Who Stayed (200).
- **The Hand** holds at most three tokens, one per type across four types (Fortune, Ground, Market, Sight). A token that does not fit is offered against the held one of its type, or against the oldest charm when a fourth type arrives. **Changed after the audit:** offers collapse to one decision per type, the newest find wins, and a charm is never offered against itself. Settling one takes two steps: mark the charm to keep, then confirm a sentence that names what goes in the river. Nothing is decided until the confirm, and a reload clears the mark.

### The floor
- **Standing orders.** Each member has a default errand from their role. On a night without orders the chosen members go out at half yield, no tokens, no risk. The Chronicle still writes.
- **The City Provides.** An empty Hand at the Eve is dealt one random token.
- **The Return.** A gap longer than seven nights collapses into one vignette and Favour primed to 20. No summary of what was missed.
- **Sigmar's Mercy.** **Open.** Needs a shared campaign rating, which needs a server or a shared file.

---

## 5. Narrative rewards

- **The Chronicle.** **Shipped** as the ledger's scroll of nights, newest first, with the current report shown separately above it. Shareable and printable versions are Phase 6.
- **Epithets.** **Shipped.** A member who features in five entries earns one, flavoured by the errand they did most, and the Town Cryer prints it.
- **Renown titles.** **Shipped** as text. Banner marks are Phase 3.
- **Town Cryer plants.** **Shipped** as "From the Night Watch": epithets, title changes, and headline flourishes from ledgers on the reading device. Cross-device plants need a server.
- **Epitaphs, the Ashen Quarter, Patrons, the Comet's Wane.** **Open.** Patrons and Jobs exist as content (`patrons.json`, `jobs.json`).

---

## 6. Time scales

| Scale | Length | Status |
|---|---|---|
| Night | 1 day, local midnight | Shipped |
| Moon | 7 nights | Shipped: eight Moons in `moons.json`, drawn as a seeded shuffle per cycle; Festival of Hanging doubles Renown, the Silent Moon mutes the Omen, the Market Moon's Bazaar multiplier waits for Phase 2 |
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

The token table is unchanged from the first plan (`tokens.json`).

---

## 8. Visual and tonal direction

Palette, type, and motion are as first planned and now binding (recorded in `PRODUCT.md`). **Changed after the audit:** no eyebrow labels above headings; decorative glows removed except the candle flicker behind the Omen card; the site's day/night toggle is hidden on Curfew pages; prose is capped at a 68-character measure. The writing style guide lives in `STYLE.md`.

### The Ledger, top to bottom
1. Identity line (the picker folds away once a warband is chosen).
2. **Last night.** The report and any keep-or-let-go decision.
3. **Tonight.** The Omen and Moon, then who goes out, with a summary once orders are given.
4. **The Hand** and meters, with the link to the Eve.
5. **Rumours**, then **the Chronicle** from the night before last.
6. Standing orders, folded away. Footer with "Burn this ledger".

---

## 9. Architecture and integration

**Changed.** The site is static on GitHub Pages, so there is no nightly resolver. Instead:

- `src/curfew/engine.ts` is pure: calendar, seeded draws (FNV-1a hash, mulberry32), errand resolution, the Hand. Every result is a deterministic function of (campaign, night, warband, orders).
- `src/curfew/state.ts` keeps one ledger per warband in `localStorage`: orders by night, resolved nights, standing orders, healed members, rumours, epithets, headlines, pending offers, the Eve session. On each visit it writes every dawn that is due and applies the absence rules.
- Content is data in `src/data/curfew/*.json`; adding a card or a Moon is a text edit.
- Tests: `node --test src/curfew/*.test.ts` (21 cases). Append `?date=YYYY-MM-DD` to a Curfew URL to view another night.

### Integration points today
- **Members:** `dead` from the roster; `injured` from the latest battle report until healed by the player.
- **Town Cryer:** reads ledgers on the same device for its dispatches.
- **Navigation:** none. Curfew is reached by direct URL for now.

### When a server arrives
The user has said a server is acceptable later. Nothing in the engine needs to change: keep resolution a pure function and the ledger serialisable, and a server can hold the ledgers, run the same resolver once at midnight, serve the rival's Hand count for the Eve, post Town Cryer entries for every device, and host the async PvP of Phase 3. Until then, the ticket exchange stands in for the glimpse.

---

## 10. Build phases

| Phase | Scope | Status |
|---|---|---|
| **0 — Content bible** | 30 Omens, 12 tokens, 8 Moons, 3 Jobs, 3 Patrons, vignette templates, style guide | **Shipped** |
| **1 — The Night** | Engine, ledger, Omen, Watch, Dawn Report, Chronicle, the Hand, Eve of Battle, Town Cryer hook, standing orders, The City Provides, The Return | **Shipped** (client-side) |
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
- Nightly reset at the device's local midnight.
- Two members per night, regardless of warband size. Revisit for larger warbands.
- Rival's Hand at the Eve: count only, via ticket.
- No token gifting between warbands in season one.
- Templates only for prose; no LLM pass.
- Season length twelve Moons, in `campaign.json`.
- Curses only from opt-in risk, never from dice or absence.
- No navigation link to Curfew until the first Moon has been played.

Still open:
- Whether the Eve should be opened automatically when a scenario is recorded.
- How many members per night when more warbands and larger rosters join.
- Whether and when to add a server, and which of ledgers, glimpses, dispatches, and PvP it takes on first.

---

*The city takes nothing from those who stay away. It only keeps what they might have found.*
