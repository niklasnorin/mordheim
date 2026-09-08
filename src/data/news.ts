export interface NewsArticle {
  headline: string;
  byline: string;
  body: string;
  notice?: boolean;
}

export const issue = 'Issue I — Nachexen, 2000';

export const news: NewsArticle[] = [
  {
    headline: 'Teal-Bannered Dwarfs Enter Mordheim; Purpose Filed Under “Old Business”',
    byline: 'By our correspondent at the eastern gate, from a respectful distance',
    body: 'A company of dwarfs calling itself the Bitterbrow Expedition entered Mordheim beneath a deep-teal sigil and with rather less luggage than weaponry. Their leader, Jorgrim Bitterbrow, has been seen comparing street names with entries in a heavy iron-bound book, though whether he seeks treasure, debtors, or something old enough to be both remains unclear. Asked what business brought them to the city, one clansman replied that the business had brought itself; our correspondent judged this answer complete and withdrew.',
  },
  {
    headline: 'Northern Family Arrives at the Gates; Declines to Say Why',
    byline: 'From our correspondent in the ruins, who wishes to remain both anonymous and alive',
    body: "A company of Ostlanders styling themselves the Nordost Kin passed the eastern gate this week, seven strong and one ogre heavier than expected. Their elder, a grey-bearded man named Agnar, registered the warband with the customary two crowns and answered every question about their reasons for leaving the north with the same word, which this publication cannot print for reasons of space. They have taken lodging in a roofless granary and have already been observed measuring the walls of it, which the neighbourhood finds either reassuring or ominous depending on the hour.",
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
    headline: 'Priest of Taal Preaches in the Ruins; Congregation Chiefly Crows',
    byline: 'By our tavern correspondent',
    body: "A shaven-headed priest of Taal, one Skalle, has taken to holding service upon a collapsed rooftop in the eastern quarter, on the grounds that a city is merely a forest that has forgotten itself. Attendance is reported as four members of his adopted family, one ogre who slept throughout, and a great many crows. The priest was seen to cross a twelve-foot gap between tenements without visible effort, a feat the faithful attribute to the god of wild places and the sceptical attribute to a very long run-up.",
  },
  {
    notice: true,
    headline: 'NOTICE OF REWARD',
    byline: '',
    body: 'The Sisterhood of Sigmar offers 50 gold crowns for the safe return of any relics looted from the Convent of the Rock. No questions shall be asked. Sigmar, however, sees all, and He has questions.',
  },
];
