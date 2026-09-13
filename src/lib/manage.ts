/**
 * The one client script the management pages share. Two conventions, both read from the markup:
 *
 *   <button data-act="warbands/claim" data-body='{"warbandId":"nordost"}' data-confirm="Take up the Nordost Kin?">
 *   <form data-api="warbands/update" data-json='{"warbandId":"nordost"}'> …fields named `patch.lore`… </form>
 *
 * A button posts its body; a form posts its fields as nested JSON (dots nest, `type=number` gives numbers,
 * checkboxes booleans, `data-list` textareas one string per line, `data-array` selects and checkbox groups
 * arrays) merged over `data-json`. On success the page reloads, or follows `data-goto`; a refusal is shown as
 * written. Nothing is updated optimistically: the server's answer is the page.
 */
export function wireManage(root: HTMLElement, base: string): void {
  const toast = ensureToast();
  const post = async (path: string, body: unknown) => {
    const res = await fetch(new URL(`${base}/api/${path}`, location.href), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), credentials: 'same-origin' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error ?? 'The city did not answer. Try again.');
    return data as { message?: string; [k: string]: unknown };
  };
  const done = (el: HTMLElement, data: { message?: string }) => {
    const goto = el.dataset.goto;
    if (data.message) toast(data.message);
    if (el.dataset.stay !== undefined) return;
    if (goto) location.href = goto; else location.reload();
  };

  root.addEventListener('click', async (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-act]');
    if (!b || b.disabled) return;
    if (b.dataset.confirm && !confirm(b.dataset.confirm)) return;
    b.disabled = true; b.setAttribute('aria-busy', 'true');
    try { done(b, await post(b.dataset.act!, JSON.parse(b.dataset.body ?? '{}'))); }
    catch (err) { toast((err as Error).message); b.disabled = false; b.removeAttribute('aria-busy'); }
  });

  root.addEventListener('submit', async (e) => {
    const form = e.target as HTMLFormElement;
    if (!form.matches('form[data-api]')) return;
    e.preventDefault();
    if (form.dataset.confirm && !confirm(form.dataset.confirm)) return;
    const button = form.querySelector<HTMLButtonElement>('button[type=submit]');
    if (button) { button.disabled = true; button.setAttribute('aria-busy', 'true'); }
    try {
      const body = merge(JSON.parse(form.dataset.json ?? '{}'), readForm(form));
      done(form, await post(form.dataset.api!, body));
    } catch (err) {
      toast((err as Error).message);
      if (button) { button.disabled = false; button.removeAttribute('aria-busy'); }
    }
  });

  // <details data-editor> opens the editor; a button[data-cancel] inside closes it
  root.addEventListener('click', (e) => {
    const c = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-cancel]');
    if (c) { const d = c.closest('details'); if (d) d.open = false; else c.closest<HTMLElement>('[data-editor]')?.setAttribute('hidden', ''); }
    const o = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-open]');
    if (o) { const t = document.getElementById(o.dataset.open!); if (t) { t.hidden = false; (t.querySelector('input, textarea, select') as HTMLElement | null)?.focus(); } }
  });
}

/**
 * Write one dotted field name into a nested body: `patch.stats.WS` nests objects, and a numbered segment makes a
 * list, so `results.0.warbandId` and `results.1.result` come out as the array the server asks for.
 */
export function setPath(out: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split('.');
  const index = (p: string) => /^\d+$/.test(p);
  let at: Record<string, unknown> = out;
  for (const [i, p] of parts.slice(0, -1).entries()) {
    at[p] ??= index(parts[i + 1]) ? [] : {};
    at = at[p] as Record<string, unknown>;
  }
  at[parts.at(-1)!] = value;
}

/** Fields to nested JSON. */
export function readForm(form: HTMLFormElement): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const set = (path: string, value: unknown) => setPath(out, path, value);
  const seen = new Set<string>();
  for (const el of [...form.elements] as (HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement)[]) {
    const name = el.name;
    if (!name || el.disabled || seen.has(name)) continue;
    if (el instanceof HTMLInputElement && el.type === 'checkbox') {
      const group = form.querySelectorAll<HTMLInputElement>(`input[type=checkbox][name="${CSS.escape(name)}"]`);
      if (group.length > 1 || el.dataset.array !== undefined) set(name, [...group].filter((c) => c.checked).map((c) => c.value));
      else set(name, el.checked);
      seen.add(name); continue;
    }
    if (el instanceof HTMLInputElement && el.type === 'radio') { const picked = form.querySelector<HTMLInputElement>(`input[type=radio][name="${CSS.escape(name)}"]:checked`); set(name, picked ? picked.value : null); seen.add(name); continue; }
    if (el instanceof HTMLSelectElement && el.multiple) { set(name, [...el.selectedOptions].map((o) => o.value)); seen.add(name); continue; }
    if (el instanceof HTMLInputElement && el.type === 'number') { set(name, el.value === '' ? (el.dataset.nullable !== undefined ? null : 0) : Number(el.value)); seen.add(name); continue; }
    if (el.dataset.list !== undefined) { set(name, el.value.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)); seen.add(name); continue; }
    if (el.dataset.paragraphs !== undefined) { set(name, el.value.split(/\n\s*\n/).map((s) => s.replace(/\s*\n\s*/g, ' ').trim()).filter(Boolean)); seen.add(name); continue; }
    if (el.dataset.nullable !== undefined && el.value === '') { set(name, null); seen.add(name); continue; }
    set(name, el.value);
    seen.add(name);
  }
  return out;
}

function merge(a: Record<string, unknown>, b: Record<string, unknown>): Record<string, unknown> {
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) {
    out[k] = v && typeof v === 'object' && !Array.isArray(v) && out[k] && typeof out[k] === 'object' && !Array.isArray(out[k]) ? merge(out[k] as Record<string, unknown>, v as Record<string, unknown>) : v;
  }
  return out;
}

function ensureToast(): (text: string) => void {
  let el = document.getElementById('mg-toast');
  if (!el) { el = document.createElement('div'); el.id = 'mg-toast'; el.className = 'mg-toast'; el.setAttribute('role', 'status'); el.hidden = true; document.body.append(el); }
  const node = el;
  let t: ReturnType<typeof setTimeout> | undefined;
  return (text) => { node.textContent = text; node.hidden = false; clearTimeout(t); t = setTimeout(() => { node.hidden = true; }, 5000); };
}
