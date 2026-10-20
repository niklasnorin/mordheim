# The Fountain Post: the catch-up rule

Between games every warband takes one of the place's jobs: a notice nailed to the fountain's post in Fussenbach's square, or the word passed along in Cutthroat's Haven. Its purpose is the game ahead: to make the matchup as good a fight as it can be, however many games each warband has played. The jobs come in three scopes. An **errand** is the usual work, a few crowns and a chance of a point or two of experience, taken by the strongest warband of the game and anyone already close to it, for the telling. A warband further short of the side it is about to meet takes a **commission**, or, when it is far short, an **undertaking**: a bigger job, with more to it and more lore, that pays enough to pull it towards the stronger side but never level with it.

**Status: a draft, for game masters alone, and a dry run only.** Players see none of it, and nothing pays a warband yet. A game master reads the post in the Watch House at `/admin/jobs/`: every scheduled game's offers, any warband at any place, and the same again with figures of their own for any warband's rating and treasury. Nothing there writes to a warband; the boards of jobs are the one thing the page saves. The players are meant to run it themselves before their games, in time.

## What holds

1. **It looks at the game ahead, and only at it.** Each warband on a scheduled game is set against the strongest other warband on that game's muster, the **stronger side**, as both stand now. How many games a warband has played, won or lost does not enter into it: players join different numbers of games, and the game ahead should be worth playing whoever turns up. The rulebook's Underdog experience still rewards a weaker side that does well.
2. **One job each, sized to the gap.** The target is four fifths (`MATCH_TARGET`) of the stronger side's strength. A warband 25 or more short of it takes an undertaking, one 5 to 24 short a commission, and the rest, the stronger side included, an errand.
3. **Within reach, never level.** With every roll at its best, a commission or an undertaking lifts the weaker side to the target; with ordinary rolls, a good way towards it; with the worst, still the floor. A commission or an undertaking stops at the target, an errand stops short of the stronger side, and no warrior passes the stronger side's best of the same rank. The stronger side has nobody to be held under.
4. **It opens when a game is scheduled with the warband in it**, and shuts when that game's first turn begins.
5. **Every offer is worked out fresh from the record**, against the muster as it stands, so a change to a warband's books, roster or the game's muster changes the offer at once.

What the job gives, against a stronger side of strength 170 (a probe of the rule on Fussenbach's board, 400 games each, as a share of the stronger side's strength):

| The weaker side starts at | The job | Worst rolls | Median | Best rolls | Median pay |
| --- | --- | --- | --- | --- | --- |
| 88 in a hundred (150) | an errand | 89 | 89 | 91 | 10 gc |
| 76 in a hundred (130) | a commission | 77 | 78 | 80 | 10 gc, 2 experience |
| 71 in a hundred (120) | a commission | 72 | 76 | 80 | 20 gc, 5 experience |
| 65 in a hundred (110) | an undertaking | 69 | 74 | 80 | 45 gc, 7 experience |
| 53 in a hundred (90) | an undertaking | 61 | 69 | 80 | 80 gc, 12 experience |
| 35 in a hundred (60) | an undertaking | 48 | 61 | 80 | 135 gc, 19 experience |

## The rule (`src/campaign/jobs.ts`, pure and tested)

| Step | What it does | Code |
| --- | --- | --- |
| Strength | The rating plus unspent gold at `GOLD_PER_RATING` (7) gc a point, since gold banked now buys warriors later. The rating is the logged one, or, when nobody has logged it (0), reckoned the rulebook's way: `RATING_PER_WARRIOR` (5) per living warrior plus their experience. | `ratingOf`, `powerOf` |
| The match | The stronger side is the strongest other warband on the game, when it is stronger than this one; the target is `MATCH_TARGET` (0.8) of its strength, rounded down; the gap is how far short of the target this warband is. The stronger side's best warrior of each rank is kept, to hold each warrior under. A dry run with no game names the warbands it would meet. | `matchFor`, `Match` |
| The scope | An undertaking from a gap of `SCOPE_FROM.undertaking` (25), a commission from `SCOPE_FROM.commission` (5), an errand below that. | `scopeFor`, `JOB_SCOPES` |
| The window | Open only for a scheduled (upcoming) game, at turn 0, with the warband on its muster. | `shutBecause` |
| The draw | One job, of the scope asked for, from the board of the place the game is fought in (or where the campaign is, if the game names no place). Seeded by the warband and the game, so the same game always gives the same job. Withheld jobs are never drawn, nor a job at a point of interest where any game is scheduled; jobs the warband hasn't done lately come first. When the board has no open notice of the scope, the nearest scope that has one stands in, smaller before larger; the pay is the rule's either way. | `jobSeed`, `drawJobs`, `drawSlot` |
| The rolls | Three, each the post's or the table's: which notice, the gold (2D6) and the experience (D6). Each scope's notices are numbered in the board's order, withheld ones keeping their number: on a D6 while a scope has six notices or fewer, on a D66 past that, 36 at most. A notice the table may not have (withheld, where a game is set, or no notice at that number) is refused with its reason and the post draws instead; at the table, a roll again. A total no such roll shows is ignored, and the post's stands. The post rolls everything either way, on streams of its own, so one roll at the table leaves the others as they were. | `numberBoard`, `dieFor`, `isNoticeRoll`, `Slot`, `isDiceTotal`, `isD6`, `TableRolls` |
| The pay of a commission or an undertaking | Worth the gap, in strength. Its lean splits that between gold and experience (`LEAN_SPLIT`: *mostly gold* 0.8 gold, *experience for all* 0.25, *a share for one hero* 0.4, *an even split* 0.5). The gold is its share at the 2D6 out of 12 (`goldShareOf`), at 7 gc a point, paid in fives; the experience its share at the D6 out of 6, never below the floor of a third (`experienceShareOf`, `EXPERIENCE_FLOOR`: 1–2 the floor, 3 a half, 4 two thirds, 5 five sixths, 6 the whole), shared out a point at a time among those the lean names, least experienced first: every warrior, every hero, the leader, or the least experienced hero. What a warrior already at the stronger side's best cannot take goes to the rest of the warband, least experienced first, and what nobody can take is paid in gold instead. A warrior who reaches the rulebook's advance threshold is flagged, to roll at the table. | `payJobs`, `HERO_ADVANCES`, `HENCHMAN_ADVANCES` |
| The pay of an errand | `ERRAND_SHARE` (a fifth) of an errand's gold (`JOB_GOLD` 2D6×5+15 gc times `LEAN_GOLD`), at least 5 gc, and its experience on its own D6 (`ERRAND_EXPERIENCE`: 1–3 none, 4–5 a point to the least experienced warrior the lean names, 6 a point each to the two least experienced, or two to the one). | `ERRAND_SHARE`, `ERRAND_EXPERIENCE` |
| The limits | Experience is granted before gold, every point held under the limits as the warband's strength rises: the target for a commission or an undertaking, one short of the stronger side for an errand, the stronger side's best of the rank for each warrior. | `payJobs` |
| A six | A six on the experience die always pays at least a point, on any job: when the job and the limits would pay none, a point goes to the least experienced warrior the job names (or of the warband, if it names none), past the target and a warrior's best if need be. Only the stronger side's own strength stops it: the point is not paid when it would make the warband level. | `SIX_PAYS` |

All the dials are code, in `src/campaign/jobs.ts`. A change to one is a commit with its test.

## The record (`src/server/campaign/jobs.ts`)

- **`location_jobs`** is each place's board, kept by a game master: a job's name, what came of it, its scope, its lean, the point of interest it is done at, and whether it is withheld. A job's name is unique on its board. It is seeded from the `jobs` lists in `src/data/locations.ts` (`ensureJobsSeeded`, `seedJobs`), which name their point of interest by name: an empty board is given the whole seed, a board already nailed up is given the seed's jobs it lacks, and a seed job nobody has edited on the site (its `updated_at` still its `created_at`) follows the seed's words, scope, lean, point and order, so a rewrite of the seed reaches a live board. A job a game master has edited is theirs. Tearing down a seed job withholds it instead, so the seed does not nail it up again; a job of the game master's own is deleted.
- **`warband_jobs`** holds the jobs taken, one row each, with the job's words copied as they were and the pay as granted. `scope` is the scope the match asked for, and `owed` whether it was sized to the gap (a commission or an undertaking) rather than an errand. The unique index on (warband, game, seq) is the once-only guard. Neon's HTTP driver has no transactions, so if two warbands take jobs at the very same moment, each may be worked out without counting the other; the next offer counts them both.
- **Taking** (`takeJobs`) pays the experience into `members.experience` and the gold into `warbands.gold`, and moves a logged `warbands.rating` up with the experience. **Striking** (`undoJobs`) takes all of it back out.
- **The books.** The match reads `warbands.rating` and `warbands.gold`, which nobody logs on the site yet, so the dry run lets a game master type figures of their own for any warband and reckon with them (`Books`, `withBooks`; carried in the page's address as `rating.<warband>` and `gold.<warband>`, never saved). A rating of 0 is reckoned from the roster. Experience comes from the warriors' own records on the muster roll.
- **Paying, for later.** `takeJobs` and `undoJobs` write the jobs and their pay into the roster and take them back; `takeJobs` takes the table's rolls too, refuses one no die shows or a notice that is a roll again, and keeps each job's rolls and who rolled them (`warband_jobs.pick`, `dice`, `experience_die`, each with its `by_hand`); they are tested, and no route calls them while the post is a dry run.

## The Watch House page (`/admin/jobs/`)

`src/pages/admin/jobs.astro` with `src/components/PostOffer.astro`, actions in `src/pages/api/admin/[action].ts`:

| Section | What it shows | Actions |
| --- | --- | --- |
| The rule | The rule as above, with the dials read from the code. | |
| Where they stand | Every warband's experience and strength, with its rating and treasury as fields to try figures in. | **Reckon** reloads the page with those figures (a GET; nothing saved) |
| Before the games | Every scheduled game and each attending warband's offer: the stronger side and the target, what is owed, the jobs drawn and their pay, and what the limits cut. Worked out at every look with the game's own seed, so these are the jobs the game would draw. Each warband's job has boxes for the table's own rolls (the notice's D6 or D66, the gold's 2D6, the experience D6): empty, the post rolls. | **Reckon with these rolls** reloads with them (a GET; nothing saved) |
| Dry run | Any warband against any other (by default the weakest against the strongest), at any place, as if a game were scheduled there today. Nothing is written. The draw is seeded by the place rather than a game, so a real game's jobs may differ; the pay is worked out the same way, and the rolls may be the table's here too. | none (a plain GET form) |
| The boards | Each place's jobs, by scope, with each notice's number and the die it is rolled on, edited in place. | `job-add`, `job-update` (including *withheld*), `job-remove` |

## Writing a job

A job is written in the past tense: what the warband did and where, then what was noticed. An errand is a sentence or two; a commission two or three, with a little more to it; an undertaking four or five, a job with more scope, more danger and more of the place's lore in it. The voice is the grimdark broadsheet's, deadpan: the horror is noticed, never remarked on, and the last line is a dry turn rather than a joke. It may touch the place's story as far as the Curfew's pack does, and no further:

- **What the pack already says may be seen.** A job may stand at Warehouse 4, the manor, Morr's Garden or the ruins, and notice what the pack's rumours, details and crossroads say is there: crates that are not the chandler's, shutters that stay shut, graves dug for nobody yet, a child who will not say what it was doing.
- **Nothing contradicts the pack.** Read the place's pack (`location:<id>` in the Watch House, or `src/data/curfew/locations/<id>.json`) before writing a job about a thread. The village's own life is the safest ground: the Flagon and its boat song, pumpkin ale, the eel-men and their third hour, the algae men, the charcoal burners, the ferryman's tenth, the mill wheel.
- **Nothing resolves a thread or adds a fact to it.** No job says what is in the crates, who walks in the old Baron's coat, or where Anselm is. A detail the pack does not have, such as a new name or a new number, belongs in the pack first, if anywhere.
- **Points of interest by their names on the site.** A seed job names its point exactly as the location keeps it; a game master can repoint a job on the board.

British spelling, typographic apostrophes, no exclamation marks; nights, not days or weeks. A job at a point where a game is scheduled is never drawn, so nobody gets to scout the next field.

## What a draft leaves for later

- **Opening it to players.** The players are to run the post themselves: a "Back from the fountain post" panel on the scenario page for the keeper of each warband on the muster, before the first turn, calling `takeJobs`; the rating and treasury in the keeper's own warband form; and a game master's way to strike a mistake (`undoJobs`).
- **The story.** The taken jobs in the warband's chronicle and on the location's map as a third colour of pin, and a Town Cryer dispatch in the place's own voice when a warband comes back from the post.
- **Choices still open.** Whether games of three or more should pull each weaker side towards the strongest (as built) or towards the one next above it; whether players choose their own champion for a *champion* job (the draft picks the least experienced hero).
