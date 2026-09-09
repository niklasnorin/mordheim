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

## Fonts

`fonts/` holds latin subsets of Grenze Gotisch, EB Garamond, Barlow Condensed, Cinzel and Cinzel Decorative, all under the SIL Open Font License, fetched from Google Fonts.
