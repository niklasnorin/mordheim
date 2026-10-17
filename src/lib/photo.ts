/**
 * A picture taken at the table, made ready in the browser before it goes up: kept as large as it can be (the
 * longest side up to 4096 pixels, as WebP or JPEG at a high quality) under what one request may carry, with a small
 * one beside it for the log. Both are drawn afresh on a canvas, which also leaves behind what the camera wrote into
 * the file besides the picture, the place it was taken among it.
 */

/** As the server keeps them (server/campaign/scenarios.ts): the picture and its preview must go up in one request. */
const PHOTO_MAX_BYTES = 3_900_000;
const PREVIEW_MAX_BYTES = 450_000;
/** The longest side tried first, then smaller should the picture not fit. 4096 by 3072 stays under what a phone's canvas allows. */
const SIDES = [4096, 3200, 2560];
const PREVIEW_SIDE = 1280;

export interface Photo { picture: Blob; preview: Blob; width: number; height: number }

const UNREADABLE = 'That picture could not be read. Try another, or take it again.';

function encode(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((ok) => canvas.toBlob(ok, type, quality));
}

/** The picture drawn at a longest side, encoded as finely as fits: WebP where the browser writes it, else JPEG. */
async function fit(bitmap: ImageBitmap, longest: number, max: number, qualities: number[]): Promise<{ blob: Blob; width: number; height: number } | null> {
  const scale = Math.min(1, longest / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error(UNREADABLE);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  try {
    for (const q of qualities) {
      // a browser that cannot write WebP answers with a PNG instead, which is passed over for the JPEG
      const webp = await encode(canvas, 'image/webp', q);
      if (webp && webp.type === 'image/webp' && webp.size <= max) return { blob: webp, width: canvas.width, height: canvas.height };
      const jpeg = await encode(canvas, 'image/jpeg', q);
      if (jpeg && jpeg.size <= max) return { blob: jpeg, width: canvas.width, height: canvas.height };
    }
    return null;
  } finally {
    // let a phone have the memory back at once
    canvas.width = canvas.height = 0;
  }
}

/** Make a picture from the camera or the library ready to go up. */
export async function preparePhoto(file: File): Promise<Photo> {
  if (!file.type.startsWith('image/') && file.type !== '') throw new Error('That is not a picture.');
  const bitmap = await createImageBitmap(file).catch(() => { throw new Error(UNREADABLE); });
  try {
    let large: Awaited<ReturnType<typeof fit>> = null;
    for (const side of SIDES) {
      large = await fit(bitmap, side, PHOTO_MAX_BYTES, [0.92, 0.85, 0.78]);
      if (large) break;
    }
    if (!large) throw new Error('That picture is too large, even shrunk. Try another.');
    const small = await fit(bitmap, PREVIEW_SIDE, PREVIEW_MAX_BYTES, [0.8, 0.65, 0.5]);
    if (!small) throw new Error(UNREADABLE);
    return { picture: large.blob, preview: small.blob, width: large.width, height: large.height };
  } finally {
    bitmap.close();
  }
}
