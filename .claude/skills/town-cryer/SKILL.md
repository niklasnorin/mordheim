---
name: town-cryer
description: Write a Town Cryer article or notice in the Watch House's Articles panel, in the broadsheet's deadpan voice, for the place the campaign is in. Use when asked to "put it in the Town Cryer", "write an article about", "announce", "post a notice of reward", or to report a campaign event on the front page. Also covers the seed fixture in src/data/news.ts.
user-invocable: true
argument-hint: "[what happened, and where]"
---

# Write for the Town Cryer

Articles live in the database and are written by game masters at `/admin/#articles` (service `src/server/campaign/news.ts`, API `article-create`, `article-update`, `article-delete` in `src/pages/api/admin/[action].ts`). The broadsheet on `/` prints the published articles for the place the campaign is currently in, lowest order first. What the nights produce (title changes, epithets, happenings) arrives as dispatches and is never an article; a notice the game master wants to post tonight and forget is **Post a notice** in the same section, printed under its own heading.

## The voice

`docs/agents/writing.md` §2 in full. In short: an Imperial broadsheet whose correspondent would like to survive the week. Headline in Title Case with a semicolon turn; a byline with a self-preserving aside or a named citizen with a title; one paragraph of 80 to 150 words that reports rumour as rumour, attributes every claim, quotes the official denial, and ends on a dry turn. Nothing is explained, nothing is resolved, no exclamation marks. A notice is ticked **A notice**: headline in capitals, empty byline, imperative body, sting last.

Two from the seed, for calibration:

> **Teal-Bannered Dwarfs Enter Mordheim; Purpose Filed Under “Old Business”** — By our correspondent at the eastern gate, from a respectful distance

> **BY ORDER OF THE BARON** — "…This notice does not carry the signature of Captain Hauer, who was not asked."

## Steps

1. Decide the place: Mordheim, Fussenbach, or any place since added in `/admin/content/`. An article for a place the campaign is not in simply waits until the game master moves there. An arrival that could happen in either place gets one article per place, reworded for each.
2. Write it in the form: headline, byline, body, place; tick **A notice** if it is one. Typographic apostrophes (’), British spelling. Leave **Published** unticked to hold it back.
3. Read it once more against the voice, then **Set in type**. Correct it later from its own drawer in the list; **Pull** removes it for good.

## Seeding an empty database instead

`src/data/news.ts` is imported once into an empty database. Add there only for a fresh deployment; editing it changes nothing on a seeded database.

## Pitfalls

- Narrating a battle: articles announce; the battle is the scenario page's job.
- Resolving a plot or stating what the reader should conclude: the Cryer reports and withdraws.
- An article for a place that is not on the map: refused; add the place's document first.
