/**
 * The muster at the table: the tracker's pages beside the table itself, a swipe away. Swiping right to left brings
 * in the viewer's own warband, then the other side's (each warband at the table has its page; the viewer's comes
 * first when they keep one), every warrior a compact card with their portrait and name. A tap on a card lifts it to
 * the top of the screen, pinned there, with the rest of the warrior under it: the statline, the skills and injuries,
 * and what has befallen them in this game. A tap on the pinned card, a swipe across it either way, Escape or the
 * phone's back puts it back.
 *
 * The pager is a track moved by hand rather than a scroll container, so the document keeps its own scroll (the
 * masthead stays sticky) and each page keeps where it was read to. A page not in view folds to nothing, so a short
 * roster does not leave the long log's height under it; while a swipe is under way the page coming in is drawn
 * where it will be read from, so nothing jumps when it settles.
 */
import { STAT_KEYS, STAT_NAMES, type Scenario, type Statline } from '../campaign/model';

export interface MusterWarrior {
  id: string;
  name: string;
  role: string;
  dead: boolean;
  rank: 'hero' | 'henchman';
  /** The two letters, where there is no picture. */
  portrait: string;
  /** The framed portrait's image id, if the keeper has hung one. */
  picture: string | null;
  epithet: string;
  stats: Statline;
  experience: number | null;
  skills: string[];
  injuries: string[];
}
export interface MusterBand {
  id: string;
  name: string;
  /** The crest's address, ready to use; null where the warband has only its sigil. */
  crest: string | null;
  sigil: string;
  /** Whether the viewer keeps this warband. */
  mine: boolean;
  members: MusterWarrior[];
}

export interface MusterMount { sync(s: Scenario): void }

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

/** Replace what is in an element with what is there, skipping what is not. */
function put(el: Element, ...children: Child[]): void { el.replaceChildren(...children.filter((c): c is Node | string => !!c)); }

const EASE = 'cubic-bezier(.22, .8, .24, 1)';
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const ordinalTurn = (t: number | null | undefined) => (t ? ` in turn ${t}` : '');

export function mountMuster(o: {
  root: HTMLElement;
  /** The pager, holding the table's own page already; the warbands' pages are added after it. */
  pager: HTMLElement;
  base: string;
  roster: MusterBand[];
  scenario: Scenario;
}): MusterMount {
  const { root, pager, base } = o;
  let s = o.scenario;
  // the viewer's own warband first, then the others as they attend
  const bands = [...o.roster.filter((b) => b.mine), ...o.roster.filter((b) => !b.mine)];
  const tablePage = pager.firstElementChild as HTMLElement;
  const track = h('div', { class: 'tk-track' });
  pager.append(track);
  track.append(tablePage);
  tablePage.classList.add('tk-page', 'on');
  tablePage.dataset.page = '0';

  const pages: HTMLElement[] = [tablePage];
  const lists = new Map<string, HTMLOListElement>();
  const counts = new Map<string, HTMLElement>();
  bands.forEach((b, i) => {
    const list = h('ol', { class: 'tk-roll-list' });
    const count = h('p', { class: 'tk-roll-sub' });
    const page = h('section', { class: 'tk-page tk-roll', 'data-page': String(i + 1), 'data-band': b.id, 'aria-label': b.name },
      h('header', { class: 'tk-roll-head' },
        h('span', { class: 'tk-roll-mark', 'aria-hidden': 'true' }, b.crest ? h('img', { src: b.crest, alt: '', width: '120', height: '140', loading: 'lazy' }) : b.sigil),
        h('div', {}, h('h2', { class: 'tk-roll-name' }, b.name), count),
      ),
      list,
    );
    lists.set(b.id, list);
    counts.set(b.id, count);
    pages.push(page);
    track.append(page);
  });

  // the dots under the masthead: where you are, and a tap to any page
  const labelOf = (i: number) => (i === 0 ? 'The table' : bands[i - 1].mine ? 'Yours' : bands[i - 1].name.replace(/^The /i, ''));
  const dots = h('nav', { class: 'tk-dots', 'aria-label': 'The table and the warbands' },
    ...pages.map((_, i) => h('button', { type: 'button', class: 'tk-dot', 'data-go': String(i), 'aria-label': i === 0 ? 'The table' : bands[i - 1].name, 'aria-current': i === 0 ? 'page' : undefined }, h('span', {}, labelOf(i)))));
  if (bands.length) pager.before(dots);
  // the row of warbands, lit for whose turn it is, belongs to the table: it slides away with it, and the dots take its place under the masthead
  const turnRow = root.querySelector('.tk-bands');
  if (turnRow) tablePage.prepend(turnRow);

  // ───────────────────────── the cards ─────────────────────────

  const takenDown = (id: string) => s.outOfAction.filter((x) => x.targetId === id);
  const tookDown = (id: string) => s.outOfAction.filter((x) => x.attackerId === id);
  const nameOf = (id: string) => o.roster.flatMap((b) => b.members).find((m) => m.id === id)?.name ?? id;

  function face(m: MusterWarrior, cls: string): HTMLElement {
    return m.picture
      ? h('span', { class: cls }, h('img', { src: `${base}/images/${m.picture}`, alt: '', width: '300', height: '400', loading: 'lazy', decoding: 'async' }))
      : h('span', { class: `${cls} letters` }, m.portrait || m.name.slice(0, 2));
  }

  /** The compact card's insides, the same in the list and pinned at the top. */
  function cardBody(m: MusterWarrior, pinned: boolean): Child[] {
    const down = takenDown(m.id).length > 0, kills = tookDown(m.id).length;
    return [
      face(m, 'tk-wr-face'),
      h('span', { class: 'tk-wr-text' },
        h('span', { class: 'tk-wr-name' }, m.name),
        h('span', { class: 'tk-wr-role' }, m.role),
      ),
      h('span', { class: 'tk-wr-marks' },
        kills ? h('span', { class: 'tk-wr-kills', title: `Took down ${kills}` }, `${kills} down`) : null,
        down ? h('span', { class: 'tk-wr-ooa' }, 'Out of action') : null,
        h('span', { class: 'tk-wr-chev', 'aria-hidden': 'true' }, pinned ? '×' : '›'),
      ),
    ];
  }

  function renderLists(): void {
    for (const b of bands) {
      const list = lists.get(b.id)!;
      const standing = b.members.filter((m) => !m.dead);
      const down = standing.filter((m) => takenDown(m.id).length).length;
      counts.get(b.id)!.textContent = `${b.mine ? 'Your warband' : 'At the table'} · ${standing.length} ${standing.length === 1 ? 'warrior' : 'warriors'}${down ? `, ${down} out of action` : ''}`;
      list.replaceChildren(...standing.map((m) => {
        const card = h('button', { type: 'button', class: 'tk-wr', 'data-member': m.id, 'data-down': String(takenDown(m.id).length > 0), 'aria-label': `${m.name}, ${m.role}: show more` }, ...cardBody(m, false));
        if (open?.m.id === m.id) card.style.visibility = 'hidden';
        return h('li', {}, card);
      }));
      if (!standing.length) list.append(h('li', { class: 'tk-note' }, 'No warriors on the roll.'));
    }
  }

  // ───────────────────────── the card lifted ─────────────────────────

  const pin = h('button', { type: 'button', class: 'tk-wr pinned' });
  const sheet = h('div', { class: 'tk-dossier-body' });
  const inner = h('div', { class: 'tk-dossier-inner' }, pin, sheet);
  const dossier = h('div', { class: 'tk-dossier', role: 'dialog', 'aria-modal': 'true', hidden: true }, inner);
  root.append(dossier);
  let open: { m: MusterWarrior; b: MusterBand } | null = null;
  let closing = false;
  /** How far across a swipe had carried the lifted card when it let go, so putting it back starts from there. */
  let fling = 0;

  function fillDossier(): void {
    if (!open) return;
    const { m, b } = open;
    put(pin, ...cardBody(m, true));
    pin.dataset.down = String(takenDown(m.id).length > 0);
    pin.setAttribute('aria-label', `${m.name}: close`);
    dossier.setAttribute('aria-label', m.name);
    const fell = takenDown(m.id), struck = tookDown(m.id);
    const game = [
      ...fell.map((x) => h('li', { class: 'fell' }, `Put out of action by ${nameOf(x.attackerId)}${ordinalTurn(x.turn)}`, x.detail ? h('small', {}, x.detail) : null)),
      ...struck.map((x) => h('li', {}, `Took down ${x.target}${ordinalTurn(x.turn)}`, x.detail ? h('small', {}, x.detail) : null)),
    ];
    put(sheet,
      h('div', { class: 'tk-dossier-lead' },
        m.picture ? face(m, 'tk-dossier-face') : null,
        h('div', {},
          h('p', { class: 'tk-dossier-kind' }, [m.rank === 'hero' ? 'Hero' : 'Henchman', b.name].join(' · ')),
          m.epithet ? h('p', { class: 'tk-dossier-epithet' }, m.epithet) : null,
          m.experience != null ? h('p', { class: 'tk-dossier-xp' }, h('b', {}, String(m.experience)), ' experience') : null,
        ),
      ),
      h('dl', { class: 'tk-stats', 'aria-label': 'Statline' }, ...STAT_KEYS.map((k) => h('div', { title: STAT_NAMES[k] }, h('dt', {}, k), h('dd', {}, String(m.stats?.[k] ?? '–'))))),
      game.length ? h('section', {}, h('h3', { class: 'tk-turn-label' }, 'This game'), h('ul', { class: 'tk-dossier-list' }, ...game)) : null,
      m.skills.length ? h('section', {}, h('h3', { class: 'tk-turn-label' }, 'Skills and rules'), h('ul', { class: 'tk-dossier-list' }, ...m.skills.map((x) => h('li', {}, x)))) : null,
      m.injuries.length ? h('section', {}, h('h3', { class: 'tk-turn-label' }, 'Injuries'), h('ul', { class: 'tk-dossier-list injuries' }, ...m.injuries.map((x) => h('li', {}, x)))) : null,
      h('a', { class: 'tk-btn ghost wide', href: `${base}/warbands/${b.id}/#${m.id}` }, 'Their whole record'),
    );
  }

  const cardFor = (id: string) => pager.querySelector<HTMLElement>(`.tk-wr[data-member="${CSS.escape(id)}"]`);

  function openCard(card: HTMLElement): void {
    if (open || closing) return;
    const id = card.dataset.member!;
    const b = bands.find((x) => x.members.some((m) => m.id === id));
    const m = b?.members.find((x) => x.id === id);
    if (!b || !m) return;
    open = { m, b };
    fillDossier();
    const from = card.getBoundingClientRect();
    dossier.hidden = false;
    dossier.scrollTop = 0;
    card.style.visibility = 'hidden';
    history.pushState({ ...(history.state ?? {}), tkCard: id }, '');
    pin.focus({ preventScroll: true });
    if (reduced()) return;
    const to = pin.getBoundingClientRect();
    pin.animate([{ transform: `translate(${from.left - to.left}px, ${from.top - to.top}px)`, boxShadow: 'none' }, { transform: 'none' }], { duration: 340, easing: EASE });
    sheet.animate([{ opacity: 0, transform: 'translateY(1.5rem)' }, { opacity: 1, transform: 'none' }], { duration: 300, delay: 90, easing: EASE, fill: 'backwards' });
    dossier.animate([{ backgroundColor: 'rgba(8, 10, 9, 0)' }, {}], { duration: 260, easing: 'ease-out' });
  }

  function closeCard(): void {
    if (!open || closing) return;
    const id = open.m.id;
    const dx = fling; fling = 0;
    inner.style.transition = ''; inner.style.transform = ''; inner.style.opacity = '';
    const finish = () => {
      dossier.hidden = true;
      open = null; closing = false;
      const card = cardFor(id);
      if (card) { card.style.visibility = ''; card.focus({ preventScroll: true }); }
    };
    const card = cardFor(id);
    if (reduced() || !card) { finish(); return; }
    closing = true;
    const from = pin.getBoundingClientRect(), to = card.getBoundingClientRect();
    sheet.animate([{ opacity: dx ? .6 : 1, transform: `translateX(${dx}px)` }, { opacity: 0, transform: `translate(${dx}px, 1.5rem)` }], { duration: 180, easing: 'ease-in', fill: 'forwards' });
    dossier.animate([{}, { backgroundColor: 'rgba(8, 10, 9, 0)' }], { duration: 300, easing: 'ease-in', fill: 'forwards' });
    const a = pin.animate([{ transform: `translateX(${dx}px)` }, { transform: `translate(${to.left - from.left}px, ${to.top - from.top}px)` }], { duration: 300, easing: EASE, fill: 'forwards' });
    a.onfinish = () => { finish(); for (const x of dossier.getAnimations({ subtree: true })) x.cancel(); };
  }

  // a tap on the pinned card, Escape, or the phone's back all go through the history, so back never leaves the page
  const putBack = () => { if (history.state?.tkCard) history.back(); else closeCard(); };
  pin.addEventListener('click', putBack);
  dossier.addEventListener('click', (e) => { if (e.target === dossier) putBack(); });
  addEventListener('popstate', () => { if (open) closeCard(); });
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && open) { e.preventDefault(); putBack(); } });

  // a swipe across the lifted card, either way, puts it back: it follows the finger, and goes home if let go far or fast enough
  let lift: { x: number; y: number; t: number; id: number; across: boolean; dx: number } | null = null;
  let swallowLift = false;
  dossier.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' || !e.isPrimary || closing) return;
    lift = { x: e.clientX, y: e.clientY, t: e.timeStamp, id: e.pointerId, across: false, dx: 0 };
  });
  dossier.addEventListener('pointermove', (e) => {
    if (!lift || e.pointerId !== lift.id) return;
    const mx = e.clientX - lift.x, my = e.clientY - lift.y;
    if (!lift.across) {
      if (Math.abs(my) > 10 && Math.abs(my) > Math.abs(mx)) { lift = null; return; }
      if (Math.abs(mx) < 10) return;
      lift.across = true;
      dossier.setPointerCapture(e.pointerId);
    }
    lift.dx = mx;
    inner.style.transition = 'none';
    inner.style.transform = `translateX(${mx}px)`;
    inner.style.opacity = String(Math.max(.4, 1 - Math.abs(mx) / (dossier.clientWidth || 1)));
  });
  const letGo = (e: PointerEvent) => {
    if (!lift || e.pointerId !== lift.id) return;
    const was = lift; lift = null;
    if (!was.across) return;
    swallowLift = true; setTimeout(() => { swallowLift = false; }, 50);
    const speed = Math.abs(was.dx) / Math.max(1, e.timeStamp - was.t);
    if (e.type !== 'pointercancel' && (Math.abs(was.dx) > (dossier.clientWidth || 1) * .2 || speed > .45)) { fling = was.dx; putBack(); return; }
    inner.style.transition = `transform 220ms ${EASE}, opacity 220ms`;
    inner.style.transform = ''; inner.style.opacity = '';
  };
  dossier.addEventListener('pointerup', letGo);
  dossier.addEventListener('pointercancel', letGo);
  dossier.addEventListener('click', (e) => { if (swallowLift) { e.stopPropagation(); e.preventDefault(); } }, true);

  // ───────────────────────── the pager ─────────────────────────

  let index = 0;
  const saved: number[] = [];
  const header = () => root.querySelector<HTMLElement>('.tk-top')?.offsetHeight ?? 0;
  /** Where a page is read from once it is in view: where it was left, or its top, never further down than now. */
  function readFrom(i: number): number {
    if (saved[i] !== undefined) return saved[i];
    const top = pager.getBoundingClientRect().top + scrollY - header();
    return Math.max(0, Math.min(scrollY, top));
  }
  /** Draw the pages either side where they will be read from, and let them be seen while they move. */
  function prepare(): void {
    pager.classList.add('moving');
    for (const i of [index - 1, index + 1]) {
      const p = pages[i];
      if (p) p.style.transform = `translateY(${scrollY - readFrom(i)}px)`;
    }
  }
  function place(dx: number, animate: boolean, i = index): void {
    track.style.transition = animate ? `transform ${reduced() ? 1 : 320}ms ${EASE}` : 'none';
    track.style.transform = `translateX(calc(${-i * 100}% + ${dx}px))`;
  }
  function settle(i: number): void {
    pager.classList.remove('moving');
    for (const p of pages) p.style.transform = '';
    if (i === index) return;
    saved[index] = scrollY;
    const to = readFrom(i);
    pages[index].classList.remove('on');
    pages[i].classList.add('on');
    index = i;
    track.style.transition = 'none';
    track.style.transform = `translateX(${-i * 100}%)`;
    scrollTo({ top: to, behavior: 'instant' });
    for (const d of dots.querySelectorAll<HTMLElement>('[data-go]')) {
      if (Number(d.dataset.go) === i) d.setAttribute('aria-current', 'page'); else d.removeAttribute('aria-current');
    }
  }
  function goTo(i: number): void {
    i = Math.max(0, Math.min(pages.length - 1, i));
    if (i === index) { place(0, true); return; }
    // a jump of more than one page draws the one it lands on beside this one, so the slide is a single step
    pager.classList.add('moving');
    const p = pages[i];
    p.style.transform = `translateY(${scrollY - readFrom(i)}px)`;
    let done = false;
    const end = () => { if (done) return; done = true; settle(i); };
    track.addEventListener('transitionend', end, { once: true });
    setTimeout(end, 500);
    requestAnimationFrame(() => place(0, true, i));
  }

  // a swipe: decided as sideways once the finger has gone further across than down, then followed
  let start: { x: number; y: number; t: number; id: number } | null = null;
  let sideways = false, dx = 0, swallow = false;
  // listened for on the whole document, so a swipe over empty space, the masthead or the bar turns the page as well
  document.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' || !e.isPrimary || pages.length < 2 || open) return;
    if ((e.target as Element).closest('input, textarea, select, dialog, .tc-drawer, .tk-dossier')) return;
    start = { x: e.clientX, y: e.clientY, t: e.timeStamp, id: e.pointerId };
    sideways = false; dx = 0;
  });
  document.addEventListener('pointermove', (e) => {
    if (!start || e.pointerId !== start.id) return;
    const mx = e.clientX - start.x, my = e.clientY - start.y;
    if (!sideways) {
      if (Math.abs(my) > 10 && Math.abs(my) > Math.abs(mx)) { start = null; return; }
      if (Math.abs(mx) < 10) return;
      sideways = true;
      pager.setPointerCapture(e.pointerId);
      prepare();
    }
    // past either end it gives a little and no more
    const edge = (index === 0 && mx > 0) || (index === pages.length - 1 && mx < 0);
    dx = edge ? mx / 4 : mx;
    place(dx, false);
  });
  const release = (e: PointerEvent) => {
    if (!start || e.pointerId !== start.id) return;
    const was = start; start = null;
    if (!sideways) return;
    swallow = true; setTimeout(() => { swallow = false; }, 50);
    const width = pager.clientWidth || 1;
    const speed = dx / Math.max(1, e.timeStamp - was.t);
    let to = index;
    if (e.type !== 'pointercancel' && (Math.abs(dx) > width * .22 || Math.abs(speed) > .45)) to = index + (dx < 0 ? 1 : -1);
    to = Math.max(0, Math.min(pages.length - 1, to));
    let done = false;
    const end = () => { if (done) return; done = true; settle(to); };
    track.addEventListener('transitionend', end, { once: true });
    setTimeout(end, 500);
    place(0, true, to);
  };
  document.addEventListener('pointerup', release);
  document.addEventListener('pointercancel', release);
  // the tap that ends a swipe is not a tap on what it ended on
  document.addEventListener('click', (e) => { if (swallow) { e.stopPropagation(); e.preventDefault(); } }, true);

  pager.addEventListener('click', (e) => {
    const card = (e.target as Element).closest<HTMLElement>('.tk-wr[data-member]');
    if (card && !card.classList.contains('pinned')) openCard(card);
  });
  dots.addEventListener('click', (e) => {
    const d = (e.target as Element).closest<HTMLElement>('[data-go]');
    if (d) goTo(Number(d.dataset.go));
  });
  // the row of warbands under the masthead takes you to the one tapped, and the lit one back to the table
  root.querySelector('.tk-bands')?.addEventListener('click', (e) => {
    const li = (e.target as Element).closest<HTMLElement>('li[data-warband]');
    if (!li) return;
    const i = bands.findIndex((b) => b.id === li.dataset.warband) + 1;
    if (i > 0) goTo(index === i ? 0 : i);
  });

  renderLists();
  return {
    sync(next) { s = next; renderLists(); if (open) fillDossier(); },
  };
}
