/**
 * The Tarot of the Damned in the battle tracker: a drawer under the thumb that holds the keeper's hand, hidden
 * from the other side of the table, and the card held up large when one is played.
 *
 * The hand is the server's: `hand` reckons it against the table's turn and answers with it, `play` spends a card
 * and logs it. Nothing here decides anything; the deck's rules are `campaign/tarot.ts`. New cards arrive face
 * down and turn over the way the Curfew's Omen does at dusk; cards already seen on this phone lie face up.
 */
import type { Scenario } from '../campaign/model';
import { TAROT_BACK, TAROT_KIND_LABEL, cardById, fadesAfter, hourOf, type HeldCard, type TarotCard, type TarotHand } from '../campaign/tarot';

export interface TarotOptions {
  base: string;
  scenarioId: string;
  /** The warbands whose hands this phone may hold: the keeper's own, every attending one for a game master. */
  hands: { id: string; name: string }[];
  scenario: () => Scenario;
  toast: (text: string) => void;
  /** A play answers with the scenario as it now stands; the tracker takes it from here. */
  onScenario: (s: Scenario) => void;
}
export interface TarotMount {
  /** The Tarot button for the bar, or null when this phone holds no hand. */
  button: HTMLButtonElement | null;
  /** Called whenever the tracker renders: a new turn means a new reckoning of the hand. */
  sync(s: Scenario): void;
  /** Hold a card up to read, without playing it: for the other side, from the log. */
  show(cardId: string): void;
}

type Child = Node | string | null | undefined | false;
function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string | boolean | undefined> = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (k === 'class') el.className = String(v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  for (const c of children) if (c) el.append(typeof c === 'string' ? document.createTextNode(c) : c);
  return el;
}
function svg(path: string): SVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const el = document.createElementNS(ns, 'svg');
  el.setAttribute('viewBox', '0 0 24 24'); el.setAttribute('fill', 'none'); el.setAttribute('stroke', 'currentColor'); el.setAttribute('stroke-width', '1.5'); el.setAttribute('stroke-linecap', 'round'); el.setAttribute('stroke-linejoin', 'round'); el.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS(ns, 'path'); p.setAttribute('d', path); el.append(p);
  return el;
}
export const CARD_ICON = 'M7 3h10a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Zm5 5 1.2 2.4 2.6.4-1.9 1.8.5 2.6L12 14l-2.4 1.2.5-2.6-1.9-1.8 2.6-.4Z';
const CLOSE = 'm6 6 12 12M18 6 6 18';

/** What the hand says about a card's hour and its fading, in a line under it. */
function captionOf(card: TarotCard, held: HeldCard, s: Scenario): { text: string; hour: ReturnType<typeof hourOf> } {
  const hour = hourOf(card, s.turn, s.turnLimit);
  const last = fadesAfter(held);
  const turn = Math.max(1, s.turn);
  if (hour === 'not-yet') return { text: 'Not before the last round', hour };
  if (hour === 'too-late') return { text: 'Its hour has passed', hour };
  return { text: last <= turn ? 'Fades after this turn' : `Good until turn ${last}`, hour };
}

export function mountTarot(root: HTMLElement, opts: TarotOptions): TarotMount {
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const api = (action: string) => new URL(`${opts.base}/api/scenarios/${action}`, location.href);
  let hand: TarotHand | null = null;
  let warbandId = opts.hands[0]?.id ?? '';
  let reckonedFor = '';
  let busy = false;

  // ───────────────────────── the drawer ─────────────────────────

  const button = opts.hands.length ? h('button', { type: 'button', class: 'tk-btn tc-toggle', 'aria-expanded': 'false', 'aria-controls': 'tarot-drawer' }, svg(CARD_ICON), 'Tarot') : null;
  const drawer = h('aside', { class: 'tc-drawer', id: 'tarot-drawer', hidden: true, 'aria-label': 'Your hand of the Tarot' });
  const head = h('div', { class: 'tc-head' });
  const handBox = h('div', { class: 'tc-hand', role: 'list' });
  const foot = h('div', { class: 'tc-foot' });
  drawer.append(head, handBox, foot);
  if (opts.hands.length) root.append(drawer);

  const seenKey = () => `tarot:seen:${opts.scenarioId}:${warbandId}`;
  const seen = (): Set<string> => { try { return new Set(JSON.parse(sessionStorage.getItem(seenKey()) ?? '[]') as string[]); } catch { return new Set(); } };
  const markSeen = (ids: string[]) => { try { sessionStorage.setItem(seenKey(), JSON.stringify([...new Set([...seen(), ...ids])])); } catch {} };
  const tag = (c: HeldCard) => `${c.id}:${c.drawnOn}`;

  function cardNode(card: TarotCard, cls: string): HTMLElement {
    return h('div', { class: `tc-card ${cls}` }, h('div', { class: 'tc-card-inner' },
      h('img', { class: 'tc-back', src: `${opts.base}${TAROT_BACK}`, alt: '', width: '1050', height: '1800', loading: 'lazy' }),
      h('img', { class: 'tc-face', src: `${opts.base}${card.image}`, alt: `${card.numeral}. ${card.title}`, width: '1050', height: '1800' }),
    ));
  }

  function renderDrawer(): void {
    const s = opts.scenario();
    head.replaceChildren(
      h('div', { class: 'tc-head-text' },
        h('div', { class: 'tk-turn-label' }, 'The Tarot of the Damned'),
        opts.hands.length > 1
          ? (() => { const sel = h('select', { class: 'tc-pick', 'aria-label': 'Whose hand' }); for (const w of opts.hands) sel.append(h('option', { value: w.id, selected: w.id === warbandId }, w.name)); sel.addEventListener('change', () => { warbandId = sel.value; hand = null; reckonedFor = ''; void load(); }); return sel; })()
          : h('div', { class: 'tc-whose' }, `${opts.hands[0]?.name ?? ''}’s hand`),
      ),
      h('button', { type: 'button', class: 'tk-strike', 'data-tarot-close': true, 'aria-label': 'Hide the hand' }, svg(CLOSE)),
    );
    handBox.replaceChildren();
    foot.replaceChildren();
    if (!hand) { handBox.append(h('p', { class: 'tc-note' }, busy ? 'The cards are being dealt.' : 'The cards have not come yet.')); return; }
    const was = seen();
    const fresh: HTMLElement[] = [];
    for (const held of hand.hand) {
      const card = cardById(held.id);
      if (!card) continue;
      const { text, hour } = captionOf(card, held, s);
      const isNew = !was.has(tag(held));
      const node = cardNode(card, isNew ? '' : 'is-flipped');
      const btn = h('button', { type: 'button', class: 'tc-held', role: 'listitem', 'data-show': card.id, 'data-hour': hour, 'aria-label': `${card.title}. ${text}. Open it` }, node, h('span', { class: 'tc-caption' }, h('b', {}, card.numeral), text));
      handBox.append(btn);
      if (isNew) fresh.push(node);
    }
    for (let i = hand.hand.length; i < 3; i++) handBox.append(h('div', { class: 'tc-slot', role: 'listitem', 'aria-label': 'An empty place in the hand' }, h('span', {}, s.status === 'played' ? 'Spent' : 'Dealt next turn')));
    // new cards lie face down, then turn over one after another, the way the Omen does at dusk
    if (fresh.length) {
      markSeen(hand.hand.map(tag));
      requestAnimationFrame(() => fresh.forEach((node, i) => {
        if (reduced) { node.classList.add('is-flipped'); return; }
        node.style.setProperty('--d', `${0.25 * i}s`);
        node.classList.add('is-revealing');
        const done = () => { node.classList.add('is-flipped'); node.classList.remove('is-revealing'); node.style.removeProperty('--d'); };
        node.querySelector('.tc-card-inner')!.addEventListener('animationend', done, { once: true });
        setTimeout(done, 1800 + 250 * i);
      }));
    }
    const spent = [...hand.played.map((p) => ({ ...p, how: 'played' as const })), ...hand.faded.map((f) => ({ id: f.id, turn: f.turn, how: 'faded' as const }))].sort((a, b) => a.turn - b.turn);
    const tally = h('div', { class: 'tc-tally' }, h('span', {}, h('b', {}, String(hand.deckLeft)), ' in the deck'), h('span', {}, h('b', {}, String(hand.played.length)), ' played'), h('span', {}, h('b', {}, String(hand.faded.length)), ' faded'));
    foot.append(tally);
    if (spent.length) {
      const fold = h('details', { class: 'tc-spent' }, h('summary', {}, 'Played and faded'));
      const list = h('ul', {});
      for (const x of spent) { const c = cardById(x.id); if (c) list.append(h('li', { 'data-how': x.how }, h('button', { type: 'button', class: 'tc-spent-card', 'data-show': c.id }, h('b', {}, c.title)), h('small', {}, `${x.how === 'played' ? 'played' : 'faded'}, turn ${x.turn}`))); }
      fold.append(list);
      foot.append(fold);
    }
    foot.append(h('p', { class: 'tc-note' }, 'Tap a card to read it, and to show it to the table.'));
  }

  async function load(): Promise<void> {
    if (!warbandId || busy) return;
    busy = true;
    if (!drawer.hidden) renderDrawer();
    try {
      const res = await fetch(api('hand'), { method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ scenarioId: opts.scenarioId, warbandId }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? 'The cards did not come. Try again.');
      hand = data.hand as TarotHand;
      const s = opts.scenario();
      reckonedFor = `${warbandId}:${s.turn}:${s.status}`;
      const unseen = hand.hand.some((c) => !seen().has(tag(c)));
      button?.classList.toggle('has-new', unseen && drawer.hidden);
    } catch (e) {
      opts.toast((e as Error).message);
    } finally {
      busy = false;
      if (!drawer.hidden) renderDrawer();
    }
  }

  function open(): void {
    drawer.hidden = false;
    button?.setAttribute('aria-expanded', 'true');
    button?.classList.remove('has-new');
    renderDrawer();
    if (!hand) void load();
  }
  function close(): void {
    drawer.hidden = true;
    button?.setAttribute('aria-expanded', 'false');
  }
  button?.addEventListener('click', () => (drawer.hidden ? open() : close()));
  drawer.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    if (t.closest('[data-tarot-close]')) { close(); return; }
    const show = t.closest<HTMLElement>('[data-show]');
    if (show) showCard(show.dataset.show!, hand?.hand.some((c) => c.id === show.dataset.show) ?? false);
  });

  // ───────────────────────── the card, held up ─────────────────────────

  const dialog = h('dialog', { class: 'tc-show', 'aria-label': 'A card of the Tarot' });
  root.append(dialog);
  dialog.addEventListener('click', (e) => { if ((e.target as HTMLElement).closest('[data-tarot-done]')) dialog.close(); });

  function showCard(cardId: string, mine: boolean): void {
    const card = cardById(cardId);
    if (!card) return;
    const s = opts.scenario();
    const held = hand?.hand.find((c) => c.id === cardId);
    const hour = hourOf(card, s.turn, s.turnLimit);
    const may = mine && !!held && s.status !== 'played';
    dialog.replaceChildren();
    const big = cardNode(card, 'is-flipped big');
    const text = h('div', { class: 'tc-show-text' },
      h('div', { class: 'tk-turn-label' }, `${card.numeral} · ${TAROT_KIND_LABEL[card.kind]}`),
      h('h2', { class: 'tc-show-title' }, card.title),
      h('p', { class: 'tc-when' }, card.when),
      h('p', { class: 'tc-effect' }, card.effect),
      held && may ? h('p', { class: 'tc-note' }, captionOf(card, held, s).text + (hour === 'now' ? '.' : ': the table may still allow it.')) : null,
    );
    const actions = h('div', { class: 'tc-show-actions' });
    const play = may ? h('button', { type: 'button', class: 'tk-btn big tc-play', 'data-hour': hour }, svg(CARD_ICON), hour === 'now' ? 'Play it: show the table' : 'Play it anyway') : null;
    const back = h('button', { type: 'button', class: 'tk-btn ghost', 'data-tarot-done': true }, mine ? 'Back to the hand' : 'Close');
    if (play) actions.append(play);
    actions.append(back);
    dialog.append(h('div', { class: 'tc-show-inner', 'data-mine': String(mine) }, h('button', { type: 'button', class: 'tk-strike tc-show-close', 'data-tarot-done': true, 'aria-label': 'Close' }, svg(CLOSE)), big, text, actions));
    play?.addEventListener('click', async () => {
      if (busy) return;
      busy = true; play.disabled = true; play.setAttribute('aria-busy', 'true');
      try {
        const res = await fetch(api('play'), { method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ scenarioId: opts.scenarioId, warbandId, cardId }) });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? 'The city did not answer. Try again.');
        hand = data.hand as TarotHand;
        // the card stays up for the other side to read; the hand behind it is already one card lighter
        dialog.querySelector('.tc-show-inner')!.setAttribute('data-played', 'true');
        text.prepend(h('div', { class: 'tc-played-mark' }, 'Played, and shown to the table'));
        actions.replaceChildren(h('button', { type: 'button', class: 'tk-btn big', 'data-tarot-done': true }, 'Done'));
        renderDrawer();
        opts.onScenario(data.scenario as Scenario);
      } catch (e) {
        opts.toast((e as Error).message);
        play.disabled = false; play.removeAttribute('aria-busy');
      } finally { busy = false; }
    });
    dialog.showModal();
  }

  return {
    button,
    sync(s) {
      if (!warbandId) return;
      const key = `${warbandId}:${s.turn}:${s.status}`;
      if (key !== reckonedFor && !busy) void load();
      else if (!drawer.hidden) renderDrawer();
    },
    show(cardId) { showCard(cardId, false); },
  };
}
