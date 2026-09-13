---
name: record-battle
description: Record a real Mordheim game on the site - mark the scenario played with each warband's result, write the battle, the epilogue and the campaign notes, help the players tell their part (their prologue and epilogue, who they brought and how each fared, who put whom out of action), and carry the consequences into the rosters (stats, injuries, deaths, treasury). Use when asked to "record the battle", "write the battle report", "mark scenario 02 played", or "update the warbands after the game". Also covers writing a seed fixture under src/data/history/ for an empty database.
user-invocable: true
argument-hint: "[scenario title or a description of the game]"
---

# Record a battle

The record lives in the database and is written on the site: a game master at `/scenarios/<id>/` under **The pen**, each player under their warband's own drawer there, and the rosters at `/warbands/<id>/`. The archive voice is in `docs/agents/writing.md` §3; the shapes are `Scenario`, `ScenarioWarband`, `ScenarioMember` and `OutOfAction` in `src/campaign/model.ts`. Nothing about a played game is a commit any more, unless you are writing the seed for an empty database (§7).

## 1. Gather what was recorded, and only that

From the players' accounts, app exports, photos or notes: the warbands that fought, the real date, the rulebook scenario and its win condition, who won and by what positions, confirmed out-of-action results, serious injuries and deaths, experience and advances, treasury totals afterwards, loot and exploration, and anything left unresolved. Where a fact was not recorded, the record says so ("was not recorded"; the rulebook field left as custom). Never infer a takedown from a hit, a bow notch or a fall. Never guess a rule from the narrative.

## 2. The scenario itself (game master)

If it was announced beforehand it is already at `/scenarios/` as **Upcoming**; otherwise set it up there first (title, played on, rulebook scenario or custom rules, who fights, prologue — which stands under the title as the summary until the game is played, unless the game master unticks it). Then on its page:

1. **Mark it played**: every attending warband gets `victory`, `defeat` or `draw`. The scenario joins the Chronicle in play order; its Imperial date follows from the real one.
2. **The scenario** drawer: the win condition for a custom scenario (a rulebook scenario sets its own, so the field is hidden and the page links to the rules), how the outcome was decided (who won by what positions, and what was not recorded), the epilogue, the Chronicle entry (one present-tense paragraph for the home page: scenario type, who did what, who won, what it cost), loot and costs one per line (say when a figure is a total and not a reward), lasting consequences and unresolved records one per line.
3. **The battle, told**: one paragraph per beat, a blank line between, naming who did what to whom. Tick **Open the battle narrative** if the players may retell it; every telling before is kept and readable under the drawer.

The API behind the forms is `src/pages/api/scenarios/[action].ts` (`update`, `played`, `battle`); a script or an agent with a session may post the same JSON.

## 3. Each warband's telling (the player who keeps it, or a game master)

Under **The pen**, one drawer per warband the viewer speaks for:

- Prologue, epilogue, accomplishments (a factual sentence or two), finest and darkest moments one per line, and the standings as they stood after the battle if kept (totals, not rewards).
- **Who fought, and how it went**: tick the warriors brought; for each, how they came out (`Active`, `Injured`, `Fell in this battle`) and one true sentence each for the finest and the darkest moment. A warrior who did nothing notable gets an honest small moment, not an invented one.
- **Out of action**: who struck, who fell (a warrior on the roll, or a name), how. The one who struck or the one who fell may record it; a game master may record any.

## 4. Carry the consequences into the roster (`/warbands/<id>/`)

- Warband: rating, shards, gold to the post-battle totals. Battles and victories are counted from the played scenarios.
- Warriors: statlines, experience, skills (prayers and spells go there too), old wounds for lasting injuries. Change the tale only where the game changed the story; say in the campaign notes when a report supersedes an earlier roster story. Weapons and gear are not tracked.
- The fallen: tick **Fallen**, give the Imperial date and the epitaph as carved; the warrior stays on the roll, the Graveyard and the engine read it.
- Never rename a warrior. Ids are chosen once, by the roster service, and key the scenario records, the ledgers and the dispatches.

## 5. What Curfew does with it, so you can tell the player

- Warriors marked `Injured` in the **most recent played** scenario stay home in the Ledger until the player marks them fit. Warriors marked fallen stay home for good.
- Charms brought to the Eve are consumed when the player presses "the fight is done" in the Ledger. That is theirs to do.
- A Town Cryer article about the aftermath is optional and separate: use the `town-cryer` skill.

## 6. Verify

Open the scenario page signed in as a player who fought and as a game master: the muster shows every participant with the right status, the Chronicle on `/` has the new chapter, the warrior's profile from the warband card carries the battle in their story.

## 7. Seeding an empty database instead

A fresh database with no warbands is filled once from `src/data/` (`src/server/campaign/seed.ts`). Only then does a fixture matter: one JSON file per scenario under `src/data/history/` in the shape of `scenario-01-the-merchants-debt.json`, registered in `src/data/history.ts`, with a Chronicle paragraph in `src/data/chronicle.ts`, and the rosters in `src/data/warbands.ts` as they stood afterwards. `node .claude/skills/record-battle/scripts/imperial-date.mjs 2026-09-05` prints the Imperial date; `node .claude/skills/record-battle/scripts/check-history.mjs` checks ids, dates and links; then `npm test && npm run check && npm run build`. Editing a fixture changes nothing on a database that has been seeded.

## Pitfalls

- Marking somebody `Injured` when they were merely knocked down: it keeps them home in Curfew for real days until healed.
- Marking a scenario played before every attending warband is on the list: the results form refuses; set the participants first.
- Writing rewards as treasury totals or the reverse: say which in the loot lines.
- Retelling the battle when the game master has not opened it: the form refuses with a 403; ask them to tick the box.
