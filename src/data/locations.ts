/**
 * Seed: the campaign's locations as they stood when the record first held them. Imported once into an empty
 * `locations` table; after that a game master keeps them on the site (/locations/) and this file changes nothing.
 * The ids match the Curfew's packs under src/data/curfew/locations/, so a place is the same place on both sides.
 */
export interface PointFixture {
  name: string;
  /** "Tavern", "Bridge": the kind of place. */
  kind: string;
  description: string;
  /** Where on the map, as percent of its width and height from the top left; left out for a place the map does not show. */
  x?: number;
  y?: number;
}

/**
 * A job on the place's board, the Fountain Post (`campaign/jobs.ts`): what a warband did there between games.
 * `scope` is how big it is: an errand (the usual work, a sentence or two), a commission (a little more), or an
 * undertaking (the biggest, with the most to it and the most lore). `point` names one of the location's points of
 * interest, by its name as the location keeps it, when the job is done at one. A job may touch the place's plots as far
 * as the Curfew's pack does, and never further: what the pack's rumours, details and crossroads already say may be
 * seen, and nothing in a job contradicts or resolves them. A seed job nobody has edited on the site follows this file.
 */
export interface JobFixture {
  title: string;
  text: string;
  lean: 'gold' | 'experience' | 'champion' | 'even';
  scope: 'errand' | 'commission' | 'undertaking';
  point?: string;
}

export interface LocationFixture {
  id: string;
  name: string;
  region: string;
  description: string;
  /** A path on this site to the map, under public/. */
  map?: string;
  /** The banner at the head of the page, under public/, and how it is framed where it is cropped. The Curfew's bands serve. */
  banner?: string;
  bannerFocus?: string;
  points: PointFixture[];
  jobs?: JobFixture[];
}

export const locations: LocationFixture[] = [
  {
    id: 'mordheim',
    name: 'Mordheim',
    region: 'Ostermark',
    banner: '/curfew/places/mordheim-band.jpg',
    bannerFocus: '50% 34%',
    description: 'The City of the Damned, since the comet fell. What stands of it stands crooked, and what lies under it glows green in the dark. The warbands came for the wyrdstone and stayed for want of a way out; the Town Cryer prints from the ruins and the Watch keeps a curfew nobody obeys. There is no map of the city that two people agree on, and none is kept here yet.',
    points: [
      { name: 'The Merchant’s Quarter', kind: 'District', description: 'The counting houses stand with their doors open and their strongrooms shut. Something is still owed here, by somebody, to somebody.' },
      { name: 'Cutthroat’s Haven', kind: 'District', description: 'Where the city’s trade carried on after the city stopped. Anything is for sale, including the way back out.' },
      { name: 'Executioner’s Square', kind: 'Square', description: 'The scaffold is still up. The crows have the only steady work in the city.' },
      { name: 'The Pit', kind: 'Fighting pit', description: 'Where the warbands train by fighting each other for coin, and where the coin is usually the smaller loss.' },
    ],
    jobs: [
      // errands
      { scope: 'errand', title: 'Minding a door in the Haven', point: 'Cutthroat’s Haven', lean: 'gold', text: 'Minded a door in Cutthroat’s Haven for a man who sold things that were not his. He paid on time, which in the Haven passes for honesty, and he never once said what was behind the door. Nobody tried it, which is the whole of the job.' },
      { scope: 'errand', title: 'Clearing the scaffold', point: 'Executioner’s Square', lean: 'even', text: 'Cleared the scaffold in Executioner’s Square for a fee from the Watch. The pay was fair. The crows disagreed, and followed them halfway back to the Haven to say so.' },
      // commissions
      { scope: 'commission', title: 'A sifter’s cart', lean: 'experience', text: 'Walked a sifter’s cart from the outer ruins to the Haven and back, three times, with the green under a tarpaulin and a lantern hung from the shaft. The cart came back each time. So did they, which is more than the last escort managed.' },
      { scope: 'commission', title: 'Seven nights in the Pit', point: 'The Pit', lean: 'champion', text: 'One of them fought seven nights running in the Pit for the house’s purse. They won more than they lost, lost the right ones, and on the last night walked out on their own feet, which the house sees rarely and does not pay extra for.' },
      // undertakings
      { scope: 'undertaking', title: 'A debt collected in the Haven', point: 'Cutthroat’s Haven', lean: 'gold', text: 'Collected a debt in Cutthroat’s Haven for a moneylender who no longer leaves his room. The debtor had moved twice, changed his name once, and hired three friends. It took four nights and one of the friends. The moneylender paid in full, through the keyhole, and asked whether they would be free again at the next Moon.' },
      { scope: 'undertaking', title: 'The cellars under the outer ruins', lean: 'experience', text: 'Went down into the cellars under the outer ruins for a sifting gang that had lost two men there and wanted their tools back. They brought up the tools, and one of the men. The gang paid for both and did not ask about the other. The cellars went on further down than anyone had rope for, and something down there had been using the tools.' },
    ],
  },
  {
    id: 'fussenbach',
    name: 'Fussenbach',
    region: 'Ostermark',
    map: '/locations/fussenbach-map.jpg',
    banner: '/curfew/places/fussenbach-band.jpg',
    bannerFocus: '50% 22%',
    description: 'A village of thirteen hundred and one pub on the Fussen, a few days upriver from the Mordheim road. The river keeps its own hours and the village keeps to the north bank: the market, the square and the Cracked Flagon above the water, the barracks and the manor on the slopes behind, and the watch tower on its crag looking down the valley. South of the bridge stand the warehouse, the wharf and Sigmar’s Hammer; east, past the cemetery, the ruins that were there before the village and are left alone. The Village Watch is one half of itself at any time. The algae basins and the silt flats are where the green is found, and the bargemen are where it goes.',
    points: [
      { name: 'The Cracked Flagon', kind: 'Tavern', description: 'The village’s one pub, with rooms above it that strangers are given and locals are not. The village talks here once it trusts you, and talks about you until then.', x: 59.2, y: 41.4 },
      { name: 'The town square', kind: 'Square', description: 'A fountain that runs when the mill race lets it, and the stocks, which are kept oiled. Notices are nailed to the fountain’s post and read aloud by whoever can.', x: 50.0, y: 53.1 },
      { name: 'The barracks', kind: 'Barracks', description: 'The Village Watch’s quarters, fenced, with a yard that the Flagon’s landlord says is not a Pit. Half the Watch is on at any hour; which half is a matter of some interest.', x: 41.3, y: 26.6 },
      { name: 'The watch tower', kind: 'Watch tower', description: 'On the crag above the village, with a view down the valley and a bell that has been rung twice in living memory. Both times it was a mistake, the Watch says.', x: 63.1, y: 13.8 },
      { name: 'Warehouse 4', kind: 'Warehouse', description: 'The chandler’s store on the south bank, numbered though there is no warehouse 1, 2 or 3. What goes in by the wharf and what comes out by the road are not always the same goods.', x: 31.7, y: 68.0 },
      { name: 'The manor', kind: 'Manor', description: 'The Baron’s house above the orchards, with its own chapel and more fence than a manor needs. The family keeps to itself; the village keeps the Baron’s seal on its nails and its coins.', x: 20.0, y: 40.4 },
      { name: 'The market', kind: 'Market', description: 'Eels, algae cakes, rope, and whatever the barges brought. The stalls that do not sell anything are the ones to watch.', x: 65.8, y: 53.1 },
      { name: 'The ruins', kind: 'Ruins', description: 'Older than the village, east of the cemetery, and not in any of the village’s stories, which is itself a story. Children are told not to go there and go there.', x: 89.2, y: 26.6 },
      { name: 'Sigmar’s Hammer', kind: 'Temple', description: 'The temple on the south bank, where the candles are kept by whoever will keep them. The priest is old, the bell is cracked, and the hammer over the door is said to have been bigger.', x: 61.0, y: 72.3 },
      { name: 'Morr’s Garden', kind: 'Cemetery', description: 'The cemetery at the village’s eastern edge, walled, with a gate that is locked from the inside at dusk. The gravedigger asks that his name be chained down too.', x: 91.6, y: 51.0 },
      { name: 'The bridge', kind: 'Bridge', description: 'The one crossing of the Fussen for a day in either direction. Whoever holds it holds the village’s trade, which is why nobody is allowed to stand on it for long.', x: 49.7, y: 62.7 },
      { name: 'The Mordheim road', kind: 'Road', description: 'South out of the village, past the temple and into the pines. Everything that comes up it is asked its business; everything that goes down it is not asked back.', x: 49.7, y: 92.5 },
    ],
    jobs: [
      // errands: the usual work, for the stronger side and anyone already close to it
      { scope: 'errand', title: 'Keeping the bridge', point: 'The bridge', lean: 'gold', text: 'Kept the line moving on the bridge for whichever half of the Watch was on. Nobody was let stand on it for long. One carter tried twice; the second time he paid double, and the Watch wrote it down as a fine rather than a toll.' },
      { scope: 'errand', title: 'Closing time at the Flagon', point: 'The Cracked Flagon', lean: 'gold', text: 'Threw the last drinkers out at closing time for the landlord, who paid in coin and in what was overheard, and kept the better of the two for himself. Nobody they threw out came back the same night, which in Fussenbach counts as good service.' },
      { scope: 'errand', title: 'Notices on the post', point: 'The town square', lean: 'even', text: 'Read the fountain post’s notices aloud in the square for those who cannot read, and nailed up three more. One of the old ones had been torn down and nailed back up the wrong way round. Nobody would say who had turned it, or what it had said.' },
      { scope: 'errand', title: 'Standing by the stalls', point: 'The market', lean: 'gold', text: 'Stood by the stalls when the barges came in: eels, algae cakes, rope, and whatever else the river had let through. The stalls that sold nothing paid best and asked least, and their keepers watched the road rather than the customers.' },
      { scope: 'errand', title: 'Pumpkins for the ale', lean: 'gold', text: 'Brought in the pumpkins for the Flagon’s ale, cart by cart, ahead of the frost. A few in the far rows were already hollowed and set facing the river. Nobody owned to it, and nobody turned them round.' },
      { scope: 'errand', title: 'The ferry, for a bad arm', lean: 'gold', text: 'Worked the ferry while the ferryman nursed his arm. He took his tenth of the fares anyway, sat in the stern with his eyes shut, and listened mid-river, as he always does.' },
      { scope: 'errand', title: 'Clearing the mill race', lean: 'even', text: 'Cleared the weed from the race below the Black-Grist Mill. The miller paid by the sack and asked them, twice, not to look at the wheel while it turned.' },
      { scope: 'errand', title: 'Firewood for the Watch House', lean: 'even', text: 'Carried the Watch House’s firewood in from the yard. Captain Hauer signed for it himself, counted the logs, and barred the door behind them before they had reached the lane.' },
      { scope: 'errand', title: 'Grain off the barges', lean: 'gold', text: 'Unloaded the grain barges on the wharf by daylight, which is when strangers are let near it. The Baron’s mercenaries counted every sack twice. The bargemen counted the mercenaries, and came to a different number.' },
      { scope: 'errand', title: 'The tithe barn roof', lean: 'gold', text: 'Mended the roof of the tithe barn. The tithe went to the Elector at the last Moon, or was meant to. Somebody had swept the floor since and left the lamps trimmed, and the dust on the tithe chest had a handprint in it.' },
      { scope: 'errand', title: 'A night at the Mud-Gate', lean: 'experience', text: 'Stood a night at the Mud-Gate in place of a watchman who was ill, or said he was. A sergeant came by at midnight for the toll, looked at who was standing there, and thought better of it.' },
      // commissions: a middling gap
      { scope: 'commission', title: 'The grain carts to the pines', lean: 'experience', text: 'Walked the grain carts down the Mordheim road as far as the pines and back, a spear to every cart. Nothing came out of the trees. Something kept pace with them inside the trees for a mile, and then stopped, which was worse.' },
      { scope: 'commission', title: 'The yard that is not a Pit', point: 'The barracks', lean: 'experience', text: 'Drilled with the Village Watch in the barracks yard, which the Flagon’s landlord insists is not a Pit. Nobody kept score, and everybody knew the score. Half the Watch drilled well. The other half spent the afternoon working out who the strangers were.' },
      { scope: 'commission', title: 'Seven nights on the crag', point: 'The watch tower', lean: 'champion', text: 'One of them kept the watch tower on the crag for seven nights, with the valley below and the bell overhead. They saw nothing worth the bell and did not ring it, which the Watch counts as nights well spent. Nobody would say what the two mistakes had been.' },
      { scope: 'commission', title: 'The bell-frame at the Hammer', point: 'Sigmar’s Hammer', lean: 'even', text: 'Mended the bell-frame at Sigmar’s Hammer, high in the dark under the cracked bell. The priest paid in silver and in blessings, apologised for the silver, and asked them to tread softly in the nave on the way down.' },
      { scope: 'commission', title: 'Wading for the algae men', lean: 'gold', text: 'Waded the upper basins for the algae men, cutting and carrying until the light went. They do not send strangers to the lower basins, and did not say why. The water was warm; the algae men said that was usual, and did not look at it.' },
      { scope: 'commission', title: 'Off the weirs by the third hour', lean: 'experience', text: 'Cleared the eel-weirs with the eel-men and were off the water before the third hour, as the eel-men insist. The weirs were empty when they left. Nobody said what fishes them after that, and the eel-men rowed home faster than they had rowed out.' },
      { scope: 'commission', title: 'Charcoal from the burners’ camp', lean: 'experience', text: 'Carried charcoal down from the burners’ camp above the village, two sacks a back. The burners will not cut near the cliff any more, and said so without being asked. They paid in silver so old that the face on it was the wrong Baron.' },
      { scope: 'commission', title: 'Day work at Warehouse 4', point: 'Warehouse 4', lean: 'gold', text: 'Carried for the chandler at Warehouse 4, by daylight only. The day stock was rope and tallow. The crates stacked at the back were somebody else’s; the chandler did not look at them, and paid extra for the work to be finished before dusk.' },
      { scope: 'commission', title: 'The orchard below the manor', point: 'The manor', lean: 'even', text: 'Cut back the orchard below the manor, row by row, under the shuttered windows. One of the Baron’s mercenaries paid them at the fence, in coin stamped with the Baron’s seal. The shutters stayed shut from dawn to dusk, all but one, which was lit at noon.' },
      { scope: 'commission', title: 'A child from the ruins', point: 'The ruins', lean: 'champion', text: 'One of them walked a child back from the ruins east of the cemetery, as the mother asked. The child had not been lost, and would not say what it had been doing there. It walked the whole way home looking back over its shoulder.' },
      { scope: 'commission', title: 'Digging for the gravedigger', point: 'Morr’s Garden', lean: 'experience', text: 'Dug graves in Morr’s Garden for the gravedigger. None of them was for anyone yet; he says it saves time. He saw to the chains on the stones himself, and tested each one twice before he paid.' },
      { scope: 'commission', title: 'Caulking at the boatyard', lean: 'experience', text: 'Caulked hulls at the boatyard while the shipwright is upriver, as the Baron’s men put it. Something long lay under a tarpaulin at the back, with a chain across it. It was not part of the work, and nobody asked them to move it.' },
      // undertakings: a wide gap, more to the job and more to tell
      { scope: 'undertaking', title: 'The lower basins, by night', lean: 'gold', text: 'Worked the lower basins through a whole night at twice the algae men’s rate, because the algae men will not. The rakes brought up green, and with it bones that had been chewed by teeth that were not small. At the lowest of the tide one rake struck iron under the silt, and rang. The algae men paid the rest at once, on condition that nobody dug there again, and nobody has.' },
      { scope: 'undertaking', title: 'The vigil in the nave', point: 'Sigmar’s Hammer', lean: 'even', text: 'Stood the night vigil in the nave of Sigmar’s Hammer at the priest’s quiet asking, beside villagers holding new spears. At the third hour the chattering came up through the floor, and every candle leaned towards it. They kept their places, and the priest kept praying, until it stopped. He paid from the poor box at dawn and asked them, as a kindness to the village, not to speak of the floor.' },
      { scope: 'undertaking', title: 'Three tides on the causeway', lean: 'experience', text: 'Kept the marsh causeway for the Watch across three low tides, from the last post out to where the reeds begin. On the second night a figure in a long coat came out of the mist as far as the last post, stood there for a while, and turned back. Nobody had been told to follow it, and nobody did. The Watch paid in full and wrote nothing down.' },
      { scope: 'undertaking', title: 'Loading the Baron’s barge', lean: 'gold', text: 'Loaded a barge at the wharf after midnight for the Baron’s mercenaries, at a rate nobody in the village would take. They were told not to look in the crates, and did not, though the slats were warm under their hands. There were more mercenaries on the quay than the Baron pays for. The money was good, and they were asked to forget the night along with it.' },
      { scope: 'undertaking', title: 'What the wheel caught', lean: 'champion', text: 'One of them went down into the race below the Black-Grist Mill with the miller’s longest hook, when the wheel jammed again. What was caught in the paddles had more legs than a fish and fewer than it had started with, and it was still moving. It went downstream in the end, slowly, still looking at them. The miller paid double and said nothing about legs.' },
      { scope: 'undertaking', title: 'A carter to the wayshrine', lean: 'experience', text: 'Rode escort for a carter along the Ostermark road as far as the wayshrine and back, through pines that did not stand where the charcoal burners had left them. Someone had scratched the hammer off the wayshrine, recently, with claws. The carter made the sign of the hammer over the place where it had been, and paid them before they reached the village, in case.' },
    ],
  },
];
