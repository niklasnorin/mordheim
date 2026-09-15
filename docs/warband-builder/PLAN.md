# THE MUSTER

## A warband builder for the campaign site, on the community's BattleScribe data

### Implementation plan

Revision 1, 15 September 2026. Nothing here is built. This document answers one question, "what would it take to build a complete warband builder on the data in [BSData/mordheim](https://github.com/BSData/mordheim), without writing a parser from scratch, in the site's own idiom", and lays the work out in stages so each one ships on its own. Every claim about the data was read from a clone of that repository at commit `b18aa66` (17 August 2026); every claim about the site was read from this repository on the same day. Status markers follow `src/data/curfew/PLAN.md`: **Shipped**, **Changed**, **Open**. Everything is **Open**.

---

## 0. The short answer

The BattleScribe files are not a rulebook, they are a rulebook *encoded for a generic list-builder*: every price, statline, equipment list, skill, injury and advance is in there, but the rules that tie them together (who may buy what, how many, what a warrior costs the rating) are written as several thousand generic modifier, condition and constraint nodes. There are three honest ways to use them:

- **Read the data, write Mordheim's rules ourselves.** Parse the files once with an existing library into a small, Mordheim-shaped JSON committed to the repository, and implement the game's own composition rules (500 gold crowns, one leader, hero and henchman limits, equipment lists, rating) as a pure, tested TypeScript module the way `src/curfew/engine.ts` already works. The BattleScribe logic is never executed; it is the *source* the JSON is distilled from.
- **Evaluate the BattleScribe logic.** Port or adopt a catalogue engine and drive the builder from the raw files. Nothing on npm does this; the open-source engines that exist are GPL, dormant, or of unstated licence, and New Recruit's is private. Feasible, largest, and it would push a BattleScribe selection tree into a site whose roster has its own shape.
- **Let New Recruit build, and import.** Players build in New Recruit against the same repository and the site imports the exported roster. Cheapest, but the builder is then not on the site.

**Recommendation: the first, staged, keeping every BattleScribe id in the distilled data** so that the third becomes an import feature later and the second remains possible if the data ever outgrows our rules. The parser is a 85 KB MIT library ([`bsdata-parser`](https://www.npmjs.com/package/bsdata-parser)) that read all eighteen Mordheim files in half a second in a spike (see §9); the parser from scratch the question wanted to avoid is exactly the part that is available. What is not available anywhere, and what we would write in any path, is a *Mordheim* rules module, and that is a few hundred lines with tests, not a BattleScribe engine.

Rough size: five stages, each one pull request or two, roughly ten to fourteen working days in all if done one after another; the first two stages, which put kinds, gear, gold and rating on the record, are about a third of that and useful on their own.

---

## 1. What the BSData repository holds

Eighteen files at the root, BattleScribe 2.03 XML, 3.5 MB in all:

| File | What it is |
| --- | --- |
| `Mordheim.gst` | The game system: two cost types (` gc`, ` Warband Rating`), five profile types (Model with M WS BS S T W I A LD, Ranged Weapon, H-t-h Weapon, Armour, Magic), five categories (Heroes, Henchmen, Dramatis Personae, Hired Swords, Configuration), two forces (Warband; Hired Swords and Dramatis Personae). |
| `data.cat` | The shared library every warband links to: 131 equipment and upgrade entries with prices and weapon profiles, the six skill lists (Academic 13, Combat 6, Shooting 8, Speed 7, Strength 6, Cavalry 9), 13 serious injuries, the nine `+1` and nine `−1` characteristic upgrades, `Experience`, `Promoted`, 24 racial maximum statlines, 49 special rules with their text, mutations, Chaos rituals, Prayers of Taal, the `Grade` and `Stash` configuration entries. |
| `Characters.cat` | 22 Hired Swords and Dramatis Personae with statlines, prices, upkeep and rating. |
| Fifteen `<Warband>.cat` | Averlanders, Beastmen Raiders, Carnival of Chaos, Cult of the Possessed, Dwarf Treasure Hunters, Kislevites, Marienburgers, Middenheimers, Orc Mob, Ostlanders, Reiklanders, Sisters of Sigmar, Skaven, Undead, Witch Hunters. Each has its heroes (`model` entries with a statline, a price, a rating and a roster max), its henchman groups (`unit` entries with a model statline, price, group min and max, sometimes a warband max), a `Starting Equipment` list per warrior linking into `data.cat`, a `Trading Post` link to the whole equipment library for later purchases, the skill lists the warrior may pick from, and the special rules. |

**What the data covers.** Founding a warband, and the whole campaign progression as a BattleScribe user would key it: experience as a repeatable upgrade that adds to the rating, advances as `+1` characteristic upgrades that increment the profile, skills as picks from the allowed lists, serious injuries as picks, henchman promotion as a `Promoted` flag with an error message telling the user to split the group, a `Stash` for gold, wyrdstone and stored equipment, hired swords with their rating. Weapons carry their profile (`Str`, `Special`) and link to the rule text ("Parry", "Concussion", "Two Handed").

**What it looks like from the inside.** The rule language actually used is a modest subset of BattleScribe 2.03 plus two New Recruit extensions. Tallied over the eighteen files: modifiers are `increment`/`decrement`/`set` on a characteristic or a cost (2,080), `set hidden` (473), `prepend`/`set name` (153), `set`/`increment`/`decrement` on points (306), `add error` (33) and a handful of `minSelections`, `defaultAmount`, `divide`; conditions test `selections` only, with `atLeast`/`equalTo`/`greaterThan`/`lessThan`/`instanceOf`/`notInstanceOf` over `parent`, `self`, `ancestor`, `force`, `roster` or a named entry; constraints are `min`/`max` on `selections` or `points`; 1,992 `repeat` nodes almost all say "increment this stat once per `+1` upgrade selected". `prepend` and `add error` are New Recruit's additions: a strict 2.03 engine would drop them.

**Its condition.** The repository's README (13 June 2026) says only the Grade 1a ("official") warbands are present; the others broke when the 1a set was fixed and were removed until restored. Of the campaign's three seed warbands, the Ostlanders and the Dwarf Treasure Hunters have a catalogue; **the Order of the Welling Rune, "Marauders of Chaos", does not**, so a kind the data does not know must remain possible (see §4). Quirks a distiller has to absorb: cost names vary (`pts`, ` gc`, `gc`) while the cost *ids* (`points`, `wb-rating`, `rarity`) are consistent, so key on ids; a `rarity` cost type is used by every catalogue but not declared in the game system; the hired swords' category links are named `New CategoryLink`; Kislevites call the shared library `common-data`; Gromril Armour appears twice at different prices; one rule id (`Parry`, `17dc-9c49-08e1-af45`) is linked twelve times and defined nowhere. Twelve dangling links out of 3,046 is good for community data, but the pipeline must lint and refuse, not trust.

**How to fetch it.** New Recruit reads the raw files from the repository's default branch, and so should we, **pinned to a commit**. The BattleScribe-era release pipeline is broken for this repository (the latest release carries no package assets, and Mordheim is absent from the BSData gallery index), so the `.bsi`/`.catz` route is a dead end. Refreshing is a script run and a diff review, never a runtime fetch.

**Licence.** The repository has no licence file. It is community data describing Games Workshop's game, and the site is already fan fiction that says so (`docs/agents/writing.md`). Credit BSData and its authors on the pages that show the data, keep the distilled JSON in the repository as a derived work of theirs, and do not redistribute the raw files.

---

## 2. What the site has today

The survey that matters for the plan, all read from source:

- **A warband's kind is free text** (`warbands.type`, a plain input on `/warbands/`, `z.string().max(60)`). Nothing knows the set of legal kinds.
- **Warriors have stats, experience, skills and injuries, and nothing else.** `Member` in `src/campaign/model.ts` says it in a comment: "Weapons and gear are not tracked." The seed fixture's `equipment` is dropped on import (`seed.ts`). Advances, skills and injuries are typed by hand as lines.
- **Gold, rating and wyrdstone are parked, not absent.** The columns sit on `warbands` and `scenario_warbands`, unread and unwritten, kept so the tracking "can come back without a migration" (`CLAUDE.md`). `PLAN.md` §4 has an **Open** Curfew mechanic (Sigmar's Mercy) waiting on a shared rating.
- **The editing idiom is settled.** A page renders the record; `data-act` buttons and `data-api` forms post to `/api/warbands/<action>`; the route validates with zod and names the least role; the service takes the `Actor`, refuses with `LedgerError`, and answers with the whole warband; the client toasts the message as written and reloads (`src/lib/manage.ts`). Nothing is optimistic. The battle tracker is the one page that renders client-side from the server's answer and polls (`src/lib/tracker.ts`), and it is the closest cousin of a builder: a phone, one hand, a bottom sheet, steppers.
- **Rules are source; the record is the database; content is documents.** `src/campaign/rulebook.ts` is the precedent for a rule as a typed constant with a test; `curfew_content` with `validateDocument` and `saveDocument` is the precedent for a JSON document a game master edits in the Watch House, versioned and optimistically locked.
- **Ids are forever.** Member ids come from the first name; several identical henchmen become `marksman`, `marksman-2`. `removeMember` refuses for anyone who fought a recorded battle. A builder that buys and sells warriors has to live inside both rules.
- **The look** is a dark archive: tarnished gold on green-black, `Pirata One` headings, `IM Fell English` body, uppercase Georgia micro-labels, no radius, 44 px controls, `<details>` drawers for disclosure, refusals as italic toasts in the campaign's voice. A builder that looks like an app would be rewritten.

---

## 3. The options for the rules, compared

| | A. Distil the data, write Mordheim's rules | B. Evaluate the BattleScribe logic | C. Adopt an existing engine | D. Build in New Recruit, import the roster |
| --- | --- | --- | --- | --- |
| Parser | `bsdata-parser` (MIT, TS, lossless IR, 0.5 s for all files) at distil time only | `bsdata-parser` at build or run time | The engine's own | A `.ros`/`.rosz` reader (zip + XML; small) |
| What we write | A projector to Mordheim JSON (~300 lines), a lint, and `muster.ts`: the game's rules as pure functions (~400 lines + tests) | A subset evaluator: constraints with scopes and shared counts, modifiers in New Recruit's step order, conditions, repeats, links; ~1,200 lines plus a conformance harness | Glue, a UI over a selection tree, and the same Mordheim JSON anyway for the site's own pages | An importer mapping selections to members and equipment, and a "kind the site does not know" fallback |
| Follows upstream fixes | On re-running the distil script, with a diff to review | Automatically, including upstream bugs | Automatically | Automatically |
| Fits the site's model | Yes: the roster stays `Member` with stats, xp, skills, injuries, plus equipment and gold | Poorly: the builder's state would be a BattleScribe selection tree beside the record | Poorly, and the licences: [Tome of Battle](https://github.com/artkoenig/tome_of_battle) and [BlueScribe](https://github.com/BlueWinds/bluescribe) are GPL-3.0 (BlueScribe last touched 2023), [ForceWright](https://github.com/ronincse/rosterforge) is TypeScript and current but `private: true` with no licence; New Recruit's engine is a private submodule | The record fills from the outside; the builder UX is theirs |
| Handles what the data does not have (Marauders of Chaos, house rules) | Yes: the JSON is ours to extend, or a game master's document (§8, Stage 5) | Only by editing catalogues | Only by editing catalogues | Only what New Recruit has |
| Risk | Our rules drift from the catalogue's intent; mitigated by a comparison test against New Recruit's totals for a few known rosters | Semantics: BattleScribe scoping is subtle and under-documented; [battlescribe-spec](https://github.com/WarHub/battlescribe-spec) (507 specs, 2026) exists to test against but has no licence file yet | Licence, and an engine shaped for 40k-scale data | Two sources of truth for a roster |
| Size | Small, staged, first value in days | Weeks before the first legal roster renders | Weeks, with a licence conversation first | Days, but not a builder |

**Choice: A, with D as a later interop stage.** Mordheim's composition rules are short and stable (they fit on two pages of the rulebook) and the campaign has one game system, a dozen kinds, and a game master who will want to bend them. What the data gives us that we could never type by hand without error is the *content*: 131 prices, every statline, the lists per warrior, the rule text for every weapon and skill. That is what we take. Keeping every BattleScribe id in the distilled JSON costs nothing and keeps B and D open.

---

## 4. The shape of the thing

### 4.1 The data: `src/data/rules/`

A distil script, `scripts/rules/distil.mjs` (Node, `bsdata-parser` as a dev dependency, never bundled), reads a pinned checkout of BSData/mordheim and writes:

- `armoury.json`: every piece of equipment with `id` (the BattleScribe id), `name`, `kind` (`hand-to-hand`, `missile`, `armour`, `misc`), `price`, `rarity` (null when common), `profile` (`str`, `range`, `save`, `special`), `rules` (ids into the glossary), and `variants` (Gromril, Ithilmar) as price deltas.
- `glossary.json`: special rules, skills, injuries and prayers with their text, by id; skill lists by name.
- `hired-swords.json`: the 22 characters with statline, hire, upkeep, rating, equipment and rules.
- `warbands/<kind>.json`, one per catalogue: `id`, `name`, `grade`, `startingGold` (500 unless the catalogue says otherwise), `maxWarriors`, `specialRules`, `heroes[]` (id, name, price, rating, min, max, statline, skill lists, starting equipment list, `leader`), `henchmen[]` (id, name, price, rating, groupMin, groupMax, warbandMax, statline, starting equipment list, `large`), `maxima` (the racial maximum statline per warrior kind).
- `SOURCE.json`: the upstream commit, the date, and the lint report.

A lint in the same script refuses to write when a link dangles, a price is missing, a warband has no leader or no henchman group, or a statline is not nine integers; the known upstream quirks (§1) are absorbed by name-and-id rules kept in the script, each with a comment naming the upstream issue. A test under `src/campaign/` loads the JSON and asserts the same invariants, so a bad regeneration cannot land. The JSON is content in the sense of `CLAUDE.md`: **a rule of the game, so it stays source**, and a game master's overrides come later as a document (§8, Stage 5).

Size: a warband file is a few tens of kilobytes; the armoury is under 100 KB. A builder page loads its kind, the armoury and the glossary, which is well inside the site's no-framework budget.

### 4.2 The record: model and schema

The smallest change that makes gear, gold and rating true (`schema-change` skill; one migration):

- `warbands.kind_id text` beside `type`: the catalogue id, null for a kind the armoury does not know. `type` stays the display name and stays free for the Welling Rune.
- `warbands.gold` comes back into `Warband` (the column exists). `warbands.stash jsonb` for wyrdstone shards and equipment not carried (`{ shards: number, equipment: EquipmentLine[] }`).
- `members.entry_id text`: which hero or henchman kind of the catalogue this warrior is (null for a hand-entered one). `members.equipment jsonb` as `EquipmentLine[]` (`{ id, name, variant? }`), and `members.rank` widened from `hero | henchman` to add `hired` so a hired sword is a member with a wage, not a special case.
- `treasury_events` table: `warbandId, at, kind (buy | sell | wage | income | adjust), gold, text, authorName`. Battles and victories are counted, never stored; gold is *spent*, so its history is the record and the balance is a sum. A game master can `adjust` with a reason.
- Rating stays derived, never stored: `ratingOf(warband)` = the sum of every living warrior's rating (5, or the catalogue's for large creatures and hired swords) plus their experience. It comes back into the standings when `standingsVisible` is on, and Sigmar's Mercy can have it.

### 4.3 The engine: `src/campaign/muster.ts`

Pure, seeded where dice are involved, tested beside itself, in the manner of `src/curfew/engine.ts`:

- `foundingOf(kind)`: the empty founding with 500 gold and the kind's rules.
- `price(line)`, `costOf(warrior)`, `ratingOf(warband)`, `goldLeft(warband)`.
- `mayBuy(warband, entryId)`, `mayEquip(warrior, itemId)`: the rules as sentences. "The Reiklanders may keep two Champions; you have two." "A Youngblood may not carry a crossbow." "That is the fifteenth warrior; the rulebook stops at fifteen." Every refusal is a `LedgerError` message in the voice, shown as written.
- `validate(warband)`: every problem, as a list, the way `validateDocument` reports.
- Later stages add `advanceTable`, `injuryTable`, `rarityRoll`, `promote`, each a pure function with a seed argument so a roll can be recorded and replayed.

### 4.4 The API and services

Actions on `/api/warbands/`, following `roster.ts` exactly (route validates and names the least role; the service takes the `Actor`, refuses with `LedgerError`, answers with the warband as it now stands):

- `found`: kind, name, lore; creates the warband with 500 gold and an empty muster, or from a free-text kind as today.
- `hire`: entryId, count for henchmen, names; buys warriors, mints ids, writes a `buy` event.
- `equip` / `unequip`: memberId, itemId, variant; from the starting list while founding, from the armoury with a rarity roll after the first game; writes events.
- `dismiss`: the reverse of `hire`, refused after a recorded battle as today ("Mark them dead instead.").
- `stash`: move gear between a warrior and the stash; `sell` at half price; `shards` to record wyrdstone found and sold.
- `advance`, `injure`, `promote`, `learn` (a skill), for Stage 3.

### 4.5 The pages and the UX

New Recruit's builder is three panes: a tree of the roster on the left, a panel of what may be added on the right, running totals in the header, and errors as a list. It is dense and made for a desktop. The site's version keeps the *jobs* and changes the *furniture*, in the idiom of the battle tracker and the roster page:

- **The purse** is a fixed strip, top on a phone, with three figures and nothing else: gold left, rating, warriors of fifteen. It reddens when a rule is broken and names the rule when tapped.
- **The muster** is the existing muster roll, grouped under `Heroes`, `Henchmen`, `Hired Swords` as `<details>` drawers, each warrior a row with name, kind, price and gear in one line; open it for the statline, the gear with each weapon's profile and rule text under a `<details>`, and the actions.
- **Hiring** is a bottom sheet (the tracker's `tk-sheet`): the kind's heroes and henchman groups as cards with price, rating and what remains of the allowance ("Champions · 35 gc · one of two"), greyed with the reason when the rule says no. Choosing one asks only for a name (or a count and one name for a group) and buys it.
- **Equipping** is a second sheet from a warrior's row: the starting list while founding, then the armoury, in the four kinds, each item with price, rarity and a one-line profile; items the warrior may not carry are greyed with the reason. Tap to buy.
- **Validation** is not a modal: the purse names the count of problems, the list opens under it, each line in the voice, and `Muster the warband` is disabled until the list is empty. A refusal from the server still arrives as the toast, as everywhere.
- **The armoury and the kinds** get read-only reference pages (`/armoury/`, `/armoury/<kind>/`), prerendered from the JSON, as a rulebook lookup for the table and as the place the credit to BSData lives.
- Rendering: the builder renders from the server's answer like the tracker does, client-side from the JSON the page embeds, so a tap answers at once and the server's `LedgerError` is the last word.

Roles as today: the owner or a game master musters; a game master may `adjust` gold and hire a kind's forbidden warrior with a reason; everyone reads.

---

## 5. The stages

Each stage is a pull request or two, passes `npm test`, `npm run check`, `npm run build`, and leaves the site better without the next. Sizes are working days, honest guesses.

### Stage 0. The armoury (2 days)

**Ships:** `scripts/rules/distil.mjs`, `bsdata-parser` as a dev dependency, `src/data/rules/*.json` with `SOURCE.json`, the invariants test, `/armoury/` and `/armoury/<kind>/` reference pages, credit to BSData, a `docs/agents` note and a `rules-refresh` skill (run the script against a new commit, read the diff, fix the lint). **Done when** every catalogue distils, the lint is empty or every exception is named, and the pages read well on a phone.

### Stage 1. Kinds, gear, gold and rating on the record (2 to 3 days)

**Ships:** the migration of §4.2; `kind_id` chosen from a select on `/warbands/` with "another kind" keeping free text; equipment lines on a warrior, edited in the existing `Change <name>` drawer from the armoury (a datalist first, the sheet comes with Stage 2); gold on the warband with `treasury_events` and a game master's `adjust`; `ratingOf` shown on the roster page and in the standings when visible; `WarriorStory` and `MemberModal` show gear with profiles. `add-warband` and `record-battle` skills updated. **Done when** the Nordost Kin's fixture equipment is on the record (by hand, once) and the rating prints. This stage alone retires the sentence "Weapons and gear are not tracked."

### Stage 2. The founding (3 to 4 days)

**Ships:** `muster.ts` with the founding rules and its tests; the `found`, `hire`, `equip`, `unequip`, `dismiss` actions; the builder page at `/warbands/<id>/muster/` with the purse, the drawers, the two sheets and the validation list; a comparison test that founds three known rosters and matches the totals New Recruit gives for the same picks (checked by hand once, recorded as fixtures). **Done when** a new player can found a legal Reiklanders warband on a phone in under five minutes and the record shows it as any other warband.

### Stage 3. Between games (3 to 4 days)

**Ships:** the trading post with rarity (`rarityRoll` seeded, the roll recorded, a game master may override), selling at half, the stash and shards; advances (`advanceTable`: the roll, then the pick of a `+1` within the racial maximum or a skill from the warrior's lists, with the glossary text), serious injuries from the table, henchman promotion (splits the group and mints the hero, keeping the henchman's id), hired swords with wages at the start of a game; `record-battle` grows a post-battle sequence on the scenario page that walks the winner and the loser through income, injuries, advances and purchases in the rulebook's order. **Done when** a played scenario can be closed with every warband's treasury and roster carried forward on the site, and the Curfew's Sigmar's Mercy has its rating.

### Stage 4. Interop (1 to 2 days)

**Ships:** import a `.ros`/`.rosz` exported from New Recruit or BattleScribe (the ids match because we kept them), refusing with a list of what could not be mapped; export a printable roster sheet (`/warbands/<id>/sheet/`, print stylesheet) and, if wanted, a `.ros`. **Done when** a roster round-trips.

### Stage 5. House rules (1 to 2 days)

**Ships:** a `rules:<kind>` content document in the Watch House, validated by a branch of `validateDocument`, layered over the distilled JSON at read time (a price changed, a hired sword allowed, a kind added such as the Marauders of Chaos typed by the game master), versioned and locked like every other document. **Done when** the Welling Rune can be given a kind without a commit.

---

## 6. What is deliberately not in the plan

- **Evaluating BattleScribe logic at run time.** Option B is kept possible by the ids, not built.
- **Rolling dice the table did not roll.** The site records; where a roll is needed (rarity, advances, injuries) it offers a seeded roll and records what was chosen, and a game master may write the table's own roll instead. This is the tracker's posture.
- **Grades other than 1a.** Until upstream restores them; the house-rules document is the bridge.
- **Points, tournaments, army lists.** Mordheim has one currency and one campaign.
- **A client framework.** The tracker's pattern (render from the server's answer, poll while visible) is enough for one roster.

---

## 7. Risks and open questions

1. **Upstream churn.** The data was overhauled in June 2026 and is edited monthly. Pinning a commit and reviewing the diff on refresh contains it; the lint catches structural drift; the comparison fixtures catch a silent price change.
2. **Our rules versus the catalogue's intent.** Where the rulebook is ambiguous the catalogue authors made a call (the Rat Ogre is one per force, not per roster; Middenheimer Swordsmen are five per warband). The distil script reads those constraints into the JSON, so we inherit the calls rather than re-make them; the comparison test is the check.
3. **Existing members have no gear and no `entry_id`.** Stage 1 backfills by hand from the fixture's `equipment` (the Nordost Kin) and leaves the rest hand-entered. A hand-entered warrior is legal by definition; the builder validates only what it minted.
4. **Ids.** Several bought henchmen named "Marksman" mint `marksman`, `marksman-2`. The builder should ask for names at purchase and suggest the kind's name with a numeral, so the ids stay readable in the ledgers and dispatches.
5. **Rating for a kind the armoury does not know.** Every warrior counts 5 plus experience unless the game master says otherwise per warrior (a `rating` override on `members`, Stage 1 or 5). Decide before the standings show it.
6. **Licence.** No licence file upstream. Credit, derive, do not redistribute the raw files; if the maintainers publish a licence, follow it. Ask on their Discord before Stage 0 lands, as a courtesy.
7. **The Curfew reads the roster too.** `loadRoster()` feeds the engine; a `hired` rank and equipment lines must not change a night's resolution until a rule says so (the engine reads stats and roles today). Add a test that a night resolves identically before and after Stage 1.
8. **Open:** does the campaign want the rulebook's fifteen-warrior cap and 1a prices, or the New Mordheimer's? The catalogues follow the latter's grading. The house-rules document (Stage 5) is where the answer lives; the default is the catalogue.

---

## 8. Where the work lands

| Piece | Where | Precedent |
| --- | --- | --- |
| Distil script and lint | `scripts/rules/distil.mjs` | `scripts/curfew/`, `.claude/skills/curfew-pack/scripts/lint-pack.mjs` |
| Distilled rules | `src/data/rules/*.json`, `SOURCE.json` | `src/data/curfew/*.json` (but a rule, so never seeded to the database) |
| Rules types and engine | `src/campaign/rules.ts` (types, loaders), `src/campaign/muster.ts` (+ `muster.test.ts`) | `src/campaign/rulebook.ts`, `src/curfew/engine.ts` |
| Record shape | `src/campaign/model.ts`, `src/server/db/schema.ts`, one migration under `drizzle/` | `schema-change` skill |
| Services | `src/server/campaign/roster.ts` (hire, equip, dismiss), `treasury.ts` (events, balance) | `roster.ts`, `scenarios.ts` |
| API | `src/pages/api/warbands/[action].ts` | the same file |
| Pages | `/warbands/<id>/muster/`, `/armoury/`, `/armoury/<kind>/`, `/warbands/<id>/sheet/` | `/scenarios/[id]/battle/`, `/warbands/[id]/` |
| Client | `src/lib/muster.ts`, `src/styles/muster.css` (prefix `mu-`) | `src/lib/tracker.ts`, `tracker.css` |
| House rules | `curfew_content` row `rules:<kind>`, `validateDocument` branch, Watch House list | `src/server/content/curfew.ts`, `/admin/content/` |
| Skills | `rules-refresh` (new); `add-warband`, `record-battle` (updated) | `.claude/skills/` |

---

## 9. Appendix: the spike

Run on 15 September 2026 against BSData/mordheim at `b18aa66`, with `bsdata-parser` 0.2.0 (MIT, TypeScript, depends only on `fast-xml-parser`), in a scratch directory outside the repository:

| Measure | Result |
| --- | --- |
| Files parsed | 18 (1 game system, 17 catalogues) |
| Time | 488 ms |
| Ids indexed | 6,894 |
| Links (`entryLink`, `infoLink`, `catalogueLink`) | 3,046 |
| Dangling links | 12, all to one undefined rule id (`Parry`) |
| Full IR as JSON | 2.5 MB (never shipped; the distilled JSON is a fraction) |

A twenty-line projection over the IR listed the Reiklanders' six warrior kinds with price, rating, roster limits and statline correctly, including the henchman groups' `min 1 / max 5 per group` and the Swordsmen's `max 5 per warband`. That projection is Stage 0's first commit.

What was searched for and not found, so nobody looks again: a catalogue *evaluator* on npm (none; `bsdata-parser`, `bsdata40k-to-json` and BlueWinds' `bsd-schema` are deserialisers, `rosz2js`, PrettyScribe and Yellowscribe read rosters); an open New Recruit engine (the `nr-shared` submodule is private; `nr-editor` and `nr-docs` are public without a licence); a JSON Schema or TypeScript typings from BSData (`BSData/schemas` has the `catpkg` schema and the 2.03 `Catalogue.xsd` only); a Python package (none on PyPI); a Mordheim entry in the BSData gallery (absent). The .NET `wham` tool (MIT, WarHub) has a roster engine on its unreleased `main`; usable in CI if a .NET step were ever wanted, which this plan does not need.
