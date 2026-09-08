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
    rating: 79,
    battles: 0,
    victories: 0,
    wyrdstone: 0,
    gold: 0,
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
        equipment: ['Sword', 'Shield', 'Light armour', 'Helmet'],
        skills: [],
        lore:
          'Agnar chose the road south and counted every grave they dug along it. He carries the weight of that arithmetic and rarely raises his voice, because he has never had to. The winter that killed so many of his family only seems to have made him harder to kill: he came through it without a fever, and the kin have taken that as an omen worth following.',
      },
      {
        id: 'mjolnir',
        name: 'Mjolnir Nordost',
        role: 'Blood Brother',
        rank: 'hero',
        portrait: 'MJ',
        epithet: 'The Left Hand',
        stats: { M: 4, WS: 4, BS: 3, S: 4, T: 3, W: 1, I: 3, A: 1, Ld: 7 },
        equipment: ['Hammer'],
        skills: [],
        injuries: ['Lost a hand — may only ever wield a single one-handed weapon.'],
        lore:
          'The strongest of the brothers, and now the simplest to arm: one hammer, one hand, no shield and no argument. He lost the other on the road south and refuses to say to what. Those who have fought beside him report that the arithmetic still works out in his favour, and that he swings as though owed something.',
      },
      {
        id: 'biorn',
        name: 'Biorn Nordost',
        role: 'Blood Brother',
        rank: 'hero',
        portrait: 'BI',
        epithet: 'Axe and Arrow',
        stats: { M: 4, WS: 4, BS: 3, S: 3, T: 3, W: 1, I: 3, A: 1, Ld: 7 },
        equipment: ['Axe', 'Bow'],
        skills: [],
        lore:
          'Biorn cannot decide whether he would rather settle a fight at twenty paces or at arm\'s length, so he carries the means for both and lets the street decide. In Nordost this was called indecision. In Mordheim, where an alley can turn into a rooftop chase without warning, it has begun to look like foresight.',
      },
      {
        id: 'baldur',
        name: 'Baldur Nordost',
        role: 'Kin',
        rank: 'hero',
        portrait: 'BA',
        epithet: 'The Wide Swing',
        stats: { M: 4, WS: 3, BS: 3, S: 3, T: 3, W: 1, I: 3, A: 1, Ld: 7 },
        equipment: ['Double-handed weapon', 'Helmet'],
        skills: [],
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
        equipment: ['Dagger'],
        skills: [],
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
        stats: { M: 4, WS: 3, BS: 4, S: 3, T: 3, W: 1, I: 3, A: 1, Ld: 7 },
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
        stats: { M: 6, WS: 3, BS: 2, S: 4, T: 4, W: 3, I: 3, A: 2, Ld: 7 },
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
    battles: 0,
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
        lore: '',
      },
      {
        id: 'gamling',
        name: 'Gamling Gubbsson',
        role: 'Clansman',
        rank: 'henchman',
        portrait: 'GG',
        epithet: '',
        stats: { M: 3, WS: 4, BS: 3, S: 3, T: 4, W: 1, I: 2, A: 1, Ld: 9 },
        equipment: [],
        skills: [],
        lore: '',
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
];
