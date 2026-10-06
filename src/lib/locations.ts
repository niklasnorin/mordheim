/**
 * The location pages' client script, on top of `manage.ts`: the map picker a game master sets a fight's spot with,
 * the pin that lights up when its entry in the list is opened, and the map upload.
 *
 *   <form …>
 *     <select name="patch.locationId" data-location-select>…</select>
 *     <input name="patch.pointId" type="number" data-nullable hidden data-point-input />
 *     <input name="patch.mapX" type="number" data-x-input /> <input name="patch.mapY" type="number" data-y-input />
 *     <div data-picker-for="fussenbach"><figure class="lmap is-picker" data-map>…</figure></div>
 *     <button type="button" data-clear-marker>…</button>
 *   </form>
 *
 * A tap on the map writes the spot into the inputs and clears the point; a tap on a point's pin writes the point and
 * clears the spot, so the marker follows the point if it is moved later. Nothing is posted until the form is.
 *
 *   <input type="file" data-picture-upload="banner" data-location="fussenbach" />
 *
 * A picture picked is shrunk, posted as the location's map or banner, and the page reloads with it.
 */
import { base64Of, shrink } from './chapters';
import { ensureToast, postApi } from './manage';

export function wireLocations(root: HTMLElement, base: string): void {
  for (const form of root.querySelectorAll<HTMLFormElement>('form')) if (form.querySelector('[data-map].is-picker')) wirePicker(form);
  wireLitPins(root);
  wireMapUploads(root, base);
}

function wirePicker(form: HTMLFormElement): void {
  const xIn = form.querySelector<HTMLInputElement>('[data-x-input]');
  const yIn = form.querySelector<HTMLInputElement>('[data-y-input]');
  const pointIn = form.querySelector<HTMLInputElement>('[data-point-input]');
  const select = form.querySelector<HTMLSelectElement>('[data-location-select]');
  if (!xIn || !yIn) return;
  const pickers = [...form.querySelectorAll<HTMLElement>('[data-picker-for]')];
  const noMap = form.querySelector<HTMLElement>('[data-no-map]');

  const visibleMap = (): HTMLElement | null => {
    const shown = pickers.find((p) => !p.hidden) ?? form;
    return shown.querySelector<HTMLElement>('[data-map].is-picker');
  };
  const draw = () => {
    const map = visibleMap();
    if (!map) return;
    const marker = map.querySelector<HTMLElement>('[data-marker]');
    if (!marker) return;
    const point = pointIn?.value ? map.querySelector<HTMLElement>(`[data-pin-point="${CSS.escape(pointIn.value)}"]`) : null;
    const x = point ? Number(point.dataset.x) : Number(xIn.value), y = point ? Number(point.dataset.y) : Number(yIn.value);
    const set = (point || (xIn.value !== '' && yIn.value !== '')) && Number.isFinite(x) && Number.isFinite(y);
    marker.hidden = !set;
    if (set) { marker.style.left = `${x}%`; marker.style.top = `${y}%`; marker.classList.toggle('below', y < 14); }
    // on a marked place, the marker speaks for it: one label, the place's name
    const label = marker.querySelector<HTMLElement>('.lmap-label');
    if (label) { label.dataset.own ??= label.textContent ?? ''; label.textContent = point ? point.querySelector('.lmap-label')?.textContent ?? label.dataset.own : label.dataset.own; }
    for (const pin of map.querySelectorAll<HTMLElement>('[data-pin-point]')) pin.classList.toggle('is-under', !!point && pin === point);
  };
  const clear = () => { xIn.value = ''; yIn.value = ''; if (pointIn) pointIn.value = ''; draw(); };

  for (const picker of pickers.length ? pickers : [form]) {
    const frame = picker.querySelector<HTMLElement>('[data-map].is-picker [data-frame]');
    if (!frame) continue;
    frame.addEventListener('click', (e) => {
      const pin = (e.target as HTMLElement).closest<HTMLElement>('[data-pin-point]');
      if (pin) {
        if (pointIn) { pointIn.value = pin.dataset.pinPoint ?? ''; xIn.value = ''; yIn.value = ''; }
        else { xIn.value = String(Number(pin.dataset.x)); yIn.value = String(Number(pin.dataset.y)); }
        draw();
        return;
      }
      const img = frame.querySelector('img');
      if (!img) return;
      const r = img.getBoundingClientRect();
      const x = Math.min(100, Math.max(0, ((e.clientX - r.left) / r.width) * 100));
      const y = Math.min(100, Math.max(0, ((e.clientY - r.top) / r.height) * 100));
      xIn.value = (Math.round(x * 10) / 10).toString(); yIn.value = (Math.round(y * 10) / 10).toString();
      if (pointIn) pointIn.value = '';
      draw();
    });
  }
  for (const input of [xIn, yIn]) input.addEventListener('input', () => { if (pointIn) pointIn.value = ''; draw(); });
  form.querySelector<HTMLButtonElement>('[data-clear-marker]')?.addEventListener('click', clear);
  if (select) {
    const follow = (changed: boolean) => {
      const id = select.value;
      for (const p of pickers) p.hidden = p.dataset.pickerFor !== id;
      const has = pickers.some((p) => p.dataset.pickerFor === id);
      if (noMap) noMap.hidden = !id || has;
      if (changed) clear(); else draw();
    };
    select.addEventListener('change', () => follow(true));
    follow(false);
  } else draw();
}

/** A point's entry in the list lights its pin on the map for a moment, so the two can be found from each other. */
function wireLitPins(root: HTMLElement): void {
  const light = (id: string) => {
    for (const pin of root.querySelectorAll<HTMLElement>(`[data-pin="${CSS.escape(id)}"]`)) {
      pin.classList.add('is-lit');
      setTimeout(() => pin.classList.remove('is-lit'), 2400);
    }
  };
  root.addEventListener('click', (e) => {
    const a = (e.target as HTMLElement).closest<HTMLAnchorElement>('a[data-show-pin]');
    if (a) light(a.dataset.showPin ?? '');
  });
  const fromHash = () => { const m = /^#point-(\d+)$/.exec(location.hash); if (m) light(m[1]); };
  window.addEventListener('hashchange', fromHash);
  fromHash();
}

/** A map or banner picked from the device is shrunk, sent, and the page reloads with it. */
function wireMapUploads(root: HTMLElement, base: string): void {
  const toast = ensureToast();
  for (const input of root.querySelectorAll<HTMLInputElement>('input[type=file][data-picture-upload]')) {
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (!file) return;
      input.disabled = true;
      try {
        const kind = input.dataset.pictureUpload === 'banner' ? 'banner' : 'map';
        const blob = await shrink(file, kind === 'map' ? 2400 : 1600);
        await postApi(base, `locations/upload-${kind}`, { locationId: input.dataset.location, mime: blob.type, data: await base64Of(blob) });
        location.reload();
      } catch (err) { toast((err as Error).message); input.disabled = false; input.value = ''; }
    });
  }
}
