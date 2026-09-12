/**
 * Debug mode: step the Ledger through nights without waiting for midnight.
 * Drives the existing `?date=YYYY-MM-DD` override, so everything else renders exactly as it would that day.
 * The flag lives on this device only.
 *
 * While it is on, a game master's requests are dry runs: the server computes every night in memory and saves
 * nothing. The sandbox state comes back with every answer and is kept here, in sessionStorage, and sent with
 * the next request, so a run of nights builds on itself. Turning the mode off drops the sandbox; the real
 * ledger was never touched.
 */
import { CAMPAIGN, dateForNight, localDate } from './engine';
import type { WarbandState } from './ledger';

const KEY = 'curfew:debug';
const DRY_COOKIE = 'curfew-dry';
const SANDBOX = 'curfew:dry-sandbox';

export function debugEnabled(): boolean { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } }
/** On: remember it, and tell the server by cookie that this browser wants dry runs. Off: forget both, and the sandbox with them. */
export function setDebug(on: boolean): void {
  try { on ? localStorage.setItem(KEY, '1') : localStorage.removeItem(KEY); } catch {}
  try { document.cookie = on ? `${DRY_COOKIE}=1; path=/; SameSite=Lax` : `${DRY_COOKIE}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax`; } catch {}
  if (!on) clearSandbox();
}

export interface Sandbox { warbandId: string; state: WarbandState; startedAt: number; steps: number }
export function loadSandbox(warbandId: string): Sandbox | null {
  try { const raw = sessionStorage.getItem(SANDBOX); const box = raw ? (JSON.parse(raw) as Sandbox) : null; return box && box.warbandId === warbandId ? box : null; } catch { return null; }
}
/** Keep the state a dry answer came back with, so the next request builds on it. `startedAt` is the real ledger's last written night when the run began. */
export function saveSandbox(warbandId: string, state: WarbandState, realLastResolved: number): Sandbox {
  const prev = loadSandbox(warbandId);
  const box: Sandbox = { warbandId, state, startedAt: prev?.startedAt ?? realLastResolved, steps: Math.max(0, state.lastResolved - (prev?.startedAt ?? realLastResolved)) };
  try { sessionStorage.setItem(SANDBOX, JSON.stringify(box)); } catch {}
  return box;
}
export function clearSandbox(): void { try { sessionStorage.removeItem(SANDBOX); } catch {} }

export function dateParam(): string | null {
  const v = new URLSearchParams(location.search).get('date');
  return v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}
/** Navigate to the same page as of another date; null returns to the real today. */
export function goToDate(date: string | null): void {
  const url = new URL(location.href);
  if (date) url.searchParams.set('date', date); else url.searchParams.delete('date');
  location.href = url.toString();
}
/** Make a link to another Curfew page keep the debug date, so both pages agree on the night. */
export function carryDate(anchor: HTMLAnchorElement | null): void {
  const d = dateParam();
  if (!anchor || !d) return;
  const url = new URL(anchor.href, location.href);
  url.searchParams.set('date', d);
  anchor.href = url.toString();
}

/** What the strip says about the dry run, when there is one. */
export interface DryStatus {
  /** The sandbox, if the run has stepped at all. */
  sandbox: Sandbox | null;
  /** Dispatches the last answer would have handed the Cryer, as headlines. */
  wouldPrint: string[];
  /** Drop the sandbox and start again from the real ledger. */
  onReset: () => void;
}

/** Render the strip into `el`; hides it when the mode is off. */
export function renderDebugBar(el: HTMLElement, today: number, dry?: DryStatus): void {
  if (!debugEnabled()) { el.hidden = true; el.innerHTML = ''; return; }
  const date = dateForNight(today);
  const real = localDate();
  const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
  el.hidden = false;
  const steps = dry?.sandbox?.steps ?? 0;
  const dryHtml = dry
    ? `<div class="cf-debug-dry">
        <span class="cf-debug-label"><b>Dry run.</b> Nothing is saved. ${steps ? `${steps} ${steps === 1 ? 'night' : 'nights'} stepped past the real ledger${dry.sandbox ? ` (night ${dry.sandbox.startedAt})` : ''}.` : 'The real ledger is the base; step a night to write one in the sandbox.'}</span>
        ${dry.wouldPrint.length ? `<span class="cf-debug-would">The Cryer would print: ${dry.wouldPrint.map((h) => `<i>${esc(h)}</i>`).join(' · ')}</span>` : ''}
        ${dry.sandbox ? '<button type="button" class="cf-btn cf-btn-ghost" data-dry-reset>Start over from the real ledger</button>' : ''}
      </div>`
    : '';
  el.innerHTML = `
    <span class="cf-debug-label">Debug · night ${today} · ${esc(date)}${date === real ? ' · today' : ''}</span>
    <div class="cf-debug-controls">
      <button type="button" class="cf-btn cf-btn-ghost" data-step="-1" aria-label="Previous night">‹ Night ${today - 1}</button>
      <button type="button" class="cf-btn cf-btn-ghost" data-today ${date === real ? 'disabled' : ''}>Today</button>
      <button type="button" class="cf-btn cf-btn-ghost" data-step="1" aria-label="Next night">Night ${today + 1} ›</button>
      <label class="cf-debug-date">Any date <input type="date" value="${esc(date)}" min="${esc(CAMPAIGN.start)}" /></label>
    </div>${dryHtml}`;
  el.querySelectorAll<HTMLButtonElement>('[data-step]').forEach((b) => b.addEventListener('click', () => goToDate(dateForNight(today + Number(b.dataset.step)))));
  el.querySelector<HTMLButtonElement>('[data-today]')!.addEventListener('click', () => goToDate(null));
  el.querySelector<HTMLInputElement>('input[type=date]')!.addEventListener('change', (e) => { const v = (e.target as HTMLInputElement).value; if (v) goToDate(v); });
  el.querySelector<HTMLButtonElement>('[data-dry-reset]')?.addEventListener('click', () => dry?.onReset());
}
