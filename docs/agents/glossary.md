# Glossary: the campaign's words and the code behind them

The repository names technical things in the fiction's words. This maps each word to what it is and where it lives, so an agent can read a request like "the Cryer should print the arrival headline the first night in a new place" and know which files it touches. Where a word has two meanings, both are given.

## Time

| Word | Meaning | Code |
| --- | --- | --- |
| **Night** | One real day. Night 1 is `campaign.json` `start` (2026-09-10); nights turn at midnight in `campaign.json` `timezone` (Europe/Stockholm). Nights before the start are zero or negative; the first game was night -4. | `nightForDate`, `dateForNight`, `currentNight`, `localDate` in `src/curfew/engine.ts` |
| **today** | The night the server treats as current, always passed into the services as a number. With `CURFEW_DEBUG` on, `?date=YYYY-MM-DD` overrides it for a game master's own Ledger and Eve; never for a player, never in the Watch House, never for the cron. | `todayFor(url, viewer)` in `src/server/curfew/service.ts` |
| **Moon** | Seven nights. Eight Moons in `moons.json`, drawn as a seeded shuffle per cycle. A Moon favours one errand by one point (`boost`) and carries a tie-in line per errand. | `moonIndex`, `moonForNight`, `moonBoostAt`, `moonTiesAt` |
| **Season** | Twelve Moons (`seasonMoons`). The finale is unbuilt. | `campaign.json` |
| **Imperial Calendar, IC** | The Empire's 400-day year, eight-day week and six holy days. Every date shown to a player goes through it; the anchor is the first game. "Marktag, 5th of Pflugzeit, 2007 IC". | `src/lib/calendar.ts`: `imperialForDate`, `formatImperial`, `parseImperial`, `ANCHOR` |
| **Dusk, Midnight, Dawn** | Orders are given at dusk (any time before midnight), the night resolves at midnight, the Dawn Report is read next visit. | `giveOrders`, `reconcile`, `NightResult` |

## The Night

| Word | Meaning | Code |
| --- | --- | --- |
| **Omen** | One card a night from the Tarot of the Damned (30 in `omens.json`), the same for every warband. Carries a `tilt` per errand from -2 to +2. Images in `public/curfew/omens/`, rendered by `scripts/curfew/`. | `omenForNight`, `OMENS` |
| **Errand** | What a member is sent to do: scavenge, carouse, train, spy, pray, trade, and dredge (Fussenbach only). Which are open depends on the place. | `Errand`, `ERRANDS`, `ERRAND_LABEL`, `isErrandAt`, `errandAt` |
| **The Watch** | The orders control in the Ledger: one control per member, up to `membersPerNight` (2) go out. Changing it saves at once. Also "the Night Watch" is the Cryer's heading for the nights' dispatches, and "the Village Watch" is Fussenbach's guard. | `Order`, `giveOrders`, `availability` |
| **Resting, Recovering, Kept** | Resting: went out last night, stays home tonight. Recovering: injured in the most recent battle report, stays home until the player marks them fit. Kept: a road taken or a curse keeps them home for a run of nights, with the reason shown. The dead stay home. | `restingMembers`, `recoveringMembers`, `keptMembers`, `heal`, `injuredInLastBattle` in `roster.ts` |
| **Standing orders** | No separate setting. On a night with no new selection, the last selection goes out again at half yield, no tokens, no edge. Results carry `standing: true`. Before any selection, the first two available members go out on the errand their role suggests. | `standingOrders`, `lastGivenOrders`, `defaultErrand` |
| **Tilt** | Omen tilt, plus one for the Moon's favoured errand, plus the edge, clamped to ±3. Each point shifts the odds eight points. | `tiltFor`, `rollOutcome` |
| **Edge** | A member who is their warband's best hand at an errand's characteristics (`ERRAND_STATS`) adds one or two points of tilt (▲, ▲▲). Measured within the warband, never a penalty, ignored on standing orders. | `statEdge`, `statMargin`, `statBaseline`, `EDGE_MAX` |
| **Outcome** | boon, fair or poor. About a quarter boon, a third poor, the rest fair, before tilt. | `Outcome` |
| **Dawn Report** | The prose for a resolved night: a header naming the night and the Omen, one or two sentences per member sent, a physical detail, sometimes a closer, then the ledger line. | `NightResult` (`header`, `results[].prose`, `detail`, `closer`, `ledger`) |
| **Ledger line** | The single line of mechanics under the prose, middle dots between items, no verbs. | `NightResult.ledger` |
| **Quiet night** | Nobody went out. | `quietNight` |
| **The Return** | A gap longer than `returnAfterNights` (7) collapses into one vignette and Favour primed to 20. Nothing is lost but opportunity. | `returnNight`, `reconcile` |
| **Rumour** | From Spy on a boon or fair night; warm for `rumourWarmNights` (7). Drawn from the pack's `rumours`, filled with `{rival}`. | `WarbandState.rumours` |
| **Rival** | The other warbands. With several, the night picks one to be the rival its vignettes speak of. | `rivalsOf` in `roster.ts`, `ResolveInput.rival` |
| **Encounter** | A closing line in a vignette where the rival crosses the member's path, about one night in seven, never on standing orders. | pack `encounters`, `{rivalMember}` |
| **Line, avoid** | Each result records which template it came from; the ledger hands the engine the last ten nights' lines and a repeat is redrawn a few times. | `OrderResult.line`, `ResolveInput.avoid`, `recentLines`, `AVOID_LINES_NIGHTS` |

## Currencies and the Hand

| Word | Meaning | Code |
| --- | --- | --- |
| **Favour** | "The city's regard." 0 to 100, soft cap `favourSoftCap` (60); past the cap the yield halves and the surplus becomes Renown. Spent at the Eve on one flourish (`flourishCost`, 25). | `HandState.favour` |
| **Shards, the green** | Wyrdstone from Scavenge and Dredge. Never rot; five convert to a Market token when Trade succeeds. | `HandState.shards`, `convertedShards` |
| **Renown, a name** | Permanent. Buys titles only. | `HandState.renown`, `TITLES`, `titleFor`, `nextTitle` |
| **Title** | The warband's Renown rank: Newcomers, Sifters, Ratcatchers, Confessors, Pit-Dogs, The Named, Those Who Stayed. The warband card on the main site carries it as "the tavern title". | `campaign.json` `titles`, `WarbandStanding.title` |
| **Token, charm** | The same thing; the interface says charm. Four types: Fortune, Ground, Market, Sight. A token with a `location` only turns up there. | `TokenDef`, `TOKENS`, `TOKEN_TYPES`, `tokensFor`, `tokenById` |
| **The Hand** | At most `HAND_SIZE` (3) tokens, one per type. Curated, not grown. | `HeldToken`, `handHas`, `applyNight` |
| **Offer** | A token that does not fit is offered against the held one of its type. One decision per type, the newest find wins, never a charm against itself. Settled in two steps in the interface. | `TokenOffer`, `normalizeOffers`, `settleOffer` |
| **Curse** | In `tokens.json` `curses`, with `nights` and `effects`. Never dropped by dice or absence; arrives only on the bad branch of a risk road at a crossroads. Stands on the ledger as an **affliction** for its nights; the Eve names any still standing. | `CURSES`, `curseById`; `WarbandState.afflictions`, `afflictionsAt` |
| **Crossroads** | About one night in five (`crossroadsChance`), one member out on real orders meets one: the Dawn Report stops and the player chooses a **road** at dawn. Never on standing orders, twice running, or twice in a season. Undecided at the next midnight, the character takes the `default` road. Content per place (`crossroads`, `undecided`, `markNames`); the night stores what was met and, once decided, the road, its words and its ledger line. See `src/data/curfew/CROSSROADS.md`. | `Crossroad`, `Road`, `CrossroadsMet`, `takeRoad`, `defaultRoad` in `engine.ts`; `decide`, `settleWaiting`, `waitingCrossroads` in `ledger.ts`; `decide` action |
| **Mark** | A permanent, named note on a warrior from a road taken; shown in their story and able to open or close later crossroads (`requires.mark`, `requires.notMark`). | `WarbandState.marks`, `RoadEffects.mark`, the pack's `markNames` |
| **Carry** | A road reaching into tonight: a tilt on that member's errand, or a night kept home. Consumed by the night it names. | `WarbandState.carry`, `WarbandState.kept`, `ResolveInput.carry` |
| **Epithet** | A member who features in `epithetAfterEntries` (5) entries earns one from the pack's `epithets`, by the errand they did most. The Cryer prints it. | `epithetFor`, `WarbandState.epithets` |

## The Eve of Battle

| Word | Meaning | Code |
| --- | --- | --- |
| **The Eve** | `/curfew/eve/`, opened by the player the night before a real game. Charms are brought or left behind; what is left is lost. | `layTable`, `fightDone`, `putBack`, `EveSession`, `EveRecord` |
| **Flourish** | One per Eve for 25 Favour: name the field, plant a headline, a weather line, or a dedication to one of the dead. | `Flourish` |
| **Headline (planted)** | A flourish that the Cryer prints, keyed by night. Not the same as a Cryer headline template. | `Headline` in `ledger.ts`, `WarbandState.headlines` |
| **Ticket** | `EVE-2-K7Q1P`: shown to the rival, reveals how many charms, not which. | `eveTicket`, `readTicket` |
| **The City Provides** | An empty Hand at the Eve is dealt one token from the place's pool. | `cityProvides`, `cityProvidesLine`, `provideIfEmpty` |
| **The fight is done** | Consumes the charms and writes a line; "put the charms back" reopens the table, spent Favour does not return. | `fightDone`, `putBack` |

## Ledgers and the server

| Word | Meaning | Code |
| --- | --- | --- |
| **Ledger** | A warband's whole Curfew state, stored as one JSON row with a `version` for optimistic locking. Also the page at `/curfew/`. | `WarbandState` in `ledger.ts`; `curfew_ledgers` in `schema.ts` |
| **Keeper** | The player who claimed a warband's ledger. One player, one warband; one warband, one keeper. | `claimWarband`, `releaseWarband`, `listClaims`, `Claim` |
| **Burn** | Reset a ledger to fresh. From the Ledger's footer by the keeper, or from the Watch House. | `actions.reset`, `burnLedger` |
| **Reconcile** | Write every dawn still due up to today. Every read reconciles first; every write is load, reconcile, change, save under a version check, then publish dispatches. | `reconcile` in `ledger.ts`; `withLedger`, `reconcileAll` in the service |
| **Midnight, the cron** | The nightly run over every ledger, `/api/cron/midnight`, guarded by `CRON_SECRET`, scheduled in `vercel.json` at 23:15 UTC. Also run by hand from the Watch House. Every run is logged. | `reconcileAll`, `runMidnight`, `curfew_runs` |
| **LedgerView** | What every Curfew API action answers with: the whole ledger view, never a partial. | `LedgerView`, `actions` in the service |
| **LedgerError** | The refusal type. Its `message` is shown to the player as written and its `status` becomes the HTTP status. | `LedgerError` in `ledger.ts` |
| **Dispatch** | A row the Town Cryer may print. Kinds: `headline` (a title change, an epithet, a planted flourish, an arrival), `happening` (one member's night, chosen by seeded dice), `notice` (posted by the Watch). `key` makes writing idempotent. | `Dispatch`, `dispatchesForNight`, `happeningFor` in `cryer.ts`; `cryer_dispatches`; `recentDispatches` |
| **The Watch (as author)** | Notices posted from the Watch House carry the warband id `the-watch`. | `THE_WATCH`, `postNotice`, `dispatchSource` |
| **Nights in the City** | A member's Curfew story on their profile, and a warband's standing on its card, read from the ledgers. | `memberNights`, `warbandStandings` in `story.ts`; `curfewStory` |
| **Viewer** | The signed-in user. | `getViewer` in `session.ts` |
| **Reset word** | Three words and a tail, issued by the game master, hashed like a password, good for 48 hours, spent on use. The only way to reset a forgotten password; there is no email. | `issueResetWord`, `resetWithWord`, `curfew_recovery` |
| **Dev sign-in, Local player** | A name-only sign-in that exists only off Vercel. Two names make two players. | `env.DEV_LOGIN`, `DEV_LOGIN_PASSWORD` |
| **Debug strip** | Previous and next night buttons and a date picker in the Ledger's footer, shown to game masters; on everywhere unless `CURFEW_DEBUG=false`. Its per-device switch lives in `localStorage`; while it is on, a `curfew-dry` cookie makes every request a **dry run**. | `src/curfew/debug.ts`, `env.CURFEW_DEBUG` |
| **Dry run** | With the strip on, the server computes a game master's request in memory from a sandbox the browser carries (`dry.base`, kept in `sessionStorage`) and saves nothing, publishes nothing. Needs `CURFEW_DEBUG`, a game master and the cookie. The strip says how far the sandbox is ahead of the real ledger and what the Cryer would print. | `src/server/curfew/dry.ts`, `DryRun` and `look` in the service |
| **PGlite** | The in-process Postgres under `.pglite/` that `astro dev` uses with no `DATABASE_URL`, and that the service tests use in memory. | `env.LOCAL_DB`, `src/server/db/client.ts` |

## Places

| Word | Meaning | Code |
| --- | --- | --- |
| **Location, place, pack** | A content pack in `src/data/curfew/locations/<id>.json`: which errands are open, templates, points of interest, rumours, epithets, Moon tie-ins, encounters, the Cryer's masthead and headlines. Mordheim and Fussenbach today. | `Location`, `LOCATIONS`, `locationById`, `DEFAULT_LOCATION` |
| **Move, the move log** | Where the campaign is, as a log of (location, from night). The place of any night is the latest move on or before it, so a written night is never rewritten. Written only from the Watch House. | `Move`, `locationForNight`; `curfew_moves`; `moveCampaign`, `campaignMoves`, `currentLocation` |
| **unavailable, redirect, inherits, moonBoost** | Pack fields: the line shown for an errand the place lacks; where an order for it goes instead; which errand's Omen tilt and Moon favour a local errand borrows; where a Moon's favour goes when the place lacks its errand. | `unavailableReason`, `errandAt`, `tiltFor`, `moonBoostAt` |
| **Arrival** | The pack's headline planted in the Cryer the first night a warband spends in a new place. | pack `arrival`, `lastLocationId` |
| **District** | A place within the place, filled into `{district}`. A village's districts are its pub, shrine, wharf and surroundings. | pack `districts` |
| **Blurb, watch note** | The one-line description of an errand in the Watch, and the note under the place's name. | pack `blurbs`, `watchNote`, `blurbFor` |

## The main site

| Word | Meaning | Code |
| --- | --- | --- |
| **Town Cryer** | The parchment broadsheet at the top of the main site. Prints the `news.ts` articles tagged for where the campaign is, then the nights' dispatches. Masthead, banner, price and headings come from the pack's `cryer`. | `src/components/TownCryer.astro`, `issueFor` in `news.ts` |
| **Article, notice** | A `NewsArticle`; `notice: true` prints as a boxed notice with no byline. | `src/data/news.ts` |
| **Chronicle** | Two things. On the main site, the timeline of battles (`chronicle.ts`, `Chronicle.astro`), one entry per scenario. In the Ledger, the warband's scroll of nights. | `ChronicleEntry`; `WarbandState.nights` |
| **Battle report, scenario record, the archives** | One JSON file per real game in `src/data/history/`, rendered at `/scenarios/<id>/`. Carries a snapshot of every participating warband and member. | `ScenarioRecord`, `history` in `src/data/history.ts` |
| **Muster, roster** | A warband's members as listed in `warbands.ts`; the "muster roll" is the member list on the card, the "muster" section on a scenario page is the snapshot. | `Warband.members`, `WarbandCard.astro` |
| **Standings** | The table of rating, battles, wyrdstone and gold. Hand-kept numbers in `warbands.ts`, not computed. | `Standings.astro` |
| **Graveyard** | Tombstones for members with `dead: true`, ordered by `death.order`, plus procedurally generated nameless graves. | `Graveyard.astro`, `Member.death` |
| **Portrait, sigil, crest** | `portrait` and `sigil` are two-letter monograms; `crest` is an optional image file in `public/` drawn where there is room. | `Member.portrait`, `Warband.sigil`, `Warband.crest` |
| **Profile, member dialog** | One `<dialog>` holds every member's profile: statline, gear, lore, the battles from the archives and the nights from the ledger on one line by date. | `MemberModal.astro`, `getMemberStory` |
| **The Watch House** | `/admin/`, the game master's console. Admission by `ADMIN_EMAILS`; under the dev sign-in everyone is admitted. | `src/pages/admin/index.astro`, `src/server/admin/` |
| **Game master** | The person who runs the campaign. Issues reset words, moves the campaign, posts notices, burns ledgers. Everything a game master authors is source, not database. | `isAdminEmail` |
