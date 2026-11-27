/**
 * The settings: templates a new campaign is made from (`docs/campaigns.md`). A setting is code, written as a commit:
 * a world's default dials for the Curfew, a suggested time zone and Imperial year, the Curfew's decks and places, the
 * locations the campaign starts with, which warband lists it allows and the crowns a warband is founded with. A
 * campaign is the record's: a game master makes one from a setting in the Watch House, and from then on the campaign's
 * own documents and options rule, so changing a setting changes no campaign already made.
 *
 * The first setting is the City of the Damned: the files under `src/data/` as they are. A new world (Lustria, the
 * Empire in Flames) is a folder beside this file with its own documents, registered below.
 */
import campaignJson from '../curfew/campaign.json' with { type: 'json' };
import { BUILT_IN_DOCUMENTS, type CurfewDocuments } from '../../curfew/engine.ts';
import { tuningOf, type CampaignTuning } from '../../campaign/campaign.ts';
import { locations as cityLocations, type LocationFixture } from '../locations.ts';

export interface Setting {
  id: string;
  name: string;
  /** A sentence for the game master choosing one. */
  description: string;
  /** The Curfew's dials a campaign starts with. */
  tuning: CampaignTuning;
  timezone: string;
  /** The Imperial year a campaign of this setting is usually set in, for the anchor's suggestion. */
  year: number;
  /** The decks and the places. */
  documents: CurfewDocuments;
  /** The locations a campaign starts with: the atlas gains any it lacks, and the campaign fights in these. */
  locations: LocationFixture[];
  /** The place the campaign's nights start in. */
  firstPlace: string;
  /** The warband lists a warband may be founded from; null for every one. */
  catalogues: string[] | null;
  startingCrowns: number;
}

export const SETTINGS: Setting[] = [
  {
    id: 'city-of-the-damned',
    name: 'Mordheim, City of the Damned',
    description: 'The ruins of Mordheim and the village of Fussenbach downriver: the rulebook’s city, with every warband list.',
    tuning: tuningOf(campaignJson),
    timezone: campaignJson.timezone,
    year: 2004,
    documents: BUILT_IN_DOCUMENTS,
    locations: cityLocations,
    firstPlace: 'mordheim',
    catalogues: null,
    startingCrowns: 500,
  },
];

export function settingFor(id: string): Setting | undefined { return SETTINGS.find((s) => s.id === id); }
