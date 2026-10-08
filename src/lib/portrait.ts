/**
 * The portrait framer on a warband's page. Each warrior the viewer may tend carries a mount:
 *
 *   <div data-portrait-editor data-member="ottilie" data-name="Ottilie" data-picture='{"image":…,"source":…,"crop":{…}}'>
 *     <input type="file" data-portrait-file hidden> <button data-portrait-choose> <button data-portrait-reframe>
 *
 * Any picture the browser can read will do, of any shape or size: it is shrunk here (as for a chapter), then shown
 * under the portrait's frame, where it is dragged into place and scaled with a pinch, the wheel, the slider or the
 * keys. Kept, the picture goes up first, then the portrait drawn from it at `PORTRAIT_SIZE` with the framing, and the
 * page reloads on the warrior. Framing again starts from the kept picture and framing.
 */
import { postApi } from './manage';
import { base64Of, shrink } from './chapters';
import { PORTRAIT_SIZE, centredView, clampView, cropOf, drawRect, scaleBounds, viewOf, zoomView, type PortraitBox, type PortraitCrop, type PortraitView } from '../campaign/portrait';
import type { PortraitPicture } from '../campaign/model';

/** The dark a portrait is laid on, where it is zoomed out past its picture's edges. The frame shows the same. */
const FILL = '#0d1210';
const MAX_BYTES = 800_000;
const UNREADABLE = 'That picture could not be read. Use a JPEG, PNG, WebP or GIF.';

interface Sitting { memberId: string; name: string; image: HTMLImageElement; blob?: Blob; sourceId?: string; crop?: PortraitCrop; url?: string }

function sheet(): HTMLDialogElement {
  const existing = document.getElementById('pt-dialog');
  if (existing) return existing as HTMLDialogElement;
  const dialog = document.createElement('dialog');
  dialog.id = 'pt-dialog';
  dialog.className = 'pt-dialog';
  dialog.setAttribute('aria-labelledby', 'pt-title');
  dialog.innerHTML = `
    <div class="pt-sheet">
      <h2 class="mg-h3" id="pt-title">Frame the portrait</h2>
      <p class="mg-muted pt-how">Drag the picture to move it. Pinch, scroll or use the slider to scale it.</p>
      <div class="pt-stage" tabindex="0" role="group" aria-label="The picture in its frame. The arrow keys move it; plus and minus scale it; zero starts again.">
        <div class="pt-frame"><img class="pt-img" alt="" draggable="false"><div class="pt-mask"></div></div>
      </div>
      <label class="mg-field pt-zoom">Scale<input type="range" min="0" max="1000" step="1" value="0"></label>
      <p class="pt-error" role="alert" hidden></p>
      <div class="mg-actions end">
        <button type="button" class="mg-btn ghost sm" data-pt="reset">Start again</button>
        <button type="button" class="mg-btn ghost sm" data-pt="cancel">Cancel</button>
        <button type="button" class="mg-btn" data-pt="keep">Keep this framing</button>
      </div>
    </div>`;
  document.body.append(dialog);
  return dialog;
}

/** The portrait as the framing shows it, drawn at its kept size and made small enough to send. */
async function draw(image: HTMLImageElement, crop: PortraitCrop): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = PORTRAIT_SIZE.width;
  canvas.height = PORTRAIT_SIZE.height;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = FILL;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  const r = drawRect(crop, canvas.width, canvas.height);
  ctx.drawImage(image, r.dx, r.dy, r.dw, r.dh);
  const encode = (type: string, quality: number) => new Promise<Blob | null>((ok) => canvas.toBlob(ok, type, quality));
  const webp = await encode('image/webp', 0.86);
  if (webp && webp.type === 'image/webp' && webp.size <= MAX_BYTES) return webp;
  for (const q of [0.86, 0.7]) {
    const jpeg = await encode('image/jpeg', q);
    if (jpeg && jpeg.size <= MAX_BYTES) return jpeg;
  }
  throw new Error('The portrait would not draw small enough. Try another picture.');
}

export function wirePortraits(root: HTMLElement, base: string): void {
  const mounts = root.querySelectorAll<HTMLElement>('[data-portrait-editor]');
  if (!mounts.length) return;
  const dialog = sheet();
  const stage = dialog.querySelector<HTMLElement>('.pt-stage')!;
  const frame = dialog.querySelector<HTMLElement>('.pt-frame')!;
  const img = dialog.querySelector<HTMLImageElement>('.pt-img')!;
  const slider = dialog.querySelector<HTMLInputElement>('.pt-zoom input')!;
  const title = dialog.querySelector<HTMLElement>('#pt-title')!;
  const error = dialog.querySelector<HTMLElement>('.pt-error')!;
  const keep = dialog.querySelector<HTMLButtonElement>('[data-pt="keep"]')!;

  let sitting: Sitting | null = null;
  let box: PortraitBox = { iw: 1, ih: 1, fw: 1, fh: 1 };
  let view: PortraitView = { scale: 1, x: 0, y: 0 };

  const say = (text: string) => { error.textContent = text; error.hidden = !text; };
  const measure = (): PortraitBox => ({ iw: box.iw, ih: box.ih, fw: frame.clientWidth || 1, fh: frame.clientHeight || 1 });
  const sliderOf = (scale: number) => { const { min, max } = scaleBounds(box); return max > min ? Math.round((1000 * Math.log(scale / min)) / Math.log(max / min)) : 0; };
  const show = (next: PortraitView) => {
    view = next;
    img.style.width = `${box.iw * view.scale}px`;
    img.style.height = `${box.ih * view.scale}px`;
    img.style.transform = `translate(${view.x}px, ${view.y}px)`;
    slider.value = String(sliderOf(view.scale));
  };
  const at = (e: { clientX: number; clientY: number }) => { const r = frame.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };

  // the frame keeps its framing when the sheet changes size (a phone turned, a window dragged)
  new ResizeObserver(() => {
    if (!sitting || !dialog.open) return;
    const crop = cropOf(view, box);
    box = measure();
    show(viewOf(crop, box));
  }).observe(frame);

  async function open(s: Sitting) {
    sitting = s;
    say('');
    keep.disabled = false; keep.removeAttribute('aria-busy');
    title.textContent = `Frame ${s.name}’s portrait`;
    img.src = s.image.src;
    await img.decode().catch(() => undefined);
    dialog.showModal();
    box = { iw: s.image.naturalWidth, ih: s.image.naturalHeight, fw: 1, fh: 1 };
    box = measure();
    show(s.crop ? viewOf(s.crop, box) : centredView(box));
    stage.focus({ preventScroll: true });
  }

  function close() {
    if (sitting?.url) URL.revokeObjectURL(sitting.url);
    sitting = null;
    img.removeAttribute('src');
  }
  dialog.addEventListener('close', close);

  // moving and scaling: one finger or the mouse drags, two pinch, the wheel scales where it points
  const pointers = new Map<number, { x: number; y: number }>();
  stage.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    stage.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, at(e));
    stage.classList.add('dragging');
  });
  stage.addEventListener('pointermove', (e) => {
    const was = pointers.get(e.pointerId);
    if (!was) return;
    const now = at(e);
    const other = [...pointers].find(([id]) => id !== e.pointerId)?.[1];
    if (!other) show(clampView({ ...view, x: view.x + now.x - was.x, y: view.y + now.y - was.y }, box));
    else {
      const span = (a: { x: number; y: number }) => Math.hypot(a.x - other.x, a.y - other.y) || 1;
      const mid = (a: { x: number; y: number }) => ({ x: (a.x + other.x) / 2, y: (a.y + other.y) / 2 });
      const from = mid(was), to = mid(now);
      const zoomed = zoomView(view, (view.scale * span(now)) / span(was), from.x, from.y, box);
      show(clampView({ ...zoomed, x: zoomed.x + to.x - from.x, y: zoomed.y + to.y - from.y }, box));
    }
    pointers.set(e.pointerId, now);
  });
  const lift = (e: PointerEvent) => { pointers.delete(e.pointerId); if (!pointers.size) stage.classList.remove('dragging'); };
  stage.addEventListener('pointerup', lift);
  stage.addEventListener('pointercancel', lift);
  stage.addEventListener('wheel', (e) => {
    e.preventDefault();
    const p = at(e);
    show(zoomView(view, view.scale * Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0015)), p.x, p.y, box));
  }, { passive: false });
  stage.addEventListener('keydown', (e) => {
    const step = e.shiftKey ? 40 : 10;
    const move: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (move[e.key]) show(clampView({ ...view, x: view.x + move[e.key][0], y: view.y + move[e.key][1] }, box));
    else if (e.key === '+' || e.key === '=') show(zoomView(view, view.scale * 1.1, box.fw / 2, box.fh / 2, box));
    else if (e.key === '-' || e.key === '_') show(zoomView(view, view.scale / 1.1, box.fw / 2, box.fh / 2, box));
    else if (e.key === '0') show(centredView(box));
    else return;
    e.preventDefault();
  });
  // the slider scales about the middle, and catches on the scale that just fills the frame
  slider.addEventListener('input', () => {
    const { min, max, cover } = scaleBounds(box);
    let scale = min * Math.pow(max / min, Number(slider.value) / 1000);
    if (Math.abs(scale - cover) / cover < 0.04) scale = cover;
    show(zoomView(view, scale, box.fw / 2, box.fh / 2, box));
  });

  dialog.addEventListener('click', async (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-pt]');
    if (!b || !sitting) return;
    if (b.dataset.pt === 'cancel') return dialog.close();
    if (b.dataset.pt === 'reset') return show(centredView(box));
    const s = sitting;
    keep.disabled = true; keep.setAttribute('aria-busy', 'true'); say('');
    try {
      const crop = cropOf(view, box);
      const portrait = await draw(s.image, crop);
      if (!s.sourceId && s.blob) s.sourceId = ((await postApi(base, 'warbands/portrait-source', { memberId: s.memberId, mime: s.blob.type, data: await base64Of(s.blob) })) as { id: string }).id;
      await postApi(base, 'warbands/portrait', { memberId: s.memberId, sourceId: s.sourceId, crop, mime: portrait.type, data: await base64Of(portrait) });
      history.replaceState(null, '', `#${s.memberId}`);
      location.reload();
    } catch (err) {
      say((err as Error).message);
      keep.disabled = false; keep.removeAttribute('aria-busy');
    }
  });

  const load = (src: string) => new Promise<HTMLImageElement>((ok, fail) => {
    const image = new Image();
    image.onload = () => ok(image);
    image.onerror = () => fail(new Error(UNREADABLE));
    image.src = src;
  });

  for (const mount of mounts) {
    const memberId = mount.dataset.member!, name = mount.dataset.name ?? 'the warrior';
    const picture: PortraitPicture | null = mount.dataset.picture ? JSON.parse(mount.dataset.picture) : null;
    const file = mount.querySelector<HTMLInputElement>('input[type=file][data-portrait-file]')!;
    const busy = (on: boolean) => mount.querySelectorAll<HTMLButtonElement>('button[data-portrait-choose], button[data-portrait-reframe]').forEach((b) => { b.disabled = on; if (on) b.setAttribute('aria-busy', 'true'); else b.removeAttribute('aria-busy'); });
    const toast = (text: string) => { const note = mount.querySelector<HTMLElement>('[data-portrait-note]'); if (note) { note.textContent = text; note.hidden = false; } };

    mount.addEventListener('click', async (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button');
      if (!b || b.disabled) return;
      if (b.matches('[data-portrait-choose]')) file.click();
      if (b.matches('[data-portrait-reframe]') && picture) {
        busy(true);
        try { await open({ memberId, name, image: await load(`${base}/images/${picture.source}`), sourceId: picture.source, crop: picture.crop }); }
        catch (err) { toast((err as Error).message); }
        busy(false);
      }
    });
    file.addEventListener('change', async () => {
      const picked = file.files?.[0];
      file.value = '';
      if (!picked) return;
      busy(true);
      try {
        // a file the browser cannot decode fails in the drawing, not with words of its own
        const blob = await shrink(picked).catch((err) => { throw err instanceof DOMException || err instanceof TypeError ? new Error(UNREADABLE) : err; });
        const url = URL.createObjectURL(blob);
        await open({ memberId, name, image: await load(url), blob, url });
      } catch (err) { toast((err as Error).message); }
      busy(false);
    });
  }
}
