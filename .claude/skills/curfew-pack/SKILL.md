---
name: curfew-pack
description: Extend a Curfew content pack (templates, rumours, districts, epithets, Cryer headlines, Moon tie-ins, encounters) or create a whole new place under src/data/curfew/locations/, plus new charms, Moons and Omens. Use when asked for "more vignettes", "a new location", "write the pack for", "add a charm", or when Dawn Reports repeat themselves.
user-invocable: true
argument-hint: "[place id, and what to add]"
---

# Curfew content packs

A place is a JSON file in `src/data/curfew/locations/<id>.json`, typed by `Location` in `src/curfew/engine.ts` and read by `resolveNight`, the Ledger, the Watch House and the Town Cryer. Adding lines is a text edit. The prose rules are `src/data/curfew/STYLE.md`, binding; the sizing that keeps a month of nights fresh is `PLAN.md` §2a.

## What a pack holds

| Key | What it is | Slots the engine fills |
| --- | --- | --- |
| `id`, `name`, `kind` (`city`/`village`), `settlement` ("the city"), `title`, `tagline` | Identity and the Ledger's heading | none |
| `errands[]` | Which of scavenge, carouse, train, spy, pray, trade, dredge are open here | |
| `unavailable{errand}` | The line shown greyed for each errand the place lacks. Required for every missing errand | none |
| `redirect{errand}` | Where an order or standing order for a missing errand goes | |
| `inherits{local: other}` | A local errand that borrows another's Omen tilt and Moon favour (Dredge inherits Scavenge) | |
| `moonBoost{moonId: errand}` | Where a Moon's favour goes when the place lacks its errand | |
| `moonTies{moonId}{errand}[]` | The Moons' tie-in lines reworded for the place; several per Moon and errand | prose slots |
| `arrival` | The Cryer headline the first night a warband spends here | `{warband}` |
| `watchNote` | The note under the place's name in the Watch; may be empty | none |
| `blurbs{errand}` | One line per errand in the Watch | none |
| `cryer{edition, banner, price, watchHeading, heard, bylines[], headlines{errand}{boon,fair,poor}[]}` | The broadsheet's masthead and the happening headlines | headlines: `{first}` `{name}` `{warband}` |
| `districts[]` | Places within the place | filled into `{district}` |
| `details[]` | One physical detail per night | none |
| `closers[]` | A closing line about the warband, some nights | none |
| `templates{errand}{boon,fair,poor,standing}[]` | The vignette for each member sent | prose slots |
| `pairs[]` | A line added to the second member's vignette, sometimes | prose slots (`{other}` is the first member) |
| `encounters[]` | The rival crossing a member's path, about one night in seven | prose slots plus `{rivalMember}` |
| `rumours[]` | What Spy brings home | `{rival}` only |
| `return[]`, `cityProvides[]`, `quiet[]` | The Return vignette, the City Provides line, the quiet night | none |
| `epithets{errand}[]` | Earned after five entries, by the errand done most | none |

Prose slots are `{name}` `{first}` `{they}` `{them}` `{their}` `{district}` `{omen}` `{rival}` `{other}`. `{detail}` in STYLE.md is not a template slot; the detail is its own line. A template must read correctly with every slot filled and with a rival called "the Order of the Welling Rune".

## Extending a pack

1. Read a dozen existing lines of the bank you are adding to, then write in the same shape. Templates: one sentence pair per member, what they did and where, what it cost or brought. No mechanics in the prose. Hint at the place's plots, never tell them.
2. Sizing for a month of nightly play by four warbands, per errand: 12 boon, 16 fair, 12 poor, 6 standing templates; 8 Cryer headlines per outcome; 10 epithets; and for the place, 40 or more rumours and details, 28 closers, 18 encounters, 12 pairs, 3 tie-in lines per Moon and errand. `npm test` enforces the hard minimums (2 templates per bank, 3 headlines, 3 epithets, an `unavailable` line for every missing errand, tie-ins for every Moon and open errand when `moonTies` exists).
3. Append new lines; do not reorder or delete existing ones during a Moon of play without reason. Draws are by index, so a change alters future nights only, never a written one, but the ledger's ten-night memory of used lines is by index too.
4. Lint, then test:

```sh
node .claude/skills/curfew-pack/scripts/lint-pack.mjs <id>            # slots, structure, STYLE.md vocabulary
node .claude/skills/curfew-pack/scripts/lint-pack.mjs <id> --month    # also where a bank is thin for a month
npm test
```

## Creating a place

1. Copy `fussenbach.json` as the scaffold and replace every line; a village is not a smaller city, and a new place is not another Fussenbach. Name its pub, its shrine, its gate. Decide its `errands`, write an `unavailable` line and a `redirect` for each of the seven it lacks, and `moonBoost` for any Moon whose favoured errand is missing.
2. A place with an errand of its own (as Fussenbach has Dredge) needs engine work: the `Errand` union, `ERRANDS`, `ERRAND_LABEL`, `ERRAND_BLURB`, `ERRAND_STATS`, `ERRAND_TOKEN_TYPE` or `SHARD_ERRANDS`, and `inherits` in the pack so it takes an existing errand's tilt. The API's errand enum derives from `ERRANDS`. Use the `curfew-engine` skill.
3. Register it: import the JSON in `src/curfew/engine.ts` and add it to `LOCATIONS`. Add its edition to `editions` in `src/data/news.ts` and write at least an arrival article there tagged with its id (`town-cryer` skill). Add charms that belong to it in `tokens.json` with `"location": "<id>"`.
4. The move itself needs no code: the game master moves the campaign from the Watch House, the move is logged by night, and the first night there plants the `arrival` headline.
5. Verify as above, then in `npm run dev`: move the campaign at `/admin/`, give orders at `/curfew/` and step a week of nights with `?date=`, read the Dawn Reports and the Cryer, move back.

## Charms, Moons and Omens

- **Charm** (`tokens.json` `tokens[]`): `id` unique, `type` one of fortune, ground, market, sight, `name`, an `effect` in rulebook terms, optional `location`. Curses in `curses[]` are content only and never drop.
- **Moon** (`moons.json`): `id`, `name`, `reading`, `boost` errand, `ties` per Mordheim errand. Eight today; the deck cycles every 56 nights, and adding one reshuffles future Moons for everyone (written nights keep theirs). Give every place with `moonTies` lines for it.
- **Omen** (`omens.json`): `id`, `numeral`, `title`, `reading`, sparse `tilt` from -2 to +2, `notes`, `image`. Thirty today; adding one reshuffles future draws and needs a card rendered with `scripts/curfew/` (see its README).

## Pitfalls

- `{rivalMember}` outside `encounters`, `{other}` in a rumour, `{warband}` in a template: printed unfilled. The linter catches these.
- An exclamation mark, or days, weeks and months in a vignette: STYLE.md forbids them; the linter warns.
- A template that explains the plot. Hint, in what was seen or smelled.
- Forgetting `unavailable` for a missing errand: `npm test` fails, and the Watch would show a generated line.
- Editing the packs to fix a night already written: nights are stored; content changes only reach the future.
