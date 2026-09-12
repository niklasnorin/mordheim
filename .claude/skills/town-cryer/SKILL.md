---
name: town-cryer
description: Write a Town Cryer article or notice in src/data/news.ts, in the broadsheet's deadpan voice, tagged for the place the campaign is in. Use when asked to "put it in the Town Cryer", "write an article about", "announce", "post a notice of reward", or to report a campaign event on the front page.
user-invocable: true
argument-hint: "[what happened, and where]"
---

# Write for the Town Cryer

Articles are source: entries in `news` in `src/data/news.ts`, printed by `src/components/TownCryer.astro` for the place the campaign is currently in. What the nights produce (title changes, epithets, happenings) arrives as dispatches from the database and never goes in `news.ts`; a notice the game master wants to post tonight and forget goes through the Watch House, not the source.

## The voice

`docs/agents/writing.md` §2 in full. In short: an Imperial broadsheet whose correspondent would like to survive the week. Headline in Title Case with a semicolon turn; a byline with a self-preserving aside or a named citizen with a title; one paragraph of 80 to 150 words that reports rumour as rumour, attributes every claim, quotes the official denial, and ends on a dry turn. Nothing is explained, nothing is resolved, no exclamation marks. A notice is `notice: true`, headline in capitals, empty byline, imperative body, sting last.

Two from the file, for calibration:

> **Teal-Bannered Dwarfs Enter Mordheim; Purpose Filed Under “Old Business”** — By our correspondent at the eastern gate, from a respectful distance

> **BY ORDER OF THE BARON** — "…This notice does not carry the signature of Captain Hauer, who was not asked."

## Steps

1. Decide the place. `location: 'fussenbach'` for the village; omit it for Mordheim. An article for a place the campaign is not in simply waits until the game master moves there. An arrival that could happen in either place gets one article per place, reworded for each.
2. Write it. Use typographic apostrophes (’) inside single-quoted strings to avoid escaping; British spelling.
3. Place it. The array prints in order, and the file keeps Mordheim's articles first and Fussenbach's in a block below the `// ── Fussenbach ──` comment. Put a new lead story at the top of its place's block and notices at the end of it.
4. If the article introduces a new place, add its edition name to `editions` in the same file (`fussenbach: 'Fussenbach Edition'`) and see the `curfew-pack` skill for the pack itself.

## Verify

```sh
npm run check
```

In `npm run dev`, open `/`. If the campaign is in another place locally, move it from `/admin/` to preview, then move it back. The broadsheet prints the article with its byline, or the notice boxed, and the masthead still names the current place.

## Pitfalls

- Narrating the battle: that is the archive's job (`record-battle`). The Cryer announces, hints and misreports.
- Naming what a rumour means. Somebody says what they saw; the paper prints that they said it.
- Using "days", "weeks", "months" in the Curfew's own copy: allowed in the Cryer, which is a newspaper, but keep the Curfew's prose to nights and Moons.
- An article with `location` set to an id that has no pack: it never prints anywhere.
