/**
 * The battle tracker's client: one phone at the table, rendering the scenario as the server last answered it.
 *
 * The page hands over the roster (who is at the table, with their warriors; it does not change during a game)
 * and the scenario; every action posts to `/api/scenarios/<action>` and re-renders from the answer, and while the
 * page is visible it asks the server every few seconds whether another phone has written something. Nothing is
 * updated optimistically: the server's answer is the table. A custom scenario's objective (campaign/objective.ts) is
 * checked from its own panel, a tap for one of it and a count for several, and each check is one line of the log.
 * The camera puts a picture in the log, taken there and then or chosen from the phone's library: it is made ready
 * here at high resolution (lib/photo.ts) and goes up as a form, the one request that is not JSON.
 */
import { SCENARIO_RESULTS, scoresOf, tallyOf, type OutOfAction, type Scenario, type ScenarioEvent, type ScenarioResult } from '../campaign/model';
import { SIDES, SIDE_LABEL, houseScenario, inWords, resultsOf, rollBrings, turnEnds, verdictOf } from '../campaign/house';
import { checkLabel, checksOf, describeCheck, inSentence, objectiveOf, objectiveScores, slotsFor, MOMENT_LABEL, type Check, type Objective, type Slot } from '../campaign/objective';
import { cardById } from '../campaign/tarot';
import { activeWarband, lastOfRound, orderComplete, placed, turnOrder } from '../campaign/turns';
import { CARD_ICON, mountTarot, type TarotMount } from './tarot';
import { preparePhoto, type Photo } from './photo';

export interface TrackerRoster { id: string; name: string; members: { id: string; name: string; role: string; dead: boolean }[] }
export interface TrackerState {
  base: string;
  roster: TrackerRoster[];
  /** Whether the viewer sits at the table and may write. */
  may: boolean;
  /** The warbands whose Tarot hands this phone holds: the keeper's own, every attending one for a game master. Empty when the Tarot is not in play. */
  hands: { id: string; name: string }[];
  /** Where to sign in, for a visitor who is not; null when signed in. */
  signIn?: string | null;
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
  cart: 'M3 15h14l2-7H6m-3 7V8h3m-1 11a2 2 0 1 0 4 0 2 2 0 1 0-4 0m8 0a2 2 0 1 0 4 0 2 2 0 1 0-4 0',
  die: 'M5 5h14v14H5Zm4 4h.01M15 15h.01M12 12h.01',
  flag: 'M5 21V4m0 0h12l-2.5 4L17 12H5',
  card: CARD_ICON,
  camera: 'M4 8h3l2-3h6l2 3h3v11H4Zm8 8.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z',
  library: 'M4 5h16v14H4Zm0 10 4.5-4.5 4 4 2.5-2.5L20 17m-5-8h.01',
};
const RESULT_LABEL: Record<ScenarioResult, string> = { victory: 'Victory', defeat: 'Defeat', draw: 'Draw' };

export function mountTracker(root: HTMLElement, initial: TrackerState): void {
  let state = initial;
  const api = (action: string) => new URL(`${state.base}/api/scenarios/${action}`, location.href);
  const toast = ensureToast(root);
  const warbandName = (id: string | null | undefined) => state.roster.find((w) => w.id === id)?.name ?? id ?? '';
  const memberOf = (id: string) => state.roster.flatMap((w) => w.members.map((m) => ({ ...m, warbandId: w.id }))).find((m) => m.id === id);
  const memberName = (id: string) => memberOf(id)?.name ?? id;
  const imageUrl = (id: string) => `${state.base}/images/${id}`;
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
  /** Send a form, for a picture: as `post`, but with the share of it sent so far told to `progress` as it goes up. */
  async function upload(action: string, body: FormData, progress: (sent: number) => void): Promise<boolean> {
    if (busy) return false;
    busy = true; root.setAttribute('aria-busy', 'true');
    body.set('scenarioId', state.scenario.id);
    try {
      const data = await new Promise<{ scenario?: Scenario; error?: string }>((ok, fail) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', api(action).href);
        xhr.withCredentials = true;
        xhr.responseType = 'json';
        xhr.upload.onprogress = (e) => { if (e.lengthComputable) progress(e.loaded / e.total); };
        xhr.onload = () => {
          const answer = (xhr.response ?? {}) as { scenario?: Scenario; error?: string };
          if (xhr.status === 413) fail(new Error('That picture is too large to send. Try another.'));
          else if (xhr.status < 200 || xhr.status >= 300) fail(new Error(answer.error ?? 'The city did not answer. Try again.'));
          else ok(answer);
        };
        xhr.onerror = () => fail(new Error('The picture did not reach the city. Try again.'));
        xhr.send(body);
      });
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
  const holdBox = h('section', { class: 'tk-hold', 'aria-label': 'The objective' });
  const objectiveBox = h('section', { class: 'tk-tally tk-objective', 'aria-label': 'Something to hold' });
  const logBox = h('section', { class: 'tk-log', 'aria-label': 'The log' });
  const bar = h('nav', { class: 'tk-bar', 'aria-label': 'Log something', 'data-may': String(state.may) },
    h('div', { class: 'tk-bar-inner' },
      h('button', { type: 'button', class: 'tk-btn', 'data-open': 'out-of-action' }, svg(ICON.fallen), 'Out of action'),
      h('button', { type: 'button', class: 'tk-btn tk-camera', 'data-open': 'photo', 'aria-label': 'A picture for the battle report', title: 'A picture for the battle report' }, svg(ICON.camera)),
      h('button', { type: 'button', class: 'tk-btn', 'data-open': 'note' }, svg(ICON.quill), 'Note'),
    ));
  const sheet = h('dialog', { class: 'tk-sheet' });
  root.append(turnBox, holdBox, objectiveBox, tallyBox, logBox, bar, sheet);
  // the Tarot of the Damned: the keeper's hidden hand in a drawer, and any card held up to read from the log
  const tarot: TarotMount | null = state.scenario.tarot ? mountTarot(root, {
    base: state.base, scenarioId: state.scenario.id, hands: state.hands, names: Object.fromEntries(state.roster.map((w) => [w.id, w.name])), scenario: () => state.scenario, toast,
    onScenario: (s) => { state = { ...state, scenario: s }; render(); },
  }) : null;
  if (tarot?.button) { bar.dataset.tarot = 'true'; bar.querySelector('.tk-bar-inner')!.append(tarot.button); }

  // ───────────────────────── rendering ─────────────────────────

  /** The row of warbands under the masthead: in the order they play, the one whose turn it is lit. */
  function renderBands(s: Scenario): void {
    const bands = root.querySelector<HTMLElement>('.tk-bands');
    if (!bands) return;
    const active = s.status === 'played' ? null : activeWarband(s);
    for (const id of turnOrder(s)) {
      const li = bands.querySelector<HTMLElement>(`li[data-warband="${CSS.escape(id)}"]`);
      if (!li) continue;
      li.dataset.now = String(id === active);
      if (id === active) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current');
      bands.append(li);
    }
  }

  /** The round, in the masthead's line: tiny, and always in view. */
  function renderRound(s: Scenario): void {
    const el = root.querySelector<HTMLElement>('.tk-round');
    if (!el) return;
    const limit = s.turnLimit ?? houseScenario(s.rulebookScenario)?.turns ?? null;
    el.textContent = s.turn > 0 ? ` · Round ${s.turn}${limit !== null ? ` of ${limit}` : ''}` : '';
  }

  function render(): void {
    const s = state.scenario;
    renderRound(s);
    renderBands(s);
    renderTurn(s);
    renderHold(s);
    renderObjective(s);
    renderTally(s);
    renderLog(s);
    bar.dataset.may = String(state.may);
    tarot?.sync(s);
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
      // a scenario with sides has them chosen at the table first: who attacks, who defends
      const kind = houseScenario(s.rulebookScenario);
      const unsided = kind?.sides ? s.warbands.filter((w) => !w.side) : [];
      const chooser = kind?.sides && live ? h('div', { class: 'tk-side-pick', role: 'group', 'aria-label': 'Who attacks and who defends' },
        h('div', { class: 'tk-turn-label' }, 'Sides'),
        ...s.warbands.map((w) => h('div', { class: 'tk-side-row' },
          h('span', { class: 'tk-side-name' }, warbandName(w.warbandId)),
          h('div', { class: 'tk-choices' }, ...SIDES.map((side) => h('button', { type: 'button', class: 'tk-side-btn', 'data-side': side, 'data-pick-side': w.warbandId, 'aria-pressed': String(w.side === side) }, side === 'attacker' ? 'Attacks' : 'Defends'))),
        )),
      ) : null;
      // and the order of the round, a tap at a time: who starts, then who follows; a tap on a placed warband undoes from there
      const chosen = placed(s), complete = orderComplete(s), needOrder = s.warbands.length > 1 && !complete;
      const ordinal = (n: number) => ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th'][n] ?? `${n + 1}th`;
      const starter = s.warbands.length > 1 ? h('div', { class: 'tk-side-pick', role: 'group', 'aria-label': s.warbands.length > 2 ? 'The order of play' : 'Who starts' },
        h('div', { class: 'tk-turn-label' }, s.warbands.length > 2 ? 'The order of play' : 'Who starts'),
        h('div', { class: 'tk-order-pick' }, ...s.warbands.map((w) => {
          const at = chosen.indexOf(w.warbandId);
          const label = [h('span', {}, warbandName(w.warbandId)), at >= 0 ? h('b', { class: 'tk-ordinal' }, ordinal(at)) : null];
          return live
            ? h('button', { type: 'button', class: 'tk-side-btn', 'data-pick-order': w.warbandId, 'aria-pressed': String(at >= 0), 'aria-label': `${warbandName(w.warbandId)}${at >= 0 ? `, ${ordinal(at)}; tap to undo from here` : ', tap to place next'}` }, ...label)
            : h('span', { class: 'tk-side-btn', 'data-pressed': String(at >= 0) }, ...label);
        })),
        complete ? null : h('p', { class: 'tk-turn-note tk-order-hint' }, s.warbands.length > 2 ? 'Tap them in the order they play; a tap on one placed undoes from there.' : 'Tap the warband that starts.'),
      ) : null;
      const wanting = unsided.length ? 'Choose the sides to begin' : needOrder ? (s.warbands.length > 2 ? 'Set the order to begin' : 'Choose who starts to begin') : 'Begin: turn 1';
      put(turnBox,
        h('div', {}, h('div', { class: 'tk-turn-label' }, 'Before the first turn'), h('p', { class: 'tk-turn-note' }, kind?.sides && live ? 'Choose who attacks and who defends, and the order of play, then begin.' : 'The warbands are deploying.')),
        chooser,
        starter,
        live ? h('button', { type: 'button', class: 'tk-btn big wide tk-turn-begin', 'data-turn': '1', disabled: unsided.length > 0 || needOrder }, wanting) : null,
      );
    } else {
      // a house scenario ends each turn with its own questions; any game with a limit stops at it, unless the table adds a round
      const kind = houseScenario(s.rulebookScenario);
      const limit = s.turnLimit ?? kind?.turns ?? null;
      const ended = turnEnds(s.events).some((t) => t.turn === s.turn);
      const verdict = kind?.objective ? verdictOf(kind, s) : null;
      const last = limit !== null && s.turn >= limit && (!kind || ended);
      // within the round, each warband's turn in order; after the last warband's, the round ends
      const order = turnOrder(s), active = activeWarband(s), lastPlayer = lastOfRound(s);
      const next = active && !lastPlayer ? order[order.indexOf(active) + 1] : null;
      const firstPlayer = !active || order.indexOf(active) === 0;
      let forward: HTMLElement = h('span');
      // the rules have given the game away before its last turn: nothing more to end, only the game to call
      if (verdict?.over && verdict.winner && !last) forward = h('span');
      else if (live && next) forward = h('button', { type: 'button', class: 'tk-btn big', 'data-step': 'forward' }, svg(ICON.plus), h('span', { class: 'tk-next' }, 'Next', h('small', {}, warbandName(next))));
      else if (live && last) forward = h('button', { type: 'button', class: 'tk-btn', 'data-limit': String(s.turn + 1) }, svg(ICON.plus), 'Another round');
      else if (live && kind) forward = h('button', { type: 'button', class: 'tk-btn big', 'data-open': 'end-turn' }, svg(ICON.plus), ended ? `Turn ${s.turn} again` : `End turn ${s.turn}`);
      else if (live) forward = h('button', { type: 'button', class: 'tk-btn big', 'data-step': 'forward' }, svg(ICON.plus), h('span', { class: 'tk-next' }, 'New round', h('small', {}, `round ${s.turn + 1}`)));
      put(turnBox,
        // back from the first warband of turn 1 is back to before the game: the table is asked whether to start over
        h('button', { type: 'button', class: 'tk-btn ghost tk-turn-back', ...(s.turn === 1 && firstPlayer ? { 'data-open': 'reset' } : { 'data-step': 'back' }), 'aria-label': s.turn === 1 && firstPlayer ? 'Back to before the first turn' : 'Back a turn', hidden: !live }, svg(ICON.minus)),
        forward,
      );

      if (live && last) put(turnBox, h('p', { class: 'tk-turn-note tk-turn-span' }, 'The last round is played. Call the game, or play another round if time permits.'));
    }
    // the way out: calling the game is the table's, and it should never be hunted for
    if (live) put(turnBox, h('button', { type: 'button', class: 'tk-btn tk-wrap', 'data-open': 'wrap-up' }, svg(ICON.laurel), 'The game is done: who won?'));
  }

  /** A house scenario's objective, round by round: who holds it, the sides, the attackers' run, and the rules' verdict. */
  function renderHold(s: Scenario): void {
    holdBox.replaceChildren();
    const kind = houseScenario(s.rulebookScenario);
    holdBox.hidden = !kind?.objective;
    if (!kind?.objective) return;
    const limit = s.turnLimit ?? kind.turns;
    const v = verdictOf(kind, s);
    const ends = turnEnds(s.events);
    const sideOf = (id: string | null | undefined) => s.warbands.find((w) => w.warbandId === id)?.side ?? null;
    const unsided = s.warbands.filter((w) => !w.side);
    holdBox.append(h('div', { class: 'tk-tally-head' }, h('span', {}, kind.objective.title), h('span', {}, 'held at the end of each round')));
    holdBox.append(h('ul', { class: 'tk-sides' }, ...s.warbands.map((w) => h('li', { 'data-side': w.side ?? '' }, h('span', {}, warbandName(w.warbandId)), h('b', {}, w.side ? SIDE_LABEL[w.side] : 'No side')))));
    if (unsided.length && s.turn > 0) holdBox.append(h('p', { class: 'tk-note' }, 'A game master sets who attacks and who defends on the scenario page; until then the cart cannot be judged.'));
    const strip = h('ol', { class: 'tk-rounds', 'aria-label': 'Round by round' });
    for (let t = 1; t <= Math.max(limit, ends.at(-1)?.turn ?? 0); t++) {
      const end = ends.find((e) => e.turn === t);
      const held = end?.held;
      const side = held === undefined ? 'open' : held === null ? 'none' : sideOf(held) ?? 'none';
      const who = held === undefined ? 'not yet' : held === null ? 'nobody' : warbandName(held);
      const brings = end?.roll !== undefined && rollBrings(kind, end.roll);
      strip.append(h('li', { 'data-side': side, 'data-now': String(t === s.turn && s.status !== 'played'), title: `Turn ${t}: ${who}${end?.roll !== undefined ? `, rolled ${end.roll}` : ''}` },
        h('span', { class: 'tk-round-n' }, String(t)),
        h('span', { class: 'tk-round-who' }, held === undefined ? '·' : held === null ? '—' : side === 'attacker' ? 'A' : side === 'defender' ? 'D' : '?'),
        end?.roll !== undefined ? h('span', { class: `tk-round-die${brings ? ' brings' : ''}` }, String(end.roll)) : null,
        h('span', { class: 'visually-hidden' }, `Turn ${t}: ${who}`),
      ));
    }
    holdBox.append(strip);
    if (!v.over && v.run > 0) holdBox.append(h('p', { class: 'tk-note' }, `The attackers have held ${kind.objective.name} ${inWords(v.run)} ${v.run === 1 ? 'round' : 'rounds'} running; ${inWords(kind.objective.holdToWin)} wins it outright.`));
    if (v.over) holdBox.append(h('div', { class: 'tk-verdict', 'data-side': v.winner ?? '' },
      h('div', { class: 'tk-turn-label' }, v.winner ? `${SIDE_LABEL[v.winner]} win` : 'The table decides'),
      h('p', {}, v.reason),
      state.may && s.status !== 'played' ? h('button', { type: 'button', class: 'tk-btn', 'data-open': 'wrap-up' }, svg(ICON.laurel), 'Call the game') : null,
    ));
  }

  function renderTally(s: Scenario): void {
    tallyBox.replaceChildren();
    // something to hold is counted instead of a free tally, so there is one way to score
    const tally = objectiveOf(s) ? '' : tallyOf(s);
    tallyBox.hidden = !tally;
    if (!tally) return;
    tallyBox.append(h('div', { class: 'tk-tally-head' }, h('span', {}, tally), h('span', {}, 'the tally')));
    for (const { warbandId, points } of scoresOf(s)) {
      tallyBox.append(h('div', { class: 'tk-score' },
        h('div', { class: 'tk-score-name' }, warbandName(warbandId)),
        h('div', { class: 'tk-score-total' }, String(points)),
        state.may && s.status !== 'played' && s.turn > 0 ? h('div', { class: 'tk-score-taps' },
          h('button', { type: 'button', class: 'tk-btn', 'data-score': warbandId, 'data-points': '1', 'aria-label': `${warbandName(warbandId)}: one more` }, svg(ICON.plus)),
          h('button', { type: 'button', class: 'tk-btn ghost', 'data-score': warbandId, 'data-points': '-1', 'aria-label': `${warbandName(warbandId)}: one fewer` }, svg(ICON.minus)),
        ) : null,
      ));
    }
  }

  // ───────────────────────── something to hold ─────────────────────────

  /** The counts a phone is setting for several things, kept across a re-render until they are recorded. */
  const slots = new Map<string, Slot>();
  const slotId = (sl: Pick<Slot, 'turn' | 'key'>) => `${sl.turn}|${sl.key}`;
  const checked = (checks: Check[], sl: Pick<Slot, 'turn' | 'key'>) => checks.find((c) => c.turn === sl.turn && c.key === sl.key);
  /** The checks a turn still owes. */
  const owed = (s: Scenario, o: Objective, turn: number) => turn < 1 ? [] : slotsFor(o, s.warbands.map((w) => w.warbandId), turn).filter((sl) => !checked(checksOf(s.events), sl));
  /** What a count shows: as it was told for this check, else nought for each warband counted, until the first tap writes it down. */
  function draftOf(s: Scenario, sl: Slot): Record<string, number> {
    const told = checked(checksOf(s.events), sl);
    if (told) return { ...told.held };
    const counted = sl.whose ? [sl.whose] : s.warbands.map((w) => w.warbandId);
    return Object.fromEntries(counted.map((w) => [w, 0]));
  }

  function renderObjective(s: Scenario): void {
    objectiveBox.replaceChildren();
    slots.clear();
    const o = objectiveOf(s);
    objectiveBox.hidden = !o;
    if (!o) return;
    const live = state.may && s.status !== 'played';
    const checks = checksOf(s.events);
    objectiveBox.append(h('div', { class: 'tk-tally-head' }, h('span', {}, o.name), h('span', {}, `${o.kind === 'many' ? `${o.count} of them · ` : ''}${MOMENT_LABEL[o.when].replace(/^At the /, '')}`)));
    const due = live && s.turn > 0 ? [...owed(s, o, s.turn - 1), ...slotsFor(o, s.warbands.map((w) => w.warbandId), s.turn)] : [];
    for (const sl of due) slots.set(slotId(sl), sl);
    const active = activeWarband(s);
    const slotFor = (w: string) => due.find((sl) => sl.whose === null) ?? due.find((sl) => sl.whose === w && (sl.turn < s.turn || w === active));
    const points = Object.fromEntries(objectiveScores(s).map((x) => [x.warbandId, x.points]));
    for (const w of turnOrder(s)) {
      const sl = slotFor(w);
      const row = h('div', { class: 'tk-held tk-span', 'data-now': String(!!sl) }, h('div', { class: 'tk-held-name' }, warbandName(w)), h('div', { class: 'tk-held-points', title: 'Points so far' }, String(points[w] ?? 0)));
      if (sl) {
        const told = checked(checks, sl);
        const held = draftOf(s, sl);
        if (o.kind === 'one') {
          const holds = (held[w] ?? 0) > 0;
          row.append(h('button', { type: 'button', class: 'tk-side-btn tk-held-toggle', 'data-slot': slotId(sl), 'data-holder': holds ? '' : w, 'aria-pressed': String(holds) }, holds ? 'Holds it' : told ? 'Does not' : 'Holds it?'));
        } else {
          const n = held[w] ?? 0, total = Object.values(held).reduce((a, x) => a + x, 0);
          row.append(h('div', { class: 'tk-stepper tk-held-stepper' },
            h('button', { type: 'button', class: 'tk-btn ghost', 'data-hold-step': slotId(sl), 'data-warband': w, 'data-d': '-1', disabled: n <= 0, 'aria-label': `${warbandName(w)}: one fewer` }, svg(ICON.minus)),
            h('output', { class: 'tk-check-count', 'aria-live': 'polite' }, String(n)),
            h('button', { type: 'button', class: 'tk-btn ghost', 'data-hold-step': slotId(sl), 'data-warband': w, 'data-d': '1', disabled: n >= o.count || total >= o.count, 'aria-label': `${warbandName(w)}: one more` }, svg(ICON.plus)),
          ));
        }
      }
      objectiveBox.append(row);
    }
    // where the checks stand, for the ones answered here: the round's, or the turn of the warband that is on or owes one
    const asked = due.filter((sl) => turnOrder(s).some((w) => slotFor(w) === sl));
    if (asked.length) objectiveBox.append(h('p', { class: 'tk-held-state tk-span' }, asked.map((sl) => {
      const told = checked(checks, sl);
      const state = told ? 'counted' : o.kind === 'many' ? `${Object.values(draftOf(s, sl)).reduce((a, x) => a + x, 0)} of ${o.count} counted` : 'to check';
      return `${sl.turn !== s.turn ? `turn ${sl.turn}, ` : ''}${checkLabel(sl, warbandName).toLowerCase()}: ${state}`;
    }).join(' · ')));
  }


  type Line = { turn: number | null; at: number; node: HTMLElement };
  function renderLog(s: Scenario): void {
    const lines: Line[] = [
      ...s.outOfAction.map((o) => ({ turn: o.turn ?? null, at: o.id, node: fallenLine(o) })),
      ...s.events.filter((e) => e.kind !== 'control').map((e) => ({ turn: e.turn, at: e.id, node: eventLine(e) })),
      // a check of the objective is one line, however many warbands it counted
      ...checksOf(s.events).map((c) => ({ turn: c.turn, at: c.ids[0], node: checkLine(c) })),
    ];
    logBox.replaceChildren(h('div', { class: 'tk-log-head' }, h('span', {}, 'The log'), h('span', {}, `${lines.length} ${lines.length === 1 ? 'line' : 'lines'}`)));
    if (!lines.length) {
      logBox.append(h('p', { class: 'tk-empty' }, state.may ? 'Nothing logged yet. Who struck, who scored, what happened: it all goes here, by turn.' : 'Nothing has been logged yet.'));
      if (!state.may) logBox.append(watching());
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
    if (!state.may) logBox.append(watching());
  }
  /** The note for a visitor who may not write, with the way in for one who is not signed in. */
  function watching(): HTMLElement {
    return h('p', { class: 'tk-watching' }, 'You are watching. Only those whose warbands fight here may write.', state.signIn ? h('a', { class: 'tk-watching-signin', href: state.signIn }, 'Sign in') : null);
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

  function checkLine(c: Check): HTMLElement {
    const { lead, strong, rest } = describeCheck(objectiveOf(state.scenario), c, warbandName);
    return h('div', { class: 'tk-line', 'data-kind': 'control' },
      svg(ICON.flag, 'tk-line-icon'),
      h('div', { class: 'tk-line-body' }, h('div', {}, lead, h('b', {}, strong), rest), h('div', { class: 'tk-line-meta' }, c.authorName ? h('span', {}, c.authorName) : null)),
      state.may ? h('button', { type: 'button', class: 'tk-strike', 'data-strike-event': String(c.ids[0]), 'aria-label': 'Strike this check' }, svg(ICON.close)) : h('span'),
    );
  }

  function eventLine(e: ScenarioEvent): HTMLElement {
    const body = h('div', { class: 'tk-line-body' });
    const kind = houseScenario(state.scenario.rulebookScenario);
    if (e.kind === 'hold') {
      const side = state.scenario.warbands.find((w) => w.warbandId === e.warbandId)?.side;
      body.append(h('div', {}, `${kind?.objective?.title ?? 'The objective'}: `, e.warbandId ? h('b', {}, `held by ${warbandName(e.warbandId)}`) : h('b', {}, 'held by nobody'), side ? ` (${SIDE_LABEL[side].toLowerCase()})` : ''));
    } else if (e.kind === 'roll') {
      const roll = kind?.endOfTurnRoll;
      const brings = !!kind && rollBrings(kind, e.points);
      body.append(h('div', {}, `${roll?.label ?? 'The roll'}: `, h('span', { class: `points${brings ? ' minus' : ''}` }, String(e.points)), '. ', brings ? h('b', {}, roll!.happens) : (roll?.nothing ?? '')));
    } else if (e.kind === 'score') {
      const sign = e.points > 0 ? '+' : '−';
      body.append(h('div', {}, h('b', {}, warbandName(e.warbandId)), ' ', h('span', { class: `points${e.points < 0 ? ' minus' : ''}` }, `${sign}${Math.abs(e.points)} ${tallyOf(state.scenario) || 'points'}`), e.text ? ` — ${e.text}` : ''));
    } else if (e.kind === 'card') {
      // a Tarot card shown to the table: named, and held up again to read from here
      const card = cardById(e.text);
      body.append(h('div', {}, h('b', {}, warbandName(e.warbandId)), ' showed ', card ? h('button', { type: 'button', class: 'tk-card-link', 'data-show-card': card.id }, `${card.numeral}. ${card.title}`) : h('b', {}, 'a card of the Tarot')));
    } else if (e.kind === 'photo') {
      // the small one in the log, the picture itself a tap away
      if (e.photo) body.append(h('a', { class: 'tk-photo', href: imageUrl(e.photo.image), target: '_blank', rel: 'noopener', 'aria-label': `The picture${e.text ? `: ${e.text}` : ''}, at full size` }, h('img', { src: imageUrl(e.photo.preview), alt: e.text || 'A picture from the table', loading: 'lazy', decoding: 'async' })));
      if (e.text) body.append(h('div', {}, e.text));
    } else {
      body.append(h('div', {}, e.text));
    }
    body.append(h('div', { class: 'tk-line-meta' }, (e.kind === 'note' || e.kind === 'photo') && e.warbandId ? h('span', { class: 'tk-chip' }, warbandName(e.warbandId)) : null, e.authorName ? h('span', {}, e.authorName) : null));
    return h('div', { class: 'tk-line', 'data-kind': e.kind },
      svg(e.kind === 'score' ? ICON.shard : e.kind === 'hold' ? ICON.cart : e.kind === 'roll' ? ICON.die : e.kind === 'card' ? ICON.card : e.kind === 'photo' ? ICON.camera : ICON.quill, 'tk-line-icon'),
      body,
      state.may ? h('button', { type: 'button', class: 'tk-strike', 'data-strike-event': String(e.id), 'aria-label': e.kind === 'photo' ? 'Strike this picture' : 'Strike this line' }, svg(ICON.close)) : h('span'),
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

  type SheetKind = 'out-of-action' | 'photo' | 'note' | 'wrap-up' | 'end-turn' | 'reset';
  /** The picture the photo sheet has made ready, and the address its preview is shown from while the sheet is open. */
  let photo: Photo | null = null, photoUrl = '';
  const forgetPhoto = () => { if (photoUrl) URL.revokeObjectURL(photoUrl); photo = null; photoUrl = ''; };
  /** What the tally says, when it decides anything: the one warband ahead wins, the rest lose. Otherwise nothing is presumed. */
  function suggestedResults(s: Scenario): Record<string, ScenarioResult> {
    const out: Record<string, ScenarioResult> = {};
    for (const w of s.warbands) if (w.result) out[w.warbandId] = w.result;
    if (Object.keys(out).length) return out;
    const kind = houseScenario(s.rulebookScenario);
    if (kind?.objective) return resultsOf(verdictOf(kind, s), s.warbands);
    const scores = objectiveOf(s) ? objectiveScores(s) : tallyOf(s) ? scoresOf(s) : null;
    if (!scores?.length) return out;
    const top = Math.max(...scores.map((x) => x.points));
    if (scores.filter((x) => x.points === top).length !== 1) return out;
    for (const x of scores) out[x.warbandId] = x.points === top ? 'victory' : 'defeat';
    return out;
  }

  function openSheet(kind: SheetKind): void {
    sheet.replaceChildren();
    const form = h('form', { method: 'dialog', 'data-kind': kind });
    if (kind === 'reset') {
      const s = state.scenario;
      const lines = s.events.length + s.outOfAction.length;
      form.append(
        h('div', { class: 'tk-sheet-head' }, h('h2', {}, 'Back to before the first turn'), closeButton()),
        h('p', { class: 'tk-note' }, `Only the turn goes back, and ${lines ? `the ${lines} ${lines === 1 ? 'line' : 'lines'} logged` : 'nothing logged'} ${lines === 1 ? 'stays' : 'stay'} as ${lines === 1 ? 'it is' : 'they are'}${s.tarot ? ', the hands dealt with it' : ''}. Or the game starts over: the log and the takedowns are struck${s.tarot ? ', and the Tarot is dealt afresh' : ''}. The sides and the length stay.`),
        h('div', { class: 'tk-actions' },
          h('button', { type: 'button', class: 'tk-btn ghost', 'data-turn': '0' }, 'Only the turn'),
          h('button', { type: 'submit', class: 'tk-btn blood' }, 'Start the game over'),
        ),
      );
    } else if (kind === 'wrap-up') {
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
        h('p', { class: 'tk-note' }, s.status === 'played' ? 'The results are changed as they stand; the scenario stays in the Chronicle.' : Object.keys(given).length && !s.warbands.some((w) => w.result) ? (houseScenario(s.rulebookScenario)?.objective ? `As the rules have it: ${verdictOf(houseScenario(s.rulebookScenario)!, s).reason} Change it if the table says otherwise.` : `Suggested from ${objectiveOf(s) ? inSentence(objectiveOf(s)!.name) : 'the tally'}. Change it if the table says otherwise.`) : 'Every warband that fought gets a result. The scenario joins the Chronicle, and the writing-up begins on its page.'),
        h('div', { class: 'tk-actions' }, h('button', { type: 'submit', class: 'tk-btn big', disabled: !s.warbands.length }, svg(ICON.laurel), s.status === 'played' ? 'Save how it ended' : 'Call the game')),
      );
    } else if (kind === 'end-turn') {
      const s = state.scenario;
      const house = houseScenario(s.rulebookScenario)!;
      const ends = turnEnds(s.events);
      const before = ends.find((e) => e.turn === s.turn) ?? ends.filter((e) => e.turn < s.turn).at(-1);
      form.append(h('div', { class: 'tk-sheet-head' }, h('h2', {}, `End of turn ${s.turn}`), closeButton()));
      if (house.objective) {
        const held = before?.held;
        const box = h('div', { class: 'tk-choices', role: 'radiogroup', 'aria-label': `Who holds ${house.objective.name}` });
        for (const w of attending()) {
          const side = s.warbands.find((p) => p.warbandId === w.id)?.side;
          box.append(h('label', {}, h('input', { type: 'radio', name: 'held', value: w.id, required: true, checked: held === w.id }), h('span', { 'data-side': side ?? '' }, w.name, side ? h('small', {}, SIDE_LABEL[side]) : null)));
        }
        box.append(h('label', {}, h('input', { type: 'radio', name: 'held', value: '', required: true, checked: held === null }), h('span', {}, 'Nobody: contested')));
        form.append(h('div', { class: 'tk-field' }, `Who holds ${house.objective.name}`, box, h('small', {}, 'The warband with the most models within 2" of its base.')));
      }
      if (house.endOfTurnRoll) {
        const r = house.endOfTurnRoll;
        const faces = h('div', { class: 'tk-choices tk-die', role: 'radiogroup', 'aria-label': `What the D${r.die} showed` });
        for (let n = 1; n <= r.die; n++) faces.append(h('label', {}, h('input', { type: 'radio', name: 'roll', value: String(n), required: true }), h('span', { 'data-brings': String(n >= r.on) }, String(n))));
        const says = h('p', { class: 'tk-note tk-roll-says', 'aria-live': 'polite' }, `On a ${r.on}${r.on < r.die ? ' or more' : ''}: ${r.happens}`);
        const roller = h('button', { type: 'button', class: 'tk-btn ghost', 'data-roll-die': String(r.die) }, svg(ICON.die), 'Roll it here');
        const tell = () => {
          const v = Number(new FormData(form).get('roll'));
          if (!v) return;
          says.textContent = v >= r.on ? `${v}. ${r.happens}` : `${v}. ${r.nothing}`;
          says.dataset.brings = String(v >= r.on);
        };
        faces.addEventListener('change', tell);
        roller.addEventListener('click', () => {
          const n = 1 + Math.floor(Math.random() * r.die);
          (faces.querySelector(`input[value="${n}"]`) as HTMLInputElement).checked = true;
          tell();
        });
        form.append(h('div', { class: 'tk-field' }, `${r.label}, D${r.die}`, faces, h('div', { class: 'tk-row' }, says, roller)));
      }
      const limit = s.turnLimit ?? house.turns;
      form.append(
        h('p', { class: 'tk-note' }, s.turn >= limit ? 'That is the last round. The cart decides the game.' : `Then on to turn ${s.turn + 1} of ${limit}.`),
        h('div', { class: 'tk-actions' }, h('button', { type: 'submit', class: 'tk-btn big' }, `End turn ${s.turn}`)),
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
    } else if (kind === 'photo') {
      // taken there and then, or chosen from the library; made ready here, then a line and a turn, as a note has
      const pick = (label: string, icon: string, capture: boolean) => h('label', { class: `tk-btn big tk-pick${capture ? '' : ' ghost'}` }, svg(icon), label,
        h('input', { type: 'file', accept: 'image/*', ...(capture ? { capture: 'environment' } : {}), 'data-photo-file': true }));
      const picker = h('div', { class: 'tk-pick-row' }, pick('Take one', ICON.camera, true), pick('From the library', ICON.library, false));
      const img = h('img', { alt: 'The picture as it will go in' });
      const says = h('p', { class: 'tk-note tk-photo-says', 'aria-live': 'polite' });
      const again = h('button', { type: 'button', class: 'tk-btn ghost', 'data-photo-again': true }, 'Choose another');
      const shown = h('figure', { class: 'tk-photo-ready', hidden: true }, img, h('figcaption', { class: 'tk-row' }, says, again));
      const sending = h('progress', { class: 'tk-photo-progress', max: '1', value: '0', hidden: true });
      const submit = h('button', { type: 'submit', class: 'tk-btn', disabled: true }, svg(ICON.camera), 'Put it in the report');
      forgetPhoto();
      let asked = 0;
      form.addEventListener('change', async (e) => {
        const input = (e.target as HTMLElement).closest<HTMLInputElement>('[data-photo-file]');
        const file = input?.files?.[0];
        if (!input || !file) return;
        input.value = '';
        const mine = ++asked;
        forgetPhoto();
        submit.disabled = true;
        picker.hidden = true; shown.hidden = false; img.removeAttribute('src');
        says.textContent = 'Making it ready…';
        try {
          const ready = await preparePhoto(file);
          if (mine !== asked || !sheet.open) return;
          photo = ready; photoUrl = URL.createObjectURL(ready.preview);
          img.src = photoUrl;
          says.textContent = `${ready.width} × ${ready.height}, ${(ready.picture.size / 1_000_000).toFixed(1)} MB`;
          submit.disabled = false;
          form.querySelector<HTMLInputElement>('input[name="text"]')?.focus();
        } catch (err) {
          if (mine !== asked) return;
          picker.hidden = false; shown.hidden = true;
          toast((err as Error).message);
        }
      });
      again.addEventListener('click', () => { asked++; forgetPhoto(); submit.disabled = true; shown.hidden = true; picker.hidden = false; });
      form.append(
        h('div', { class: 'tk-sheet-head' }, h('h2', {}, 'A picture'), closeButton()),
        picker,
        shown,
        h('label', { class: 'tk-field' }, 'What it shows', h('input', { name: 'text', maxlength: '500', placeholder: 'The wall, before the charge.' }), h('small', {}, 'Optional. It goes in the battle report under its turn; a tap there opens it large.')),
        h('div', { class: 'tk-field' }, 'Whose', warbandChoices('warbandId', 'The table')),
        sending,
        h('div', { class: 'tk-actions' }, turnField(), submit),
      );
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
    (form.querySelector('select, textarea, input:not([type=radio]):not([type=number]):not([type=file])') as HTMLElement | null)?.focus();
  }

  sheet.addEventListener('close', forgetPhoto);
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
    if (kind === 'reset') {
      ok = await post('reset', {});
    } else if (kind === 'wrap-up') {
      const results = state.scenario.warbands.map((w) => ({ warbandId: w.warbandId, result: String(data.get(`result.${w.warbandId}`) ?? '') }));
      if (results.some((r) => !r.result)) { toast('Every warband that fought needs a result.'); button.disabled = false; button.removeAttribute('aria-busy'); return; }
      const calling = state.scenario.status !== 'played';
      ok = await post('played', { results });
      // the game called, the table goes to the scenario's page to write it up; a changed result stays here
      if (ok && calling) { location.href = `${state.base}/scenarios/${state.scenario.id}/`; return; }
    } else if (kind === 'end-turn') {
      const house = houseScenario(state.scenario.rulebookScenario);
      ok = await post('end-turn', {
        turn: state.scenario.turn,
        ...(house?.objective ? { held: String(data.get('held') ?? '') || null } : {}),
        ...(house?.endOfTurnRoll ? { roll: Number(data.get('roll')) } : {}),
      });
    } else if (kind === 'out-of-action') {
      const targetId = String(data.get('targetId') ?? '');
      ok = await post('out-of-action', { attackerId: data.get('attackerId'), targetId: targetId && targetId !== '@other' ? targetId : null, target: targetId === '@other' ? data.get('target') : '', detail: data.get('detail') ?? '', turn });
    } else if (kind === 'photo') {
      if (!photo) { toast('Take a picture, or choose one, first.'); button.disabled = false; button.removeAttribute('aria-busy'); return; }
      const sending = form.querySelector<HTMLProgressElement>('.tk-photo-progress')!;
      sending.hidden = false; sending.value = 0;
      const body = new FormData();
      body.set('turn', String(turn));
      body.set('warbandId', String(data.get('warbandId') ?? ''));
      body.set('text', String(data.get('text') ?? '').trim());
      body.set('picture', photo.picture, photo.picture.type === 'image/webp' ? 'picture.webp' : 'picture.jpg');
      body.set('preview', photo.preview, photo.preview.type === 'image/webp' ? 'preview.webp' : 'preview.jpg');
      ok = await upload('photo', body, (sent) => { sending.value = sent; });
      if (!ok) sending.hidden = true;
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
    const card = t.closest<HTMLButtonElement>('[data-show-card]');
    if (card) { tarot?.show(card.dataset.showCard!); return; }
    const pick = t.closest<HTMLButtonElement>('[data-pick-side]');
    if (pick) {
      // with two warbands, one side chosen settles the other
      const s = state.scenario, warbandId = pick.dataset.pickSide!, side = pick.dataset.side as 'attacker' | 'defender';
      const sides: Record<string, string> = { [warbandId]: side };
      if (s.warbands.length === 2) for (const w of s.warbands) if (w.warbandId !== warbandId) sides[w.warbandId] = side === 'attacker' ? 'defender' : 'attacker';
      await post('sides', { sides });
      return;
    }
    const place = t.closest<HTMLButtonElement>('[data-pick-order]');
    if (place) { await post('order', { warbandId: place.dataset.pickOrder }); return; }
    const stepTap = t.closest<HTMLButtonElement>('[data-step]');
    if (stepTap) {
      // leaving a warband's turn with its own check owed, or ending the round with any owed, is allowed but asked about
      if (sheet.open) sheet.close();
      const s = state.scenario, o = objectiveOf(s), active = activeWarband(s);
      if (stepTap.dataset.step === 'forward' && o) {
        const due = owed(s, o, s.turn).filter((sl) => lastOfRound(s) || sl.whose === active);
        if (due.length && !confirm(`${o.name} has not been checked${lastOfRound(s) ? ` for turn ${s.turn}` : ` for ${warbandName(active)}’s turn`}. Move on anyway?`)) return;
      }
      await post('step', { direction: stepTap.dataset.step });
      return;
    }
    const more = t.closest<HTMLButtonElement>('[data-limit]');
    if (more) { await post('turn-limit', { turnLimit: Number(more.dataset.limit) }); return; }
    const turn = t.closest<HTMLButtonElement>('[data-turn]');
    if (turn) {
      // from the question sheet, the sheet goes first; moving on with the objective unchecked is allowed, but asked about
      if (sheet.open) sheet.close();
      const s = state.scenario, o = objectiveOf(s), to = Number(turn.dataset.turn);
      if (o && to > s.turn && owed(s, o, s.turn).length && !confirm(`${o.name} has not been checked for turn ${s.turn}. Move on anyway?`)) return;
      await post('turn', { turn: to });
      return;
    }
    const holder = t.closest<HTMLButtonElement>('[data-holder]');
    if (holder) {
      const sl = slots.get(holder.dataset.slot!);
      if (sl) await post('check', { turn: sl.turn, whose: sl.whose, held: holder.dataset.holder ? { [holder.dataset.holder]: 1 } : {} });
      return;
    }
    const hold = t.closest<HTMLButtonElement>('[data-hold-step]');
    if (hold) {
      // every tap writes the count down, so there is one way to count and nothing to confirm
      const s = state.scenario, o = objectiveOf(s), sl = slots.get(hold.dataset.holdStep!);
      if (!o || !sl) return;
      const held = { ...draftOf(s, sl) }, w = hold.dataset.warband!;
      held[w] = Math.max(0, Math.min(o.count, (held[w] ?? 0) + Number(hold.dataset.d)));
      if (Object.values(held).reduce((a, n) => a + n, 0) > o.count) return;
      await post('check', { turn: sl.turn, whose: sl.whose, held });
      return;
    }
    const score = t.closest<HTMLButtonElement>('[data-score]');
    if (score) { await post('event', { kind: 'score', warbandId: score.dataset.score, points: Number(score.dataset.points), turn: Math.max(1, state.scenario.turn) }); return; }
    const strikeEvent = t.closest<HTMLButtonElement>('[data-strike-event]');
    if (strikeEvent) { if (confirm(strikeEvent.closest('[data-kind="control"]') ? 'Strike this check from the log?' : 'Strike this line from the log?')) await post('remove-event', { id: Number(strikeEvent.dataset.strikeEvent) }); return; }
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
