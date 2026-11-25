/**
 * The builder's catalogues for the server and the tests: every warband's file and the library, read once. The browser
 * loads them one at a time instead (`src/lib/builder-data.ts`); the generator is `scripts/builder/normalise.mjs`.
 */
import { bundleOf, type Bundle, type CatalogueFile, type IndexFile, type LibraryFile } from './catalogue.ts';
import libraryJson from '../data/builder/library.json' with { type: 'json' };
import indexJson from '../data/builder/index.json' with { type: 'json' };
import averlanders from '../data/builder/averlanders.json' with { type: 'json' };
import beastmen_raiders from '../data/builder/beastmen-raiders.json' with { type: 'json' };
import carnival_of_chaos from '../data/builder/carnival-of-chaos.json' with { type: 'json' };
import cult_of_the_possessed from '../data/builder/cult-of-the-possessed.json' with { type: 'json' };
import dwarf_treasure_hunters from '../data/builder/dwarf-treasure-hunters.json' with { type: 'json' };
import kislevites from '../data/builder/kislevites.json' with { type: 'json' };
import marauders_of_chaos from '../data/builder/marauders-of-chaos.json' with { type: 'json' };
import marienburgers from '../data/builder/marienburgers.json' with { type: 'json' };
import middenheimers from '../data/builder/middenheimers.json' with { type: 'json' };
import orc_mob from '../data/builder/orc-mob.json' with { type: 'json' };
import ostlanders from '../data/builder/ostlanders.json' with { type: 'json' };
import reiklanders from '../data/builder/reiklanders.json' with { type: 'json' };
import sisters_of_sigmar from '../data/builder/sisters-of-sigmar.json' with { type: 'json' };
import skaven from '../data/builder/skaven.json' with { type: 'json' };
import undead from '../data/builder/undead.json' with { type: 'json' };
import witch_hunters from '../data/builder/witch-hunters.json' with { type: 'json' };

export const library = libraryJson as unknown as LibraryFile;
export const catalogueIndex = indexJson as unknown as IndexFile;
const files: Record<string, CatalogueFile> = {
  'averlanders': averlanders as unknown as CatalogueFile,
  'beastmen-raiders': beastmen_raiders as unknown as CatalogueFile,
  'carnival-of-chaos': carnival_of_chaos as unknown as CatalogueFile,
  'cult-of-the-possessed': cult_of_the_possessed as unknown as CatalogueFile,
  'dwarf-treasure-hunters': dwarf_treasure_hunters as unknown as CatalogueFile,
  'kislevites': kislevites as unknown as CatalogueFile,
  'marauders-of-chaos': marauders_of_chaos as unknown as CatalogueFile,
  'marienburgers': marienburgers as unknown as CatalogueFile,
  'middenheimers': middenheimers as unknown as CatalogueFile,
  'orc-mob': orc_mob as unknown as CatalogueFile,
  'ostlanders': ostlanders as unknown as CatalogueFile,
  'reiklanders': reiklanders as unknown as CatalogueFile,
  'sisters-of-sigmar': sisters_of_sigmar as unknown as CatalogueFile,
  'skaven': skaven as unknown as CatalogueFile,
  'undead': undead as unknown as CatalogueFile,
  'witch-hunters': witch_hunters as unknown as CatalogueFile,
};

const bundles = new Map<string, Bundle>();
/** The warband's catalogue with the library, by slug; undefined for a slug no catalogue has. */
export function bundleFor(slug: string): Bundle | undefined {
  const file = files[slug];
  if (!file) return undefined;
  let b = bundles.get(slug);
  if (!b) { b = bundleOf(library, file); bundles.set(slug, b); }
  return b;
}
export const catalogueSlugs = (): string[] => Object.keys(files);
