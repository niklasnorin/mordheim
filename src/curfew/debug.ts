/**
 * Debug mode: step the Ledger through nights without waiting for midnight.
 * Drives the existing `?date=YYYY-MM-DD` override, so everything else renders exactly as it would that day.
 * The flag lives on this device only.
 */
import { CAMPAIGN, dateForNight, localDate } from './engine';

const KEY = 'curfew:debug';

export function debugEnabled(): boolean { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } }
export function setDebug(on: boolean): void { try { on ? localStorage.setItem(KEY, '1') : localStorage.removeItem(KEY); } catch {} }

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

/** Render the strip into `el`; hides it when the mode is off. */
export function renderDebugBar(el: HTMLElement, today: number): void {
  if (!debugEnabled()) { el.hidden = true; el.innerHTML = ''; return; }
  const date = dateForNight(today);
  const real = localDate();
  const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
  el.hidden = false;
  el.innerHTML = `
    <span class="cf-debug-label">Debug · night ${today} · ${esc(date)}${date === real ? ' · today' : ''}</span>
    <div class="cf-debug-controls">
      <button type="button" class="cf-btn cf-btn-ghost" data-step="-1" aria-label="Previous night">‹ Night ${today - 1}</button>
      <button type="button" class="cf-btn cf-btn-ghost" data-today ${date === real ? 'disabled' : ''}>Today</button>
      <button type="button" class="cf-btn cf-btn-ghost" data-step="1" aria-label="Next night">Night ${today + 1} ›</button>
      <label class="cf-debug-date">Any date <input type="date" value="${esc(date)}" min="${esc(CAMPAIGN.start)}" /></label>
    </div>`;
  el.querySelectorAll<HTMLButtonElement>('[data-step]').forEach((b) => b.addEventListener('click', () => goToDate(dateForNight(today + Number(b.dataset.step)))));
  el.querySelector<HTMLButtonElement>('[data-today]')!.addEventListener('click', () => goToDate(null));
  el.querySelector<HTMLInputElement>('input[type=date]')!.addEventListener('change', (e) => { const v = (e.target as HTMLInputElement).value; if (v) goToDate(v); });
}
