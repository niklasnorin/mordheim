# Mordheim — City of the Damned

A grimdark, interactive campaign chronicle for our Mordheim game group, built with [Astro](https://astro.build) and hosted on GitHub Pages.

**Live site:** https://niklasnorin.github.io/mordheim/

## Features

- 🌧 Rainy, moody atmosphere — canvas rain, flying crows, drifting fog, and distant lightning
- 📰 **Town Cryer** — a parchment broadsheet with news from the City of the Damned
- ⚔ **Warbands** — rosters with clickable warrior profiles (statlines, equipment, skills, and lore)
- 🏆 **Campaign Standings** — ratings, battles, wyrdstone, and gold
- 📜 **The Chronicle** — a timeline of campaign events

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

## Deployment

Pushes to `main` are automatically built and deployed to GitHub Pages via `.github/workflows/deploy.yml` (official Astro action). In the repository settings, set **Pages → Source** to **GitHub Actions**.

---

*A fan-made, non-commercial hobby project. Mordheim is © Games Workshop.*
