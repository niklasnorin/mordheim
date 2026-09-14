/**
 * The battle tracker's client: one phone at the table, rendering the scenario as the server last answered it.
 *
 * The page hands over the roster (who is at the table, with their warriors; it does not change during a game)
 * and the scenario; every action posts to `/api/scenarios/<action>` and re-renders from the answer, and while the
 * page is visible it asks the server every few seconds whether another phone has written something. Nothing is
 * updated optimistically: the server's answer is the table.
 */
import { SCENARIO_RESULTS, scoresOf, tallyOf, type OutOfAction, type Scenario, type ScenarioEvent, type ScenarioResult } from '../campaign/model';

export interface TrackerRoster { id: string; name: string; members: { id: string; name: string; role: string; dead: boolean }[] }
export interface TrackerState {
  base: string;
  roster: TrackerRoster[];
  /** Whether the viewer sits at the table and may write. */
  may: boolean;
  scenario: Scenario;
}

const POLL_MS = 8000;

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
/** Append what is there and skip what is not, so a control can be left out with a `&&`. */
function put(el: Element, ...children: Child[]): void { for (const c of children) if (c) el.append(c); }
function svg(path: string, cls = ''): SVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const el = document.createElementNS(ns, 'svg');
  el.setAttribute('viewBox', '0 0 24 24'); el.setAttribute('fill', 'none'); el.setAttribute('stroke', 'currentColor'); el.setAttribute('stroke-width', '1.5'); el.setAttribute('stroke-linecap', 'round'); el.setAttribute('stroke-linejoin', 'round'); el.setAttribute('aria-hidden', 'true');
  if (cls) el.setAttribute('class', cls);
  const p = document.createElementNS(ns, 'path'); p.setAttribute('d', path); el.append(p);
  return el;
}
const ICON = {
  fallen: 'M6 21V10a6 6 0 0 1 12 0v11M4 21h16M12 7v8m-3-5h6',
  shard: 'm12 4 6 8-6 8-6-8 6-8Z',
  quill: 'M4 20c4-1 7-3 10-6l6-8-3-3-8 6c-3 3-5 6-6 10Zm6-6 4-4M4 20l3-3',
  close: 'm6 6 12 12M18 6 6 18',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  laurel: 'm3 6 3 13h12l3-13-6 5-3-8-3 8-6-5ZM6 16h12',
};
const RESULT_LABEL: Record<ScenarioResult, string> = { victory: 'Victory', defeat: 'Defeat', draw: 'Draw' };

export function mountTracker(root: HTMLElement, initial: TrackerState): void {
  let state = initial;
  const api = (action: string) => new URL(`${state.base}/api/scenarios/${action}`, location.href);
  const toast = ensureToast(root);
  const warbandName = (id: string | null | undefined) => state.roster.find((w) => w.id === id)?.name ?? id ?? '';
  const memberOf = (id: string) => state.roster.flatMap((w) => w.members.map((m) => ({ ...m, warbandId: w.id }))).find((m) => m.id === id);
  const memberName = (id: string) => memberOf(id)?.name ?? id;
  const attending = () => state.scenario.warbands.map((p) => state.roster.find((w) => w.id === p.warbandId)).filter((w): w is TrackerRoster => !!w);

  // ───────────────────────── talking to the server ─────────────────────────

  let busy = false;
  async function post(action: string, body: Record<string, unknown>): Promise<boolean> {
    if (busy) return false;
    busy = true; root.setAttribute('aria-busy', 'true');
    try {
      const res = await fetch(api(action), { method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ scenarioId: state.scenario.id, ...body }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? 'The city did not answer. Try again.');
      state = { ...state, scenario: data.scenario as Scenario };
      render();
      return true;
    } catch (e) {
      toast((e as Error).message);
      return false;
    } finally { busy = false; root.removeAttribute('aria-busy'); }
  }
  /** Ask whether another phone has written; only re-render when something changed, so a half-read log does not jump. */
  async function refresh(): Promise<void> {
    if (busy || document.visibilityState !== 'visible' || sheet.open) return;
    try {
      const res = await fetch(api('tracker'), { method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ scenarioId: state.scenario.id }) });
      if (!res.ok) { live.dataset.on = 'false'; return; }
      const data = await res.json();
      live.dataset.on = 'true';
      const next = data.scenario as Scenario;
      if (String(next.updatedAt) !== String(state.scenario.updatedAt)) { state = { ...state, scenario: next }; render(); }
    } catch { live.dataset.on = 'false'; }
  }

  // ───────────────────────── the frame ─────────────────────────

  const live = root.querySelector<HTMLElement>('.tk-live') ?? h('span', { class: 'tk-live' });
  const turnBox = h('section', { class: 'tk-turn', 'aria-label': 'The turn' });
  const tallyBox = h('section', { class: 'tk-tally', 'aria-label': 'The tally' });
  const logBox = h('section', { class: 'tk-log', 'aria-label': 'The log' });
  const bar = h('nav', { class: 'tk-bar', 'aria-label': 'Log something', 'data-may': String(state.may) },
    h('div', { class: 'tk-bar-inner' },
      h('button', { type: 'button', class: 'tk-btn', 'data-open': 'out-of-action' }, svg(ICON.fallen), 'Out of action'),
      h('button', { type: 'button', class: 'tk-btn', 'data-open': 'score' }, svg(ICON.shard), 'Score'),
      h('button', { type: 'button', class: 'tk-btn', 'data-open': 'note' }, svg(ICON.quill), 'Note'),
    ));
  const sheet = h('dialog', { class: 'tk-sheet' });
  root.append(turnBox, tallyBox, logBox, bar, sheet);

  // ───────────────────────── rendering ─────────────────────────

  function render(): void {
    const s = state.scenario;
    renderTurn(s);
    renderTally(s);
    renderLog(s);
    bar.dataset.may = String(state.may);
    bar.querySelector<HTMLButtonElement>('[data-open="score"]')!.hidden = !tallyOf(s);
  }

  function renderTurn(s: Scenario): void {
    turnBox.replaceChildren();
    const played = s.status === 'played';
    const live = state.may && !played;
    turnBox.dataset.idle = String(s.turn === 0);
    if (played) {
      // how it ended, first: the one thing the table wants to see once the game is called
      const results = h('div', { class: 'tk-result' },
        h('div', { class: 'tk-turn-label' }, 'The game is played'),
        h('ul', { class: 'tk-result-list' }, ...s.warbands.map((w) => h('li', { 'data-result': w.result ?? '' }, h('span', {}, warbandName(w.warbandId)), h('b', {}, w.result ? RESULT_LABEL[w.result] : 'No result')))),
        h('p', { class: 'tk-turn-note' }, s.turn > 0 ? `It ran ${s.turn} ${s.turn === 1 ? 'turn' : 'turns'} as the table counted them.` : 'It was not tracked turn by turn.'),
        h('div', { class: 'tk-result-actions' },
          h('a', { class: 'tk-btn', href: `${state.base}/scenarios/${s.id}/#pen` }, svg(ICON.quill), 'Write it up'),
          state.may ? h('button', { type: 'button', class: 'tk-btn ghost', 'data-open': 'wrap-up' }, 'Change how it ended') : null,
        ),
      );
      turnBox.dataset.idle = 'true';
      put(turnBox, results);
      return;
    }
    if (s.turn === 0) {
      put(turnBox,
        h('div', {}, h('div', { class: 'tk-turn-label' }, 'Before the first turn'), h('p', { class: 'tk-turn-note' }, 'The warbands are deploying. Anything logged now goes down as turn 1.')),
        live ? h('button', { type: 'button', class: 'tk-btn big wide tk-turn-begin', 'data-turn': '1' }, 'Begin: turn 1') : null,
      );
    } else {
      put(turnBox,
        h('button', { type: 'button', class: 'tk-btn ghost tk-turn-back', 'data-turn': String(s.turn - 1), 'aria-label': 'Back a turn', hidden: !live }, svg(ICON.minus)),
        h('div', { class: 'tk-turn-now' }, h('div', { class: 'tk-turn-label' }, 'Turn'), h('div', { class: 'tk-turn-number' }, String(s.turn))),
        live ? h('button', { type: 'button', class: 'tk-btn big', 'data-turn': String(s.turn + 1) }, svg(ICON.plus), 'Next turn') : h('span'),
      );
    }
    // the way out: calling the game is the table's, and it should never be hunted for
    if (live) put(turnBox, h('button', { type: 'button', class: 'tk-btn tk-wrap', 'data-open': 'wrap-up' }, svg(ICON.laurel), 'The game is done: who won?'));
  }

  function renderTally(s: Scenario): void {
    tallyBox.replaceChildren();
    const tally = tallyOf(s);
    tallyBox.hidden = !tally;
    if (!tally) return;
    tallyBox.append(h('div', { class: 'tk-tally-head' }, h('span', {}, tally), h('span', {}, 'the tally')));
    for (const { warbandId, points } of scoresOf(s)) {
      tallyBox.append(h('div', { class: 'tk-score' },
        h('div', { class: 'tk-score-name' }, warbandName(warbandId)),
        h('div', { class: 'tk-score-total' }, String(points)),
        state.may && s.status !== 'played' ? h('div', { class: 'tk-score-taps' },
          h('button', { type: 'button', class: 'tk-btn', 'data-score': warbandId, 'data-points': '1', 'aria-label': `${warbandName(warbandId)}: one more` }, svg(ICON.plus)),
          h('button', { type: 'button', class: 'tk-btn ghost', 'data-score': warbandId, 'data-points': '-1', 'aria-label': `${warbandName(warbandId)}: one fewer` }, svg(ICON.minus)),
        ) : null,
      ));
    }
  }

  type Line = { turn: number | null; at: number; node: HTMLElement };
  function renderLog(s: Scenario): void {
    logBox.replaceChildren(h('div', { class: 'tk-log-head' }, h('span', {}, 'The log'), h('span', {}, `${s.events.length + s.outOfAction.length} ${s.events.length + s.outOfAction.length === 1 ? 'line' : 'lines'}`)));
    const lines: Line[] = [
      ...s.outOfAction.map((o) => ({ turn: o.turn ?? null, at: o.id, node: fallenLine(o) })),
      ...s.events.map((e) => ({ turn: e.turn, at: e.id, node: eventLine(e) })),
    ];
    if (!lines.length) {
      logBox.append(h('p', { class: 'tk-empty' }, state.may ? 'Nothing logged yet. Who struck, who scored, what happened: it all goes here, by turn.' : 'Nothing has been logged yet.'));
      if (!state.may) logBox.append(h('p', { class: 'tk-watching' }, 'You are watching. Only those whose warbands fight here may write.'));
      return;
    }
    // latest turn first, so the thumb lands on what just happened; within a turn, in the order it was logged
    const turns = [...new Set(lines.map((l) => l.turn))].sort((a, b) => (b ?? -1) - (a ?? -1));
    if (s.turn > 0 && !turns.includes(s.turn)) turns.unshift(s.turn);
    for (const t of turns) {
      const group = h('div', { class: 'tk-group' });
      group.append(h('div', { class: 'tk-group-head', 'data-now': String(t === s.turn && s.status !== 'played') }, t === null ? h('small', {}, 'Written up afterwards') : `Turn ${t}`));
      const mine = lines.filter((l) => l.turn === t).sort((a, b) => a.at - b.at);
      if (!mine.length) group.append(h('p', { class: 'tk-empty' }, 'Nothing yet this turn.'));
      for (const l of mine) group.append(l.node);
      logBox.append(group);
    }
    if (!state.may) logBox.append(h('p', { class: 'tk-watching' }, 'You are watching. Only those whose warbands fight here may write.'));
  }

  function fallenLine(o: OutOfAction): HTMLElement {
    const attacker = memberOf(o.attackerId);
    return h('div', { class: 'tk-line', 'data-kind': 'out-of-action' },
      svg(ICON.fallen, 'tk-line-icon'),
      h('div', { class: 'tk-line-body' },
        h('div', {}, h('b', {}, memberName(o.attackerId)), ' put ', h('b', {}, o.target), ' out of action', o.detail ? `: ${o.detail}` : ''),
        h('div', { class: 'tk-line-meta' }, attacker ? h('span', { class: 'tk-chip' }, warbandName(attacker.warbandId)) : null),
      ),
      state.may ? h('button', { type: 'button', class: 'tk-strike', 'data-strike-ooa': String(o.id), 'aria-label': 'Strike this record' }, svg(ICON.close)) : h('span'),
    );
  }

  function eventLine(e: ScenarioEvent): HTMLElement {
    const body = h('div', { class: 'tk-line-body' });
    if (e.kind === 'score') {
      const sign = e.points > 0 ? '+' : '−';
      body.append(h('div', {}, h('b', {}, warbandName(e.warbandId)), ' ', h('span', { class: `points${e.points < 0 ? ' minus' : ''}` }, `${sign}${Math.abs(e.points)} ${tallyOf(state.scenario) || 'points'}`), e.text ? ` — ${e.text}` : ''));
    } else {
      body.append(h('div', {}, e.text));
    }
    body.append(h('div', { class: 'tk-line-meta' }, e.kind === 'note' && e.warbandId ? h('span', { class: 'tk-chip' }, warbandName(e.warbandId)) : null, e.authorName ? h('span', {}, e.authorName) : null));
    return h('div', { class: 'tk-line', 'data-kind': e.kind },
      svg(e.kind === 'score' ? ICON.shard : ICON.quill, 'tk-line-icon'),
      body,
      state.may ? h('button', { type: 'button', class: 'tk-strike', 'data-strike-event': String(e.id), 'aria-label': 'Strike this line' }, svg(ICON.close)) : h('span'),
    );
  }

  // ───────────────────────── the sheet ─────────────────────────

  const turnField = () => h('label', { class: 'tk-turn-field' }, 'Turn', h('input', { type: 'number', name: 'turn', min: '1', max: '99', inputmode: 'numeric', value: String(Math.max(1, state.scenario.turn)) }));
  const closeButton = () => h('button', { type: 'button', class: 'tk-strike', 'data-close': true, 'aria-label': 'Close' }, svg(ICON.close));
  const warbandChoices = (name: string, none?: string) => {
    const box = h('div', { class: 'tk-choices', role: 'group' });
    if (none) box.append(h('label', {}, h('input', { type: 'radio', name, value: '', checked: true }), h('span', {}, none)));
    attending().forEach((w, i) => box.append(h('label', {}, h('input', { type: 'radio', name, value: w.id, checked: !none && i === 0 }), h('span', {}, w.name))));
    return box;
  };
  const memberSelect = (name: string, placeholder: string, extra?: { value: string; label: string }) => {
    const sel = h('select', { name, required: !extra });
    sel.append(h('option', { value: '' }, placeholder));
    for (const w of attending()) {
      const g = h('optgroup', { label: w.name });
      for (const m of w.members.filter((m) => !m.dead)) g.append(h('option', { value: m.id }, `${m.name} · ${m.role}`));
      sel.append(g);
    }
    if (extra) sel.append(h('option', { value: extra.value }, extra.label));
    return sel;
  };

  type SheetKind = 'out-of-action' | 'score' | 'note' | 'wrap-up';
  /** What the tally says, when it decides anything: the one warband ahead wins, the rest lose. Otherwise nothing is presumed. */
  function suggestedResults(s: Scenario): Record<string, ScenarioResult> {
    const out: Record<string, ScenarioResult> = {};
    for (const w of s.warbands) if (w.result) out[w.warbandId] = w.result;
    if (Object.keys(out).length) return out;
    if (!tallyOf(s)) return out;
    const scores = scoresOf(s);
    const top = Math.max(...scores.map((x) => x.points));
    if (scores.filter((x) => x.points === top).length !== 1) return out;
    for (const x of scores) out[x.warbandId] = x.points === top ? 'victory' : 'defeat';
    return out;
  }

  function openSheet(kind: SheetKind): void {
    sheet.replaceChildren();
    const form = h('form', { method: 'dialog', 'data-kind': kind });
    if (kind === 'wrap-up') {
      const s = state.scenario;
      const given = suggestedResults(s);
      form.append(h('div', { class: 'tk-sheet-head' }, h('h2', {}, s.status === 'played' ? 'How it ended' : 'The game is done'), closeButton()));
      if (!s.warbands.length) form.append(h('p', { class: 'tk-empty' }, 'No warbands are named for this scenario yet. A game master names them on the scenario page.'));
      for (const w of attending()) {
        const box = h('div', { class: 'tk-choices', role: 'group', 'aria-label': w.name });
        for (const r of SCENARIO_RESULTS) box.append(h('label', {}, h('input', { type: 'radio', name: `result.${w.id}`, value: r, required: true, checked: given[w.id] === r }), h('span', { 'data-result': r }, RESULT_LABEL[r])));
        form.append(h('div', { class: 'tk-field' }, w.name, box));
      }
      form.append(
        h('p', { class: 'tk-note' }, s.status === 'played' ? 'The results are changed as they stand; the scenario stays in the Chronicle.' : Object.keys(given).length && !s.warbands.some((w) => w.result) ? 'Suggested from the tally. Change it if the table says otherwise.' : 'Every warband that fought gets a result. The scenario joins the Chronicle, and the writing-up begins on its page.'),
        h('div', { class: 'tk-actions' }, h('button', { type: 'submit', class: 'tk-btn big', disabled: !s.warbands.length }, svg(ICON.laurel), s.status === 'played' ? 'Save how it ended' : 'Call the game')),
      );
    } else if (kind === 'out-of-action') {
      const target = memberSelect('targetId', 'Who fell', { value: '@other', label: 'Someone not on the roll…' });
      const other = h('label', { class: 'tk-field', hidden: true }, 'Their name', h('input', { name: 'target', maxlength: '120', placeholder: 'A hired sword, a beast, a bystander' }));
      target.addEventListener('change', () => { other.hidden = target.value !== '@other'; if (!other.hidden) other.querySelector('input')!.focus(); });
      form.append(
        h('div', { class: 'tk-sheet-head' }, h('h2', {}, 'Out of action'), closeButton()),
        h('label', { class: 'tk-field' }, 'Who struck', memberSelect('attackerId', 'Who struck')),
        h('label', { class: 'tk-field' }, 'Who fell', target),
        other,
        h('label', { class: 'tk-field' }, 'How', h('input', { name: 'detail', maxlength: '1000', placeholder: 'From the rooftop; the crossbow.' }), h('small', {}, 'Optional. Only what was seen at the table.')),
        h('div', { class: 'tk-actions' }, turnField(), h('button', { type: 'submit', class: 'tk-btn blood' }, 'Record it')),
      );
    } else if (kind === 'score') {
      const tally = tallyOf(state.scenario) || 'Points';
      const count = h('input', { type: 'number', name: 'points', min: '-99', max: '99', value: '1', inputmode: 'numeric', required: true });
      const step = (d: number) => h('button', { type: 'button', class: 'tk-btn ghost', 'aria-label': d > 0 ? 'More' : 'Fewer', 'data-step': String(d) }, svg(d > 0 ? ICON.plus : ICON.minus));
      form.append(
        h('div', { class: 'tk-sheet-head' }, h('h2', {}, tally), closeButton()),
        h('div', { class: 'tk-field' }, 'Who scored', warbandChoices('warbandId')),
        h('div', { class: 'tk-field' }, 'How many', h('div', { class: 'tk-stepper' }, step(-1), count, step(1)), h('small', {}, 'A minus takes back what was lost again.')),
        h('label', { class: 'tk-field' }, 'How', h('input', { name: 'text', maxlength: '500', placeholder: 'Two from the fountain.' }), h('small', {}, 'Optional.')),
        h('div', { class: 'tk-actions' }, turnField(), h('button', { type: 'submit', class: 'tk-btn' }, 'Score it')),
      );
      form.addEventListener('click', (e) => {
        const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-step]');
        if (!b) return;
        let v = (Number(count.value) || 0) + Number(b.dataset.step);
        if (v === 0) v += Number(b.dataset.step);
        count.value = String(Math.max(-99, Math.min(99, v)));
      });
    } else {
      const text = h('textarea', { name: 'text', maxlength: '500', required: true, placeholder: 'What happened, in a line.' });
      const quick = h('div', { class: 'tk-quick' });
      for (const words of ['Failed the rout test', 'Passed the rout test', 'Routed voluntarily', 'The leader is down']) quick.append(h('button', { type: 'button', class: 'tk-btn ghost', 'data-words': words }, words));
      quick.addEventListener('click', (e) => {
        const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-words]');
        if (!b) return;
        text.value = text.value.trim() ? `${text.value.trim()} ${b.dataset.words}` : b.dataset.words!;
        text.focus();
      });
      form.append(
        h('div', { class: 'tk-sheet-head' }, h('h2', {}, 'A note'), closeButton()),
        h('label', { class: 'tk-field' }, 'What happened', text),
        quick,
        h('div', { class: 'tk-field' }, 'Whose', warbandChoices('warbandId', 'The table')),
        h('div', { class: 'tk-actions' }, turnField(), h('button', { type: 'submit', class: 'tk-btn' }, 'Note it')),
      );
    }
    sheet.append(form);
    sheet.showModal();
    (form.querySelector('select, textarea, input:not([type=radio]):not([type=number])') as HTMLElement | null)?.focus();
  }

  sheet.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('[data-close]')) { sheet.close(); return; }
    // a tap on the backdrop closes the sheet; the dialog's own box swallows the rest
    if (e.target === sheet) sheet.close();
  });
  sheet.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const data = new FormData(form);
    const kind = form.dataset.kind!;
    const turn = Number(data.get('turn')) || Math.max(1, state.scenario.turn);
    const button = form.querySelector<HTMLButtonElement>('button[type=submit]')!;
    button.disabled = true; button.setAttribute('aria-busy', 'true');
    let ok = false;
    if (kind === 'wrap-up') {
      const results = state.scenario.warbands.map((w) => ({ warbandId: w.warbandId, result: String(data.get(`result.${w.warbandId}`) ?? '') }));
      if (results.some((r) => !r.result)) { toast('Every warband that fought needs a result.'); button.disabled = false; button.removeAttribute('aria-busy'); return; }
      ok = await post('played', { results });
      if (ok) window.scrollTo({ top: 0, behavior: 'smooth' });
    } else if (kind === 'out-of-action') {
      const targetId = String(data.get('targetId') ?? '');
      ok = await post('out-of-action', { attackerId: data.get('attackerId'), targetId: targetId && targetId !== '@other' ? targetId : null, target: targetId === '@other' ? data.get('target') : '', detail: data.get('detail') ?? '', turn });
    } else if (kind === 'score') {
      ok = await post('event', { kind: 'score', warbandId: data.get('warbandId') || null, points: Number(data.get('points')), text: data.get('text') ?? '', turn });
    } else {
      ok = await post('event', { kind: 'note', warbandId: data.get('warbandId') || null, text: data.get('text') ?? '', turn });
    }
    if (ok) sheet.close(); else { button.disabled = false; button.removeAttribute('aria-busy'); }
  });

  // ───────────────────────── the taps ─────────────────────────

  root.addEventListener('click', async (e) => {
    const t = e.target as HTMLElement;
    const open = t.closest<HTMLButtonElement>('[data-open]');
    if (open) { openSheet(open.dataset.open as SheetKind); return; }
    const turn = t.closest<HTMLButtonElement>('[data-turn]');
    if (turn) { await post('turn', { turn: Number(turn.dataset.turn) }); return; }
    const score = t.closest<HTMLButtonElement>('[data-score]');
    if (score) { await post('event', { kind: 'score', warbandId: score.dataset.score, points: Number(score.dataset.points), turn: Math.max(1, state.scenario.turn) }); return; }
    const strikeEvent = t.closest<HTMLButtonElement>('[data-strike-event]');
    if (strikeEvent) { if (confirm('Strike this line from the log?')) await post('remove-event', { id: Number(strikeEvent.dataset.strikeEvent) }); return; }
    const strikeOoa = t.closest<HTMLButtonElement>('[data-strike-ooa]');
    if (strikeOoa) { if (confirm('Strike this out-of-action record?')) await post('remove-out-of-action', { id: Number(strikeOoa.dataset.strikeOoa) }); return; }
  });

  render();
  setInterval(refresh, POLL_MS);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') void refresh(); });
}

function ensureToast(root: HTMLElement): (text: string) => void {
  const el = h('div', { class: 'tk-toast', role: 'status', hidden: true });
  root.append(el);
  let t: ReturnType<typeof setTimeout> | undefined;
  return (text) => { el.textContent = text; el.hidden = false; clearTimeout(t); t = setTimeout(() => { el.hidden = true; }, 5000); };
}
