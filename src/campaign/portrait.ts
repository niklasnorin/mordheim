/**
 * A warrior's portrait: whatever picture the keeper brings, framed by them to the one shape every portrait on the site
 * shares. The framing is kept as a crop in the picture's own fractions, so it reads the same whatever size the frame is
 * drawn at, and the keeper can come back to it; the framed portrait itself is drawn by the browser at `PORTRAIT_SIZE`.
 *
 * Pure, for the framing editor (`src/lib/portrait.ts`) and the service alike.
 */

/** Every portrait is this wide for its height. */
export const PORTRAIT_RATIO = 3 / 4;
/** The framed portrait as it is kept, in pixels: room for the warband page's largest, on a sharp screen. */
export const PORTRAIT_SIZE = { width: 600, height: 800 } as const;
/** How far in past filling the frame the keeper may go. */
export const PORTRAIT_ZOOM = 6;

/**
 * The part of the picture inside the frame, in fractions of the picture: `x` and `w` of its width, `y` and `h` of its
 * height. Zoomed out further than the picture fills, the crop runs past its edges (`x` below 0, `w` above 1) and the
 * frame shows the dark around it.
 */
export interface PortraitCrop { x: number; y: number; w: number; h: number }

/** The picture's size and the frame's, in whatever units the caller measures both in. */
export interface PortraitBox { iw: number; ih: number; fw: number; fh: number }

/** The picture as it sits under the frame: drawn `scale` times its size, its top-left corner at `x`, `y` from the frame's. */
export interface PortraitView { scale: number; x: number; y: number }

/** How small and how large the picture may be drawn: from all of it inside the frame, through filling it, to well in. */
export function scaleBounds(b: PortraitBox): { min: number; cover: number; max: number } {
  const across = b.fw / b.iw, down = b.fh / b.ih;
  const cover = Math.max(across, down);
  return { min: Math.min(across, down), cover, max: cover * PORTRAIT_ZOOM };
}

/**
 * The view kept within bounds. Larger than the frame, the picture always covers it; smaller (zoomed out), it stays
 * wholly inside it. Either way no edge of the picture is lost in the dark.
 */
export function clampView(v: PortraitView, b: PortraitBox): PortraitView {
  const { min, max } = scaleBounds(b);
  const scale = Math.min(max, Math.max(min, v.scale));
  const within = (at: number, frame: number, size: number) => {
    const slack = frame - size;
    return Math.min(Math.max(0, slack), Math.max(Math.min(0, slack), at));
  };
  return { scale, x: within(v.x, b.fw, b.iw * scale), y: within(v.y, b.fh, b.ih * scale) };
}

/** The picture filling the frame, its middle in the middle: where a new portrait starts. */
export function centredView(b: PortraitBox): PortraitView {
  const { cover } = scaleBounds(b);
  return { scale: cover, x: (b.fw - b.iw * cover) / 2, y: (b.fh - b.ih * cover) / 2 };
}

/** Zoom to `scale`, keeping the point of the frame at `px`, `py` over the same spot of the picture. */
export function zoomView(v: PortraitView, scale: number, px: number, py: number, b: PortraitBox): PortraitView {
  const { min, max } = scaleBounds(b);
  const next = Math.min(max, Math.max(min, scale));
  const k = next / v.scale;
  return clampView({ scale: next, x: px - (px - v.x) * k, y: py - (py - v.y) * k }, b);
}

/** The view as a crop, to keep. */
export function cropOf(v: PortraitView, b: PortraitBox): PortraitCrop {
  const w = b.iw * v.scale, h = b.ih * v.scale;
  return { x: -v.x / w, y: -v.y / h, w: b.fw / w, h: b.fh / h };
}

/** A kept crop as a view of a frame of this size, to frame again. */
export function viewOf(c: PortraitCrop, b: PortraitBox): PortraitView {
  const scale = b.fw / (c.w * b.iw);
  return clampView({ scale, x: -c.x * b.iw * scale, y: -c.y * b.ih * scale }, b);
}

/** Where to draw the whole picture so the crop fills an output of `width` by `height`. */
export function drawRect(c: PortraitCrop, width: number, height: number): { dx: number; dy: number; dw: number; dh: number } {
  return { dx: (-c.x / c.w) * width, dy: (-c.y / c.h) * height, dw: width / c.w, dh: height / c.h };
}

/** A crop as it may be kept: finite, with some size, not absurdly far out, and rounded. Null when it is none of those. */
export function normaliseCrop(c: PortraitCrop): PortraitCrop | null {
  const n = [c.x, c.y, c.w, c.h];
  if (!n.every(Number.isFinite) || c.w <= 0 || c.h <= 0 || n.some((v) => Math.abs(v) > 50)) return null;
  const round = (v: number) => Math.round(v * 1e6) / 1e6;
  return { x: round(c.x), y: round(c.y), w: round(c.w), h: round(c.h) };
}
