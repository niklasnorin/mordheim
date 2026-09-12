# CURFEW — Tarot of the Damned

Renders the thirty Omen cards and the card back for the CURFEW between-games companion as PNG images.

- Deck content: `src/data/curfew/omens.json` (id, numeral, title, reading, per-errand tilt, notes, image path).
- Output: `public/curfew/omens/NN-id.png` (1050×1800, 7:12 tarot ratio), `back.png`, and `deck-sheet.jpg` (contact sheet).

## Regenerating

```sh
node scripts/curfew/render-omens.mjs            # all 30 fronts + back (needs Playwright's Chromium)
node scripts/curfew/render-omens.mjs --only the-comet,back
python3 scripts/curfew/compress-omens.py        # 8-bit palette PNGs (~1.1 MB each) + contact sheet; needs Pillow
```

The renderer draws every card procedurally on an HTML canvas (`lib.js` primitives, `frame.js` layout, `scenes.js`/`scenes2.js` one scene per Omen, `back.js` the card back) and screenshots it headless. Output is deterministic: every scene is seeded by its index.

## The place bands

`render-places.py` cuts the letterhead art the Curfew pages carry: a wide band and a small mark for each place
the campaign can be in, graded so the village and the city read as one night with two different silhouettes.

```sh
python3 scripts/curfew/render-places.py     # needs Pillow
```

- Sources: `public/ruined-city.jpg` for Mordheim, `sources/fussenbach.jpg` for the village (the painting from the
  group's campaign PDF). Crops, grades and sizes are the `PLACES` table at the top of the script.
- Output: `public/curfew/places/<id>-band.jpg` (1100×495, shown as a shorter letterbox) and `<id>-mark.jpg` (96×96,
  the tile beside the night line).
- Where the band is framed once the letterbox crops it is the pack's own business: `art.focus` in
  `src/data/curfew/locations/<id>.json`, an `object-position` value.
- A new place needs a row in `PLACES`, a source image, and its `art.focus`.

## Fonts

`fonts/` holds latin subsets of Grenze Gotisch, EB Garamond, Barlow Condensed, Cinzel and Cinzel Decorative, all under the SIL Open Font License, fetched from Google Fonts.
