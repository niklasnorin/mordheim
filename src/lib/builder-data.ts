/**
 * The builder's catalogues in the browser: the index at once, the library and a warband's file when it is first
 * wanted, each its own chunk, so a page carries only what it shows.
 */
import { bundleOf, type Bundle, type CatalogueFile, type IndexFile, type LibraryFile } from '../builder/catalogue.ts';
import indexJson from '../data/builder/index.json';

export const catalogueIndex = indexJson as unknown as IndexFile;

const files = import.meta.glob<{ default: unknown }>(['../data/builder/*.json', '!../data/builder/index.json']);
const bundles = new Map<string, Promise<Bundle>>();

/** The warband's catalogue with the library, loaded once; rejects for a slug no catalogue has. */
export function loadBundle(slug: string): Promise<Bundle> {
  let b = bundles.get(slug);
  if (!b) {
    const lib = files['../data/builder/library.json'], own = files[`../data/builder/${slug}.json`];
    if (!lib || !own) return Promise.reject(new Error('No such warband in the catalogue.'));
    b = Promise.all([lib(), own()]).then(([l, o]) => bundleOf(l.default as LibraryFile, o.default as CatalogueFile));
    bundles.set(slug, b);
  }
  return b;
}
