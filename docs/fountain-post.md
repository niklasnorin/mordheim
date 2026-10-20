# The Fountain Post: the catch-up rule

Between games every warband takes the place's work: the notices nailed to the fountain's post in Fussenbach's square, or the word passed along in Cutthroat's Haven. Its purpose is the game ahead: to make the matchup as good a fight as it can be. Every warband on the game takes **the usual work**, the strongest included: a few crowns and a chance of a point or two of experience, for the telling. A warband weaker than the strongest other warband on its game took more of it, and brings that pay to the table as gold and experience, pulled closer to the side it is about to meet but never level with it.

**Status: a draft, for game masters alone, and a dry run only.** Players see none of it, and nothing pays a warband yet. A game master reads the post in the Watch House at `/admin/jobs/`: every scheduled game's offers, any warband at any place, and the same again with figures of their own for any warband's rating and treasury. Nothing there writes to a warband; the boards of jobs are the one thing the page saves. The players are meant to run it themselves before their games, in time.

## What holds

1. **It looks at the game ahead, and only at it.** Each warband on a scheduled game is set against the strongest other warband on that game's muster, the **stronger side**, as both stand now. Games played, won or lost do not enter into it; who wins the game is the dice's business, and the rulebook's Underdog experience still rewards the weaker side that does well.
2. **Everyone takes part; the weaker side is paid well.** Every warband takes the usual work: a fifth of a usual job's gold (at least 5 gc) and a chance of experience on its own D6 (1–3 none, 4–5 a point, 6 two points). A warband short of four fifths of the stronger side's strength takes owed jobs on top, sized to the gap.
3. **Within reach, never level.** With every roll at its best, the owed jobs lift the weaker side to the target, four fifths (`MATCH_TARGET`) of the stronger side's strength; with ordinary rolls, a good way towards it; with the worst, still the floor. The owed jobs stop at the target, the usual work stops short of the stronger side, and no warrior passes the stronger side's best of the same rank. The stronger side has nobody to be held under, and is paid the usual work alone.
4. **It opens when a game is scheduled with the warband in it**, and shuts when that game's first turn begins.
5. **Every offer is worked out fresh from the record**, against the muster as it stands, so a change to a warband's books, roster or the game's muster changes the offer at once.

What the rolls give, against a stronger side of strength 170 (a probe of the rule, 400 games each):

| The weaker side starts at | Owed jobs | Worst rolls | Median | Best rolls |
| --- | --- | --- | --- | --- |
| 76 in a hundred (130) | 1 | 77 | 79 | 82 |
| 65 in a hundred (110) | 3 | 69 | 75 | 82 |
| 53 in a hundred (90) | 3 | 61 | 70 | 82 |
| 35 in a hundred (60) | 3 | 46 | 63 | 82 |

The best rolls reach the target, 80, and the usual work a little past it; never the stronger side.

## The rule (`src/campaign/jobs.ts`, pure and tested)

| Step | What it does | Code |
| --- | --- | --- |
| Strength | The rating plus unspent gold at `GOLD_PER_RATING` (7) gc a point, since gold banked now buys warriors later. The rating is the logged one, or, when nobody has logged it (0), reckoned the rulebook's way: `RATING_PER_WARRIOR` (5) per living warrior plus their experience. | `ratingOf`, `powerOf` |
| The match | The stronger side is the strongest other warband on the game, when it is stronger than this one; the target is `MATCH_TARGET` (0.8) of its strength, rounded down; the gap is how far short of the target this warband is. The stronger side's best warrior of each rank is kept, to hold each warrior under. A dry run with no game names the warbands it would meet. | `matchFor`, `Match` |
| Owed | One owed job per `JOB_SPAN` (10) points of the gap, rounded up, at most `JOBS_AT_MOST` (3), on top of the usual work. None without a gap. | `jobsOwed` |
| The window | Open only for a scheduled (upcoming) game, at turn 0, with the warband on its muster. | `shutBecause` |
| The draw | One job more than is owed (the owed ones first, then the usual work, so a small board pays what is owed first), from the board of the place the game is fought in (or where the campaign is, if the game names no place). Seeded by the warband and the game, so the same game always gives the same jobs. Withheld jobs are never drawn, nor a job at a point of interest where any game is scheduled. Jobs the warband hasn't done lately come first, and no job comes up twice in one return. | `jobSeed`, `drawJobs` |
| The rolls | Three, each the post's or the table's: which notice (D66), the gold (2D6) and the experience (D6). The notices on a board are numbered D66 in the board's order, withheld ones keeping their number, 36 at most. A notice the table may not have (withheld, where a game is set, already taken this return, or no notice at that number) is refused with its reason and the post draws that place; at the table, a roll again. A total no such roll shows is ignored, and the post's stands. The post rolls everything for every job either way, on streams of its own, so one roll at the table leaves the others as they were. | `numberBoard`, `drawSlots`, `Slot`, `isD66`, `isDiceTotal`, `isD6`, `TableRolls` |
| The pay of an owed job | An equal share of the gap, in strength. Its lean splits it between gold and experience (`LEAN_SPLIT`: *mostly gold* 0.8 gold, *experience for all* 0.25, *a share for one hero* 0.4, *an even split* 0.5). The gold is its share at the 2D6 out of 12 (`goldShareOf`), at 7 gc a point, paid in fives; the experience its share at the D6 out of 6, never below the floor of a third (`experienceShareOf`, `EXPERIENCE_FLOOR`: 1–2 the floor, 3 a half, 4 two thirds, 5 five sixths, 6 the whole), shared out a point at a time among those the lean names, least experienced first: every warrior, every hero, the leader, or the least experienced hero. A warrior who reaches the rulebook's advance threshold is flagged, to roll at the table. | `payJobs`, `HERO_ADVANCES`, `HENCHMAN_ADVANCES` |
| The usual work | `USUAL_SHARE` (a fifth) of a usual job's gold (`JOB_GOLD` 2D6×5+15 gc times `LEAN_GOLD`), at least 5 gc, and its experience on its own D6 (`USUAL_EXPERIENCE`: 1–3 none, 4–5 a point to the least experienced warrior the lean names, 6 a point each to the two least experienced, or two to the one). | `USUAL_SHARE`, `USUAL_EXPERIENCE` |
| The limits | Experience is granted before gold, the owed jobs before the usual work, every point held under the limits as the warband's strength rises: the target for the owed jobs, one short of the stronger side for the usual work, the stronger side's best of the rank for each warrior. | `payJobs` |

All the dials are code, in `src/campaign/jobs.ts`. A change to one is a commit with its test.

## The record (`src/server/campaign/jobs.ts`)

- **`location_jobs`** is each place's board, kept by a game master: a job's name, what came of it, its lean, the point of interest it is done at, and whether it is withheld. A job's name is unique on its board. It is seeded once from the `jobs` lists in `src/data/locations.ts` (`ensureJobsSeeded`), which name their point of interest by name. Like the locations, the seed runs again if the table is ever empty, so take a board out of play by withholding its jobs rather than tearing them all down.
- **`warband_jobs`** holds the jobs taken, one row each, with the job's words copied as they were and the pay as granted. `owed` says whether it was an owed job or the usual work. The unique index on (warband, game, seq) is the once-only guard. Neon's HTTP driver has no transactions, so if two warbands take jobs at the very same moment, each may be worked out without counting the other; the next offer counts them both.
- **Taking** (`takeJobs`) pays the experience into `members.experience` and the gold into `warbands.gold`, and moves a logged `warbands.rating` up with the experience. **Striking** (`undoJobs`) takes all of it back out.
- **The books.** The match reads `warbands.rating` and `warbands.gold`, which nobody logs on the site yet, so the dry run lets a game master type figures of their own for any warband and reckon with them (`Books`, `withBooks`; carried in the page's address as `rating.<warband>` and `gold.<warband>`, never saved). A rating of 0 is reckoned from the roster. Experience comes from the warriors' own records on the muster roll.
- **Paying, for later.** `takeJobs` and `undoJobs` write the jobs and their pay into the roster and take them back; `takeJobs` takes the table's rolls too, refuses one no die shows or a notice that is a roll again, and keeps each job's rolls and who rolled them (`warband_jobs.pick`, `dice`, `experience_die`, each with its `by_hand`); they are tested, and no route calls them while the post is a dry run.

## The Watch House page (`/admin/jobs/`)

`src/pages/admin/jobs.astro` with `src/components/PostOffer.astro`, actions in `src/pages/api/admin/[action].ts`:

| Section | What it shows | Actions |
| --- | --- | --- |
| The rule | The rule as above, with the dials read from the code. | |
| Where they stand | Every warband's games, experience and strength, with its rating and treasury as fields to try figures in. | **Reckon** reloads the page with those figures (a GET; nothing saved) |
| Before the games | Every scheduled game and each attending warband's offer: the stronger side and the target, what is owed, the jobs drawn and their pay, and what the limits cut. Worked out at every look with the game's own seed, so these are the jobs the game would draw. Each job has boxes for the table's own rolls (the notice's D66, the gold's 2D6, the experience D6): empty, the post rolls. | **Reckon with these rolls** reloads with them (a GET; nothing saved) |
| Dry run | Any warband against any other (by default the weakest against the strongest), at any place, as if a game were scheduled there today. Nothing is written. The draw is seeded by the place rather than a game, so a real game's jobs may differ; the pay is worked out the same way, and the rolls may be the table's here too. | none (a plain GET form) |
| The boards | Each place's jobs, edited in place, with each notice's D66 number. | `job-add`, `job-update` (including *withheld*), `job-remove` |

## Writing a job

A job is one or two short sentences, past tense: what the warband did and where, then one thing noticed. It may touch the place's story as far as the Curfew's pack does, and no further:

- **What the pack already says may be seen.** A job may stand at Warehouse 4, the manor, Morr's Garden or the ruins, and notice what the pack's rumours, details and crossroads say is there: crates that are not the chandler's, shutters that stay shut, graves dug for nobody yet, a child who will not say what it was doing.
- **Nothing contradicts the pack.** Read the place's pack (`location:<id>` in the Watch House, or `src/data/curfew/locations/<id>.json`) before writing a job about a thread. The village's own life is the safest ground: the Flagon and its boat song, pumpkin ale, the eel-men and their third hour, the algae men, the charcoal burners, the ferryman's tenth, the mill wheel.
- **Nothing resolves a thread or adds a fact to it.** No job says what is in the crates, who walks in the old Baron's coat, or where Anselm is. A detail the pack does not have, such as a new name or a new number, belongs in the pack first, if anywhere.
- **Points of interest by their names on the site.** A seed job names its point exactly as the location keeps it; a game master can repoint a job on the board.

British spelling, typographic apostrophes, no exclamation marks; nights, not days or weeks. A job at a point where a game is scheduled is never drawn, so nobody gets to scout the next field.

## What a draft leaves for later

- **Opening it to players.** The players are to run the post themselves: a "Back from the fountain post" panel on the scenario page for the keeper of each warband on the muster, before the first turn, calling `takeJobs`; the rating and treasury in the keeper's own warband form; and a game master's way to strike a mistake (`undoJobs`).
- **The story.** The taken jobs in the warband's chronicle and on the location's map as a third colour of pin, and a Town Cryer dispatch in the place's own voice when a warband comes back from the post.
- **Choices still open.** Whether games of three or more should pull each weaker side towards the strongest (as built) or towards the one next above it; whether players choose their own champion for a *champion* job (the draft picks the least experienced hero).
