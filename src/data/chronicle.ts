export interface ChronicleEntry {
  date: string;
  title: string;
  body: string;
}

export const chronicle: ChronicleEntry[] = [
  {
    date: 'Vorhexen 12, 1999',
    title: 'Battle of the Merchant Quarter',
    body: "Grimhammer's Oathbound defeat Wolfenstein's Wolves in a brutal street fight among the counting-houses. Beardling Grimnir Coalfist falls covering the retreat of his kin. The dwarfs claim the quarter and a cache of 5 wyrdstone shards.",
  },
  {
    date: 'Vorhexen 5, 1999',
    title: 'Skirmish at the Broken Bridge',
    body: 'Both warbands race for a toppled wagon rumoured to carry a noble\'s strongbox. Anya Wolfenstein\'s arrows drive back the dwarf vanguard and the Wolves seize the prize — 30 gold crowns and a very surprised chicken, since adopted as the clan mascot.',
  },
  {
    date: 'Kaldezeit 28, 1999',
    title: 'First Blood in the Fallen City',
    body: 'The Oathbound and the Wolves clash for the first time in the shadow of the Rock. An inconclusive brawl in the rain ends when a tenement collapses between the two forces. Both sides claim victory; the tenement claims two swords, a helmet, and Yuri\'s best boot.',
  },
  {
    date: 'Kaldezeit 21, 1999',
    title: 'The Warbands Enter Mordheim',
    body: 'Two companies pass the shattered gates within a day of one another: dwarfen treasure hunters out of Karak Kadrin marching under the Oath of the Unforgiven, and an Ostlander clan following a patriarch\'s dream of buying back his lost lands. The crows gather to watch. The crows always watch.',
  },
];
