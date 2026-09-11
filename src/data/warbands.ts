export interface Statline {
  M: number; WS: number; BS: number; S: number; T: number; W: number; I: number; A: number; Ld: number;
}

export interface Member {
  id: string;
  name: string;
  role: string;
  /** Heroes get elaborate graves; henchmen get plain ones. */
  rank: 'hero' | 'henchman';
  portrait: string;
  epithet: string;
  dead?: boolean;
  death?: {
    /** Date the warrior fell, in Imperial calendar. */
    date: string;
    /** Higher = more recent. Used to order graves front-to-back. */
    order: number;
    /** Quote carved on the tombstone. */
    epitaph: string;
  };
  stats: Statline;
  experience?: number;
  equipment: string[];
  skills: string[];
  /** Prayers known, for priests and other blessed warriors. */
  prayers?: string[];
  /** Lasting injuries rolled on the serious injury table. */
  injuries?: string[];
  lore: string;
}

export interface Warband {
  id: string;
  name: string;
  type: string;
  sigil: string;
  /** Heraldic crest in public/, drawn in place of the sigil where there is room. */
  crest?: string;
  player: string;
  rating: number;
  battles: number;
  victories: number;
  wyrdstone: number;
  gold: number;
  lore: string;
  members: Member[];
}

export const warbands: Warband[] = [
  {
    id: 'nordost',
    name: 'The Nordost Kin',
    type: 'Ostlanders',
    sigil: 'NK',
    crest: 'crest-nordost.svg',
    player: 'Niklas',
    rating: 124,
    battles: 1,
    victories: 1,
    wyrdstone: 0,
    gold: 72,
    lore:
      'Nordost was a holding of longhouses and pine forest in the cold north of Ostland, and it belongs to the Nordost family no longer. What drove them out, they do not discuss with strangers. They walked south through a hard winter and buried kin at the roadside as they went — brothers, wives, children — until only this handful reached the Reik. Hardy folk, raised on thin soil and long nights, they have come to the City of the Damned because it is the one place in the Empire where a family with nothing left can still dig a fortune out of the ground. They mean to earn enough wyrdstone to buy land somewhere quiet, raise longhouses again, and never speak of the road south.',
    members: [
      {
        id: 'agnar',
        name: 'Agnar Nordost',
        role: 'Elder',
        rank: 'hero',
        portrait: 'AN',
        epithet: 'Who Led Them South',
        stats: { M: 4, WS: 4, BS: 4, S: 3, T: 4, W: 1, I: 3, A: 1, Ld: 8 },
        experience: 24,
        equipment: ['Sword', 'Shield', 'Light armour', 'Helmet'],
        skills: ['Leader'],
        lore:
          'Agnar chose the road south and counted every grave they dug along it. He carries the weight of that arithmetic and rarely raises his voice, because he has never had to. The winter that killed so many of his family only seems to have made him harder to kill: he came through it without a fever, and the kin have taken that as an omen worth following.',
      },
      {
        id: 'mjolnir',
        name: 'Mjølnir Nordost',
        role: 'Blood Brother',
        rank: 'hero',
        portrait: 'MJ',
        epithet: 'The Left Hand',
        stats: { M: 4, WS: 4, BS: 3, S: 3, T: 3, W: 1, I: 3, A: 1, Ld: 7 },
        experience: 13,
        equipment: ['Dagger', 'Hammer'],
        skills: [],
        injuries: ['Severe Arm Wound — lost a hand; may only ever wield a single one-handed weapon.'],
        lore:
          'One of the blood brothers, and now the simplest to arm: one weapon at a time, one hand, no shield and no argument. Gammling Gubbsson put him out of action in the watchtower during the kin’s first battle for the abandoned market; the wound cost him the other hand. Baldur avenged him and held the tower, but that is not the same as getting it back. Mjølnir means to make the remaining hand count.',
      },
      {
        id: 'biorn',
        name: 'Biorn Nordost',
        role: 'Blood Brother',
        rank: 'hero',
        portrait: 'BI',
        epithet: 'Axe and Arrow',
        stats: { M: 4, WS: 4, BS: 3, S: 4, T: 3, W: 1, I: 3, A: 1, Ld: 7 },
        experience: 15,
        equipment: ['Dagger', 'Axe', 'Bow'],
        skills: [],
        lore:
          'Biorn cannot decide whether he would rather settle a fight at twenty paces or at arm\'s length, so he carries the means for both and lets the street decide. In Nordost this was called indecision. In Mordheim, where an alley can turn into a rooftop chase without warning, it has begun to look like foresight.',
      },
      {
        id: 'baldur',
        name: 'Baldur Nordost',
        role: 'Hero Kin',
        rank: 'hero',
        portrait: 'BA',
        epithet: 'The Wide Swing',
        stats: { M: 4, WS: 3, BS: 3, S: 3, T: 3, W: 2, I: 3, A: 1, Ld: 7 },
        experience: 3,
        equipment: ['Dagger', 'Double-handed weapon', 'Helmet'],
        skills: ['Promoted to hero', 'Skill access: Combat, Shooting'],
        lore:
          'Youngest of the kin to come through the winter, and the only one who still talks about the road south as an adventure. He swings a blade meant for a bigger man and has been told, repeatedly, to check who is standing behind him first. The helmet was Agnar\'s idea, and Baldur wears it because arguing with Agnar is not a thing the family does.',
      },
      {
        id: 'skalle',
        name: 'Skalle',
        role: 'Priest of Taal',
        rank: 'hero',
        portrait: 'SK',
        epithet: 'Who Walks Ahead',
        stats: { M: 4, WS: 3, BS: 3, S: 3, T: 3, W: 1, I: 3, A: 1, Ld: 7 },
        experience: 13,
        equipment: ['Dagger'],
        skills: ['Prayer User'],
        prayers: ["Stag's Leap"],
        lore:
          'No Nordost by blood, but he found the family on the road and stayed. Skalle serves Taal, lord of the wild places, and holds that a city is only a forest that has forgotten itself — a position Mordheim tests daily. He goes lightly armed and moves over broken ground like something with four legs, which the kin have stopped finding strange.',
      },
      {
        id: 'torgrim',
        name: 'Torgrim Nordost',
        role: 'Jaeger',
        rank: 'henchman',
        portrait: 'TN',
        epithet: 'Who Fed Them on the Road',
        stats: { M: 4, WS: 3, BS: 3, S: 3, T: 3, W: 1, I: 3, A: 2, Ld: 7 },
        experience: 2,
        equipment: ['Bow', 'Dagger'],
        skills: [],
        lore:
          'The family hunter, and the reason more of them did not starve between Nordost and the Reik. He is a quiet, patient man who thinks of the ruins as woodland with worse cover, and he has taken to sitting in high windows the way he once sat in trees. He still counts his arrows every evening out of habit.',
      },
      {
        id: 'ragnar',
        name: 'Ragnar',
        role: 'Ogre',
        rank: 'henchman',
        portrait: 'RA',
        epithet: 'Paid in Full, Nightly',
        stats: { M: 6, WS: 3, BS: 2, S: 4, T: 4, W: 3, I: 3, A: 2, Ld: 8 },
        experience: 4,
        equipment: ['Double-handed weapon'],
        skills: [],
        lore:
          'Hired outside the gates for a rate the kin can barely meet and a supper they can meet even less. Ragnar has no interest in Nordost, land, or the road south; he was told there would be fighting and food, and so far both have been delivered. The family have decided this makes him one of them, and nobody has told him.',
      },
    ],
  },
  {
    id: 'bitterbrow-expedition',
    name: 'The Bitterbrow Expedition',
    type: 'Dwarf Treasure Hunters',
    sigil: 'BE',
    crest: 'crest-bitterbrow.png',
    player: '',
    rating: 0,
    battles: 1,
    victories: 0,
    wyrdstone: 0,
    gold: 0,
    lore:
      'The Bitterbrow Expedition says little of why it came west from Karak Barazund. It is rumored that old entries in the clan’s book of grudges have led them to Mordheim, and that certain debts can be paid only among the ruins. His companions whisper that if enough names are struck from the ledger, he may one day return beneath the deep-teal banners and ascend the throne.',
    members: [
      {
        id: 'jorgrim',
        name: 'Jorgrim Bitterbrow',
        role: 'Lord',
        rank: 'hero',
        portrait: 'JB',
        epithet: '',
        stats: { M: 3, WS: 5, BS: 4, S: 3, T: 4, W: 1, I: 2, A: 1, Ld: 9 },
        equipment: [],
        skills: [],
        lore:
          'Jorgrim was raised in the dark-water halls of Karak Barazund, heir to the Bitterbrows’ stubborn traditions and a throne he does not yet claim. Their kings may not truly ascend until old grudges from the Battle of a Thousand Woes are answered; which entries brought him to Mordheim, he refuses to say. He calls this merely an expedition. The others call him the uncrowned — though never within earshot.',
      },
      {
        id: 'norri',
        name: 'Norri Stonebrew',
        role: 'Slayer',
        rank: 'hero',
        portrait: 'NS',
        epithet: '',
        stats: { M: 3, WS: 4, BS: 3, S: 3, T: 4, W: 1, I: 2, A: 1, Ld: 9 },
        equipment: [],
        skills: [],
        lore: '',
      },
      {
        id: 'grakki',
        name: 'Grakki Dourhammer',
        role: 'Clansman',
        rank: 'henchman',
        portrait: 'GD',
        epithet: '',
        stats: { M: 3, WS: 4, BS: 3, S: 3, T: 4, W: 1, I: 2, A: 1, Ld: 9 },
        equipment: [],
        skills: [],
        lore:
          'Grakki greets a broken bridge as a route worth trying and an abandoned market as a place worth exploring. Even the drowned vines that nearly rooted him in the canal could not extinguish his appetite for adventure. Biorn Nordost ended his first battle before he had finished looking round; Grakki would call that an interrupted expedition, not a lesson in caution.',
      },
      {
        id: 'gamling',
        name: 'Gammling Gubbsson',
        role: 'Clansman',
        rank: 'henchman',
        portrait: 'GG',
        epithet: '',
        stats: { M: 3, WS: 4, BS: 3, S: 3, T: 4, W: 1, I: 2, A: 1, Ld: 9 },
        equipment: [],
        skills: [],
        lore:
          'Gammling has seen better stonework, better weather and better enemies, and will explain the failings of all three while climbing a tower to fight. A jaded old clansman with a complaint for every step, he remains dangerous enough to make younger warriors regret mistaking grumbling for exhaustion. He put Mjølnir Nordost out of action in the market watchtower before Baldur answered the blow. Human swordsmanship is now another subject upon which he has objections.',
      },
      {
        id: 'flint',
        name: 'Flint Mudbeard',
        role: 'Beardling',
        rank: 'henchman',
        portrait: 'FM',
        epithet: '',
        stats: { M: 3, WS: 3, BS: 2, S: 3, T: 4, W: 1, I: 2, A: 1, Ld: 8 },
        equipment: [],
        skills: [],
        lore: '',
      },
      {
        id: 'orri',
        name: 'Orri Ormsson',
        role: 'Beardling',
        rank: 'henchman',
        portrait: 'OO',
        epithet: '',
        stats: { M: 3, WS: 3, BS: 2, S: 3, T: 4, W: 1, I: 2, A: 1, Ld: 8 },
        equipment: [],
        skills: [],
        lore: '',
      },
    ],
  },
  {
    id: 'welling-rune',
    name: 'The Order of the Welling Rune',
    type: 'Marauders of Chaos',
    sigil: 'WR',
    player: '',
    rating: 0,
    battles: 0,
    victories: 0,
    wyrdstone: 0,
    gold: 0,
    lore:
      '“The Order was founded near the year 1800 by Godefrey de la Vieuxbourg, Castellan of the Ferric Keep, who styled himself la Lance Sanglante after a rune of welling dragon-blood impressed itself upon him in the hour of a kill. The Annals of Hargendorf for 1867 tell of armoured reavers who cut down a garrison, demanded a duel, and left a symbol of slaughter daubed upon the square in the blood of the townsfolk; Herr Lehman von Grafenrich calls them plain Norscans, and Herr Lehman is wrong. Theirs was no headlong dive into heresy but a long and certain road, and they ride it still beneath a writhing crimson rune on a black field. Now a Questoathed of the Order has come to the City of the Damned with three of his brethren. I pray to the God-King that you never face them, and I confess that as I write of them my quill grows steadier, not weaker.” — from the Codex Sanguinatum of Brother Waldemar, called the Lunatic, sometime Scribe of the Order of the Cleansing Flame',
    members: [
      {
        id: 'merovech',
        name: 'Merovech de Wormsbourg',
        role: 'Chieftain',
        rank: 'hero',
        portrait: 'MW',
        epithet: 'Questoathed',
        stats: { M: 4, WS: 5, BS: 4, S: 4, T: 4, W: 1, I: 5, A: 1, Ld: 8 },
        equipment: [],
        skills: ['Leader'],
        lore:
          'Lord of the brotherhood of the mailed fist, thrice honoured by the Axe-Father, slayer of Roland de Hauteville and taker of the skulls of champions. The Codex Sanguinatum says the ground resounded when he rode out from the Ferric Keep, and that all who saw his pennants knew the Order was abroad. He has sworn an oath that brought him south from the frozen forests to the soft green lands and, at last, to Mordheim. What the oath demands he has told only the Bloodfather, and the Bloodfather does not say.',
      },
      {
        id: 'reinmar',
        name: 'Reinmar von Altakre',
        role: 'Seer',
        rank: 'hero',
        portrait: 'RA',
        epithet: 'Bloodfather',
        stats: { M: 4, WS: 4, BS: 3, S: 4, T: 4, W: 1, I: 4, A: 1, Ld: 8 },
        equipment: [],
        skills: ['Wizard'],
        lore:
          'An Imperial name and an Imperial education, both put to uses the Colleges would burn him for. Reinmar reads the rune where the brothers cannot: in the pattern a wound leaves on stone, in the way blood runs across broken ground. It is he who daubs the symbol of slaughter on a square when the fighting is done, and he who tells Merovech what it means. The brothers call him Bloodfather.',
      },
      {
        id: 'guillame',
        name: 'Guillame Shieldbreaker',
        role: 'Champion',
        rank: 'hero',
        portrait: 'GS',
        epithet: 'Brother Knight',
        stats: { M: 4, WS: 4, BS: 3, S: 4, T: 3, W: 1, I: 4, A: 1, Ld: 7 },
        equipment: [],
        skills: [],
        lore:
          'The name was not given for shields he has carried. Guillame came to the Order the way most of its knights do, by winning the duel the Order demands of every keep it passes, and then finding he had nowhere to go home to. He delights in seeking challenges with fellow knights, laughing in the face of their false chivalry as he adds yet more skulls to his collection. He hopes to lay them someday at the grand altar of the Ferric Keep for the glory of the Axe-Father.',
      },
      {
        id: 'krylov',
        name: 'Krylov Vasilyevich',
        role: 'Champion',
        rank: 'hero',
        portrait: 'KV',
        epithet: 'Brother Knight',
        stats: { M: 4, WS: 4, BS: 3, S: 4, T: 3, W: 1, I: 4, A: 1, Ld: 7 },
        equipment: [],
        skills: [],
        lore:
          'A Kislevite by his name and his patience, and the only brother who does not seem to enjoy the work. Krylov keeps the Order’s pennants and mends them by lamplight, the crimson rune on the black field, and rides at Merovech’s left where a Questoathed keeps the man he trusts. He speaks little in the Reikspiel and less in his own tongue. The Bloodfather says the rune took him in a snowfield east of Praag, and that is all the Order knows of it.',
      },
    ],
  },
];
