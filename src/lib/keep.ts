/**
 * A warband's own roster page in the browser: drawing a written roster up for the keeper to confirm, and keeping it
 * between games. Keeping, every change goes to the server, which charges or pays the stash and answers with the
 * warband as it now stands (`KeepView`); the builder renders it, and this adds the stash, the trading post where the
 * campaign is, hiring by name, what a game leaves behind and the log.
 */
import type { Bundle } from '../builder/catalogue.ts';
import { flatOptions, findSelection } from '../builder/roster.ts';
import { optionsUnder, place, type Roster } from '../builder/evaluate.ts';
import { GROUP_MAX, stashItems, type Warrior } from '../builder/rules.ts';
import { priceRange, rolled, saleOf } from '../builder/stash.ts';
import type { Op } from '../builder/ops.ts';
import { nodeOf } from '../builder/catalogue.ts';
import type { StockLine } from '../campaign/trading.ts';
import { aftermath, type GameRecord } from '../builder/aftermath.ts';
import { h, localDriver, mountBuilder, type Driver, type State, type View } from './builder.ts';
import { ensureToast, postApi } from './manage.ts';

export interface KeepData {
  warbandId: string;
  name: string;
  version: number;
  catalogue: string;
  roster: Roster | null;
  names: Record<string, string[]>;
  gold: number;
  shards: number;
  log: { id: number; kind: string; gold: number; shards: number; text: string; authorName: string; struck: boolean; createdAt: string; undoable: boolean; scenarioId: string | null }[];
  post: { id: string; name: string; lines: StockLine[] } | null;
}
export interface PageData {
  mode: 'keep' | 'draw' | 'read';
  base: string;
  canEdit: boolean;
  gm: boolean;
  keep?: KeepData;
  /** The roster to confirm, and for a warband on the road from another campaign, where from and what it proposes. */
  proposal?: { roster: Roster; names: Record<string, string[]>; notes: string[]; catalogue: string; carried?: { from: string; mode: string; gold: number; shards: number } };
  /** Played scenarios the warband fought in, newest first, with what the record says of them, for experience and income. */
  games?: ({ id: string; title: string } & GameRecord)[];
}

const gc = (n: number) => `${n} gc`;

// ───────────────────────── keeping ─────────────────────────

export function mountKeep(root: HTMLElement, data: PageData, bundle: Bundle): void {
  const toast = ensureToast();
  let keep = data.keep!;
  const stateOf = (k: KeepData): State => ({ bundle, roster: k.roster!, names: k.names, stash: k.gold });
  const post = async (path: string, body: Record<string, unknown>): Promise<State> => {
    try {
      const out = await postApi(data.base, `warbands/${path}`, { warbandId: keep.warbandId, version: keep.version, ...body });
      keep = out.keep as KeepData;
      return stateOf(keep);
    } catch (e) {
      // a roster changed elsewhere: bring the page up to date and say so
      if (/changed elsewhere/.test((e as Error).message)) { const out = await postApi(data.base, 'warbands/keep', { warbandId: keep.warbandId }); keep = out.keep as KeepData; view.refresh(stateOf(keep)); }
      throw e;
    }
  };
  const run = async (path: string, body: Record<string, unknown>) => {
    root.setAttribute('aria-busy', 'true');
    try { view.refresh(await post(path, body)); } catch (e) { toast((e as Error).message); } finally { root.removeAttribute('aria-busy'); }
  };

  const driver: Driver = {
    mode: 'keep', canChange: data.canEdit, hireByName: true, groupCounts: false,
    apply: (_state, op: Op) => post('roster-op', { op }),
    warriorExtras: (v, w) => (data.canEdit ? warriorRow(v, w) : []),
    after: (v) => panels(v),
  };

  function warriorRow(v: View, w: Warrior) {
    const names = v.state.names[w.id] ?? [];
    const recruitName = h('input', { class: 'bd-name', maxlength: 80, placeholder: 'The recruit’s name', 'aria-label': 'The recruit’s name' }) as HTMLInputElement;
    return [
      h('details', { class: 'mg-editor bd-after' },
        h('summary', {}, 'After a game'),
        h('div', {},
          h('ul', { class: 'bd-rows' }, ...w.members.map((m, i) => h('li', { class: 'bd-row' },
            h('span', { class: 'bd-row-name' }, names[i] || w.type),
            w.kind === 'henchmen' && !w.promoted ? h('button', { type: 'button', class: 'mg-btn ghost sm', onclick: () => { if (confirm(`Promote ${names[i] || 'this henchman'} to a hero? They leave their group with its gear.`)) void run('promote', { memberId: m }); } }, 'Promote') : null,
            h('button', { type: 'button', class: 'mg-btn blood sm', onclick: () => { if (confirm(`${names[i] || 'This warrior'} is dead? They leave the roster and what they carried is lost. The last line of the log can be taken back.`)) void run('lose', { memberId: m }); } }, 'Fell')))),
          w.kind === 'henchmen' && !w.promoted && w.count < GROUP_MAX ? h('div', { class: 'bd-row' }, recruitName, h('button', { type: 'button', class: 'mg-btn sm', onclick: () => void run('recruit', { groupId: w.id, name: recruitName.value }) }, 'Recruit one, armed alike')) : null,
          h('p', { class: 'mg-note' }, 'Experience is the − and + above; an advance or an old wound is under Skills and more.'),
        ),
      ),
    ];
  }

  function panels(v: View) {
    const b = v.state.bundle;
    const items = stashItems(b, v.state.roster, v.ev);
    const warriors = v.summary.warriors;
    const lines = keep.post?.lines ?? [];
    const wrap = h('div', { class: 'bd-keep' });

    // the stash: gold, wyrdstone, and gear to give out or sell
    const stash = h('section', { class: 'bd-panel', id: 'stash' },
      h('h2', {}, 'The stash'),
      h('p', {}, h('b', {}, gc(keep.gold)), ` · ${keep.shards} shard${keep.shards === 1 ? '' : 's'} of wyrdstone`),
      items.length ? h('ul', { class: 'bd-rows' }, ...items.map((i) => {
        const node = nodeOf(b, findSelection(v.state.roster.selections, i.id)!.entry)!;
        const sale = saleOf(node.name, { gold: node.costs.points ?? 0, rarity: node.costs.rarity ?? 0 }, lines);
        const to = h('select', { 'aria-label': `Give ${i.name} to` }, h('option', { value: '' }, 'Give to…'), ...warriors.map((w) => h('option', { value: w.id }, `${(v.state.names[w.id] ?? []).join(', ') || w.type}${w.kind === 'henchmen' && w.count > 1 ? ` (needs ${w.count})` : ''}`))) as HTMLSelectElement;
        return h('li', { class: 'bd-row' },
          h('span', { class: 'bd-row-name' }, i.count > 1 ? `${i.name} ×${i.count}` : i.name),
          data.canEdit ? to : null,
          data.canEdit ? h('button', { type: 'button', class: 'mg-btn sm', onclick: () => { if (to.value) void run('move-gear', { itemId: i.id, to: to.value }); else toast('Choose who takes it.'); } }, 'Give') : null,
          data.canEdit ? h('button', { type: 'button', class: 'mg-btn ghost sm', onclick: () => { if (confirm(`Sell one ${i.name} at ${keep.post?.name ?? 'the trading post'} for ${sale.value} crowns?`)) void run('sell', { itemId: i.id, count: 1 }); } }, `Sell for ${gc(sale.value)}`) : null);
      })) : h('p', { class: 'mg-muted' }, 'No gear in the stash. Gear taken off a warrior comes here.'),
    );

    // the trading post where the campaign is
    const forSale = lines.filter((l) => l.available && !l.custom);
    const shop = keep.post ? h('section', { class: 'bd-panel', id: 'post' },
      h('h2', {}, `The trading post at ${keep.post.name}`),
      h('p', { class: 'mg-note' }, 'Bought into the stash, then given out. A price with dice is rolled at the table: write the total. An item sells back for half its price, or half the figure before the dice if it is rare here.'),
      h('details', {}, h('summary', { class: 'mg-link' }, `What it has (${forSale.length})`), h('ul', { class: 'bd-rows' }, ...forSale.map((l) => {
        const { min, max } = priceRange(l.price);
        const price = h('input', { type: 'number', min, max, value: min, 'aria-label': `Price paid for ${l.name}`, readonly: min === max ? true : undefined }) as HTMLInputElement;
        const count = h('input', { type: 'number', min: 1, max: 20, value: 1, 'aria-label': `How many ${l.name}` }) as HTMLInputElement;
        return h('li', { class: 'bd-row' },
          h('span', { class: 'bd-row-name' }, l.name, h('small', { class: 'mg-muted' }, ` ${l.price} gc${l.rarity > 0 ? ` · rare ${l.rarity}` : ''}`)),
          data.canEdit ? count : null, data.canEdit ? price : null,
          data.canEdit ? h('button', { type: 'button', class: 'mg-btn sm', onclick: () => void run('buy', { itemId: l.itemId, count: Number(count.value), price: Number(price.value) }) }, rolled(l.price) ? 'Buy at that' : 'Buy') : null);
      }))),
    ) : null;

    // hiring, by name
    const roots = place(b, v.state.roster);
    const fighters = flatOptions(optionsUnder(b, roots, null)).filter((o) => !o.hidden && (o.type === 'model' || o.type === 'unit'));
    const pick = h('select', { 'aria-label': 'Who to hire' }, ...fighters.map((o) => h('option', { value: o.id, disabled: o.left === 0 ? true : undefined }, `${o.name}${o.each.points ? ` — ${gc(o.each.points)}` : ''}${o.left === 0 ? ' (no more)' : ''}`))) as HTMLSelectElement;
    const hireNames = h('input', { class: 'bd-name', maxlength: 200, placeholder: 'Their names, by commas for a group', 'aria-label': 'Their names' }) as HTMLInputElement;
    const hiring = data.canEdit ? h('section', { class: 'bd-panel', id: 'hire' },
      h('h2', {}, 'Hire'),
      h('div', { class: 'bd-row' }, pick, hireNames, h('button', { type: 'button', class: 'mg-btn sm', onclick: () => void run('hire', { entry: pick.value, names: hireNames.value.split(',').map((x) => x.trim()).filter(Boolean).slice(0, GROUP_MAX) }) }, 'Hire')),
      h('p', { class: 'mg-note' }, 'Paid from the stash at the catalogue’s price; gear is bought for them after, or given from the stash.'),
    ) : null;

    // what a game brought in
    const found = h('input', { type: 'number', min: 0, max: 99, value: 0, 'aria-label': 'Shards found' }) as HTMLInputElement;
    const sold = h('input', { type: 'number', min: 0, max: 99, value: 0, 'aria-label': 'Shards sold' }) as HTMLInputElement;
    const goldIn = h('input', { type: 'number', min: data.gm ? -100000 : 0, max: 100000, value: 0, 'aria-label': 'Crowns' }) as HTMLInputElement;
    const why = h('input', { maxlength: 200, placeholder: 'What for', 'aria-label': 'What the crowns were for' }) as HTMLInputElement;
    const game = h('select', { 'aria-label': 'After which game' }, h('option', { value: '' }, 'No game in particular'), ...(data.games ?? []).map((g) => h('option', { value: g.id }, g.title))) as HTMLSelectElement;
    const incomeBox = data.canEdit ? h('section', { class: 'bd-panel', id: 'income' },
      h('h2', {}, 'What a game brought in'),
      h('div', { class: 'bd-row' }, h('label', {}, 'Shards found ', found), h('label', {}, 'Shards sold ', sold)),
      h('div', { class: 'bd-row' }, h('label', {}, 'Crowns ', goldIn), why),
      h('div', { class: 'bd-row' }, game, h('button', { type: 'button', class: 'mg-btn sm', onclick: () => void run('income', { found: Number(found.value), sold: Number(sold.value), gold: Number(goldIn.value), text: why.value, scenarioId: game.value || null }) }, 'Enter it')),
      h('p', { class: 'mg-note' }, `Shards sold fetch the rulebook’s rate for a warband of ${v.summary.size}, once after each game; the rest stay in the stash.${data.gm ? ' A game master may take crowns away with a figure below nought.' : ''}`),
    ) : null;

    // what the last games gave: experience suggested from the record, entered once a game
    const owed = (data.games ?? []).filter((g) => !keep.log.some((l) => !l.struck && l.kind === 'experience' && l.scenarioId === g.id)).slice(0, 3);
    const after = data.canEdit && owed.length ? h('section', { class: 'bd-panel', id: 'after' },
      h('h2', {}, 'After the game'),
      ...owed.map((g) => {
        const awards = aftermath(warriors, g);
        const inputs = new Map<string, HTMLInputElement>();
        return h('details', { class: 'mg-editor', open: g === owed[0] ? true : undefined },
          h('summary', {}, g.title),
          h('div', {},
            h('ul', { class: 'bd-rows' }, ...awards.map((a) => {
              const w = warriors.find((x) => x.id === a.warriorId)!;
              const names = (v.state.names[w.id] ?? []).join(', ') || w.type;
              const input = h('input', { type: 'number', min: 0, max: 20, value: a.suggested, 'aria-label': `Experience for ${names}` }) as HTMLInputElement;
              inputs.set(w.id, input);
              const why = [a.survived ? 'came through' : a.fought ? '' : 'did not fight', a.takedowns ? `${a.takedowns} put out of action` : '', a.leader ? 'led them to victory' : ''].filter(Boolean).join(', ');
              const roll = a.outOfAction.map((m) => v.state.names[w.id]?.[w.members.indexOf(m)] ?? w.type);
              return h('li', { class: 'bd-row' },
                h('span', { class: 'bd-row-name' }, names, h('small', { class: 'mg-muted' }, why ? ` — ${why}` : ''),
                  roll.length ? h('small', { class: 'bd-roll' }, ` · out of action: ${roll.join(', ')}, ${w.kind === 'hero' ? 'to roll on the serious injury table (Skills and more, or Fell)' : 'dead on a 1 or 2 (Fell)'}`) : null,
                  a.advances ? h('small', { class: 'bd-roll' }, ` · ${a.advances === 1 ? 'an advance' : `${a.advances} advances`} due`) : null),
                input);
            })),
            h('div', { class: 'mg-actions end' }, h('button', { type: 'button', class: 'mg-btn sm', onclick: () => void run('award', { scenarioId: g.id, awards: Object.fromEntries([...inputs].map(([id, i]) => [id, Number(i.value) || 0])) }) }, 'Enter the experience')),
            h('p', { class: 'mg-note' }, 'Suggested from the battle’s record: one for coming through, one for each enemy a hero put out of action, one more for a winning leader. Change any figure the table agreed otherwise; an advance is taken under Skills and more.'),
          ));
      }),
    ) : null;

    // the log
    const logBox = keep.log.length ? h('section', { class: 'bd-panel', id: 'log' },
      h('h2', {}, 'The log'),
      h('ul', { class: 'bd-log' }, ...keep.log.map((l) => h('li', { class: l.struck ? 'struck' : '' },
        h('span', {}, l.text, h('small', { class: 'mg-muted' }, ` — ${l.authorName}`)),
        h('span', { class: 'gold' }, l.gold ? `${l.gold > 0 ? '+' : ''}${l.gold}` : '', l.shards ? ` ${l.shards > 0 ? '+' : ''}${l.shards} ◆` : ''),
        l.undoable && data.canEdit ? h('button', { type: 'button', class: 'mg-link', onclick: () => { if (confirm('Take this line back, and the roster with it?')) void run('undo', {}); } }, 'Take back') : null))),
    ) : null;

    wrap.append(...[after, stash, hiring, shop, incomeBox, logBox].filter((x): x is HTMLElement => !!x));
    if (data.gm) wrap.append(h('p', { class: 'mg-note' }, h('button', { type: 'button', class: 'mg-link', onclick: () => { if (confirm('Put this warband’s roster back in the record’s hands, written by hand? The log is struck through.')) void postApi(data.base, 'warbands/drop-roster', { warbandId: keep.warbandId }).then(() => location.reload(), (e) => toast((e as Error).message)); } }, 'Put the roster back to hand-written'), ' (game masters)'));
    v.root.append(wrap);
  }

  const view = mountBuilder(root, stateOf(keep), driver);
}

// ───────────────────────── drawing up ─────────────────────────

export function mountDraw(root: HTMLElement, data: PageData, bundle: Bundle): void {
  const toast = ensureToast();
  const p = data.proposal!;
  const KEY = `builder:draw:${data.keep?.warbandId ?? ''}`;
  let start: State = { bundle, roster: p.roster, names: p.names, stash: null };
  try { const kept = JSON.parse(sessionStorage.getItem(KEY) ?? 'null'); if (kept?.roster?.catalogue === p.catalogue) start = { ...start, roster: kept.roster, names: kept.names ?? p.names }; } catch { /* none kept */ }
  const save = (s: State) => { try { sessionStorage.setItem(KEY, JSON.stringify({ roster: s.roster, names: s.names })); } catch { /* no storage */ } };
  const driver = localDriver('draw', save);
  const linked = (s: State, id: string) => !!findSelection(s.roster.selections, id)?.members?.length;
  // a linked warrior's name is the record's, changed on the muster roll; one the keeper adds here is named here
  driver.rename = async (s, id, list) => (linked(s, id) ? s : { ...s, names: { ...s.names, [id]: list } });
  driver.after = (v) => {
    const road = p.carried;
    const gold = h('input', { type: 'number', min: 0, max: 100000, value: road?.gold ?? 0, 'aria-label': 'Crowns in the stash' }) as HTMLInputElement;
    const shards = h('input', { type: 'number', min: 0, max: 999, value: road?.shards ?? 0, 'aria-label': 'Shards of wyrdstone in the stash' }) as HTMLInputElement;
    const box = h('section', { class: 'bd-panel', id: 'confirm' },
      h('h2', {}, road ? 'Approve the roster' : 'Confirm the roster'),
      road ? h('p', {}, road.mode === 'start-over'
        ? `They start over, brought from ${road.from}: found the roster afresh above, with the crowns below.`
        : `Brought from ${road.from}, ${road.mode === 'adjusted' ? 'adjusted by this campaign’s rules' : 'as they were'}: the roster above and the stash below are what it proposes. Change anything you like; the log keeps what was proposed beside what you approve.`) : null,
      p.notes.length ? h('div', {}, h('p', {}, road ? 'What the road changed:' : 'What the record had that the catalogue did not take; put it right above, or leave it:'), h('ul', { class: 'mg-list' }, ...p.notes.map((n) => h('li', {}, n)))) : h('p', { class: 'mg-muted' }, 'Every warrior was found in the catalogue.'),
      h('div', { class: 'bd-row' }, h('label', {}, 'Crowns in the stash ', gold), h('label', {}, 'Shards of wyrdstone ', shards)),
      h('p', { class: 'mg-note' }, 'Once confirmed, the warriors’ statlines, gear, skills, old wounds and experience are the roster’s, and their names and stories stay on the muster roll. Hiring, buying and selling go through the stash from then on.'),
      h('div', { class: 'mg-actions end' },
        h('button', { type: 'button', class: 'mg-btn ghost', onclick: () => { try { sessionStorage.removeItem(KEY); } catch { /* none */ } location.reload(); } }, 'Start from the record again'),
        h('button', { type: 'button', class: 'mg-btn', onclick: async (e: Event) => {
          const btn = e.target as HTMLButtonElement;
          if (v.summary.errors.length && !confirm(`The rules object: ${v.summary.errors[0]} Confirm anyway?`)) return;
          btn.disabled = true;
          try {
            await postApi(data.base, 'warbands/draw-up', { warbandId: data.keep!.warbandId, roster: v.state.roster, names: v.state.names, gold: Number(gold.value), shards: Number(shards.value) });
            try { sessionStorage.removeItem(KEY); } catch { /* none */ }
            location.reload();
          } catch (err) { toast((err as Error).message); btn.disabled = false; }
        } }, road ? 'Approve the roster' : 'Confirm the roster')),
    );
    v.root.append(box);
  };
  mountBuilder(root, start, driver);
}
