/**
 * The warband builder in the browser: a roster drawn from a warband's catalogue, its warriors as cards, their gear
 * and skills picked from what the catalogue offers them, the crowns and the rating reckoned as it goes.
 *
 * One renderer, three uses, told apart by the driver it is given:
 * - practice (`/builder/`): everything happens here, kept in this browser; a player who may found a warband sends
 *   the finished roster to the server once.
 * - drawing up (`/warbands/<id>/roster/` for a warband without one): the same, starting from what the record holds,
 *   confirmed by the keeper.
 * - keeping (the same address once a warband has its roster): every change goes to the server, which charges or
 *   pays the stash for it and logs it; the page renders the server's answer (`src/lib/keep.ts` adds the stash,
 *   the trading post and what a game leaves behind).
 */
import { nodeOf, type Bundle } from '../builder/catalogue.ts';
import { evaluate, findPlaced, optionsUnder, place, type Evaluation, type OptionView, type Roster } from '../builder/evaluate.ts';
import { applyOp, randomId, type Op } from '../builder/ops.ts';
import { addSelection, flatOptions, newRoster, RosterError } from '../builder/roster.ts';
import { GROUP_MAX, maxWarriors, rosterText, STARTING_GOLD, stashItems, stashOf, summarise, type Summary, type Warrior } from '../builder/rules.ts';
import { STAT_KEYS, STAT_NAMES } from '../campaign/model.ts';
import { ensureToast } from './manage.ts';

// ───────────────────────── a little DOM ─────────────────────────

type Child = Node | string | null | undefined | false;
export function h(tag: string, attrs: Record<string, unknown> = {}, ...children: Child[]): HTMLElement {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v as EventListener);
    else if (k === 'class') el.className = String(v);
    else if (k === 'value' && (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement)) el.value = String(v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children) if (c != null && c !== false) el.append(typeof c === 'string' ? document.createTextNode(c) : c);
  return el;
}
const gc = (n: number | undefined) => `${n ?? 0} gc`;

// ───────────────────────── what drives it ─────────────────────────

export interface State {
  bundle: Bundle;
  roster: Roster;
  /** Warriors' names by selection: one for a hero, one per model in a group. Kept by the record once founded. */
  names: Record<string, string[]>;
  /** The gold in the stash, in a campaign; null in practice, where the purse is the 500 crowns. */
  stash: number | null;
}
export interface Driver {
  mode: 'practice' | 'draw' | 'keep';
  /** Make a change; resolves with the state to render, or rejects with words to show. */
  apply(state: State, op: Op): Promise<State>;
  /** Names are the record's once founded: a driver may keep them itself. */
  rename?(state: State, id: string, names: string[]): Promise<State>;
  /** Called after every render, for the page to add its own parts (the founding form, the stash's dealings). */
  after?(view: View): void;
  /** What a warrior's card adds below its own buttons. */
  warriorExtras?(view: View, w: Warrior): Child[];
  /** Whether the card's own buttons are offered (a keeper between games takes gear through the stash instead). */
  canChange?: boolean;
}
export interface View { root: HTMLElement; state: State; summary: Summary; ev: Evaluation; driver: Driver; refresh(next: State): void; pick(parent: string | null, filter: PickFilter, title: string): void; act(op: Op): Promise<void> }
export type PickFilter = 'gear' | 'more' | 'hire' | 'all';

/** A driver that changes the roster here and keeps it in this browser. */
export function localDriver(mode: 'practice' | 'draw', save?: (s: State) => void): Driver {
  return {
    mode, canChange: true,
    async apply(state, op) {
      const { roster, id } = applyOp(state.bundle, state.roster, op, randomId);
      const names = { ...state.names };
      if (op.kind === 'add' && id && !names[id]) names[id] = [];
      const next = { ...state, roster, names };
      save?.(next);
      return next;
    },
    async rename(state, id, list) { const next = { ...state, names: { ...state.names, [id]: list } }; save?.(next); return next; },
  };
}

export function emptyState(bundle: Bundle): State {
  return { bundle, roster: newRoster(bundle, bundle.catalogue.slug ?? '', randomId), names: {}, stash: null };
}

// ───────────────────────── the picker ─────────────────────────

const CONTAINER = (b: Bundle, o: OptionView) => { const n = nodeOf(b, o.id); return !!n && n.type === 'upgrade' && !n.profiles.length && n.children.length > 0; };
const isGearContainer = (name: string) => /^(Starting Equipment|Trading Post)/i.test(name);
const NOT_PICKED = /^(Experience|Variable Gold Cost|Promoted|DummyEntry)$/i;

interface Section { title: string; parent: string | null; container?: OptionView; options: OptionView[] }

/** What may be taken under a selection, in sections: each container's own list, then the rest by its group. */
function sectionsFor(state: State, parentId: string | null, filter: PickFilter): Section[] {
  const b = state.bundle;
  const roots = place(b, state.roster);
  const parent = parentId ? findPlaced(roots, parentId) ?? null : null;
  const out: Section[] = [];
  const byGroup = new Map<string, Section>();
  const visit = (opts: OptionView[], group: string) => {
    for (const o of opts) {
      if (o.hidden) continue;
      if (o.kind === 'group') { visit(o.children, o.name); continue; }
      if (NOT_PICKED.test(o.name)) continue;
      if (filter === 'hire') { if (o.type !== 'model' && o.type !== 'unit') continue; }
      if (CONTAINER(b, o)) {
        const gear = isGearContainer(o.name);
        if ((filter === 'gear' && !gear) || (filter === 'more' && gear)) continue;
        // the container's own options, as if it were taken
        let roster = state.roster, cid: string | undefined = parent?.children.find((c) => c.node.id === o.id)?.s.id;
        if (!cid) { try { const r = addSelection(b, roster, parentId, o.id, () => '#probe'); roster = r.roster; cid = r.id; } catch { continue; } }
        const pr = place(b, roster);
        const inner = flatOptions(optionsUnder(b, pr, findPlaced(pr, cid) ?? null)).filter((x) => !x.hidden);
        out.push({ title: o.name, parent: cid === '#probe' ? null : cid, container: cid === '#probe' ? o : undefined, options: inner });
        continue;
      }
      if (filter === 'gear') continue;
      const key = group || 'Other';
      let s = byGroup.get(key);
      if (!s) { s = { title: key, parent: parentId, options: [] }; byGroup.set(key, s); }
      s.options.push(o);
    }
  };
  visit(optionsUnder(b, roots, parent), '');
  // a warband's own list before the trading post, whose rare goods want a roll
  out.sort((a, z) => Number(/^Trading Post/i.test(a.title)) - Number(/^Trading Post/i.test(z.title)));
  for (const s of out) if (/^Trading Post/i.test(s.title)) s.title = 'The trading post (rare goods want a roll)';
  return [...out, ...byGroup.values()].filter((s) => s.options.length);
}

// ───────────────────────── mounting ─────────────────────────

export function mountBuilder(root: HTMLElement, initial: State, driver: Driver): View {
  const toast = ensureToast();
  const sheet = h('dialog', { class: 'bd-sheet', 'aria-label': 'Choose' }) as HTMLDialogElement;
  document.body.append(sheet);
  let busy = false;

  const view: View = {
    root, state: initial, driver, summary: summarise(initial.bundle, initial.roster), ev: evaluate(initial.bundle, initial.roster),
    refresh(next) { view.state = next; view.ev = evaluate(next.bundle, next.roster); view.summary = summarise(next.bundle, next.roster); render(); },
    async act(op) {
      if (busy) return;
      busy = true; root.setAttribute('aria-busy', 'true');
      try { view.refresh(await driver.apply(view.state, op)); }
      catch (e) { toast(e instanceof RosterError || e instanceof Error ? e.message : 'That could not be done.'); }
      finally { busy = false; root.removeAttribute('aria-busy'); }
    },
    pick(parent, filter, title) { openSheet(parent, filter, title); },
  };

  function openSheet(parentId: string | null, filter: PickFilter, title: string) {
    const draw = () => {
      const sections = sectionsFor(view.state, parentId, filter);
      sheet.replaceChildren(
        h('div', { class: 'bd-sheet-head' }, h('h2', {}, title), h('button', { type: 'button', class: 'mg-btn ghost sm', onclick: () => sheet.close() }, 'Done')),
        sections.length ? '' : h('p', { class: 'mg-empty' }, 'Nothing more may be taken here.'),
        ...sections.map((s) => h('section', { class: 'bd-sec' },
          h('h3', { class: 'bd-sec-title' }, s.title),
          h('ul', { class: 'bd-options' }, ...s.options.map((o) => {
            const full = o.left === 0;
            return h('li', {}, h('button', {
              type: 'button', class: 'bd-option', disabled: full, title: full ? 'No more may be taken' : undefined,
              onclick: async () => {
                if (s.container) {
                  // take the container first, then the item in it
                  const before = view.state.roster;
                  await view.act({ kind: 'add', parent: parentId, entry: s.container.id });
                  if (view.state.roster === before) return;
                  const placedNow = place(view.state.bundle, view.state.roster);
                  const p = parentId ? findPlaced(placedNow, parentId) : null;
                  const cid = (p ? p.children : placedNow).filter((c) => c.node.id === s.container!.id).at(-1)?.s.id;
                  if (cid) await view.act({ kind: 'add', parent: cid, entry: o.id });
                } else await view.act({ kind: 'add', parent: s.parent, entry: o.id });
                if (filter === 'hire') sheet.close(); else draw();
              },
            }, h('span', { class: 'bd-option-name' }, o.name), o.count > 0 && filter !== 'hire' ? h('span', { class: 'mg-chip gold' }, `${o.count}`) : null, h('span', { class: 'bd-option-cost' }, [o.each.points ? gc(o.each.points) : '', o.each.rarity ? `rare ${o.each.rarity}` : ''].filter(Boolean).join(' · '))));
          }))),
        ),
      );
    };
    draw();
    if (!sheet.open) sheet.showModal();
  }
  sheet.addEventListener('click', (e) => { if (e.target === sheet) sheet.close(); });

  function render() {
    const { state, summary } = view;
    const b = state.bundle;
    const slug = state.roster.catalogue;
    const max = maxWarriors(slug);
    const left = state.stash == null ? STARTING_GOLD - summary.spent : state.stash;
    const purse = h('div', { class: 'bd-purse', role: 'status' },
      state.stash == null
        ? h('span', { class: left < 0 ? 'over' : '' }, h('b', {}, gc(summary.spent)), ` of ${STARTING_GOLD} spent · `, h('b', {}, left < 0 ? `${-left} gc over` : gc(left)), left < 0 ? '' : ' to the stash')
        : h('span', {}, h('b', {}, gc(left)), ' in the stash'),
      h('span', {}, 'Rating ', h('b', {}, String(summary.rating))),
      h('span', { class: summary.size > max ? 'over' : '' }, h('b', {}, `${summary.size}`), ` of ${max} warriors`),
    );
    const problems = summary.errors.length
      ? h('ul', { class: 'bd-problems', 'aria-label': 'What the rules object to' }, ...summary.errors.map((e) => h('li', {}, e)))
      : summary.warriors.length ? h('p', { class: 'bd-fine' }, 'The roster stands within the rules.') : null;

    const cards = summary.warriors.map((w) => warriorCard(w));
    const config = state.roster.selections.filter((s) => { const n = nodeOf(b, s.entry); return n && !stashOf(b, { ...state.roster, selections: [s] }) && !summary.warriors.some((w) => w.id === s.id) && n.children.length > 0 && !/^Grade$/i.test(n.name); });
    const configCards = config.map((s) => {
      const v = view.ev.byId.get(s.id)!;
      return h('div', { class: 'bd-config' }, h('span', {}, h('b', {}, v.name), v.children.length ? `: ${v.children.map((c) => c.name).join(', ')}` : ''), driver.canChange ? h('button', { type: 'button', class: 'mg-link', onclick: () => view.pick(s.id, 'all', v.name) }, 'Choose') : null);
    });

    const items = stashItems(b, state.roster, view.ev);
    root.replaceChildren(
      purse,
      problems ?? '',
      ...configCards,
      h('section', { class: 'bd-warriors', 'aria-label': 'The warriors' }, ...(cards.length ? cards : [h('p', { class: 'mg-empty' }, 'No warriors yet. Hire the first below; a warband needs its leader.')])),
      driver.canChange ? h('div', { class: 'bd-hire' }, h('button', { type: 'button', class: 'mg-btn wide', onclick: () => view.pick(null, 'hire', 'Hire a warrior') }, 'Hire a warrior')) : '',
      state.stash != null || items.length ? h('section', { class: 'bd-stash-short' }, h('h3', { class: 'mg-h3' }, 'In the stash'), items.length ? h('p', {}, items.map((i) => (i.count > 1 ? `${i.name} ×${i.count}` : i.name)).join(', ')) : h('p', { class: 'mg-muted' }, 'No gear in the stash.')) : '',
    );
    driver.after?.(view);
  }

  /** The catalogue's experience for a warrior who has none yet. */
  function experienceOption(id: string): OptionView | undefined {
    const b = view.state.bundle, roots = place(b, view.state.roster);
    return flatOptions(optionsUnder(b, roots, findPlaced(roots, id) ?? null)).find((o) => !o.hidden && /^Experience$/i.test(o.name));
  }

  function warriorCard(w: Warrior) {
    const b = view.state.bundle;
    const names = view.state.names[w.id] ?? [];
    const slots = w.kind === 'henchmen' && !w.promoted ? w.count : 1;
    const canChange = !!driver.canChange;
    const nameInputs = Array.from({ length: slots }, (_, i) => h('input', {
      class: 'bd-name', value: names[i] ?? '', maxlength: 80, 'aria-label': slots > 1 ? `Name of ${w.type} ${i + 1}` : `Name of the ${w.type}`,
      placeholder: slots > 1 ? `${w.type} ${i + 1}` : `Name the ${w.type.toLowerCase()}`, readonly: driver.rename ? undefined : true,
      onchange: async (e: Event) => {
        const list = Array.from({ length: slots }, (_, j) => names[j] ?? '');
        list[i] = (e.target as HTMLInputElement).value.trim();
        if (driver.rename) view.refresh(await driver.rename(view.state, w.id, list));
      },
    }));
    const count = w.kind === 'henchmen' && w.modelId && canChange && !w.promoted
      ? h('span', { class: 'bd-count' },
        h('button', { type: 'button', class: 'mg-btn ghost sm', 'aria-label': 'One fewer', disabled: w.count <= 1, onclick: () => view.act({ kind: 'count', id: w.modelId!, count: w.count - 1 }) }, '−'),
        h('b', {}, `×${w.count}`),
        h('button', { type: 'button', class: 'mg-btn ghost sm', 'aria-label': 'One more', disabled: w.count >= GROUP_MAX, onclick: () => view.act({ kind: 'count', id: w.modelId!, count: w.count + 1 }) }, '+'))
      : w.kind === 'henchmen' && w.count > 1 ? h('b', { class: 'bd-count' }, `×${w.count}`) : null;
    const chip = (id: string, label: string, removable: boolean) => {
      const hasOptions = canChange && flatOptions(optionsUnder(b, place(b, view.state.roster), findPlaced(place(b, view.state.roster), id) ?? null)).some((o) => !o.hidden && !NOT_PICKED.test(o.name));
      return h('li', { class: 'bd-chip' },
        hasOptions ? h('button', { type: 'button', class: 'bd-chip-name', onclick: () => view.pick(id, 'all', label) }, label) : h('span', { class: 'bd-chip-name' }, label),
        removable && canChange ? h('button', { type: 'button', class: 'bd-chip-x', 'aria-label': `Take away ${label}`, onclick: () => view.act({ kind: 'remove', id }) }, '×') : null);
    };
    return h('article', { class: `bd-card ${w.kind}`, id: `w-${w.id}` },
      h('header', { class: 'bd-card-head' },
        h('div', { class: 'bd-names' }, ...nameInputs),
        h('div', { class: 'bd-kind' }, h('span', {}, `${w.type}${w.promoted ? ' · promoted' : ''}`), count, h('span', { class: 'bd-cost' }, gc(w.cost)))),
      h('table', { class: 'mg-statline' }, h('thead', {}, h('tr', {}, ...STAT_KEYS.map((k) => h('th', { scope: 'col' }, h('abbr', { title: STAT_NAMES[k] }, k))))), h('tbody', {}, h('tr', {}, ...STAT_KEYS.map((k) => h('td', {}, String(w.stats[k])))))),
      h('div', { class: 'bd-line' }, h('span', { class: 'mg-muted' }, 'Experience'), ' ', h('b', {}, String(w.experience)),
        canChange && (w.experienceId || experienceOption(w.id)) ? h('span', { class: 'bd-count' },
          h('button', { type: 'button', class: 'mg-btn ghost sm', 'aria-label': 'One less experience', disabled: !w.experienceId, onclick: () => (w.experience <= 1 ? view.act({ kind: 'remove', id: w.experienceId! }) : view.act({ kind: 'count', id: w.experienceId!, count: w.experience - 1 })) }, '−'),
          h('button', { type: 'button', class: 'mg-btn ghost sm', 'aria-label': 'One more experience', onclick: () => (w.experienceId ? view.act({ kind: 'count', id: w.experienceId, count: w.experience + 1 }) : view.act({ kind: 'add', parent: w.id, entry: experienceOption(w.id)!.id })) }, '+')) : null),
      w.gear.length ? h('div', {}, h('h4', { class: 'mg-h3' }, 'Gear'), h('ul', { class: 'bd-chips' }, ...w.gear.map((g) => chip(g.id, g.count > 1 ? `${g.name} ×${g.count}` : g.name, true)))) : null,
      w.parts.length || w.skills.length ? h('div', {}, h('h4', { class: 'mg-h3' }, 'Skills, rules and wounds'), h('ul', { class: 'bd-chips' },
        ...w.skills.filter((s) => !w.parts.some((p) => p.name === s)).map((s) => h('li', { class: 'bd-chip fixed' }, h('span', { class: 'bd-chip-name' }, s))),
        ...w.parts.map((p) => chip(p.id, p.count > 1 ? `${p.name} ×${p.count}` : p.name, true)))) : null,
      canChange ? h('div', { class: 'mg-actions' },
        h('button', { type: 'button', class: 'mg-btn sm', onclick: () => view.pick(w.id, 'gear', `Gear for ${names[0] || w.type}`) }, 'Equip'),
        h('button', { type: 'button', class: 'mg-btn ghost sm', onclick: () => view.pick(w.id, 'more', `Skills and more for ${names[0] || w.type}`) }, 'Skills and more'),
        h('button', { type: 'button', class: 'mg-btn ghost sm bd-dismiss', onclick: () => { if (confirm(`Strike ${names[0] || `the ${w.type}`} from the roster?`)) void view.act({ kind: 'remove', id: w.id }); } }, 'Dismiss')) : null,
      ...(driver.warriorExtras?.(view, w) ?? []),
      w.errors.length ? h('ul', { class: 'bd-problems small' }, ...w.errors.filter((e) => !/duplicate the group/i.test(e)).map((e) => h('li', {}, e))) : null,
    );
  }

  render();
  return view;
}

/** The roster as text, with the names given. */
export const textOf = (state: State, name?: string): string => rosterText(state.bundle, state.roster, { name, names: state.names, stash: state.stash ?? STARTING_GOLD - summarise(state.bundle, state.roster).spent });
