import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PORTRAIT_RATIO, PORTRAIT_SIZE, PORTRAIT_ZOOM, centredView, clampView, cropOf, drawRect, normaliseCrop, scaleBounds, viewOf, zoomView, type PortraitCrop } from './portrait.ts';

// a landscape photograph under a 300 by 400 frame, and a tall narrow one
const wide = { iw: 1600, ih: 900, fw: 300, fh: 400 };
const tall = { iw: 500, ih: 2000, fw: 300, fh: 400 };
const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} is not ${b}`);
const nearCrop = (a: PortraitCrop, b: PortraitCrop) => { near(a.x, b.x); near(a.y, b.y); near(a.w, b.w); near(a.h, b.h); };

test('every portrait is framed to one shape, kept at one size', () => {
  assert.equal(PORTRAIT_SIZE.width / PORTRAIT_SIZE.height, PORTRAIT_RATIO);
});

test('a new portrait starts with the picture filling the frame, its middle in the middle', () => {
  const v = centredView(wide);
  near(v.scale, 400 / 900);
  near(v.y, 0);
  near(v.x, (300 - 1600 * v.scale) / 2);
  const c = cropOf(v, wide);
  near(c.h, 1);
  near(c.x + c.w / 2, 0.5);
  near((c.w * wide.iw) / (c.h * wide.ih), PORTRAIT_RATIO);
  const t = cropOf(centredView(tall), tall);
  near(t.w, 1);
  near(t.y + t.h / 2, 0.5);
});

test('zoomed in, the picture always covers the frame however far it is dragged', () => {
  const v = clampView({ scale: scaleBounds(wide).cover * 2, x: 500, y: -5000 }, wide);
  near(v.x, 0);
  near(v.y, 400 - 900 * v.scale);
  const c = cropOf(v, wide);
  assert.ok(c.x >= 0 && c.y >= 0 && c.x + c.w <= 1 + 1e-9 && c.y + c.h <= 1 + 1e-9);
});

test('zoomed out, the whole picture fits and stays inside the frame', () => {
  const { min, max, cover } = scaleBounds(wide);
  near(min, 300 / 1600);
  near(max, cover * PORTRAIT_ZOOM);
  const v = clampView({ scale: 0.01, x: -100, y: 1000 }, wide);
  near(v.scale, min);
  near(v.x, 0);
  near(v.y, 400 - 900 * min);
  const c = cropOf(v, wide);
  near(c.w, 1);
  assert.ok(c.h > 1 && c.y < 0, 'the frame shows the dark above and below');
  assert.equal(clampView({ scale: 99, x: 0, y: 0 }, wide).scale, max, 'and no further in than the bound');
});

test('zooming keeps the point under the fingers where it was', () => {
  const v = centredView(tall);
  const z = zoomView(v, v.scale * 2, 150, 100, tall);
  // the spot of the picture under (150, 100) before is under it after
  near((150 - v.x) / v.scale, (150 - z.x) / z.scale);
  near((100 - v.y) / v.scale, (100 - z.y) / z.scale);
});

test('a kept crop comes back as the same view, whatever size the frame is drawn at', () => {
  const v = zoomView(centredView(wide), scaleBounds(wide).cover * 1.7, 40, 320, wide);
  const c = cropOf(v, wide);
  const again = viewOf(c, wide);
  near(again.scale, v.scale); near(again.x, v.x); near(again.y, v.y);
  const smaller = { ...wide, fw: 150, fh: 200 };
  nearCrop(cropOf(viewOf(c, smaller), smaller), c);
});

test('the crop draws the picture to fill the portrait exactly', () => {
  const r = drawRect({ x: 0.25, y: 0.1, w: 0.5, h: 0.4 }, 600, 800);
  near(r.dw, 1200); near(r.dh, 2000);
  near(r.dx, -300); near(r.dy, -200);
  const out = drawRect({ x: -0.1, y: 0, w: 1.2, h: 1 }, 600, 800);
  assert.ok(out.dx > 0 && out.dw < 600, 'zoomed out, the picture sits inside with the dark either side');
});

test('a crop is kept only when it is a crop', () => {
  assert.deepEqual(normaliseCrop({ x: 0.1234567891, y: 0, w: 0.5, h: 0.5 }), { x: 0.123457, y: 0, w: 0.5, h: 0.5 });
  assert.equal(normaliseCrop({ x: 0, y: 0, w: 0, h: 1 }), null);
  assert.equal(normaliseCrop({ x: Number.NaN, y: 0, w: 1, h: 1 }), null);
  assert.equal(normaliseCrop({ x: 0, y: 0, w: 1, h: 900 }), null);
});
