---
name: add-warband
description: Add a new warband and its warriors to the campaign on the site (found it at /warbands/, hand it to its player, enter the roster), with the crest and the Town Cryer's arrival article, so it appears on the home page and can be taken up in the Curfew. Use when a new player joins, or when asked to "add a warband", "add a member to the roster" or "register the new company". Also covers the seed fixture in src/data/warbands.ts for an empty database.
user-invocable: true
argument-hint: "[warband name and type, or the roster to enter]"
---

# Add a warband

The roster lives in the database and is kept on the site. A player founds their own warband at `/warbands/` (it is theirs at once) or takes up one that waits at the gates; a game master founds one unowned and hands it to a player from its page. The shape is `Warband` and `Member` in `src/campaign/model.ts`; the service is `src/server/campaign/roster.ts`; the API `src/pages/api/warbands/[action].ts`. The warband cards, the standings, the member dialog, the Curfew's picker, the Watch House and the other warbands' vignettes all read the database.

## 1. Found it

At `/warbands/`, **Found a warband**: name (may begin with "The"; the engine strips it where a vignette says "the {rival}"), kind (the rulebook warband type), the story (one paragraph in the roster voice, `docs/agents/writing.md` §4). Rating, gold and wyrdstone are not tracked for now, so there is nothing else to fill in. The id is chosen once from the name (`the-grey-hand` becomes `grey-hand`) and never changes: it becomes the ledger's key, the dispatch key and the `warbandId` in every scenario record. The sigil is two letters from the name unless a game master sets one.

## 2. Enter the warriors (`/warbands/<id>/`, **Add a warrior**)

- Name, role, rank (`hero` or `henchman`; heroes get elaborate graves), experience, the full statline, skills and special rules one per line (prayers and spells too), the tale of two to four sentences. Weapons and gear are not tracked.
- The `role` words steer the Curfew's default errand before any orders are given (`defaultErrand` in `src/curfew/engine.ts`): priest, sister, confessor, flagellant, augur pray; jaeger, hunter, scout, ranger, archer, marksman scavenge; ogre, slayer, pit, champion, brother, troll train; thief, assassin, beardling, youngblood, urchin, night runner spy; lord, elder, captain, merchant, engineer, magister trade; anyone else carouses. Pick roles the rulebook uses and the mapping reads naturally.
- The statline feeds the edge: a warrior who is their warband's best hand at an errand's characteristics gets a small bonus, measured within the warband. Give everyone one.
- The id is the first name, ASCII-folded (`mjolnir` for Mjølnir), made unique across the campaign. It cannot be renamed; strike and re-enter a warrior only while they have fought in no recorded battle.

## 3. The crest and the player

A crest is an image in `public/` named `crest-<id>.svg` or `.png`, committed to the repository; a game master writes its file name into the warband's record drawer. The player's name on the card is the owner's; a game master may also write one for a warband nobody has signed in to own yet.

## 4. Announce them

Every warband so far arrived with a Town Cryer article ("Northern Family Arrives at the Gates; Declines to Say Why"). Write one with the `town-cryer` skill, for the place the campaign is in.

## 5. Verify

On `/` the card renders with its crest or sigil and the muster roll opens each warrior's dialog; the standings table has the row; at `/curfew/` the owner opens the ledger (or a second local player takes the warband up), and the first player's next Dawn Report may name it as the rival. In `/admin/` the ledgers table lists it.

## Seeding an empty database instead

`src/data/warbands.ts` is imported once into an empty database (`src/server/campaign/seed.ts`) and is the engine tests' fixture. Its `Warband`/`Member` are the fixture's older shape (with `equipment` and `prayers`, which the seed folds away). Add there only for a fresh deployment or a test; editing it changes nothing on a seeded database. The service tests use the real `nordost` roster (`agnar`, `torgrim`, `skalle`, `mjolnir`); leave those ids alone.

## Pitfalls

- Founding a second warband as a player: refused; a player keeps one. Give the first up, or ask a game master to hand it to someone.
- Handing a warband to a player who keeps another: refused until they release theirs. The ledger moves with the warband, nights and all.
- Forgetting a statline: the warrior goes out without an edge and the profile shows the defaults.
