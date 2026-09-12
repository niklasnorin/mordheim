# Writing for the campaign: the four voices

Most work in this repository is prose that happens to live in TypeScript and JSON. Each surface has its own register. Getting the register right matters more than any single sentence; a well-built feature in the wrong voice will be rewritten.

Common to all four: British spelling (favour, armour, neighbourhood), typographic apostrophes and quotes in content strings (’ “ ”), a spaced em dash where the house style uses one ("Night 14 — under the Hanged Merchant"), no exclamation marks anywhere, and they/them for a member unless the roster says otherwise. Mordheim is © Games Workshop; the campaign is fan fiction and never claims otherwise.

## 1. The Curfew vignette (Dawn Reports, rumours, packs)

`src/data/curfew/STYLE.md` is binding and short; read it before touching a pack. The essentials:

- Short declaratives, present tense, name the members, one physical detail per vignette, dry gallows humour allowed, jokes forbidden.
- Mechanics live only in the ledger line. The prose never says "+6 Favour".
- Nights, Moons, the Season. Never days, weeks, months.
- The warband, the kin, the company. Never the team or the party. Wyrdstone is the green, slivers, shards. Never loot.
- Plots are hinted, never told. A rumour says what was seen; a detail says what was smelled. Nobody in a vignette explains anything.
- The rival crosses paths rarely and lightly. Nothing is decided between warbands in a vignette.

A template must read correctly with every slot filled, including a first name of one syllable and a rival called "the Order of the Welling Rune". Which slots the engine fills where is listed at the top of `.claude/skills/curfew-pack/scripts/lint-pack.mjs`; the linter checks them.

Example, `templates.scavenge.boon` in Mordheim: "{name} went sifting in {district}. {they} came back with green in both pockets and no words about how."

## 2. The Town Cryer article (`src/data/news.ts`)

An Imperial broadsheet with a correspondent who would like to survive the week. Deadpan, satirical, exact.

- **Headline**: Title Case, long, often with a semicolon turn. "Teal-Bannered Dwarfs Enter Mordheim; Purpose Filed Under “Old Business”". "Black-Grist Mill Wheel Jams Third Time This Month; Miller Blames Large Fish".
- **Byline**: "By our correspondent at <place>, who <self-preserving aside>", or a named citizen with a title. "From our correspondent on the mill bridge, who did not look down."
- **Body**: one paragraph, roughly 80 to 150 words, third person, past tense for events and present for standing conditions. Reports rumour as rumour, attributes claims to who made them, quotes an official denial, and ends on a dry turn. It never resolves a plot and never states what the reader is meant to conclude.
- **Notices**: `notice: true`, headline in capitals ("NOTICE OF REWARD", "BY ORDER OF THE BARON"), empty byline, imperative body, a sting in the last sentence.
- **Location**: every article carries `location` unless it is for Mordheim. The broadsheet prints only the current place's articles.
- Articles announce; they do not narrate a battle. The battle is the archive's job.

## 3. The archive (battle reports, `src/data/history/*.json`)

A campaign archivist writing after the fact from the players' accounts. Neutral, past tense, precise about what is recorded and honest about what is not.

- `rulebookScenario` and `winCondition` are the rulebook's words or `null`. Never guess a rule from the narrative.
- `outcome` says who won and by what positions, and names what was not recorded ("The exact finishing turn and whether either warband voluntarily routed were not recorded").
- `prologue`, `battle[]`, `epilogue` are the neutral account; each `battle` paragraph is one beat of the fight, naming who did what to whom. `perspectives[]` are partisan in sympathy but not in fact, one per warband, with `accomplishments` as a single factual sentence or two.
- `outOfAction` lists only confirmed takedowns. A hit, a notch on a bow, a fall from a wall are not takedowns. An empty list means none were recorded, not that none happened.
- `campaignNotes` preserve deaths, lasting injuries, recurring items, bookkeeping reconciliations and conflicting accounts, including which account supersedes an earlier roster story.
- `highlight` and `lowlight` per member are one sentence each and must be true of this scenario. A member who did nothing notable gets an honest small moment, not an invented one.
- Treasury figures are totals after the battle, not battle rewards; say so in `loot` when a figure could be misread.

## 4. The roster and the Chronicle (`src/data/warbands.ts`, `src/data/chronicle.ts`)

- **Warband lore**: one paragraph. Where they are from, what drove them to the city, what they want, in the warband's own temperament. No stats, no rules.
- **Member lore**: two to four sentences of character through habit and one physical or historical detail, tying the member to others where it helps. Present tense for who they are, past for what happened to them.
- **Epithet**: a relative clause without its subject, as it would follow the name on a tombstone or in a tavern: "Who Led Them South". Curfew epithets in the packs follow the same shape.
- **Death**: `death.date` in the Imperial Calendar as `formatImperial` writes it, `death.order` higher for more recent, `epitaph` as carved, short. Set `dead: true` and keep the member in the roster; the Graveyard and the engine both read it.
- **Chronicle entry**: one paragraph in the present tense that names the scenario type, who did what, who won, and what it cost or left unresolved. Newest battle first in the array. The `date` matches the record's.

## Commit messages

Sentence-case imperative subject with no prefix or ticket, then a body in plain paragraphs that says what changed and why in the same register as the site ("The local database is ash."). Read `git log` for the tone. One logical change per commit.
