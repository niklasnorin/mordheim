---
name: record-battle
description: Record a real Mordheim game in the campaign archives - write the scenario JSON under src/data/history/, register it, add the Chronicle entry, and carry the consequences into the rosters (stats, injuries, deaths, treasury). Use when asked to "record the battle", "write the battle report", "add scenario 02", or "update the warbands after the game".
user-invocable: true
argument-hint: "[scenario slug or a description of the game]"
---

# Record a battle

A real game becomes one JSON file in `src/data/history/`, one line in the Chronicle, and edits to the rosters. The types in `src/data/history.ts` are the contract; `scenario-01-the-merchants-debt.json` is the worked example; the archive voice is in `docs/agents/writing.md` §3. Everything here is source: no database, no console.

## 1. Gather what was recorded, and only that

From the players' accounts, app exports, photos or notes: the warbands that fought, the real date, the rulebook scenario and its win condition, who won and by what positions, confirmed out-of-action results, serious injuries and deaths, experience and advances, treasury totals afterwards, loot and exploration, and anything left unresolved. Where a fact was not recorded, the record says so (`null` for rulebook fields, "was not recorded" in prose). Never infer a takedown from a hit, a bow notch or a fall. Never guess a rule from the narrative.

## 2. Date it in the Imperial Calendar

```sh
node .claude/skills/record-battle/scripts/imperial-date.mjs 2026-09-05
# Marktag, 5th of Pflugzeit, 2007 IC   (night -4)
```

The output is the record's `date`; the argument is its `playedOn`. Both go in the file. `playedOn` is what lets a warrior's profile lay the battle among their Curfew nights.

## 3. Write the record

- File `src/data/history/scenario-NN-<slug>.json`; `id` equals the file name without `.json`; `sequence` is NN as a number, unique, in play order. Copy the key order of scenario 01.
- `scenario` is the campaign chapter title; `report.rulebookScenario` the rulebook's name or `null`.
- `warbands[]`: one `WarbandSnapshot` per participant with `warbandId` from `warbands.ts`, the `result`, and the standings **as they stood after the battle** (rating, battles, victories, wyrdstone, gold are totals, not rewards). `highlights` and `lowlights` are short lists.
- `members[]`: every member who took part, `memberId` exactly as in the roster, `rank`, `status` (`active`, `injured` or `dead`), the full statline **after** advances, `experience`, `equipment`, `skills`, one-sentence `highlight` and `lowlight` that are true of this game.
- `report`: `outcome`, `prologue`, `battle[]` (one paragraph per beat), `epilogue`, one `perspectives[]` entry per warband, `loot[]`, `campaignNotes[]`, `outOfAction[]` with `attackerId` and optional `targetId` as participant member ids. `puzzle` only if the game master wrote one.
- Prose: typographic apostrophes, British spelling, no exclamation marks, past tense.

## 4. Register it

- `src/data/history.ts`: import the JSON `with { type: 'json' }` and append it to `history` (oldest first).
- `src/data/chronicle.ts`: add an entry at the **top** (newest first) with the same `scenarioId` and the same `date` string, and a one-paragraph present-tense summary that names the scenario type, who did what, who won, and what it cost.

## 5. Carry the consequences into the roster (`src/data/warbands.ts`)

- Warband: `rating`, `battles`, `victories`, `wyrdstone`, `gold` to the post-battle totals. Standings are hand-kept; nothing computes them.
- Members: statlines, `experience`, `equipment`, `skills`, `injuries[]` for lasting wounds, `prayers[]` if learned. Update `lore` only where the game changed the story, and say in `campaignNotes` when a report supersedes an earlier roster story.
- The fallen: keep them in the roster, set `dead: true` and `death: { date, order, epitaph }` with the Imperial date, an `order` higher than every existing grave, and an epitaph as carved. The Graveyard and the engine both read `dead`.
- Do not rename or remove member ids. They key the archives, the ledgers and the dispatches.

## 6. What Curfew does with it, so you can tell the player

- Members with `status: 'injured'` in the **most recent** record (by `sequence`) stay home in the Ledger until the player marks them fit. Members with `dead: true` stay home for good.
- Charms brought to the Eve are consumed when the player presses "the fight is done" in the Ledger. That is theirs to do; nothing in the archive touches a ledger.
- A Town Cryer article about the aftermath is optional and separate: use the `town-cryer` skill.

## 7. Verify

```sh
node .claude/skills/record-battle/scripts/check-history.mjs   # ids resolve, dates agree, Chronicle links, roster battle counts
npm test && npm run check && npm run build
```

Then in `npm run dev`: open `/scenarios/<id>/`, the Chronicle on `/`, and a participating member's profile from their warband card. Check the muster shows every participant and the statuses read right.

## Pitfalls

- `date` written by hand with the wrong weekday: the checker compares it against `playedOn`. Use the script.
- `id` not equal to the file name, or a file not imported in `history.ts`: the checker fails; the page route would be wrong or missing.
- Rewards written as treasury totals or the reverse: say which in `loot`.
- Marking somebody `injured` when they were merely knocked down: it keeps them home in Curfew for real days until healed.
- Trailing commas or straight quotes escaping in JSON; run `npm run check`, which parses the imports.
