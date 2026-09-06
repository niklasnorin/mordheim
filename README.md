# Mordheim — City of the Damned

A grimdark, interactive campaign chronicle for our Mordheim game group, built with [Astro](https://astro.build) and hosted on GitHub Pages.

**Live site:** https://niklasnorin.github.io/mordheim/

## Features

- 🌧 Rainy, moody atmosphere — canvas rain, flying crows, drifting fog, and distant lightning
- 📰 **Town Cryer** — a parchment broadsheet with news from the City of the Damned
- ⚔ **Warbands** — rosters with clickable warrior profiles (statlines, equipment, skills, and lore)
- 🏆 **Campaign Standings** — ratings, battles, wyrdstone, and gold
- 📜 **The Chronicle** — a timeline of campaign events
- ⚔ **Battle reports** — open any Chronicle chapter or warrior story entry for scenario outcomes, paired warband prologues and epilogues, the battle narrative, campaign consequences, and every participant's accomplishments

## Development

```sh
npm install
npm run dev       # start local dev server
npm run build     # build static site to ./dist
npm run preview   # preview the production build
```

## Updating campaign content

All content lives in plain TypeScript data files — no HTML editing required:

| File | Contents |
| --- | --- |
| `src/data/warbands.ts` | Warbands, members, statlines, equipment, lore |
| `src/data/news.ts` | Town Cryer articles and notices |
| `src/data/chronicle.ts` | Campaign timeline entries |
| `src/data/history/*.json` | Per-scenario battle reports and snapshots: narratives, outcomes, loot, campaign consequences, and every participant's stats, highlights and lowlights |
| `src/data/history.ts` | Types and helpers (`getMemberStory`, `getWarbandStory`) to follow any warrior or warband across the campaign |

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
