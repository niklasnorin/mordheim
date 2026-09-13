/**
 * Checking a Curfew content document before it goes into force. Pure. The same hard rules as
 * .claude/skills/curfew-pack/scripts/lint-pack.mjs, which stays the finer comb for prose; these are the ones a
 * broken document would turn into a night that cannot be written.
 */
import { ERRANDS, type CurfewDocuments, type Errand, type Location, type Moon, type Omen, type TokenDef } from './engine.ts';

export type DocumentId = 'omens' | 'moons' | 'tokens' | `location:${string}`;
export const DECK_IDS: DocumentId[] = ['omens', 'moons', 'tokens'];
export const locationDocId = (id: string): DocumentId => `location:${id}`;
export const isLocationDoc = (id: string): boolean => id.startsWith('location:');

const PROSE_SLOTS = ['name', 'first', 'they', 'them', 'their', 'district', 'omen', 'rival', 'other'];
const ENCOUNTER_SLOTS = [...PROSE_SLOTS, 'rivalMember'];
const HEADLINE_SLOTS = ['first', 'name', 'warband'];
const isStr = (x: unknown): x is string => typeof x === 'string';
const strList = (x: unknown): x is string[] => Array.isArray(x) && x.every(isStr);

/** Every problem that would stop the document being used. Empty means it may be saved. */
export function validateDocument(id: string, doc: unknown, context: { moonIds?: string[]; locationIds?: string[] } = {}): string[] {
  const errors: string[] = [];
  const fail = (m: string) => errors.push(m);
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return ['The document must be a JSON object.'];
  const d = doc as Record<string, unknown>;
  const slots = (text: string, allowed: string[], at: string) => { for (const [, slot] of text.matchAll(/\{(\w+)\}/g)) if (!allowed.includes(slot)) fail(`${at}: slot {${slot}} is not filled here (allowed: ${allowed.join(', ')})`); };
  const bank = (list: unknown, allowed: string[], at: string, min = 1) => {
    if (!strList(list)) { fail(`${at} must be a list of strings`); return; }
    if (list.length < min) fail(`${at} needs at least ${min}`);
    list.forEach((t, i) => slots(t, allowed, `${at}[${i}]`));
  };
  if (id === 'omens') {
    if (!Array.isArray(d.omens) || d.omens.length < 2) return ['omens must be a list of at least two Omens'];
    for (const o of d.omens as Partial<Omen>[]) {
      if (!isStr(o.id) || !isStr(o.title) || !isStr(o.reading) || !isStr(o.image)) fail(`omen ${o.id ?? '?'}: needs id, title, reading and image`);
      for (const [e, v] of Object.entries(o.tilt ?? {})) { if (!ERRANDS.includes(e as Errand)) fail(`omen ${o.id}: tilt for unknown errand ${e}`); if (typeof v !== 'number' || v < -2 || v > 2) fail(`omen ${o.id}: tilt.${e} outside -2..2`); }
    }
    const ids = (d.omens as Omen[]).map((o) => o.id);
    for (const x of new Set(ids)) if (ids.filter((y) => y === x).length > 1) fail(`omen id "${x}" repeats`);
  } else if (id === 'moons') {
    if (!Array.isArray(d.moons) || d.moons.length < 1) return ['moons must be a list of Moons'];
    for (const m of d.moons as Partial<Moon>[]) {
      if (!isStr(m.id) || !isStr(m.name) || !isStr(m.reading)) fail(`moon ${m.id ?? '?'}: needs id, name and reading`);
      if (!ERRANDS.includes(m.boost as Errand)) fail(`moon ${m.id}: boost must be an errand`);
      for (const [e, line] of Object.entries(m.ties ?? {})) { if (!ERRANDS.includes(e as Errand)) fail(`moon ${m.id}: tie for unknown errand ${e}`); if (!isStr(line)) fail(`moon ${m.id}: tie ${e} must be a string`); else slots(line, PROSE_SLOTS, `moon ${m.id}.ties.${e}`); }
    }
  } else if (id === 'tokens') {
    const types = d.types as Record<string, unknown> | undefined;
    for (const t of ['fortune', 'ground', 'market', 'sight']) if (!types || typeof types[t] !== 'object') fail(`types.${t} missing`);
    if (!Array.isArray(d.tokens) || d.tokens.length < 4) return [...errors, 'tokens must be a list of at least four charms'];
    for (const t of d.tokens as Partial<TokenDef>[]) {
      if (!isStr(t.id) || !isStr(t.name) || !isStr(t.effect)) fail(`token ${t.id ?? '?'}: needs id, name and effect`);
      if (!['fortune', 'ground', 'market', 'sight'].includes(t.type as string)) fail(`token ${t.id}: type "${t.type}"`);
      if (t.location && context.locationIds && !context.locationIds.includes(t.location)) fail(`token ${t.id}: location "${t.location}" is not a pack`);
    }
    for (const type of ['fortune', 'ground', 'market', 'sight']) if (!(d.tokens as TokenDef[]).some((t) => t.type === type && !t.location)) fail(`no charm of type ${type} without a location; every place needs one to draw`);
    const ids = (d.tokens as TokenDef[]).map((t) => t.id);
    for (const x of new Set(ids)) if (ids.filter((y) => y === x).length > 1) fail(`token id "${x}" repeats`);
    if (!Array.isArray(d.curses)) fail('curses must be a list');
    else for (const c of d.curses as { id?: unknown; name?: unknown; nights?: unknown }[]) if (!isStr(c.id) || !isStr(c.name) || typeof c.nights !== 'number') fail(`curse ${c.id ?? '?'}: needs id, name and nights`);
  } else if (isLocationDoc(id)) {
    const loc = d as Partial<Location>;
    const want = id.slice('location:'.length);
    if (loc.id !== want) fail(`the pack's id must be "${want}"`);
    for (const k of ['name', 'settlement', 'title', 'tagline', 'arrival', 'watchNote'] as const) if (!isStr(loc[k])) fail(`${k} must be a string`);
    if (!['city', 'village'].includes(loc.kind as string)) fail('kind must be city or village');
    if (!Array.isArray(loc.errands) || loc.errands.length < 1 || !loc.errands.every((e) => ERRANDS.includes(e))) return [...errors, 'errands must list at least one known errand'];
    if (loc.arrival) slots(loc.arrival, ['warband'], 'arrival');
    for (const e of ERRANDS) {
      if (loc.errands.includes(e)) {
        const t = loc.templates?.[e];
        if (!t) { fail(`templates.${e} missing`); continue; }
        for (const k of ['boon', 'fair', 'poor', 'standing'] as const) bank(t[k], PROSE_SLOTS, `templates.${e}.${k}`, 2);
        const h = loc.cryer?.headlines?.[e];
        if (!h) fail(`cryer.headlines.${e} missing`); else for (const k of ['boon', 'fair', 'poor'] as const) bank(h[k], HEADLINE_SLOTS, `cryer.headlines.${e}.${k}`, 3);
        bank(loc.epithets?.[e], [], `epithets.${e}`, 3);
      } else {
        if (!isStr(loc.unavailable?.[e])) fail(`unavailable.${e} missing; the Watch shows this line greyed`);
        const to = loc.redirect?.[e];
        if (to && !loc.errands.includes(to)) fail(`redirect.${e} → ${to}, which the place lacks`);
      }
    }
    for (const [e, from] of Object.entries(loc.inherits ?? {})) if (!loc.errands.includes(e as Errand) || !ERRANDS.includes(from as Errand)) fail(`inherits.${e} is not between known errands`);
    for (const [m, e] of Object.entries(loc.moonBoost ?? {})) { if (context.moonIds && !context.moonIds.includes(m)) fail(`moonBoost for unknown Moon ${m}`); if (!loc.errands.includes(e)) fail(`moonBoost.${m} → ${e}, which the place lacks`); }
    for (const [m, ties] of Object.entries(loc.moonTies ?? {})) {
      if (context.moonIds && !context.moonIds.includes(m)) fail(`moonTies for unknown Moon ${m}`);
      for (const [e, lines] of Object.entries(ties)) { if (!ERRANDS.includes(e as Errand)) fail(`moonTies.${m}.${e} is not an errand`); bank(Array.isArray(lines) ? lines : [lines], PROSE_SLOTS, `moonTies.${m}.${e}`); }
    }
    const cryer = loc.cryer;
    if (!cryer || !isStr(cryer.edition) || !isStr(cryer.banner) || !isStr(cryer.price) || !isStr(cryer.watchHeading) || !isStr(cryer.heard)) fail('cryer needs edition, banner, price, watchHeading and heard');
    bank(cryer?.bylines, [], 'cryer.bylines', 2);
    bank(loc.pairs, PROSE_SLOTS, 'pairs', 2);
    bank(loc.encounters, ENCOUNTER_SLOTS, 'encounters', 2);
    bank(loc.rumours, ['rival'], 'rumours', 2);
    for (const key of ['districts', 'details', 'closers', 'return', 'cityProvides', 'quiet'] as const) bank(loc[key], [], key, 2);
    if (loc.crossroads !== undefined) {
      if (!Array.isArray(loc.crossroads)) fail('crossroads must be a list');
      else for (const c of loc.crossroads) {
        if (!isStr(c.id) || !isStr(c.setup) || !Array.isArray(c.options) || c.options.length < 2) { fail(`crossroads ${c.id ?? '?'}: needs id, setup and at least two options`); continue; }
        if (!Array.isArray(c.errands) || !c.errands.every((e) => ERRANDS.includes(e))) fail(`crossroads ${c.id}: errands must be known errands`);
        for (const o of c.options) if (!isStr(o.id) || !isStr(o.label) || !isStr(o.outcome)) fail(`crossroads ${c.id}: every road needs id, label and outcome`);
      }
    }
  } else {
    fail(`Unknown document "${id}". Known: omens, moons, tokens, location:<id>.`);
  }
  return errors;
}

/** Turn stored documents into what the engine takes. Unknown ids are ignored; a missing deck falls back to the built-in. */
export function documentsFrom(rows: { id: string; document: unknown }[]): Partial<CurfewDocuments> {
  const out: Partial<CurfewDocuments> = {};
  const locations: Location[] = [];
  for (const r of rows) {
    if (r.id === 'omens') out.omens = r.document as CurfewDocuments['omens'];
    else if (r.id === 'moons') out.moons = r.document as CurfewDocuments['moons'];
    else if (r.id === 'tokens') out.tokens = r.document as CurfewDocuments['tokens'];
    else if (isLocationDoc(r.id)) locations.push(r.document as Location);
  }
  if (locations.length) out.locations = locations;
  return out;
}

/** The engine's built-in content, as the documents the database would hold. */
export function builtInRows(docs: CurfewDocuments): { id: DocumentId; document: unknown }[] {
  return [
    { id: 'omens', document: docs.omens }, { id: 'moons', document: docs.moons }, { id: 'tokens', document: docs.tokens },
    ...docs.locations.map((l) => ({ id: locationDocId(l.id), document: l })),
  ];
}

/** What a place's pack must carry to the browser: everything but the prose banks the engine alone reads. */
const CLIENT_LOCATION_KEYS: (keyof Location)[] = ['id', 'name', 'kind', 'settlement', 'title', 'tagline', 'errands', 'unavailable', 'redirect', 'inherits', 'moonBoost', 'art', 'arrival', 'watchNote', 'blurbs', 'cryer', 'cityProvides'];
/** The content the Curfew pages' scripts need, trimmed of the vignette banks so a phone does not download a novel. */
export function clientDocuments(docs: CurfewDocuments): CurfewDocuments {
  const slim = (l: Location): Location => Object.fromEntries(CLIENT_LOCATION_KEYS.filter((k) => l[k] !== undefined).map((k) => [k, l[k]])) as unknown as Location;
  return {
    omens: { omens: docs.omens.omens }, moons: { moons: docs.moons.moons }, tokens: { types: docs.tokens.types, tokens: docs.tokens.tokens, curses: docs.tokens.curses },
    locations: docs.locations.map((l) => ({ ...slim(l), templates: {}, districts: [], details: [], closers: [], pairs: [], encounters: [], rumours: [], return: [], quiet: [], epithets: {} })),
  };
}
