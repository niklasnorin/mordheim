export interface NewsArticle {
  headline: string;
  byline: string;
  body: string;
  notice?: boolean;
}

export const issue = 'Issue XIII — Vorhexen, 1999';

export const news: NewsArticle[] = [
  {
    headline: 'Dwarfen Company Seizes the Merchant Quarter!',
    byline: 'From our correspondent in the ruins, who wishes to remain both anonymous and alive',
    body: "Word reaches this humble publication that the dwarfen sellswords styling themselves Grimhammer's Oathbound have driven the Ostlander clan Wolfenstein from the shattered counting-houses of the old Merchant Quarter. Witnesses — a mad beggar and a one-eyed cat — report that the dwarf lord Thorgrim felled three men with a single sweep of his hammer before the Ostlanders withdrew in what their patriarch later described as 'a strategic redistribution of courage.' A young dwarf, Grimnir Coalfist by name, gave his life in the taking. His kin were heard singing in the deep tongue late into the night.",
  },
  {
    headline: 'Wyrdstone Prices Soar as Winter Closes In',
    byline: 'By Herr Albrecht Fenster, Guild of Merchants (in exile)',
    body: 'The merchants of Cutthroat\'s Haven report that shards of the green stone now fetch upwards of thirty gold crowns for a mere sliver, as agents of certain personages in Altdorf and Nuln bid against one another with unseemly enthusiasm. Honest folk are reminded that handling the stone is known to cause visions, warts, unnatural vigour, and in one documented case, a second head. The second head was reportedly more agreeable than the first.',
  },
  {
    headline: 'Beware the Rat-Things of the Under-Streets!',
    byline: 'A warning from Father Odo of the Shrine of Sigmar Preserved',
    body: 'Godly citizens are once more warned against venturing near the sewer mouths after dusk. Three treasure hunters of the Breucker company entered the drains beneath the Rock a fortnight past. Only their boots were recovered — neatly arranged, which somehow made matters worse. Sightings of man-sized vermin walking upright continue, and continue to be officially denied by authorities who no longer exist.',
  },
  {
    headline: 'Ostlander Camp Claims Bear Sighting; Bear Unavailable for Comment',
    byline: 'By our tavern correspondent',
    body: "Members of the Wolfenstein clan swear upon several saints that a great bear now dens in the ruins of the Temple of Shallya, and that it spoke to their kinsman Yuri in the tongue of Ostland, demanding tribute of honey and strong drink. This publication notes that the clan's vodka stores had run notably low that same evening, and offers no further comment on the matter of talking bears.",
  },
  {
    notice: true,
    headline: 'NOTICE OF REWARD',
    byline: '',
    body: 'The Sisterhood of Sigmar offers 50 gold crowns for the safe return of any relics looted from the Convent of the Rock. No questions shall be asked. Sigmar, however, sees all, and He has questions.',
  },
  {
    headline: 'The Comet Grows Brighter, Say Doomsayers; Doomsayers Grow Louder, Say Everyone',
    byline: 'By the Editor',
    body: 'The twin-tailed shadow that hangs above the City of the Damned has, by all accounts, grown brighter these past weeks. The Cult of the Purple Hand claims it heralds the end of all things. The Cult of the Red Dawn claims it heralds the beginning of all things. The landlord of the Last Drop tavern claims it makes for excellent drinking light, and his prices have risen accordingly.',
  },
];
