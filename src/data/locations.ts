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
  },
];
