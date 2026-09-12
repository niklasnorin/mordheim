# THE CROSSROADS

## A proposal: choices the warband made last night, decided this morning

Proposal, 12 September 2026. Not decided. Written to fit the plan (`PLAN.md`) and the code as they stand on Night 3; §9 says what it would cost. If taken, it becomes a phase in the plan's table and this file is folded into it.

---

## 1. The pitch

Some nights, one of the members sent out comes to a crossroads. The rake catches a ring with a hand still in it, and Old Henrik is watching from the bank. A Sister's candle is the only light between a beggar and the Watch. The rival's lookout has fallen asleep at his post.

The Dawn Report inks in as far as that moment and stops. Two or three sentences say what {first} could do. The player decides at dawn, on their character's behalf, and the report finishes: what it brought, what it cost, and what {first} is now known for. The choice is written into that warrior's story for good, and it can reach into tonight.

Most crossroads are hard. Both roads cost something, and the city never says which was right. A few are light: which door, what to call the dog. None is a trap.

---

## 2. What it keeps

The pillars hold, and two are sharpened.

- **One night per day, two minutes, top to bottom.** At most one crossroads waits for a player on any morning. Deciding it is one tap and a confirm, and it sits where the Dawn Report already is: the first thing read.
- **The city takes nothing from the absent.** A crossroads nobody decides is decided by the character at the next midnight, along the road that risks nothing. Absence costs the chance of the other road, never more.
- **Power is capped. Story is not.** No road changes more than a good night brings. What lasts is a *mark* on the warrior, a line in their story, and sometimes a headline.
- **Every result is a story.** The choice is prose. The ledger line comes after, as it does now.
- **Opt-in risk is where the curses come from.** The plan reserves curses for opt-in risk in the mini-games (`§3`, `§11`). A risk crossroads is opt-in risk without a mini-game: this is the door the four curses in `tokens.json` have been waiting for.

---

## 3. When a crossroads arises

Seeded and deterministic, inside `resolveNight`, from the same draw as the rest of the night. So the same orders on the same night at the same place always meet the same crossroads, on every machine, which is what keeps the cron and a visit honest with each other.

- About **one night in five** (`crossroadsChance` in `campaign.json`, 0.2 to start; the first Moon of play tunes it). With two out on real orders that is one or two a Moon per warband.
- It attaches to **one member**, the first in the orders whose errand has a crossroads to offer at this place.
- **Never** on standing orders, never on a quiet night, never in The Return, never two nights running for the same warband (`cooldown` of one night), never the same crossroads twice in a season for the same warband (the ledger keeps `crossroads.seen`).
- Tilt does not change the odds of a crossroads. The Omen and Moon may **colour** which one: a crossroads can require a Moon, an Omen, an outcome (a poor night meets different crossroads than a boon), a mark the member already carries, or a standing with one of the place's names (§5).
- The night's outcome, yields and the first sentence are resolved as they are now. The crossroads replaces the member's **second** sentence and suspends the closing line and the ledger line until it is decided.

---

## 4. The shape of a crossroads

A crossroads is content, authored in the place's pack (`locations/<place>.json`, a new `crossroads` list), because it is exactly what a game master would write. Which crossroads a night met and what the player chose is what a night produces, so that goes in the ledger (database). The split follows the content model in `CLAUDE.md`.

```jsonc
{
  "id": "the-ring-in-the-silt",
  "kind": "moral",                        // moral | risk | loyalty | lore | light
  "errands": ["dredge"],
  "outcomes": ["fair", "boon"],           // optional: only after these outcomes
  "requires": { "moon": ["debtors-moon"], "mark": [], "standing": {} },   // all optional
  "weight": 2,
  "setup": "At the third basin the rake caught a ring, and a finger still in it. Old Henrik was on the bank, not looking away.",
  "options": [
    { "id": "keep",  "label": "Keep the ring. Say nothing.",
      "outcome": "{first} worked the ring free and the finger went back in the silt. Henrik nodded once, as if agreeing a price.",
      "effects": { "shards": 1, "renown": -2, "mark": "kept-the-ring", "standing": { "old-henrik": 1 } },
      "headline": null },
    { "id": "morr",  "label": "Take it to Morr's Garden.",
      "outcome": "{first} carried it up to the Garden in {their} cap. The priest did not ask where. Nobody pays for that kind of honesty, but it was seen.",
      "effects": { "favour": 3, "mark": "gave-morr-his-due", "standing": { "morrs-garden": 1 } },
      "headline": "{first} of {warband} seen at Morr's Garden before dawn, carrying something small." },
    { "id": "leave", "label": "Leave it where it lies.", "default": true,
      "outcome": "{first} pushed it back under with the rake and finished the row. The basin keeps what it keeps.",
      "effects": {} }
  ]
}
```

Rules for writing them belong in `STYLE.md`:

- **Two or three roads, never one.** Labels are what the character does, present tense, four to eight words. Never "Good" and "Evil". Never a question.
- **Hard means both roads cost.** Shards now against a name later. The warband against the self. The safe road against the one that might bring a curse home. Roughly equal in expectation, different in shape.
- **The default road is the one that risks nothing.** It is marked `default` and is what the character does when nobody decides. It may still be the wrong thing morally; it is never the poorer thing mechanically.
- **The city never judges.** The outcome sentence says what happened and what was seen. No adjectives about the choice.
- **Plots are hinted, never told.** A crossroads is the best place to brush against Warehouse 4 or the coat in the cemetery. It still explains nothing.
- **Kinds, by weight:** moral 50, risk 20, loyalty 15, lore 10, light 5. So most are hard, not all.

---

## 5. Consequences

Four kinds, from smallest to longest-lived. A road may carry any of them; most carry two.

**Tonight's ledger line.** The road's `effects` land on the night being decided: Favour (±2 to ±8), shards (0 to 2), Renown (±1 to ±5; moral roads often trade Renown, because being seen is what Renown is), a charm (through the offer rule as now, never bypassing the Hand), a rumour. Bounded by the rule of thumb: no road moves more than a good night brings.

**Tonight, still to come.** `carry`: the road can tilt that member's errand tonight by ±1, or send them back (a **forced errand** tonight: "{first} has to go back to the wharf"), or keep them home (`staysHome: 1`). The Watch shows the reason in the member's row, in the pack's words. This is how a morning's choice reaches the next night's outcome. Whether forcing an errand is too heavy is a decision for you (§10).

**A curse.** Risk roads only, and only the bad branch of a risk road, which is itself a seeded draw made when the road is taken (a *risk* road says "You may lose the ring, or the hand": the player chooses the risk, the dice choose which). Curses are the four already in `tokens.json`, given a home: `afflictions` on the ledger, per member, with a night count. Wyrdstone Cough is cosmetic and feeds the prose. Hungover keeps a member home a night. Marked costs Renown and prints a headline. Swindled costs shards. Each fades in three to seven nights and the Eve names any still standing, since the table should know.

**A mark.** Permanent, narrative, on the warrior: `marks[memberId]` as a list of ids with the night. Marks do three things. A later crossroads can require one (a **callback**: the beggar {first} passed on the Steps is at the door on the Silent Moon). Epithets can weigh them (`kept-the-ring` twice and the taverns have a name for you). The warrior's story shows them under the timeline, as the choices they made, in the pack's words.

**Standing (second step).** Some roads move a counter with one of the place's names: Old Henrik, Sister Agathe, the Man in Grey, the Baron's clerk, Morr's Garden. Standing is −3 to +3 per name, per warband, kept on the ledger. It tilts the errand that name is tied to by one point at the extremes, gates crossroads, and is how `patrons.json` and the village's five plots finally enter play without a contracts system. Worth doing, but after the first step has been played a Moon.

What a road **never** does: touch the roster (wounds, gold, equipment are source and battle reports), touch another warband's ledger (see §8), or change a night already written.

---

## 6. Deciding at dawn

- The Dawn Report inks in to the crossroads and stops. Under it, a card in the offer's dress: the setup, then the roads as buttons. One tap marks a road; a confirm sentence names what it costs in words ("Keep the ring. Henrik will remember."). Nothing is decided until the confirm; a reload clears the mark. This is the offer's two-step, reused.
- On confirm the outcome sentence and the ledger line ink in, and the rest of the page updates as any action does (the API always answers with the whole ledger).
- An undecided crossroads is decided by the default road at the next midnight, before that night resolves, so `carry` still works. The outcome then opens with a line from the pack's `undecided` bank: "There was nobody to ask. {first} kept walking." Not a scolding.
- When several nights are written at once (a player away), every crossroads but the last night's is defaulted on the spot. Only one ever waits.
- A crossroads does not block the Watch, the Eve or anything else. It only holds its own night's last lines.

---

## 7. Where it shows

- **The Ledger:** as above. The Chronicle shows decided crossroads with the road taken in italics after the vignette.
- **The warrior's story** (`story.ts`, `MemberModal`): a night with a crossroads reads "…chose to keep the ring." A short **Marks** line under the timeline lists what the warrior is now known for, from the pack's `markNames`.
- **The Town Cryer:** roads may carry a `headline`; a decided road with one is a `happening` under the existing key scheme (`{warband}:{night}:x`) and prints where the night happened. Undecided nights print nothing; the default road rarely has a headline.
- **The Watch House:** the ledger table gets a "waiting" flag for an undecided crossroads, and the ledger inspector lists the choices made, by night. A game master at the table can read a warband's Moon of decisions in a glance.
- **The Eve:** names any curse still standing. Nothing else changes.

---

## 8. How it is built

Everything here keeps resolution a pure function of (campaign, night, warband, orders, location) plus, now, the decisions already taken.

- `engine.ts`: `resolveNight` may attach `crossroads: { id, memberId, setup, options: [{ id, label }] }` to a `NightResult`, drawn from `location.crossroads` filtered by errand, outcome, Moon, Omen, marks, standing, `seen`, and the cooldown, with the same `avoid` steer as lines. **Effects are not stored on the night**; they are read from the pack at decision time, and any dice inside a road (the risk branch) are seeded by (campaign, warband, night, crossroads id, road id). So the ledger view sent to the browser carries the labels and nothing a player could peek at.
- `ledger.ts`: `decide(state, warband, night, roadId, location)` refuses if nothing waits, if the night is not the one waiting, or if it was already decided (`LedgerError('That was decided.')`); applies effects, appends the outcome and the ledger line to the night, pushes rumours, headlines, marks, afflictions and `carry`, runs `normalizeOffers`, records `seen`. `reconcile` defaults any waiting crossroads before resolving the next night, and `availability` learns `afflicted` and `carried` as reasons. `statEdge`'s tilt gains the `carry` point.
- `WarbandState` goes to `version: 2` with `marks`, `afflictions`, `standing`, `carry`, `crossroads.seen`. **`coerceState` today starts a ledger afresh on any version but 1**; it needs a 1→2 step that keeps every night. That is a test before it is code.
- `cryer.ts`: `dispatchesForNight` skips an undecided night's happening; `decide` publishes it.
- `service.ts`: one new action, `decide: { night, roadId }`, through `withLedger` as the others. The cron needs nothing new: defaulting is part of `reconcile`.
- Content: Fussenbach first, about twenty-four crossroads (four to five per errand, a handful tied to the plots and the Moons, three or four callbacks), `undecided` lines, `markNames`. Mordheim gets a dozen alongside the pack sizing already on the housekeeping list.
- Tests, beside the code as now: a crossroads is met deterministically and never on standing, quiet or Return nights; the cooldown and `seen`; `decide` applies each kind of effect; the default at the next reconcile, including many nights at once; `carry` changes tonight's tilt; an affliction fades; the 1→2 migration keeps a ledger whole; the Cryer waits for the decision; the API round trip.

---

## 9. Size and order

| Step | Scope | Effort |
|---|---|---|
| **A. The crossroads** | Engine, ledger, API, the card in the Dawn Report, marks and immediate effects and `carry` tilt, the story line, the Cryer headline, the Watch House flag, the migration; twenty-four Fussenbach crossroads of the moral, loyalty, lore and light kinds | About a week of evenings, half of it writing |
| **B. Risk and callbacks** | Risk roads with the seeded bad branch, afflictions with fading and the Eve's line, `staysHome` and forced errands, callback crossroads on marks | A few evenings |
| **C. Standing** | Standing with the place's names on the ledger, its tilt and its gates, `patrons.json` wired in, a dozen crossroads that move it | A few evenings, mostly writing |
| **D. The rival** | A road that touches the rival warband (warn them, rob them, leave them) whose consequence lands in the rival's *story* by dispatch, never their ledger | Later, with Phase 3 |

Step A is worth doing before Phase 2. It gives the nights a second decision a Moon without a mini-game, it turns the plots from set dressing into something a player has touched, and it uses curses as the plan intended. In the plan's table it is **1e — The Crossroads**, after the first Moon of play has been read.

---

## 10. Decisions to take before building

1. **The name.** The Crossroads is the working one. "What {first} did" is the card's heading.
2. **How far a choice reaches into tonight.** A tilt only, or also a forced errand and a night at home. My recommendation: tilt and a night at home in step A, forced errands in step B once the Watch has shown the reason well.
3. **Whether marks are shown to other players.** The warrior's story is public on the campaign site, so marks will be read by the rival. I would keep that: being known for a thing is the point. The alternative is marks on the Ledger only.
4. **Whether a game master may plant a crossroads for one night.** Per the content model, not from the Watch House. A `night` field on a crossroads in the pack does the same thing as a commit, and keeps the record in source.
5. **Odds.** One in five, or one in four. Play a Moon with one in five first.

---

## 11. Three more, to hear the voice

**Carouse, loyalty, Fussenbach.** *Setup:* "In the Flagon a Watch sergeant, deep in his cups, said the name of a man in {warband} and a price for it. He meant {other}." *Roads:* "Buy him another and hear the rest." (rumour, Renown −1, mark `listened`) · "Take {other} home before he hears." (Favour −3 for the drinks unpaid, mark `stood-by-them`, standing Watch −1) · default "Finish the cup and go." · *undecided:* "Nobody said anything. The sergeant fell asleep."

**Pray, risk, anywhere.** *Setup:* "The candle guttered at the third hour and something at the back of the shrine breathed in. Sister Agathe said the word for it was 'stay'." *Roads:* "Stay until dawn." (risk: seeded, either Favour +6 and a Fortune charm, or Wyrdstone Cough for five nights; mark `kept-vigil` either way) · default "Snuff the candle and go." · *undecided:* "The candle was out when they looked again."

**Spy, light, Fussenbach.** *Setup:* "A dog followed {first} from the mill to the wharf and would not be sent home. It is under the table now." *Roads:* "Keep it. Name it." (mark `has-a-dog`; the pack's later vignettes may use `{dog}`) · "Give it to the miller's girl." (Favour +1) · No default: a light crossroads undecided is decided by the dog.

---

*The city does not ask what you would have done. It writes down what {first} did.*
