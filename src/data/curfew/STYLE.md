# CURFEW — writing style guide

Short declaratives. Present tense. Name the members. One physical detail per vignette: weather, smell, a sound. No exclamation marks. Dry gallows humour allowed, jokes forbidden. Mechanics live only in the ledger line beneath the prose.

## Shape of a Dawn Report

    Night 14 — under the Hanged Merchant.
    Ulf went sifting in the Merchant's Quarter. He came back with two slivers of green and a cough he did not leave with.
    Hanna kept the candles at the Broken Bell; they held until the third hour. Nobody spoke of Rudi.

    Ledger: +6 Favour · 2 shards · Ulf: Wyrdstone Cough (fades in 3 nights)

- A header names the night and the Omen.
- One sentence pair per member sent. The first says what they did and where. The second says what it cost or brought.
- At most one closing line about the warband as a whole.
- The ledger is a single line, middle dots between items, no verbs.

## Vocabulary

- The warband, the kin, the company. Never "the team", never "the party".
- Wyrdstone is "the green", "slivers", "shards". Never "loot".
- Favour is "the city's regard". Renown is "a name".
- Nights, Moons, the Season. Never "days", "weeks", "months" in prose.

## Templates

Templates live in `vignettes.json` and are filled with slots:

- `{name}` the member's full name, `{first}` their first name, `{they}` `{them}` `{their}` pronouns (always they/them unless the roster says otherwise).
- `{district}` a place in the city, `{detail}` a physical detail, `{omen}` the Omen title, `{other}` the other member on the Watch, `{rival}` the rival warband.
- A template must read correctly with every slot filled. If it needs a second member, put it under `pairs`.
