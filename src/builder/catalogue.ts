/**
 * The shape of the builder's catalogue: the BattleScribe data files as `scripts/builder/normalise.mjs` writes them
 * under `src/data/builder/`. Every entry, group and link is kept flat by id; a node's children are ids. A warband's
 * file is evaluated together with `library.json` (the game system and the shared library it links to); `bundleOf`
 * puts the two together and `nodeOf` resolves a link onto its target the way BattleScribe does.
 */

export interface Condition {
  type: 'atLeast' | 'atMost' | 'equalTo' | 'notEqualTo' | 'greaterThan' | 'lessThan' | 'instanceOf' | 'notInstanceOf';
  field: string;
  scope: string;
  childId: string;
  value: number;
  shared?: boolean;
  /** Count every selection under the scope, not only its own children. */
  inc?: boolean;
  forces?: boolean;
}
export interface ConditionGroup { type: 'and' | 'or'; conditions?: Condition[]; groups?: ConditionGroup[] }
export interface Repeat { field: string; scope: string; childId: string; value: number; repeats: number; roundUp?: boolean; shared?: boolean; inc?: boolean }
export interface Modifier {
  type: 'set' | 'increment' | 'decrement' | 'prepend' | 'append' | 'add' | 'remove' | 'divide' | 'multiply';
  /** What changes: hidden, name, error, warning, a cost type, a constraint's id or a characteristic's id. */
  field: string;
  value: string;
  /** Where the change lands, when not on the entry itself: `parent` names the parent ("Gromril" before "Sword"). */
  scope?: string;
  conditions?: Condition[];
  groups?: ConditionGroup[];
  repeats?: Repeat[];
}
export interface Constraint { id: string; type: 'min' | 'max'; field: string; scope: string; value: number; shared?: boolean; inc?: boolean; forces?: boolean; percent?: boolean }
export interface Profile { id: string; name: string; type: string; chars: Record<string, string>; modifiers?: Modifier[]; hidden?: boolean }

interface Common { id: string; name: string; hidden?: boolean; constraints?: Constraint[]; modifiers?: Modifier[] }
export interface EntryDef extends Common {
  k: 'e';
  type: 'model' | 'unit' | 'upgrade';
  collective?: boolean;
  costs?: Record<string, number>;
  categories?: string[];
  primary?: string;
  profiles?: Profile[];
  rules?: string[];
  children?: string[];
}
export interface GroupDef extends Common { k: 'g'; defaultId?: string; children?: string[] }
export interface LinkDef extends Common { k: 'l'; target: string; kind: 'e' | 'g'; costs?: Record<string, number>; categories?: string[]; primary?: string }
export type Def = EntryDef | GroupDef;

export interface CatalogueHead { id: string; name: string; revision: number; library: boolean; imports: string[]; links: string[]; roots: string[]; slug?: string; title?: string; grade?: string }
export interface CatalogueFile { catalogue: CatalogueHead; defs: Record<string, Def>; links: Record<string, LinkDef>; rules: Record<string, { id: string; name: string }> }
export interface CharType { id: string; name: string }
export interface SystemDef {
  id: string; name: string; revision: number;
  costTypes: { id: string; name: string }[];
  profileTypes: Record<string, { name: string; chars: CharType[] }>;
  categories: Record<string, string>;
  forces: { id: string; name: string; categories: { id: string; target: string; name: string; constraints?: Constraint[]; modifiers?: Modifier[]; hidden?: boolean }[] }[];
}
export interface LibraryFile extends CatalogueFile { system: SystemDef }
export interface IndexFile { warbands: { slug: string; id: string; name: string; grade: string; revision: number }[] }

/** A warband's catalogue with the library it links to, ready to evaluate. */
export interface Bundle {
  system: SystemDef;
  /** The warband's own catalogue. */
  catalogue: CatalogueHead;
  defs: Record<string, Def>;
  links: Record<string, LinkDef>;
  rules: Record<string, { id: string; name: string }>;
  /** The entries a warband is founded from: the warband's own and those of the catalogues it imports. */
  roots: string[];
  /** The force the warband is mustered in, and the categories it allows at its root. */
  force: SystemDef['forces'][number];
  /** Memo of resolved nodes. */
  nodes: Map<string, Node>;
}

export function bundleOf(library: LibraryFile, warband: CatalogueFile): Bundle {
  const system = library.system;
  const force = system.forces.find((f) => f.categories.some((c) => system.categories[c.target] === 'Heroes')) ?? system.forces[0];
  const imported = warband.catalogue.imports.includes(library.catalogue.id) ? library.catalogue.roots : [];
  return {
    system, catalogue: warband.catalogue, force,
    defs: { ...library.defs, ...warband.defs }, links: { ...library.links, ...warband.links }, rules: { ...library.rules, ...warband.rules },
    roots: [...warband.catalogue.roots, ...imported], nodes: new Map(),
  };
}

/** An entry or a group as it is offered: a link laid over its target, or a definition as it stands. */
export interface Node {
  /** The id a selection names: the link's own, or the entry's. */
  id: string;
  /** The definition behind it. */
  target: string;
  kind: 'e' | 'g';
  name: string;
  type?: 'model' | 'unit' | 'upgrade';
  collective: boolean;
  hidden: boolean;
  costs: Record<string, number>;
  categories: string[];
  primary?: string;
  constraints: Constraint[];
  modifiers: Modifier[];
  profiles: Profile[];
  rules: string[];
  children: string[];
  defaultId?: string;
}

export function nodeOf(b: Bundle, id: string): Node | undefined {
  const memo = b.nodes.get(id);
  if (memo) return memo;
  const link = b.links[id];
  let node: Node | undefined;
  if (link) {
    const t = nodeOf(b, link.target);
    if (!t) return undefined;
    node = {
      ...t, id, hidden: !!link.hidden || t.hidden,
      costs: { ...t.costs, ...link.costs },
      categories: link.categories?.length ? link.categories : t.categories, primary: link.primary ?? t.primary,
      constraints: [...t.constraints, ...(link.constraints ?? [])], modifiers: [...t.modifiers, ...(link.modifiers ?? [])],
    };
  } else {
    const d = b.defs[id];
    if (!d) return undefined;
    node = d.k === 'e'
      ? { id, target: id, kind: 'e', name: d.name, type: d.type, collective: !!d.collective, hidden: !!d.hidden, costs: d.costs ?? {}, categories: d.categories ?? [], primary: d.primary, constraints: d.constraints ?? [], modifiers: d.modifiers ?? [], profiles: d.profiles ?? [], rules: d.rules ?? [], children: d.children ?? [] }
      : { id, target: id, kind: 'g', name: d.name, collective: false, hidden: !!d.hidden, costs: {}, categories: [], constraints: d.constraints ?? [], modifiers: d.modifiers ?? [], profiles: [], rules: [], children: d.children ?? [], defaultId: d.defaultId };
  }
  b.nodes.set(id, node);
  return node;
}

/** The name of a category, cost type or characteristic. */
export const categoryName = (b: Bundle, id: string): string => b.system.categories[id] ?? '';
export const COST = { gold: 'points', rating: 'wb-rating', rarity: 'rarity' } as const;
