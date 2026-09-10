# Mordheim — City of the Damned

A grimdark, interactive campaign chronicle for our Mordheim game group, built with [Astro](https://astro.build) and hosted on GitHub Pages.

**Live site:** https://niklasnorin.github.io/mordheim/

## Features

- 🌧 Rainy, moody atmosphere — canvas rain, flying crows, drifting fog, and distant lightning
- 📰 **Town Cryer** — a parchment broadsheet with news from the City of the Damned
- ⚔ **Warbands** — rosters with clickable warrior profiles (statlines, equipment, skills, and lore)
- **Quick reference** — persistent section navigation, compact mobile rosters, scrollable standings with pinned warband names, and accessible warrior dialogs with stat definitions
- 🏆 **Campaign Standings** — ratings, battles, wyrdstone, and gold
- 📜 **The Chronicle** — a timeline of campaign events
- ⚔ **Battle reports** — open any Chronicle chapter or warrior story entry for scenario outcomes, paired warband prologues and epilogues, the battle narrative, campaign consequences, and every participant's accomplishments

## CURFEW — nights between games

[`/curfew/`](https://niklasnorin.github.io/mordheim/curfew/) is a between-games companion. Every real day is one night in Mordheim: at dusk a player gives up to two warband members an errand, at midnight the dice decide, at dawn a short vignette and a ledger line say what it cost. Favour, shards and Renown accrue; the Hand holds up to three charms (one per type) that are laid on the table at [`/curfew/eve/`](https://niklasnorin.github.io/mordheim/curfew/eve/) the night before a real game and spent whether used or not.

There is no server. The site is static, so the Night runs in the browser: the Omen and Moon for a date are a seeded function of the campaign id, and a night's result is a deterministic function of the orders given, so two devices agree on the same dawn. Each player's ledger is kept in their own browser's `localStorage`. Missed nights run on standing orders at half yield; a gap longer than a week collapses into a single Return vignette and nothing is lost but opportunity.

| File | Contents |
| --- | --- |
| `src/data/curfew/campaign.json` | Start date (night 1), members per night, soft caps, thresholds |
| `src/data/curfew/omens.json` | The 30 Omens of the Tarot of the Damned, with readings and errand tilts |
| `src/data/curfew/moons.json`, `tokens.json`, `patrons.json`, `jobs.json` | The weekly Moons, the 12 tokens and 4 curses, and Phase 4 content |
| `src/data/curfew/vignettes.json`, `STYLE.md`, `PLAN.md` | Dawn Report templates, rumours, epithets, Renown titles, the writing style guide, and the implementation plan with phase status |
| `src/curfew/engine.ts` | The pure Night engine: calendar, seeded draws, errand resolution, the Hand |
| `src/curfew/state.ts` | Per-device ledger: orders, reconciliation of passed nights, absence rules, headlines |
| `public/curfew/omens/` | Card images, regenerated with `scripts/curfew/` |

```sh
node --test src/curfew/*.test.ts    # engine and state tests
```

Append `?date=YYYY-MM-DD` to a Curfew URL to view the Ledger as of another night.

## Development

```sh
npm install
npm run dev       # start local dev server
npm run build     # build static site to ./dist
npm run preview   # preview the production build
```

### Design skill

The [Impeccable](https://impeccable.style) design skill is checked in under `.claude/skills/impeccable/` for Claude Code. Start a design task with `/impeccable init` once, then `/impeccable <command> <target>` (for example `/impeccable audit src/pages/curfew/index.astro`). Its launcher downloads a small engine binary on first run. Update it with `npx impeccable update`.

## Updating campaign content

All content lives in plain TypeScript data files — no HTML editing required:

| File | Contents |
| --- | --- |
| `src/data/warbands.ts` | Warbands, members, statlines, equipment, lore |
| `src/data/news.ts` | Town Cryer articles and notices |
| `src/data/chronicle.ts` | Campaign timeline entries |
| `src/data/history/*.json` | Per-scenario battle reports and snapshots: narratives, outcomes, loot, campaign consequences, and every participant's stats, highlights and lowlights |
| `src/data/history.ts` | Types and helpers (`getMemberStory`, `getWarbandStory`) to follow any warrior or warband across the campaign |
| `src/data/curfew/omens.json` | The CURFEW Omen deck: 30 Tarot of the Damned cards with readings and errand tilts; images in `public/curfew/omens/`, regenerated with `scripts/curfew/` |

### Campaign history database

Each scenario played gets one JSON file in `src/data/history/` recording a snapshot of both warbands as they stood after the battle — rating, gold, wyrdstone, and a per-member snapshot of stats, equipment, skills, and status (`active`, `injured`, or `dead`), plus a highlight and a lowlight for every warrior and each warband. Add a new file per scenario and register it in `src/data/history.ts` to extend the storyline.

Each record also includes a `report`:

- `rulebookScenario` is the actual rulebook scenario title, distinct from the campaign chapter title. `winCondition` records its victory requirement, and `outcome` explains who won and how. Use `null` for rulebook details that were not recorded, rather than guessing from the narrative.
- `prologue`, `battle` (a list of paragraphs), and `epilogue` give the neutral account. `perspectives` contains one entry per participating `warbandId`, with its own `prologue`, `epilogue`, and `accomplishments`.
- `loot` records noteworthy rewards and costs; `campaignNotes` preserves deaths, recurring items, lasting consequences, and unresolved or conflicting accounts. Treasury snapshots are totals, not battle rewards.
- `outOfAction` records confirmed takedowns with `attackerId` (a participating member ID), `target` (the opponent's name or a description if unnamed), `detail`, and optionally `targetId` (another participating member ID, for a link). An empty list means no confirmed results were recorded, not necessarily that nobody was taken out. Do not infer a takedown from a hit, a bow notch, or an environmental casualty.

Detail pages are generated automatically at `/mordheim/scenarios/<id>/`. Set the matching `scenarioId` in `src/data/chronicle.ts` to link a listing to its report. Warrior story entries link to the same pages. Existing reports retell the recorded history; unrecorded rulebook details remain explicitly marked as missing.

## Deployment

Pushes to `main` are automatically built and deployed to GitHub Pages via `.github/workflows/deploy.yml` (official Astro action). In the repository settings, set **Pages → Source** to **GitHub Actions**.

---

*A fan-made, non-commercial hobby project. Mordheim is © Games Workshop.*
