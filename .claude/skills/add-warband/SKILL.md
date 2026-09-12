---
name: add-warband
description: Add a new warband and its members to the campaign roster in src/data/warbands.ts, with the crest, standings and the Town Cryer's arrival article, so it appears on the site and can be claimed in the Curfew. Use when a new player joins, or when asked to "add a warband", "add a member to the roster" or "register the new company".
user-invocable: true
argument-hint: "[warband name and type, or the roster to enter]"
---

# Add a warband

The roster is source: one entry in `warbands` in `src/data/warbands.ts`, whose `Warband` and `Member` types at the top of that file are the contract. Nothing else registers it. The warband cards, the standings, the member dialog, the Curfew's warband picker, the Watch House and the other warbands' vignettes all read the array.

## 1. Choose ids that will never change

- `Warband.id`: a lowercase hyphenated slug (`nordost`, `bitterbrow-expedition`, `welling-rune`). It becomes the ledger's primary key, the dispatch key and the `warbandId` in every battle record. Changing it later orphans all three.
- `Member.id`: a lowercase slug, usually the first name, ASCII-folded and unique **within the warband** (`mjolnir` for Mjølnir, `gamling` for Gammling Gubbsson). Battle records reference it; ledgers and epithets key on it.

## 2. Fill the warband

- `name` may begin with "The"; the engine strips it where a vignette says "the {rival}".
- `type` is the rulebook warband type. `sigil` is a two-letter monogram. `crest` is optional: an image in `public/` named `crest-<id>.svg` or `.png`, drawn instead of the sigil where there is room.
- `player` is the player's first name, or `''` if not yet known.
- `rating`, `battles`, `victories`, `wyrdstone`, `gold`: the starting values, hand-kept from here on by `record-battle`.
- `lore`: one paragraph in the roster voice (`docs/agents/writing.md` §4).

## 3. Fill each member

- `name`, `role`, `rank` (`hero` or `henchman`; heroes get elaborate graves), `portrait` (two letters), `epithet` (a relative clause without its subject, or `''`), `stats` as a full statline, `experience`, `equipment[]`, `skills[]`, optional `prayers[]` and `injuries[]`, and `lore` of two to four sentences.
- The `role` words steer the Curfew's default errand for a member before any orders are given (`defaultErrand` in `src/curfew/engine.ts`): priest, sister, confessor, flagellant, augur pray; jaeger, hunter, scout, ranger, archer, marksman scavenge; ogre, slayer, pit, champion, brother, troll train; thief, assassin, beardling, youngblood, urchin, night runner spy; lord, elder, captain, merchant, engineer, magister trade; anyone else carouses. Pick roles the rulebook uses and the mapping will read naturally.
- The statline feeds the edge: a member who is their warband's best hand at an errand's characteristics gets a small bonus. Members without stats get no edge and do not count in the baseline, so give everyone one.
- The dead join with `dead: true` and a `death` block; see `record-battle` §5.

## 4. Announce them

Every warband so far arrived with a Town Cryer article ("Northern Family Arrives at the Gates; Declines to Say Why"). Write one with the `town-cryer` skill, tagged for the place the campaign is in, or for both places if they may arrive after a move.

## 5. Verify

```sh
npm run check && npm test && npm run build
node .claude/skills/record-battle/scripts/check-history.mjs
```

In `npm run dev`: the card renders on `/` with its crest or sigil and the muster roll opens each member's dialog; the standings table has the row; at `/curfew/` a second local player can claim the warband, and the first player's next Dawn Report may name it as the rival. In `/admin/` the ledgers table lists it unclaimed.

## Pitfalls

- A duplicated member id inside the warband: the dialog and the ledger will confuse the two.
- Renaming an existing id to tidy it: do not. Add a new member instead of repurposing an old one.
- Putting the announcement in a dispatch or the database: articles are source, in `news.ts`.
- Forgetting a statline: the member goes out without an edge and skews nothing else, but the profile shows blanks.
- The service tests use the real `nordost` roster (`agnar`, `torgrim`, `skalle`, `mjolnir`); leave those ids alone.
