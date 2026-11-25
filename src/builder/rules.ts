/**
 * The campaign's rules for a warband that BattleScribe's data cannot say: the 500 crowns a warband is founded with,
 * how many warriors and heroes it may have, and how a roster reads as warriors on the muster roll (their statline,
 * gear, skills, old wounds and experience). Pure; the builder page and the server read the same.
 */
import { nodeOf, type Bundle } from './catalogue.ts';
import { evaluate, type Evaluation, type Roster, type Selection, type SelectionView } from './evaluate.ts';
import type { Statline } from '../campaign/model.ts';

/** What a new warband has to spend. What is left goes into its stash. */
export const STARTING_GOLD = 500;
/** No warband has more heroes than this, however many it promotes. */
export const MAX_HEROES = 6;
/** The most warriors each warband may field, from its rules; a warband not named here has 15. */
export const WARBAND_MAX: Record<string, number> = {
  'dwarf-treasure-hunters': 12, 'witch-hunters': 12, 'orc-mob': 20, skaven: 20,
};
export const DEFAULT_MAX = 15;
export const maxWarriors = (slug: string): number => WARBAND_MAX[slug] ?? DEFAULT_MAX;
/** A henchman group is one to five warriors alike. */
export const GROUP_MAX = 5;

/** The catalogue's warband types, matched to what the record calls them ("Ostlanders"). */
export function slugForType(type: string, slugs: string[]): string | undefined {
  const norm = (s: string) => s.toLowerCase().replace(/\s*\(.*?\)\s*/g, '').replace(/[’']/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const t = norm(type);
  return slugs.find((s) => s === t) ?? slugs.find((s) => t.includes(s) || s.includes(t));
}

// ───────────────────────── reading the warriors out of a roster ─────────────────────────

export interface Warrior {
  /** The roster selection: a hero, or a henchman group. */
  id: string;
  kind: 'hero' | 'henchmen';
  /** What the catalogue calls them: "Champion", "Warriors". */
  type: string;
  /** How many: 1 for a hero, the group's size for henchmen. */
  count: number;
  /** The warriors on the record this selection is: one for a hero, one per model in a group. */
  members: string[];
  /** The model selection inside a henchman group, which carries the count. */
  modelId?: string;
  promoted: boolean;
  stats: Statline;
  equipment: string[];
  skills: string[];
  injuries: string[];
  experience: number;
  /** The selection ids of their gear, for moving it. */
  gear: { id: string; name: string; target: string; count: number }[];
  /** Everything else under them by selection, for changing it: skills, rules, old wounds, advances. */
  parts: { id: string; name: string; kind: 'skill' | 'injury' | 'advance'; count: number }[];
  /** Their experience selection, if the catalogue gives them one. */
  experienceId?: string;
  /** Gold and rating, with everything they carry. */
  cost: number;
  rating: number;
  errors: string[];
}

const STAT_NAMES: Record<string, keyof Statline> = { M: 'M', WS: 'WS', BS: 'BS', S: 'S', T: 'T', W: 'W', I: 'I', A: 'A', LD: 'Ld', LD_: 'Ld', Ld: 'Ld' };
const GEAR_PROFILES = new Set(['Ranged Weapon', 'H-t-h Weapon', 'Armour']);
const CONTAINERS = /^(Starting Equipment|Trading Post|Equipment)\b/i;
const GEAR_GROUPS = /^(Equipment|Armour|Hand-to-hand|Missile|Miscellaneous|Blackpowder|Animals|Mounts)/i;
const ADVANCE_GROUPS = /^Characteristic (Increases|Decreases)/i;
const SKIP = /^(Promoted|Variable Gold Cost|Grade|Core|DummyEntry)$/i;

export function statlineOf(v: SelectionView | undefined): Statline {
  const out: Statline = { M: 0, WS: 0, BS: 0, S: 0, T: 0, W: 0, I: 0, A: 0, Ld: 0 };
  const p = v?.profiles.find((x) => x.typeName === 'Model');
  if (!p) return out;
  for (const c of p.chars) { const k = STAT_NAMES[c.name.toUpperCase()] ?? STAT_NAMES[c.name]; if (k) out[k] = parseInt(c.value, 10) || 0; }
  return out;
}

const isGear = (v: SelectionView, underContainer: boolean) =>
  v.profiles.some((p) => GEAR_PROFILES.has(p.typeName)) || underContainer || v.groups.some((g) => GEAR_GROUPS.test(g));

/** Sort what is under a warrior into gear, skills, old wounds and experience. */
function sortOut(v: SelectionView, into: Warrior, underContainer = false): void {
  for (const c of v.children) {
    if (c.type === 'model') { sortOut(c, into, underContainer); continue; }
    if (SKIP.test(c.name)) { if (/^Promoted$/i.test(c.name)) into.promoted = true; continue; }
    if (/^Experience$/i.test(c.name)) { into.experience += c.count; into.experienceId ??= c.id; continue; }
    if (CONTAINERS.test(c.name) && !c.profiles.length) { sortOut(c, into, true); continue; }
    if (c.groups.some((g) => ADVANCE_GROUPS.test(g))) { into.parts.push({ id: c.id, name: c.name, kind: 'advance', count: c.count }); continue; }
    if (c.groups.some((g) => /Serious Injuries/i.test(g))) { for (let i = 0; i < c.count; i++) into.injuries.push(c.name); into.parts.push({ id: c.id, name: c.name, kind: 'injury', count: c.count }); continue; }
    if (isGear(c, underContainer)) {
      into.equipment.push(c.count > 1 ? `${c.name} ×${c.count}` : c.name);
      into.gear.push({ id: c.id, name: c.name, target: c.target, count: c.count });
      continue;
    }
    into.skills.push(c.name);
    into.parts.push({ id: c.id, name: c.name, kind: 'skill', count: c.count });
    // a skill or rule may carry its own choices (a spell list, a mutation's form)
    if (c.children.length) sortOut(c, into, false);
  }
}

/** Every warrior and henchman group on a roster, read as the record keeps them. */
export function warriorsOf(b: Bundle, roster: Roster, ev: Evaluation = evaluate(b, roster)): Warrior[] {
  const heroCat = Object.entries(b.system.categories).find(([, n]) => n === 'Heroes')?.[0];
  const henchCat = Object.entries(b.system.categories).find(([, n]) => n === 'Henchmen')?.[0];
  const out: Warrior[] = [];
  for (const s of roster.selections) {
    const v = ev.byId.get(s.id);
    if (!v) continue;
    const hero = !!heroCat && v.categories.includes(heroCat);
    const hench = !!henchCat && v.categories.includes(henchCat);
    if (!hero && !hench) continue;
    const model = v.type === 'unit' ? v.children.find((c) => c.type === 'model') : undefined;
    const w: Warrior = {
      id: s.id, kind: hero ? 'hero' : 'henchmen', type: nodeOf(b, s.entry)?.name ?? v.name, count: model ? model.count : v.count,
      members: s.members ?? [], modelId: model?.id, promoted: false,
      stats: statlineOf(v.profiles.some((p) => p.typeName === 'Model') ? v : model), equipment: [], skills: [...v.rules], injuries: [], experience: 0, gear: [], parts: [],
      cost: v.total.points ?? 0, rating: v.total['wb-rating'] ?? 0, errors: v.errors,
    };
    sortOut(v, w);
    if (w.promoted) w.kind = 'hero';
    out.push(w);
  }
  return out;
}

// ───────────────────────── the stash ─────────────────────────

export const isStash = (b: Bundle, s: Selection): boolean => /^Stash$/i.test(nodeOf(b, s.entry)?.name ?? '');
export const stashOf = (b: Bundle, roster: Roster): Selection | undefined => roster.selections.find((s) => isStash(b, s));

/** The stash's items: everything under it, through its equipment group. */
export function stashItems(b: Bundle, roster: Roster, ev: Evaluation = evaluate(b, roster)): { id: string; name: string; target: string; count: number }[] {
  const s = stashOf(b, roster);
  const v = s ? ev.byId.get(s.id) : undefined;
  if (!v) return [];
  return v.children.filter((c) => !SKIP.test(c.name) && !/^Wyrdstone$/i.test(c.name)).map((c) => ({ id: c.id, name: c.name, target: c.target, count: c.count }));
}

// ───────────────────────── the whole warband ─────────────────────────

export interface Summary {
  warriors: Warrior[];
  /** Warriors in all: heroes, and every henchman in every group. */
  size: number;
  heroes: number;
  /** Gold the warriors and their gear are worth, the stash left out. */
  spent: number;
  rating: number;
  errors: string[];
  warnings: string[];
}

export function summarise(b: Bundle, roster: Roster): Summary {
  const ev = evaluate(b, roster);
  const warriors = warriorsOf(b, roster, ev);
  const size = warriors.reduce((n, w) => n + w.count, 0);
  const heroes = warriors.filter((w) => w.kind === 'hero').reduce((n, w) => n + w.count, 0);
  const stash = stashOf(b, roster);
  const stashGold = stash ? ev.byId.get(stash.id)?.total.points ?? 0 : 0;
  const errors = [...ev.errors];
  const max = maxWarriors(roster.catalogue);
  if (size > max) errors.push(`The warband may field no more than ${max} warriors; it has ${size}.`);
  if (heroes > MAX_HEROES) errors.push(`The warband may have no more than ${MAX_HEROES} heroes; it has ${heroes}.`);
  for (const w of warriors) if (w.kind === 'henchmen' && !w.promoted && w.count > GROUP_MAX) errors.push(`${w.type}: a henchman group is no more than ${GROUP_MAX}.`);
  // the data's own advice on promotion is for BattleScribe's way of doing it; the site promotes for you
  const own = errors.filter((e) => !/duplicate the group/i.test(e));
  return { warriors, size, heroes, spent: (ev.totals.points ?? 0) - stashGold, rating: ev.totals['wb-rating'] ?? 0, errors: [...new Set(own)], warnings: ev.warnings };
}

// ───────────────────────── the roster as text ─────────────────────────

const statText = (s: Statline) => `M${s.M} WS${s.WS} BS${s.BS} S${s.S} T${s.T} W${s.W} I${s.I} A${s.A} Ld${s.Ld}`;

/** The roster written out plainly, for pasting where the other players read it. */
export function rosterText(b: Bundle, roster: Roster, opts: { name?: string; names?: Record<string, string[]>; stash?: number } = {}): string {
  const s = summarise(b, roster);
  const lines: string[] = [];
  const title = b.catalogue.title ?? b.catalogue.name;
  lines.push(opts.name ? `${opts.name} (${title})` : title);
  lines.push(`${s.spent} gc in warriors and gear${opts.stash != null ? `, ${opts.stash} gc in the stash` : ''}; rating ${s.rating}; ${s.size} warriors, ${s.heroes} heroes.`);
  for (const w of s.warriors) {
    const names = (opts.names?.[w.id] ?? w.members).filter(Boolean);
    const who = names.length ? ` — ${names.join(', ')}` : '';
    lines.push('');
    lines.push(`${w.kind === 'henchmen' && w.count > 1 ? `${w.type} ×${w.count}` : w.type}${who} (${w.cost} gc)`);
    lines.push(`  ${statText(w.stats)}${w.experience ? `, ${w.experience} experience` : ''}`);
    if (w.equipment.length) lines.push(`  Gear: ${w.equipment.join(', ')}`);
    if (w.skills.length) lines.push(`  Skills and rules: ${w.skills.join(', ')}`);
    if (w.injuries.length) lines.push(`  Old wounds: ${w.injuries.join(', ')}`);
  }
  const items = stashItems(b, roster);
  if (items.length) { lines.push(''); lines.push(`Stash: ${items.map((i) => (i.count > 1 ? `${i.name} ×${i.count}` : i.name)).join(', ')}`); }
  return lines.join('\n');
}
