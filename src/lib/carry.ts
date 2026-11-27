/**
 * The keeper's pen's "Take them to another campaign": choose the campaign and the way, see what goes across (API
 * `carry-preview`, which writes nothing), then carry them (API `carry`) and follow them there, to their new page, or to
 * the roster's draw-up when they come in for the keeper to approve. The rule is `campaign/carry.ts`.
 */
import { ensureToast, postApi } from './manage.ts';

interface Target { id: string; name: string; status: string; modes: string[]; crowns: number }
interface Planned { fromId: string; name: string; veteran: boolean; changes: string[] }
interface Preview {
  to: { name: string; startingCrowns: number };
  mode: 'as-is' | 'adjusted' | 'start-over';
  pending: boolean;
  plan: { members: Planned[]; left: { name: string; why: string }[]; gold: number; shards: number; notes: string[] };
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export function wireCarry(root: HTMLElement, base: string): void {
  const box = root.querySelector<HTMLElement>('[data-carry]');
  if (!box) return;
  const toast = ensureToast();
  const data = JSON.parse(box.dataset.carry!) as { warbandId: string; targets: Target[] };
  const to = box.querySelector<HTMLSelectElement>('[data-carry-to]')!;
  const plan = box.querySelector<HTMLElement>('[data-carry-plan]')!;
  const veterans = box.querySelector<HTMLElement>('[data-carry-veterans]')!;
  const modes = [...box.querySelectorAll<HTMLInputElement>('input[name="carry-mode"]')];
  const mode = () => modes.find((m) => m.checked)?.value ?? 'as-is';
  const body = () => ({ warbandId: data.warbandId, to: to.value, mode: mode(), veterans: [...box.querySelectorAll<HTMLInputElement>('[data-veteran]:checked')].map((c) => c.value) });

  // the ways the chosen campaign takes warbands in; a way it does not take is greyed out
  const fit = () => {
    const t = data.targets.find((x) => x.id === to.value);
    for (const m of modes) { m.disabled = !t?.modes.includes(m.value); if (m.disabled && m.checked) m.checked = false; }
    if (!mode() || modes.every((m) => !m.checked)) { const first = modes.find((m) => !m.disabled); if (first) first.checked = true; }
    veterans.hidden = mode() !== 'start-over';
    plan.innerHTML = '';
  };
  to.addEventListener('change', fit);
  for (const m of modes) m.addEventListener('change', fit);
  fit();

  box.addEventListener('click', async (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button');
    if (!b || b.disabled) return;
    if (b.matches('[data-carry-preview]')) {
      b.disabled = true;
      try {
        const { preview } = (await postApi(base, 'warbands/carry-preview', body())) as unknown as { preview: Preview };
        plan.innerHTML = render(preview);
      } catch (err) { toast((err as Error).message); }
      b.disabled = false;
    } else if (b.matches('[data-carry-go]')) {
      if (!confirm(`Carry them into ${data.targets.find((x) => x.id === to.value)?.name}? This campaign keeps them as they are.`)) return;
      b.disabled = true;
      try {
        const r = await postApi(base, 'warbands/carry', body());
        if (r.message) toast(r.message);
        location.href = String(r.goto);
      } catch (err) { toast((err as Error).message); b.disabled = false; }
    }
  });

  function render(p: Preview): string {
    const who = p.plan.members.map((m) => `<li><b>${esc(m.name)}</b>${m.changes.length ? ` <span class="mg-muted">— ${esc(m.changes.join('; '))}</span>` : ''}</li>`).join('');
    const left = p.plan.left.map((l) => `<li>${esc(l.name)} <span class="mg-muted">— ${esc(l.why)}</span></li>`).join('');
    const purse = p.mode === 'start-over' ? `A fresh roster, founded with ${p.to.startingCrowns} crowns.` : `${p.plan.gold} crowns and ${p.plan.shards} shards of wyrdstone come with them.`;
    const after = p.pending
      ? `They come in on the road: ${p.mode === 'start-over' ? 'draw up their new roster' : 'the roster above is proposed; change anything you like'} in ${esc(p.to.name)}, and approve it there.`
      : `They stand in ${esc(p.to.name)} at once.`;
    return `<div class="mg-panel">
      <h3 class="mg-h3">Into ${esc(p.to.name)}</h3>
      ${p.plan.notes.length ? `<ul class="mg-list">${p.plan.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}
      ${who ? `<p>Who comes:</p><ul class="mg-list">${who}</ul>` : '<p class="mg-muted">Nobody comes but the name.</p>'}
      ${left ? `<p>Who stays:</p><ul class="mg-list">${left}</ul>` : ''}
      <p>${esc(purse)}</p>
      <p class="mg-note">${after}</p>
      <div class="mg-actions"><button type="button" class="mg-btn" data-carry-go>Carry them</button></div>
    </div>`;
  }
}
