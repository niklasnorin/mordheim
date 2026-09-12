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

Templates live in `locations/<place>.json`, one pack per place the campaign can be in, and are filled with slots:

- `{name}` the member's full name, `{first}` their first name, `{they}` `{them}` `{their}` pronouns (always they/them unless the roster says otherwise).
- `{district}` a place in the city, `{detail}` a physical detail, `{omen}` the Omen title, `{other}` the other member on the Watch, `{rival}` the rival warband, `{rivalMember}` (in `encounters` only) a living member of the rival warband, by first name.
- A template must read correctly with every slot filled. If it needs a second member, put it under `pairs`; if it needs the rival, under `encounters`.

## Crossroads

A crossroads is a `setup` and two or three roads under `crossroads` in the pack. The setup is one or two sentences in the Dawn Report's own voice: what {first} found, who was watching. It stops at the moment of choosing and explains nothing.

- **Roads are what the character does.** Present tense, four to eight words: "Keep the ring. Say nothing." Never a question, never "Good" and "Evil".
- **Hard means both roads cost.** Shards now against a name later; the warband against the self; the safe road against the one that might bring a curse home. Roughly equal in worth, different in shape.
- **The default road risks nothing.** It is marked `default` and is what the character does when nobody decides. It may be the wrong thing morally. It is never the poorer thing in mechanics, and it never carries a curse.
- **The city never judges.** An `outcome` says what happened and what was seen. No adjectives about the choice, no reward for virtue, no punishment for its lack beyond what the world would do.
- **Plots are brushed against, never told.** A crossroads is the best place to touch Warehouse 4 or the coat in the cemetery, and still says nothing about them.
- **Kinds by weight:** moral half, risk a fifth, loyalty a seventh, lore a tenth, light a twentieth. Most are hard. Not all.
- Slots as elsewhere, plus `{warband}`; `{other}` is the other member out that night or "nobody". A `headline` on a road is written as the Cryer writes.
- Every mark a road leaves is named in `markNames`, in the past tense, as the taverns would say it: "kept the ring", "lied to a Witch Hunter".
- `undecided` lines open the outcome when the character decided alone. Not a scolding: "There was nobody to ask. {first} kept walking."

## Places

A pack has everything the engine says about a place: its `errands` and, for every errand it has none of, an `unavailable` line shown to the player as written; `templates` for each of its errands; `districts`, `details`, `closers`, `rumours`, `return`, `cityProvides`, `quiet`, `epithets`, `encounters`; `moonTies` where the Moons' own lines would not fit; its `crossroads`, `undecided` lines and `markNames`; and the Cryer's masthead and `headlines`.

- The plots of a place are hinted at, never told. A rumour says what was seen; a detail says what was smelled. Nobody in a vignette explains anything.
- A village is not a smaller city. One pub, one shrine, one wharf: name them. `{district}` still varies, but a carousing vignette says the Flagon and a praying one says the shrine.
- The rival warband crosses paths rarely and lightly. A nod, a light in a window, a mark under a mark. Nothing is decided between them in the Chronicle.
