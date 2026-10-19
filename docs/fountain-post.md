# The Fountain Post: the catch-up rule

Between games every warband takes the place's work: the notices nailed to the fountain's post in Fussenbach's square, or the word passed along in Cutthroat's Haven. For a warband keeping pace, even the one leading the campaign, it is **the usual work**: a few crowns and a chance of a point or two of experience, for the telling. A warband that has fought fewer games than the rest took more of it, and when it next comes to the table it brings that pay home as gold and experience. This is the campaign's catch-up rule: everyone takes part before every game, but it pays well only those who are behind, and it never lifts them past those who play more.

**Status: a draft, for game masters alone, and a dry run only.** Players see none of it, and nothing pays a warband yet. A game master reads the post in the Watch House at `/admin/jobs/`: every scheduled game's offers, any warband at any place, and the same again with figures of their own for any warband's rating and treasury. Nothing there writes to a warband; the boards of jobs are the one thing the page saves. The players are meant to run it themselves before their games, in time.

## What holds

1. **Everyone takes part; only those behind are paid well.** Every warband on a scheduled game takes the usual work, one job paying a fifth of a job's gold (at least 5 gc) and a chance of experience on its own D6 (1–3 none, 4–5 a point, 6 two points). A warband behind the pace takes its owed jobs on top, paid in full. Only owed jobs count towards the pace.
2. **It counts games behind, never games lost.** Helping the weaker side in a battle is what the rulebook's Underdog experience is for.
3. **It opens when a game is scheduled with the warband in it**, and shuts when that game's first turn begins. A warband is paid for coming back, not for staying away. If the jobs are not taken in time they stay owed, and can be taken before the warband's next game.
4. **It never makes a warband stronger than any warband that has fought more.** The ceiling is the weakest warband ahead (decided: not the median of those ahead), measured three ways, and every grant, the usual work included, is cut to fit under it. A warband nobody is ahead of is held under nothing, and it is paid only the usual work.
5. **Every offer is worked out fresh from the record.** Nothing is fixed when a game is scheduled. If warband A takes its jobs and a game with warband B is then scheduled before A's game is played, B's offer already counts A's jobs. Each warband ahead was held under the same ceiling, so nobody can climb past a warband that actually played.

## The rule (`src/campaign/jobs.ts`, pure and tested)

| Step | What it does | Code |
| --- | --- | --- |
| Effective games | Games played plus owed jobs taken; the usual work does not count. | `effectiveGames` |
| The pace | The median effective games of the warbands that count (those with a keeper, or with a game fought). When the number is even, the higher of the two middle values. | `paceOf` |
| Owed | The pace minus this warband's effective games, at most `JOBS_AT_MOST` (3), and nothing when no warband is ahead. Owed jobs come on top of the usual work. | `jobsOwed` |
| Strength | The rating plus unspent gold at `GOLD_PER_RATING` (7) gc a point, since gold banked now buys warriors later. The rating is the logged one, or, when nobody has logged it (0), reckoned the rulebook's way: `RATING_PER_WARRIOR` (5) per living warrior plus their experience. | `ratingOf`, `powerOf` |
| The ceiling | Among the warbands with more effective games: the lowest strength, the lowest total experience, and for each rank the lowest of each warband's best warrior of that rank. | `ceilingFor` |
| The window | Open only for a scheduled (upcoming) game, at turn 0, with the warband on its muster. | `shutBecause` |
| The draw | One job more than is owed (the owed ones first, then the usual work, so a small board pays what is owed first), from the board of the place the game is fought in (or where the campaign is, if the game names no place). Seeded by the warband and the game, so the same game always gives the same jobs. Withheld jobs are never drawn, nor a job at a point of interest where any game is scheduled. Jobs the warband hasn't done lately come first, and no job comes up twice in one return. | `jobSeed`, `drawJobs` |
| The rolls | Three, each the post's or the table's: which notice (D66), the gold (2D6) and the experience (D6), on the owed table or the usual work's. The notices on a board are numbered D66 in the board's order, withheld ones keeping their number, 36 at most. A notice the table may not have (withheld, where a game is set, already taken this return, or no notice at that number) is refused with its reason and the post draws that place; at the table, a roll again. A total no such roll shows is ignored, and the post's stands. The post rolls everything for every job either way, on streams of its own, so one roll at the table leaves the others as they were. The ceiling holds the same. | `numberBoard`, `drawSlots`, `Slot`, `isD66`, `isDiceTotal`, `isD6`, `TableRolls` |
| The pay | An owed job's gold is `JOB_GOLD` (2D6×5+15 gc) times its lean's factor (`LEAN_GOLD`), paid in fives; the usual work pays `USUAL_SHARE` (a fifth) of that, at least 5 gc, and its experience on its own D6 (`USUAL_EXPERIENCE`: 1–3 none, 4–5 a point to the least experienced warrior the lean names, 6 a point each to the two least experienced, or two to the one). An owed job's experience floor goes by the lean: every warrior +1 (*experience*), every hero +1 (*even*), the leader +1 (*gold*), or +2 to the least experienced hero (*champion*). Experience is granted first, warrior by warrior, then the gold, with every point held under the ceiling as the warband's totals rise. A warrior who reaches the rulebook's advance threshold is flagged, to roll at the table. | `payJobs`, `HERO_ADVANCES`, `HENCHMAN_ADVANCES` |
| The experience roll | An owed job's D6, never below the floor: 1–2 the floor (the lean's grant as it stands), 3–5 the floor and a point more to the least experienced warrior it names, 6 twice the floor. Only the ceiling can cut below the floor. The usual work has its own table instead (`USUAL_EXPERIENCE`), so the leader too may come away with a point or two. | `EXPERIENCE_ROLL`, `USUAL_EXPERIENCE`, `JobPay.experienceDie` |

All the dials are code, in `src/campaign/jobs.ts`. A change to one is a commit with its test.

## The record (`src/server/campaign/jobs.ts`)

- **`location_jobs`** is each place's board, kept by a game master: a job's name, what came of it, its lean, the point of interest it is done at, and whether it is withheld. A job's name is unique on its board. It is seeded once from the `jobs` lists in `src/data/locations.ts` (`ensureJobsSeeded`), which name their point of interest by name. Like the locations, the seed runs again if the table is ever empty, so take a board out of play by withholding its jobs rather than tearing them all down.
- **`warband_jobs`** holds the jobs taken, one row each, with the job's words copied as they were and the pay as granted. `owed` says whether it was an owed job or the usual work; an owed row counts towards the warband's effective games for good, even if the game it was taken before is struck. The unique index on (warband, game, seq) is the once-only guard. Neon's HTTP driver has no transactions, so if two warbands take jobs at the very same moment, each may be worked out without counting the other; the next offer counts them both.
- **Taking** (`takeJobs`) pays the experience into `members.experience` and the gold into `warbands.gold`, and moves a logged `warbands.rating` up with the experience. **Striking** (`undoJobs`) takes all of it back out.
- **The books.** The ceiling reads `warbands.rating` and `warbands.gold`, which nobody logs on the site yet, so the dry run lets a game master type figures of their own for any warband and reckon with them (`Books`, `withBooks`; carried in the page's address as `rating.<warband>` and `gold.<warband>`, never saved). A rating of 0 is reckoned from the roster. Experience comes from the warriors' own records on the muster roll.
- **Paying, for later.** `takeJobs` and `undoJobs` write the jobs and their pay into the roster and take them back; `takeJobs` takes the table's rolls too, refuses one no die shows or a notice that is a roll again, and keeps each job's rolls and who rolled them (`warband_jobs.pick`, `dice`, `experience_die`, each with its `by_hand`); they are tested, and no route calls them while the post is a dry run.

## The Watch House page (`/admin/jobs/`)

`src/pages/admin/jobs.astro` with `src/components/PostOffer.astro`, actions in `src/pages/api/admin/[action].ts`:

| Section | What it shows | Actions |
| --- | --- | --- |
| The rule | The rule as above, with the dials read from the code. | |
| Where they stand | Every warband's games, jobs, effective games, experience, strength and jobs owed, with its rating and treasury as fields to try figures in. | **Reckon** reloads the page with those figures (a GET; nothing saved) |
| Before the games | Every scheduled game and each attending warband's offer: owed, the ceiling and who sets it, the jobs drawn and their pay, and what the ceiling cut. Worked out at every look with the game's own seed, so these are the jobs the game would draw. Each job has boxes for the table's own rolls (the notice's D66, the gold's 2D6, the experience D6): empty, the post rolls. | **Reckon with these rolls** reloads with them (a GET; nothing saved) |
| Dry run | Any warband at any place, as if a game were scheduled there today. Nothing is written. The draw is seeded by the place rather than a game, so a real game's jobs may differ; the pay is worked out the same way, and the rolls may be the table's here too. | none (a plain GET form) |
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
- **Calibration.** A job pays fixed dice today. Once rating, treasury and experience are logged after every game, the pay could be set from the campaign's own average takings per game (about 0.6 of it), so it keeps pace as the campaign grows richer.
- **Choices still open.** Whether the Curfew's nights should count towards the pace; whether players choose their own champion for a *champion* job (the draft picks the least experienced hero).
