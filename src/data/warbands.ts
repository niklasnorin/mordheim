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
  lore: string;
}

export interface Warband {
  id: string;
  name: string;
  type: string;
  sigil: string;
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
    id: 'grimhammer',
    name: "Grimhammer's Oathbound",
    type: 'Dwarf Treasure Hunters',
    sigil: '⚒',
    player: 'Niklas',
    rating: 112,
    battles: 4,
    victories: 3,
    wyrdstone: 11,
    gold: 87,
    lore:
      'Cast out from Karak Kadrin after a vault was lost on his watch, Thorgrim Grimhammer swore the Oath of the Unforgiven: he will not return until he has recovered treasure enough to fill the vault twice over. The cursed streets of Mordheim, glittering with wyrdstone, may yet grant him redemption — or a grave worthy of song.',
    members: [
      {
        id: 'thorgrim',
        name: 'Thorgrim Grimhammer',
        role: 'Noble',
        rank: 'hero',
        portrait: '🧔',
        epithet: 'The Unforgiven',
        stats: { M: 3, WS: 5, BS: 4, S: 4, T: 4, W: 2, I: 3, A: 2, Ld: 10 },
        equipment: ['Gromril axe', 'Double-handed hammer', 'Gromril armour', 'Lucky charm'],
        skills: ['Mighty Blow', 'Resilient', 'Wyrdstone Hunter'],
        lore:
          'Thorgrim speaks little and drinks less, which worries the others more than anything. The ledger chained to his belt records every coin owed to the vault of Karak Kadrin — and every grudge owed to those who stand in his way.',
      },
      {
        id: 'borri',
        name: 'Borri Forkbeard',
        role: 'Engineer',
        rank: 'hero',
        portrait: '🧌',
        epithet: 'Keeper of the Black Powder',
        stats: { M: 3, WS: 4, BS: 5, S: 3, T: 4, W: 1, I: 2, A: 1, Ld: 9 },
        equipment: ['Handgun', 'Pistol', 'Axe', 'Heavy armour'],
        skills: ['Weapons Expert', 'Hunter'],
        lore:
          'Borri claims his handgun, "Grudge-Settler", has never misfired. The scorch marks on his beard suggest otherwise. He is drawing up schematics for a wyrdstone-powered lantern that the others have politely asked him to test far away from camp.',
      },
      {
        id: 'dagna',
        name: 'Dagna Ironmaid',
        role: 'Troll Slayer',
        rank: 'hero',
        portrait: '🔥',
        epithet: 'The Doomed Bride',
        stats: { M: 3, WS: 4, BS: 3, S: 3, T: 4, W: 1, I: 2, A: 1, Ld: 9 },
        equipment: ['Twin axes', 'Flail'],
        skills: ['Ferocious Charge', 'Fearsome'],
        lore:
          'Dagna took the Slayer oath on what should have been her wedding day. None dare ask why. She seeks a doom mighty enough to erase the shame, and Mordheim has been generous with candidates — so far, none mighty enough.',
      },
      {
        id: 'snorri',
        name: 'Snorri Halfpint',
        role: 'Beardling',
        rank: 'hero',
        portrait: '⛏',
        epithet: 'The Optimist',
        stats: { M: 3, WS: 3, BS: 3, S: 3, T: 4, W: 1, I: 2, A: 1, Ld: 8 },
        equipment: ['Axe', 'Shield', 'Light armour'],
        skills: [],
        lore:
          'Young, cheerful, and inexplicably lucky, Snorri has survived two building collapses and a Skaven ambush without a scratch. The elders have started making him walk in front.',
      },
      {
        id: 'grimnir',
        name: 'Grimnir Coalfist',
        role: 'Beardling',
        rank: 'hero',
        portrait: '🪓',
        epithet: 'The Quiet One',
        dead: true,
        death: {
          date: 'Vorhexen 12, 1999',
          order: 5,
          epitaph: '“He said nothing in life. His deeds speak for him now.”',
        },
        stats: { M: 3, WS: 3, BS: 3, S: 3, T: 4, W: 1, I: 2, A: 1, Ld: 8 },
        equipment: ['Axe', 'Dagger'],
        skills: [],
        lore:
          'Fell at the Battle of the Merchant Quarter, dragging two Ostlander axemen into a collapsing cellar with him. His name has been entered in the Book of Grudges — and the Book of Honour.',
      },
      {
        id: 'okri',
        name: 'Okri Stonebrow',
        role: 'Thunderer',
        rank: 'henchman',
        portrait: '💥',
        epithet: 'The Deaf Gunner',
        dead: true,
        death: {
          date: 'Vorhexen 5, 1999',
          order: 4,
          epitaph: '“He never heard the shot that took him. He never heard much of anything.”',
        },
        stats: { M: 3, WS: 3, BS: 4, S: 3, T: 4, W: 1, I: 2, A: 1, Ld: 9 },
        equipment: ['Handgun', 'Axe'],
        skills: [],
        lore:
          'Years beside Borri\'s black powder left Okri stone deaf and utterly fearless — no war cry ever reached him. An Ostlander arrow found him at the Broken Bridge as he calmly reloaded, humming a song only he could hear.',
      },
      {
        id: 'durgin',
        name: 'Durgin Alebelly',
        role: 'Clansman',
        rank: 'henchman',
        portrait: '🍺',
        epithet: 'The Thirsty',
        dead: true,
        death: {
          date: 'Kaldezeit 28, 1999',
          order: 2,
          epitaph: '“He found the only cellar in Mordheim with the roof still on. Briefly.”',
        },
        stats: { M: 3, WS: 4, BS: 3, S: 3, T: 4, W: 1, I: 2, A: 1, Ld: 9 },
        equipment: ['Hammer', 'Shield'],
        skills: [],
        lore:
          'Durgin joined the expedition on the rumour that Mordheim\'s breweries fell with their stock intact. He died as he lived — underground, in the dark, reaching for a barrel — when the tenement came down at First Blood.',
      },
    ],
  },
  {
    id: 'wolfensteins',
    name: "Wolfenstein's Wolves",
    type: 'Ostlanders',
    sigil: '🐺',
    player: 'Erik',
    rating: 98,
    battles: 4,
    victories: 1,
    wyrdstone: 6,
    gold: 42,
    lore:
      'From the dark forests of Ostland come the Brothers Wolfenstein and their kin — a clan of bull-headed, vodka-soaked woodsmen who heard that the streets of Mordheim were paved with wyrdstone and decided that sounded easier than farming. They fight as a family, drink as an army, and retreat as neither.',
    members: [
      {
        id: 'boris',
        name: 'Boris Wolfenstein',
        role: 'Elder',
        rank: 'hero',
        portrait: '👴',
        epithet: 'Patriarch of the Clan',
        stats: { M: 4, WS: 4, BS: 4, S: 3, T: 3, W: 1, I: 3, A: 1, Ld: 8 },
        equipment: ['Sword', 'Pistol', 'Heavy armour', 'Hunting arrows'],
        skills: ['Streetwise', 'Tactician'],
        lore:
          'Boris has buried three wives, two feuds, and one tax collector. He rules the clan with an iron fist and a wooden leg, and swears the wyrdstone will buy back the family lands lost to the Count of Ostland in a card game he still insists was rigged.',
      },
      {
        id: 'yuri',
        name: 'Yuri Wolfenstein',
        role: 'Blood Brother',
        rank: 'hero',
        portrait: '🪓',
        epithet: 'The Bear-Wrestler',
        stats: { M: 4, WS: 4, BS: 3, S: 4, T: 3, W: 1, I: 3, A: 1, Ld: 7 },
        equipment: ['Double-handed axe', 'Dagger', 'Bearskin cloak'],
        skills: ['Mighty Blow'],
        lore:
          'Yuri once wrestled a bear for a barrel of vodka and won both. The bearskin he wears is, he insists, from a different bear — that one was a friend.',
      },
      {
        id: 'anya',
        name: 'Anya Wolfenstein',
        role: 'Blood Brother',
        rank: 'hero',
        portrait: '🏹',
        epithet: 'The Winter Hawk',
        stats: { M: 4, WS: 3, BS: 4, S: 3, T: 3, W: 1, I: 3, A: 1, Ld: 7 },
        equipment: ['Bow', 'Sword', 'Dagger'],
        skills: ['Eagle Eyes'],
        lore:
          "Boris's granddaughter shoots crows from the spires for practice and Skaven from the shadows for sport. She keeps a tally carved into her bow. The bow is running out of room.",
      },
      {
        id: 'pavel',
        name: 'Pavel the Slow',
        role: 'Kinsman',
        rank: 'henchman',
        portrait: '🛡',
        epithet: 'Mountain of Ostland',
        stats: { M: 4, WS: 3, BS: 2, S: 4, T: 4, W: 1, I: 2, A: 1, Ld: 6 },
        equipment: ['Club', 'Shield', 'Light armour'],
        skills: [],
        lore:
          'Pavel is not slow of wit — he simply sees no reason to hurry. Walls have been known to give way before he does. He carries the clan banner, the cooking pot, and on one occasion, an entire door he took a liking to.',
      },
      {
        id: 'mikhail',
        name: 'Mikhail Halfhand',
        role: 'Kinsman',
        rank: 'henchman',
        portrait: '🗡',
        epithet: 'The Card Cheat',
        stats: { M: 4, WS: 3, BS: 3, S: 3, T: 3, W: 1, I: 3, A: 1, Ld: 6 },
        equipment: ['Sword', 'Dagger', 'Loaded dice'],
        skills: [],
        lore:
          'Mikhail lost two fingers in a game of knives and won three purses in the same evening, which he considers a fair trade. He joined the expedition one step ahead of a debt collector from Wolfenburg.',
      },
      {
        id: 'ludmilla',
        name: 'Ludmilla the Crow-Mother',
        role: 'Priestess of Taal',
        rank: 'hero',
        portrait: '🌿',
        epithet: 'Voice of the Old Forest',
        stats: { M: 4, WS: 2, BS: 2, S: 3, T: 3, W: 1, I: 3, A: 1, Ld: 7 },
        equipment: ['Staff', 'Holy relic', 'Herb pouch'],
        skills: ['Blessing of Taal'],
        lore:
          'The crows of Mordheim follow Ludmilla, and she speaks to them in the old tongue of the forest. What they tell her, she keeps to herself — but she has three times led the clan away from an ambush that no scout had seen.',
      },
      {
        id: 'dmitri',
        name: 'Dmitri Wolfenstein',
        role: 'Blood Brother',
        rank: 'henchman',
        portrait: '⚔',
        epithet: 'The Unlucky',
        dead: true,
        death: {
          date: 'Vorhexen 5, 1999',
          order: 3,
          epitaph: '“He drew the short straw at birth and never gave it back.”',
        },
        stats: { M: 4, WS: 4, BS: 3, S: 3, T: 3, W: 1, I: 3, A: 1, Ld: 7 },
        equipment: ['Sword', 'Shield', 'Light armour'],
        skills: [],
        lore:
          'Youngest of the Wolfenstein brothers, Dmitri survived the wolf winter of \'94, a duel over a woman who married someone else entirely, and three of Borri\'s misfires — only for the Broken Bridge itself to give way beneath him. The strongbox, the clan notes bitterly, floated.',
      },
      {
        id: 'olga',
        name: 'Olga the Axe-Widow',
        role: 'Kinswoman',
        rank: 'henchman',
        portrait: '🪓',
        epithet: 'Thrice-Married, Thrice-Avenged',
        dead: true,
        death: {
          date: 'Kaldezeit 21, 1999',
          order: 1,
          epitaph: '“Buried with her axe. Mordheim is warned.”',
        },
        stats: { M: 4, WS: 3, BS: 3, S: 3, T: 3, W: 1, I: 3, A: 1, Ld: 6 },
        equipment: ['Axe', 'Dagger'],
        skills: [],
        lore:
          'Olga outlived three husbands and personally avenged all three, which made her the clan\'s most respected marriage prospect. She fell to a lurking horror in the shadow of the gates on the very first day — the first grave the campaign dug, and the reason the Wolves no longer scout alone.',
      },
    ],
  },
];
