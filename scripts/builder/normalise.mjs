#!/usr/bin/env node
/**
 * The warband builder's catalogue, from the BattleScribe data files.
 *
 * The rules of each warband (who may be hired, what they cost, what they may carry, how their advances change them)
 * are kept by the community as BattleScribe XML: one game system (`Mordheim.gst`), a shared library (`data.cat`) and a
 * catalogue per warband. This script reads them and writes compact JSON under `src/data/builder/`: `library.json`
 * (the game system and the shared library) and one file per warband, which `src/builder/` evaluates. The output is
 * committed, so the site never reads the XML; run this again when the data files change.
 *
 *   node scripts/builder/normalise.mjs [path/to/mordheim-fork]     write the JSON (default ../mordheim-fork)
 *   node scripts/builder/normalise.mjs --check [path]              only report, and fail on anything the engine does
 *                                                                  not understand or on JSON that is out of date
 *
 * Kept: names, costs, profiles, categories, constraints, modifiers, conditions, repeats and the names of rules.
 * Left out: the rules' long text (it is the rulebook's, and the profiles carry the short version), page numbers,
 * publications and BattleScribe's display hints. Hired Swords and Dramatis Personae (`Characters.cat`) are not part
 * of the builder yet.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';

const args = process.argv.slice(2);
const check = args.includes('--check');
const source = resolve(args.find((a) => !a.startsWith('--')) ?? '../mordheim-fork');
const out = resolve('src/data/builder');

// ───────────────────────── what the engine understands (keep in step with src/builder/evaluate.ts) ─────────────────────────

const SUPPORTED = {
  modifierTypes: new Set(['set', 'increment', 'decrement', 'prepend', 'append', 'add', 'remove', 'divide', 'multiply']),
  conditionTypes: new Set(['atLeast', 'atMost', 'equalTo', 'notEqualTo', 'greaterThan', 'lessThan', 'instanceOf', 'notInstanceOf']),
  constraintTypes: new Set(['min', 'max']),
  scopes: new Set(['self', 'parent', 'ancestor', 'root-entry', 'force', 'roster', 'model', 'unit', 'primary-catalogue', 'primary-category']),
  /** Modifier fields the engine applies; a constraint id, a characteristic id or a cost type id are understood too. */
  fields: new Set(['hidden', 'name', 'error', 'warning', 'category']),
  /** Fields it knowingly ignores: no Mordheim catalogue uses them to any effect. */
  ignored: new Set(['minSelections', 'defaultAmount', 'description', 'annotation', 'page']),
};

// ───────────────────────── a small XML reader: elements, attributes, text; enough for BattleScribe ─────────────────────────

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: '’' };
const decode = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) => (e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : ENTITIES[e] ?? m));

function parseXml(text) {
  const root = { tag: '#root', attrs: {}, children: [], text: '' };
  const stack = [root];
  const re = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[([\s\S]*?)\]\]>|<\/([\w:.-]+)\s*>|<([\w:.-]+)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/g;
  let m;
  while ((m = re.exec(text))) {
    const top = stack[stack.length - 1];
    if (m[1] !== undefined) top.text += m[1];
    else if (m[2]) { if (stack.length > 1) stack.pop(); }
    else if (m[3]) {
      const attrs = {};
      for (const a of m[4].matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) attrs[a[1]] = decode(a[2] ?? a[3] ?? '');
      const el = { tag: m[3], attrs, children: [], text: '' };
      top.children.push(el);
      if (!m[5]) stack.push(el);
    } else if (m[6] !== undefined && !m[0].startsWith('<')) top.text += decode(m[6]);
  }
  return root.children.find((c) => !c.tag.startsWith('#'));
}
const kids = (el, tag) => (el?.children ?? []).filter((c) => c.tag === tag);
const kid = (el, tag) => (el?.children ?? []).find((c) => c.tag === tag);
const list = (el, wrap, tag) => kids(kid(el, wrap), tag);
const num = (v) => (v === undefined || v === '' ? undefined : Number(v));
const yes = (v) => v === 'true';

// ───────────────────────── the shapes written ─────────────────────────

const report = { modifierTypes: {}, conditionTypes: {}, constraintTypes: {}, scopes: {}, fields: {}, unknown: [], collisions: [] };
const bump = (bag, k) => { bag[k] = (bag[k] ?? 0) + 1; };

function constraintOf(c) {
  bump(report.constraintTypes, c.attrs.type);
  bump(report.scopes, scopeKind(c.attrs.scope));
  const o = { id: c.attrs.id, type: c.attrs.type, field: c.attrs.field, scope: c.attrs.scope, value: num(c.attrs.value) ?? 0 };
  if (yes(c.attrs.shared)) o.shared = true;
  if (yes(c.attrs.includeChildSelections)) o.inc = true;
  if (yes(c.attrs.includeChildForces)) o.forces = true;
  if (yes(c.attrs.percentValue)) o.percent = true;
  return o;
}
function conditionOf(c) {
  bump(report.conditionTypes, c.attrs.type);
  bump(report.scopes, scopeKind(c.attrs.scope));
  const o = { type: c.attrs.type, field: c.attrs.field, scope: c.attrs.scope, childId: c.attrs.childId, value: num(c.attrs.value) ?? 0 };
  if (yes(c.attrs.shared)) o.shared = true;
  if (yes(c.attrs.includeChildSelections)) o.inc = true;
  if (yes(c.attrs.includeChildForces)) o.forces = true;
  return o;
}
function groupOf(g) {
  const o = { type: g.attrs.type };
  const cs = list(g, 'conditions', 'condition').map(conditionOf);
  const gs = list(g, 'conditionGroups', 'conditionGroup').map(groupOf);
  if (cs.length) o.conditions = cs;
  if (gs.length) o.groups = gs;
  return o;
}
function repeatOf(r) {
  bump(report.scopes, scopeKind(r.attrs.scope));
  const o = { field: r.attrs.field, scope: r.attrs.scope, childId: r.attrs.childId, value: num(r.attrs.value) ?? 1, repeats: num(r.attrs.repeats) ?? 1 };
  if (yes(r.attrs.roundUp)) o.roundUp = true;
  if (yes(r.attrs.shared)) o.shared = true;
  if (yes(r.attrs.includeChildSelections)) o.inc = true;
  return o;
}
function modifierOf(m) {
  bump(report.modifierTypes, m.attrs.type);
  bump(report.fields, m.attrs.field);
  const o = { type: m.attrs.type, field: m.attrs.field, value: m.attrs.value ?? '' };
  if (m.attrs.scope) o.scope = m.attrs.scope;
  const cs = list(m, 'conditions', 'condition').map(conditionOf);
  const gs = list(m, 'conditionGroups', 'conditionGroup').map(groupOf);
  const rs = list(m, 'repeats', 'repeat').map(repeatOf);
  if (cs.length) o.conditions = cs;
  if (gs.length) o.groups = gs;
  if (rs.length) o.repeats = rs;
  return o;
}
const scopeKind = (s) => (SUPPORTED.scopes.has(s) ? s : s ? 'entry' : 'none');

function costsOf(el) {
  const out = {};
  for (const c of list(el, 'costs', 'cost')) out[c.attrs.typeId] = num(c.attrs.value) ?? 0;
  return out;
}
function categoriesOf(el) {
  const links = list(el, 'categoryLinks', 'categoryLink');
  if (!links.length) return {};
  const o = { categories: links.map((l) => l.attrs.targetId) };
  const primary = links.find((l) => yes(l.attrs.primary));
  if (primary) o.primary = primary.attrs.targetId;
  return o;
}
function common(el, o) {
  if (yes(el.attrs.hidden)) o.hidden = true;
  const cons = list(el, 'constraints', 'constraint').map(constraintOf);
  const mods = list(el, 'modifiers', 'modifier').map(modifierOf);
  if (cons.length) o.constraints = cons;
  if (mods.length) o.modifiers = mods;
  return o;
}

/** Every element with an id is written flat, keyed by id; children are lists of ids. */
function collect(el, defs, links, rules, file) {
  // an id is meant to be unique; where the data repeats one for something different, the second gets a suffix
  const put = (bag, o) => {
    if (bag[o.id] && JSON.stringify(bag[o.id]) !== JSON.stringify(o)) {
      report.collisions.push(`${file}: ${o.id} (${o.name})`);
      let n = 2;
      while (bag[`${o.id}~${n}`]) n++;
      o.id = `${o.id}~${n}`;
    }
    bag[o.id] = o;
  };
  const childrenOf = (node) => {
    const ids = [];
    for (const e of list(node, 'selectionEntries', 'selectionEntry')) ids.push(entry(e));
    for (const g of list(node, 'selectionEntryGroups', 'selectionEntryGroup')) ids.push(group(g));
    for (const l of list(node, 'entryLinks', 'entryLink')) ids.push(link(l));
    return ids;
  };
  const rulesOf = (node) => {
    const ids = [];
    for (const r of list(node, 'rules', 'rule')) { put(rules, { id: r.attrs.id, name: r.attrs.name }); ids.push(r.attrs.id); }
    for (const i of list(node, 'infoLinks', 'infoLink')) if (i.attrs.type === 'rule') ids.push(i.attrs.targetId);
    return ids;
  };
  function entry(e) {
    const o = { k: 'e', id: e.attrs.id, name: e.attrs.name, type: e.attrs.type };
    if (yes(e.attrs.collective)) o.collective = true;
    const costs = costsOf(e);
    if (Object.keys(costs).length) o.costs = costs;
    Object.assign(o, categoriesOf(e));
    common(e, o);
    const profiles = list(e, 'profiles', 'profile').map((p) => {
      const po = { id: p.attrs.id, name: p.attrs.name, type: p.attrs.typeId, chars: {} };
      for (const c of list(p, 'characteristics', 'characteristic')) po.chars[c.attrs.typeId] = (c.text ?? '').trim();
      const mods = list(p, 'modifiers', 'modifier').map(modifierOf);
      if (mods.length) po.modifiers = mods;
      if (yes(p.attrs.hidden)) po.hidden = true;
      return po;
    });
    if (profiles.length) o.profiles = profiles;
    const r = rulesOf(e);
    if (r.length) o.rules = r;
    const c = childrenOf(e);
    if (c.length) o.children = c;
    put(defs, o);
    return o.id;
  }
  function group(g) {
    const o = { k: 'g', id: g.attrs.id, name: g.attrs.name };
    if (g.attrs.defaultSelectionEntryId) o.defaultId = g.attrs.defaultSelectionEntryId;
    common(g, o);
    const c = childrenOf(g);
    if (c.length) o.children = c;
    put(defs, o);
    return o.id;
  }
  function link(l) {
    const o = { k: 'l', id: l.attrs.id, name: l.attrs.name, target: l.attrs.targetId, kind: l.attrs.type === 'selectionEntryGroup' ? 'g' : 'e' };
    const costs = costsOf(l);
    if (Object.keys(costs).length) o.costs = costs;
    Object.assign(o, categoriesOf(l));
    common(l, o);
    put(links, o);
    return o.id;
  }
  return { childrenOf, rulesOf, entry, group, link };
}

function readCatalogue(path) {
  const root = parseXml(readFileSync(path, 'utf8'));
  const defs = {}, links = {}, rules = {};
  const c = collect(root, defs, links, rules, basename(path));
  for (const e of list(root, 'sharedSelectionEntries', 'selectionEntry')) c.entry(e);
  for (const g of list(root, 'sharedSelectionEntryGroups', 'selectionEntryGroup')) c.group(g);
  for (const r of list(root, 'sharedRules', 'rule')) rules[r.attrs.id] = { id: r.attrs.id, name: r.attrs.name };
  c.rulesOf(root);
  const roots = c.childrenOf(root);
  const catalogue = {
    id: root.attrs.id, name: root.attrs.name, revision: num(root.attrs.revision) ?? 0, library: yes(root.attrs.library),
    imports: list(root, 'catalogueLinks', 'catalogueLink').filter((l) => yes(l.attrs.importRootEntries)).map((l) => l.attrs.targetId),
    links: list(root, 'catalogueLinks', 'catalogueLink').map((l) => l.attrs.targetId),
    roots,
  };
  return { catalogue, defs, links, rules };
}

function readSystem(path) {
  const root = parseXml(readFileSync(path, 'utf8'));
  const costTypes = list(root, 'costTypes', 'costType').map((c) => ({ id: c.attrs.id, name: c.attrs.name.trim() }));
  const profileTypes = {};
  for (const p of list(root, 'profileTypes', 'profileType')) profileTypes[p.attrs.id] = { name: p.attrs.name, chars: list(p, 'characteristicTypes', 'characteristicType').map((c) => ({ id: c.attrs.id, name: c.attrs.name })) };
  const categories = {};
  for (const c of list(root, 'categoryEntries', 'categoryEntry')) categories[c.attrs.id] = c.attrs.name;
  const forces = list(root, 'forceEntries', 'forceEntry').map((f) => ({
    id: f.attrs.id, name: f.attrs.name,
    categories: list(f, 'categoryLinks', 'categoryLink').map((l) => { const o = { id: l.attrs.id, target: l.attrs.targetId, name: l.attrs.name }; common(l, o); return o; }),
  }));
  return { id: root.attrs.id, name: root.attrs.name, revision: num(root.attrs.revision) ?? 0, costTypes, profileTypes, categories, forces };
}

// ───────────────────────── run ─────────────────────────

if (!existsSync(join(source, 'Mordheim.gst'))) {
  // the check runs where the data files are checked out beside the site; anywhere else there is nothing to compare
  if (check) { console.log(`No Mordheim.gst under ${source}; the catalogue check is skipped.`); process.exit(0); }
  console.error(`No Mordheim.gst under ${source}. Pass the path to the data files.`);
  process.exit(2);
}

const system = readSystem(join(source, 'Mordheim.gst'));
const files = readdirSync(source).filter((f) => f.endsWith('.cat') && f !== 'Characters.cat').sort();
const read = Object.fromEntries(files.map((f) => [f, readCatalogue(join(source, f))]));
const libraryFile = files.find((f) => read[f].catalogue.library && read[f].catalogue.name === 'data');
if (!libraryFile) { console.error('No data.cat library found.'); process.exit(2); }
const lib = read[libraryFile];

const slugOf = (name) => name.replace(/\s*\(.*?\)\s*/g, '').toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const outputs = { 'library.json': { system, catalogue: lib.catalogue, defs: lib.defs, links: lib.links, rules: lib.rules } };
const index = [];
for (const f of files) {
  const r = read[f];
  if (r.catalogue.library) continue;
  const slug = slugOf(r.catalogue.name);
  const grade = /\(([^)]+)\)/.exec(r.catalogue.name)?.[1] ?? '';
  const name = r.catalogue.name.replace(/\s*\(.*?\)\s*/g, '').trim();
  // an id the warband shares with the library is only a copy; drop it so the library's stays the one
  for (const bag of ['defs', 'links', 'rules']) for (const id of Object.keys(r[bag])) if (lib[bag][id]) { if (JSON.stringify(lib[bag][id]) !== JSON.stringify(r[bag][id])) report.collisions.push(`${f}: ${id} differs from the library's`); delete r[bag][id]; }
  outputs[`${slug}.json`] = { catalogue: { ...r.catalogue, slug, title: name, grade }, defs: r.defs, links: r.links, rules: r.rules };
  index.push({ slug, id: r.catalogue.id, name, grade, revision: r.catalogue.revision });
}
outputs['index.json'] = { system: { id: system.id, revision: system.revision }, library: { id: lib.catalogue.id, revision: lib.catalogue.revision }, warbands: index };

// what the engine does not understand
for (const [k, n] of Object.entries(report.modifierTypes)) if (!SUPPORTED.modifierTypes.has(k)) report.unknown.push(`modifier type ${k} ×${n}`);
for (const [k, n] of Object.entries(report.conditionTypes)) if (!SUPPORTED.conditionTypes.has(k)) report.unknown.push(`condition type ${k} ×${n}`);
for (const [k, n] of Object.entries(report.constraintTypes)) if (!SUPPORTED.constraintTypes.has(k)) report.unknown.push(`constraint type ${k} ×${n}`);
const allIds = new Set();
for (const o of Object.values(outputs)) for (const bag of ['defs', 'links']) for (const id of Object.keys(o[bag] ?? {})) allIds.add(id);
for (const o of Object.values(outputs)) for (const bag of ['defs', 'links']) for (const d of Object.values(o[bag] ?? {})) for (const c of d.constraints ?? []) allIds.add(c.id);
const charIds = new Set(Object.values(system.profileTypes).flatMap((p) => p.chars.map((c) => c.id)));
const costIds = new Set(system.costTypes.map((c) => c.id).concat(['rarity']));
for (const [k, n] of Object.entries(report.fields)) {
  if (SUPPORTED.fields.has(k) || SUPPORTED.ignored.has(k) || charIds.has(k) || costIds.has(k) || allIds.has(k)) continue;
  report.unknown.push(`modifier field ${k} ×${n}`);
}

const fmt = (bag) => Object.entries(bag).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(', ');
console.log(`Mordheim data: ${index.length} warbands, ${Object.keys(lib.defs).length} library entries.`);
console.log(`  modifiers: ${fmt(report.modifierTypes)}`);
console.log(`  conditions: ${fmt(report.conditionTypes)}`);
console.log(`  scopes: ${fmt(report.scopes)}`);
if (report.collisions.length) console.log(`  ${report.collisions.length} id(s) used twice in the data for different things (the second given a suffix):\n    ${report.collisions.slice(0, 10).join('\n    ')}`);
if (report.unknown.length) console.log(`  not understood by the engine:\n    ${report.unknown.join('\n    ')}`);

let stale = 0;
if (!check) mkdirSync(out, { recursive: true });
for (const [file, data] of Object.entries(outputs)) {
  const text = JSON.stringify(data) + '\n';
  const path = join(out, file);
  const old = existsSync(path) ? readFileSync(path, 'utf8') : null;
  if (check) { if (old !== text) { stale++; console.log(`  out of date: src/data/builder/${file}`); } continue; }
  if (old !== text) writeFileSync(path, text);
}
if (!check) console.log(`Wrote ${Object.keys(outputs).length} files to src/data/builder/.`);
if (report.unknown.length || stale) process.exit(1);
