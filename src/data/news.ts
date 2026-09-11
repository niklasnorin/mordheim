export interface NewsArticle {
  headline: string;
  byline: string;
  body: string;
  notice?: boolean;
  /** Where the broadsheet prints this: a location id from `src/data/curfew/locations/`. Mordheim when not said. */
  location?: string;
}

/** The issue line of the masthead: the edition for where the campaign is, and the Imperial date it is printed. */
const editions: Record<string, string> = { mordheim: 'Issue I', fussenbach: 'Fussenbach Edition' };
export function issueFor(locationId: string, printed: string): string { return `${editions[locationId] ?? editions.mordheim} — ${printed}`; }

export const news: NewsArticle[] = [
  {
    headline: 'A Single Word Found Written in Blood on Tannery Wall',
    byline: 'By our correspondent in the eastern quarter, who did not touch the wall',
    body: 'Lamplighters passing the old tannery on the canal found one word written across its north wall, in letters the height of a man, in what the Watch describes as red paint and what the Watch’s own dog refused to go near. The word is MEROVECH. It is not a word in Reikspiel, nor in any tongue the Guild of Scribes was willing to name; a clerk of the Guild allowed that it had the shape of a name and declined to say whose. Nothing else was written. No symbol, no signature, no demand. Residents report that the letters were dry by morning and wet again by dusk, which the Watch attributes to the damp off the canal and the residents attribute to nothing they care to say aloud. Four armoured horsemen under a black pennant were seen at the eastern gate the same week. The Watch has ordered the wall whitewashed. The whitewash has not taken.',
  },
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

  // ── Fussenbach ──
  {
    location: 'fussenbach',
    headline: 'Grain Barge Brings Armed Strangers Up the Fussen; Village Counts Its Pumpkins',
    byline: 'By our correspondent at the ferry stair, who was counting too',
    body: 'A grain barge out of the south put in at the lower docks this week carrying rather less grain than advertised and rather more steel. The companies aboard, lately of Mordheim by their own account and by the smell of their coats, have taken the rooms above the Cracked Flagon and paid a month in advance, in coin the landlord tested with his teeth and found good. Asked what brings such people to a village of thirteen hundred souls and one pub, their spokesman said the river did; asked what they intend to do here, he said the same. The Village Watch has noted their arrival in the book at the Mud-Gate. Captain Hauer has noted it in a second book, which he keeps himself.',
  },
  {
    location: 'fussenbach',
    headline: 'Green Light Seen Again at Warehouse 4; Baron’s Men Say Lantern, Bargemen Say Nothing',
    byline: 'By a bargeman who wishes it known he saw nothing',
    body: 'Persons abroad after curfew, of whom this publication naturally knows none, report a faint green light beneath the floorboards of Warehouse 4 at low tide, together with a smell the more educated among them compare to sulphur and the rest to eggs. The Baron’s mercenaries, who now guard the wharf in numbers the wharf has never needed, describe it as a lantern. It is a lantern that burns underwater, then. This publication also notes that two bargemen who raised the matter at the Flagon last month have since taken work upriver, according to the Baron’s men, without collecting their pay, according to everyone else.',
  },
  {
    location: 'fussenbach',
    headline: 'Black-Grist Mill Wheel Jams Third Time This Month; Miller Blames Large Fish',
    byline: 'From our correspondent on the mill bridge, who did not look down',
    body: 'The great wheel of the Black-Grist Mill stood still for the best part of a night after fouling on what the miller describes as a very large fish and what his apprentice, before he was sent indoors, described as having too many arms for a fish and a face. The carcass was cleared with boat-hooks and returned to the river, where it sank more slowly than the apprentice liked. The miller reminds the village that flour will be late, that the river has always had big fish in it, and that anyone repeating the word the apprentice used will find their grain at the back of the queue.',
  },
  {
    location: 'fussenbach',
    headline: 'Gravediggers Order More Chain; Father Justinian Orders More Candles',
    byline: 'By our correspondent at the Shrine of Sigmar’s Hammer, from the back pew',
    body: 'The chandler reports his best month in years, the Shrine of Sigmar’s Hammer having taken every candle he can dip and Father Justinian having asked, in a voice the chandler describes as level, whether he also stocks spearheads. Meanwhile the gravediggers of Morr’s Garden have taken delivery of a second cartload of iron chain to hold down headstones that the damp, they say, keeps lifting. The damp is also blamed for a sound like teeth beneath the shrine floor during the late vigils, for the coffin found open on the silt last Marktag, and for the old Baron’s coat being seen abroad at low tide a year after it was buried with him. It has been a very damp year.',
  },
  {
    location: 'fussenbach',
    notice: true,
    headline: 'BY ORDER OF THE BARON',
    byline: '',
    body: 'Warehouse 4 and the Wharf are closed to all but the Baron’s appointed men between dusk and dawn. Bargemen absent from their vessels are to be presumed gone upriver of their own accord. Any guardsman spreading rumour concerning the Baron’s business will answer to the Baron’s men and not to the Watch. This notice does not carry the signature of Captain Hauer, who was not asked.',
  },
];
