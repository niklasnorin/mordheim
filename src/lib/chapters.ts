/**
 * The chapter editor on a warband's page: a title, then prose and pictures in the order they are told. Each mount
 * is `<div data-chapter-editor data-warband="nordost" data-chapter='{"id":3,"title":"…","blocks":[…]}'>`; without
 * an id it writes a new chapter. A picture is shrunk here before it is sent (the longest side to 1800 pixels, as
 * WebP or JPEG), uploaded at once, and placed: left or right with the prose running round it, or alone in the
 * middle, at a width in per cent of the column or in pixels. Saving reloads the page on the chapter.
 */
import { ensureToast, postApi } from './manage';
import { IMAGE_SIZE, type ChapterBlock, type ChapterImage, type ImageAlign, type ImageUnit } from '../campaign/model';

interface Draft { id?: number; title: string; blocks: ChapterBlock[] }

const LONGEST = 1800;
const MAX_BYTES = 2_500_000;
const ALIGN_LABEL: Record<ImageAlign, string> = { left: 'Left', centre: 'Middle', right: 'Right' };

/** A tiny element builder: attributes, then children. */
function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, ...children: (Node | string)[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  el.append(...children);
  return el;
}

/** The picture made small enough to keep: a GIF that already fits is sent as it is, so it still moves. A map may ask for a longer edge. */
export async function shrink(file: File, longest = LONGEST): Promise<Blob> {
  if (file.type === 'image/gif' && file.size <= MAX_BYTES) return file;
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, longest / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const encode = (type: string, quality: number) => new Promise<Blob | null>((ok) => canvas.toBlob(ok, type, quality));
  const webp = await encode('image/webp', 0.85);
  if (webp && webp.type === 'image/webp' && webp.size <= MAX_BYTES) return webp;
  for (const q of [0.85, 0.7, 0.55]) {
    const jpeg = await encode('image/jpeg', q);
    if (jpeg && jpeg.size <= MAX_BYTES) return jpeg;
  }
  throw new Error('That picture is too large, even shrunk. Try a smaller one.');
}

export const base64Of = (blob: Blob) => new Promise<string>((ok, fail) => {
  const reader = new FileReader();
  reader.onload = () => ok(String(reader.result).replace(/^data:[^,]*,/, ''));
  reader.onerror = () => fail(new Error('The picture could not be read.'));
  reader.readAsDataURL(blob);
});

export function wireChapterEditors(root: HTMLElement, base: string): void {
  const toast = ensureToast();
  root.querySelectorAll<HTMLElement>('[data-chapter-editor]').forEach((mount) => {
    const warbandId = mount.dataset.warband!;
    const draft: Draft = JSON.parse(mount.dataset.chapter ?? '{"title":"","blocks":[]}');
    if (!draft.blocks.length) draft.blocks.push({ kind: 'text', text: '' });
    const imageUrl = (id: string) => `${base}/images/${id}`;
    const uid = `ch-${draft.id ?? 'new'}`;

    const title = h('input', { type: 'text', maxlength: '120', placeholder: 'The Road South', value: draft.title });
    const list = h('ol', { class: 'ce-blocks' });
    const file = h('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp,image/gif', hidden: '' });
    const addText = h('button', { type: 'button', class: 'mg-btn ghost sm' }, '+ Prose');
    const addImage = h('button', { type: 'button', class: 'mg-btn ghost sm' }, '+ Picture');
    const save = h('button', { type: 'button', class: 'mg-btn' }, draft.id ? 'Save the chapter' : 'Add the chapter');

    // the draft is the truth; the list is drawn from it after every change
    const draw = () => {
      list.replaceChildren(...draft.blocks.map((b, i) => blockCard(b, i)));
    };
    const move = (i: number, by: number) => {
      const to = i + by;
      if (to < 0 || to >= draft.blocks.length) return;
      [draft.blocks[i], draft.blocks[to]] = [draft.blocks[to], draft.blocks[i]];
      draw();
    };
    const tools = (i: number, label: string) => {
      const up = h('button', { type: 'button', class: 'ce-tool', 'aria-label': `Move this ${label.toLowerCase()} up` }, '↑');
      const down = h('button', { type: 'button', class: 'ce-tool', 'aria-label': `Move this ${label.toLowerCase()} down` }, '↓');
      const cut = h('button', { type: 'button', class: 'ce-tool ce-cut', 'aria-label': `Take this ${label.toLowerCase()} out` }, '✕');
      up.disabled = i === 0;
      down.disabled = i === draft.blocks.length - 1;
      up.onclick = () => move(i, -1);
      down.onclick = () => move(i, 1);
      cut.onclick = () => { draft.blocks.splice(i, 1); draw(); };
      return h('div', { class: 'ce-head' }, h('span', { class: 'ce-kind' }, label), up, down, cut);
    };
    function blockCard(b: ChapterBlock, i: number): HTMLLIElement {
      if (b.kind === 'text') {
        const area = h('textarea', { class: 'ce-text', rows: '8', maxlength: '20000', placeholder: 'Leave a blank line between paragraphs. The first letter of the chapter is drawn large.', 'aria-label': 'Prose' });
        area.value = b.text;
        area.oninput = () => { b.text = area.value; };
        return h('li', { class: 'ce-block' }, tools(i, 'Prose'), area);
      }
      return h('li', { class: 'ce-block ce-image' }, tools(i, 'Picture'), imageFields(b, i));
    }
    function imageFields(b: ChapterImage, i: number): HTMLElement {
      const name = `${uid}-align-${i}`;
      const aligns = h('div', { class: 'ce-aligns', role: 'radiogroup', 'aria-label': 'Where the picture sits' }, ...(Object.keys(ALIGN_LABEL) as ImageAlign[]).map((a) => {
        const radio = h('input', { type: 'radio', name, value: a });
        radio.checked = b.align === a;
        radio.onchange = () => { b.align = a; preview.dataset.align = a; };
        return h('label', {}, radio, ALIGN_LABEL[a]);
      }));
      const size = h('input', { type: 'number', inputmode: 'numeric', value: String(b.size), 'aria-label': 'Width' });
      const unit = h('select', { 'aria-label': 'Width in' }, ...(['%', 'px'] as ImageUnit[]).map((u) => { const o = h('option', { value: u }, u === '%' ? '% of the column' : 'pixels'); o.selected = b.unit === u; return o; }));
      const limits = () => { const l = IMAGE_SIZE[b.unit]; size.min = String(l.min); size.max = String(l.max); };
      limits();
      size.oninput = () => { b.size = Number(size.value); };
      unit.onchange = () => { b.unit = unit.value as ImageUnit; b.size = IMAGE_SIZE[b.unit].default; size.value = String(b.size); limits(); };
      const caption = h('input', { type: 'text', maxlength: '300', placeholder: 'A line under the picture, if any', value: b.caption, 'aria-label': 'Caption' });
      caption.oninput = () => { b.caption = caption.value; };
      const preview = h('img', { src: imageUrl(b.imageId), alt: '', class: 'ce-thumb', 'data-align': b.align });
      return h('div', { class: 'ce-image-fields' },
        preview,
        h('div', { class: 'ce-image-controls' },
          h('span', { class: 'ce-label' }, 'Placed'), aligns,
          h('span', { class: 'ce-label' }, 'Width'), h('div', { class: 'ce-size' }, size, unit),
          h('label', { class: 'ce-label ce-caption' }, 'Caption', caption),
        ),
      );
    }

    addText.onclick = () => { draft.blocks.push({ kind: 'text', text: '' }); draw(); (list.lastElementChild?.querySelector('textarea') as HTMLTextAreaElement | null)?.focus(); };
    addImage.onclick = () => file.click();
    file.onchange = async () => {
      const picked = file.files?.[0];
      file.value = '';
      if (!picked) return;
      addImage.disabled = true; addImage.textContent = 'Uploading…';
      try {
        const blob = await shrink(picked);
        const { id } = (await postApi(base, 'warbands/upload-image', { warbandId, mime: blob.type, data: await base64Of(blob) })) as { id: string };
        draft.blocks.push({ kind: 'image', imageId: id, align: 'right', size: IMAGE_SIZE['%'].default, unit: '%', caption: '' });
        draw();
      } catch (e) { toast((e as Error).message); }
      finally { addImage.disabled = false; addImage.textContent = '+ Picture'; }
    };
    save.onclick = async () => {
      save.disabled = true; save.setAttribute('aria-busy', 'true');
      const chapter = { title: title.value, blocks: draft.blocks };
      try {
        const { chapters } = (await postApi(base, draft.id ? 'warbands/update-chapter' : 'warbands/add-chapter', draft.id ? { chapterId: draft.id, chapter } : { warbandId, chapter })) as { chapters: { id: number }[] };
        const at = draft.id ?? chapters.at(-1)?.id;
        location.hash = at ? `chapter-${at}` : 'story';
        location.reload();
      } catch (e) { toast((e as Error).message); save.disabled = false; save.removeAttribute('aria-busy'); }
    };

    draw();
    mount.replaceChildren(
      h('label', { class: 'mg-field' }, 'Title', title),
      list,
      h('div', { class: 'ce-add' }, addText, addImage, file),
      h('div', { class: 'mg-actions end' }, save),
    );
  });
}
