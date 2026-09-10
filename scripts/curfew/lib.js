// CURFEW — Tarot of the Damned. Shared drawing library (frame, parchment, engraving primitives).
'use strict';
const W = 1050, H = 1800;
const C = {
  soot: '#0E0D0C', ash: '#2A2724', bone: '#D9CDB8', blood: '#6B1F1F', candle: '#E0A34A', wyrd: '#6FCF7A',
  ink: '#1A1410', inkSoft: 'rgba(26,20,16,0.55)', gold: '#B8862E', goldPale: '#E8C57A', parch: '#CBBB9A', parchDark: '#8E7B5A',
};
const PANEL = { x: 105, y: 190, w: 840, h: 1100, arch: 150 }; // art window
const TAU = Math.PI * 2;

function rng(seed) { // mulberry32
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const lerp = (a, b, t) => a + (b - a) * t;

// ---------- textures ----------
function noiseCanvas(w, h, seed, contrast = 1) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d'); const img = x.createImageData(w, h); const r = rng(seed);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 128 + (r() - 0.5) * 255 * contrast;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255;
  }
  x.putImageData(img, 0, 0); return c;
}
// multi-octave mottle: upscaled blurred noise layers
function mottle(ctx, x, y, w, h, seed, alpha) {
  ctx.save(); ctx.globalAlpha = alpha; ctx.globalCompositeOperation = 'multiply';
  const octaves = [[8, 0.9], [24, 0.6], [96, 0.35]];
  octaves.forEach(([n, a], i) => {
    const c = noiseCanvas(n, Math.round(n * h / w), seed + i * 7919, a);
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(c, x, y, w, h);
  });
  ctx.restore();
}
function grain(ctx, alpha, seed) {
  const c = noiseCanvas(W, H, seed, 1);
  ctx.save(); ctx.globalAlpha = alpha; ctx.globalCompositeOperation = 'overlay'; ctx.drawImage(c, 0, 0); ctx.restore();
}

// ---------- geometry ----------
function panelPath(ctx, inset = 0) {
  const { x, y, w, h, arch } = PANEL;
  const x0 = x + inset, x1 = x + w - inset, y0 = y + inset, y1 = y + h - inset, cx = x + w / 2;
  ctx.beginPath();
  ctx.moveTo(x0, y1); ctx.lineTo(x0, y0 + arch);
  ctx.quadraticCurveTo(x0, y0 + arch * 0.25, cx - (w / 2 - inset) * 0.42, y0 + arch * 0.12);
  ctx.quadraticCurveTo(cx - 40, y0 + 6, cx, y0);
  ctx.quadraticCurveTo(cx + 40, y0 + 6, cx + (w / 2 - inset) * 0.42, y0 + arch * 0.12);
  ctx.quadraticCurveTo(x1, y0 + arch * 0.25, x1, y0 + arch);
  ctx.lineTo(x1, y1); ctx.closePath();
}
function poly(ctx, pts, close = true) {
  ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); if (close) ctx.closePath();
}
function fillPoly(ctx, pts, color) { poly(ctx, pts); ctx.fillStyle = color; ctx.fill(); }
function circle(ctx, x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); }
function ellipse(ctx, x, y, rx, ry, rot = 0) { ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rot, 0, TAU); }
function line(ctx, x1, y1, x2, y2, color = C.ink, w = 2) {
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.strokeStyle = color; ctx.lineWidth = w; ctx.stroke();
}
// hatch inside the current path (call after building a path; consumes it)
function hatch(ctx, angle, spacing, width, color, jitter = 0, r = Math.random) {
  ctx.save(); ctx.clip();
  ctx.translate(W / 2, H / 2); ctx.rotate(angle);
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = 'round';
  const L = Math.hypot(W, H);
  for (let d = -L; d < L; d += spacing) {
    const j = jitter ? (r() - 0.5) * jitter : 0;
    ctx.beginPath(); ctx.moveTo(-L, d + j); ctx.lineTo(L, d + j); ctx.stroke();
  }
  ctx.restore();
}
// gradient hatch: density increases toward y1 within rect
function skyHatch(ctx, x, y0, w, y1, color, minGap, maxGap, r) {
  ctx.save(); ctx.beginPath(); ctx.rect(x, y0, w, y1 - y0); ctx.clip(); ctx.globalAlpha = 0.7;
  ctx.strokeStyle = color; ctx.lineWidth = 1.4; ctx.lineCap = 'round';
  let y = y0; let i = 0;
  while (y < y1) {
    const t = (y - y0) / (y1 - y0);
    const gap = lerp(minGap, maxGap, t);
    const segs = 3 + Math.floor(r() * 3);
    let sx = x - 20;
    for (let s = 0; s < segs; s++) {
      const len = (w + 40) / segs; const gapLen = len * (0.05 + r() * 0.25);
      ctx.beginPath(); ctx.moveTo(sx, y + (r() - 0.5) * 1.2); ctx.lineTo(sx + len - gapLen, y + (r() - 0.5) * 1.2); ctx.stroke();
      sx += len;
    }
    y += gap; i++;
  }
  ctx.restore();
}
function rays(ctx, cx, cy, r0, r1, n, color, width = 1.6, alpha = 0.7, r = Math.random) {
  ctx.save(); ctx.globalAlpha = alpha; ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + (r() - 0.5) * 0.02; const rr = r1 * (0.8 + r() * 0.35);
    ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); ctx.stroke();
  }
  ctx.restore();
}
function glow(ctx, x, y, r, color, alpha = 0.8) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.save(); ctx.globalAlpha = alpha; ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2); ctx.restore();
}
function stars(ctx, n, x0, y0, x1, y1, r, color = C.ink) {
  ctx.fillStyle = color;
  for (let i = 0; i < n; i++) {
    const x = lerp(x0, x1, r()), y = lerp(y0, y1, r()), s = 1.5 + r() * 3.5;
    ctx.beginPath();
    for (let k = 0; k < 8; k++) { const a = k * TAU / 8; const rr = k % 2 ? s * 0.35 : s; ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
    ctx.closePath(); ctx.fill();
  }
}
function moon(ctx, x, y, rad, color, phase = 1, ink = C.ink) {
  ctx.save(); circle(ctx, x, y, rad); ctx.fillStyle = color; ctx.fill();
  ctx.strokeStyle = ink; ctx.lineWidth = 2.5; ctx.stroke();
  // craters
  const r = rng(Math.floor(x * 31 + y));
  ctx.fillStyle = 'rgba(26,20,16,0.18)';
  for (let i = 0; i < 6; i++) { const a = r() * TAU, d = r() * rad * 0.7; circle(ctx, x + Math.cos(a) * d, y + Math.sin(a) * d, 3 + r() * rad * 0.16); ctx.fill(); }
  if (phase < 1) { // shadow crescent
    ctx.clip(); ctx.fillStyle = ink; circle(ctx, x + rad * (1 - phase) * 1.4, y, rad); ctx.fill();
  }
  ctx.restore();
}

// ---------- scenery ----------
function skyline(ctx, baseY, height, r, color = C.ink, x0 = PANEL.x, x1 = PANEL.x + PANEL.w) {
  ctx.save(); ctx.fillStyle = color;
  let x = x0 - 20;
  ctx.beginPath(); ctx.moveTo(x, baseY + 40);
  while (x < x1 + 20) {
    const w = 30 + r() * 90; const h = height * (0.25 + r() * 0.95);
    const top = baseY - h;
    ctx.lineTo(x, top);
    const kind = r();
    if (kind < 0.35) { // gabled roof (some broken)
      const broken = r() < 0.5; const peak = top - w * (0.35 + r() * 0.3);
      if (broken) { ctx.lineTo(x + w * 0.3, peak + (peak - top) * -0.3); ctx.lineTo(x + w * 0.42, top + 18); ctx.lineTo(x + w * 0.55, top - 8); ctx.lineTo(x + w, top + 12); }
      else { ctx.lineTo(x + w / 2, peak); ctx.lineTo(x + w, top); }
    } else if (kind < 0.55) { // battlements
      const n = Math.max(2, Math.floor(w / 16));
      for (let i = 0; i < n; i++) { const bx = x + (i / n) * w, bw = w / n; ctx.lineTo(bx, top - (i % 2 ? 0 : 12)); ctx.lineTo(bx + bw, top - (i % 2 ? 0 : 12)); }
    } else if (kind < 0.7) { // spire
      ctx.lineTo(x + w * 0.35, top); ctx.lineTo(x + w * 0.5, top - w * 1.4); ctx.lineTo(x + w * 0.65, top); ctx.lineTo(x + w, top);
    } else { // jagged ruin
      const n = 3 + Math.floor(r() * 4);
      for (let i = 1; i <= n; i++) ctx.lineTo(x + (i / n) * w, top + (r() - 0.3) * 40);
    }
    x += w;
  }
  ctx.lineTo(x, baseY + 40); ctx.closePath(); ctx.fill();
  // windows: a few pale slits, one lit
  ctx.restore();
}
function ground(ctx, y, r, color = C.ink) {
  const { x, w } = PANEL;
  ctx.save();
  ctx.beginPath(); ctx.moveTo(x - 10, y);
  for (let gx = x; gx <= x + w + 10; gx += 18) ctx.lineTo(gx, y + (r() - 0.5) * 6);
  ctx.lineTo(x + w + 10, PANEL.y + PANEL.h + 10); ctx.lineTo(x - 10, PANEL.y + PANEL.h + 10); ctx.closePath();
  ctx.fillStyle = color; ctx.fill();
  ctx.restore();
}
function rubble(ctx, x0, x1, y, n, r, color = C.ink, scale = 1) {
  ctx.fillStyle = color;
  for (let i = 0; i < n; i++) {
    const cx = lerp(x0, x1, r()), cy = y + (r() - 0.3) * 30 * scale, s = (8 + r() * 26) * scale;
    const pts = []; const k = 4 + Math.floor(r() * 3);
    for (let j = 0; j < k; j++) { const a = j * TAU / k + r() * 0.6; pts.push([cx + Math.cos(a) * s * (0.6 + r() * 0.6), cy + Math.sin(a) * s * 0.45]); }
    fillPoly(ctx, pts, color);
  }
}
function water(ctx, x0, x1, y0, y1, r, color = C.ink) {
  ctx.save(); ctx.strokeStyle = color; ctx.lineCap = 'round';
  for (let y = y0; y < y1; y += 10 + (y - y0) * 0.05) {
    ctx.lineWidth = 1.2 + (y - y0) / (y1 - y0) * 1.5;
    let x = x0 + r() * 40;
    while (x < x1) { const len = 30 + r() * 120; ctx.beginPath(); ctx.moveTo(x, y); ctx.bezierCurveTo(x + len / 3, y - 3, x + len * 2 / 3, y + 3, x + len, y); ctx.stroke(); x += len + 20 + r() * 60; }
  }
  ctx.restore();
}
function ripples(ctx, x, y, rx, n, color = C.ink) {
  ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = 2;
  for (let i = 1; i <= n; i++) { ellipse(ctx, x, y, rx * i / n, rx * i / n * 0.28); ctx.stroke(); }
  ctx.restore();
}
function windLines(ctx, n, r, color = C.ink, region = [PANEL.x, PANEL.y + 200, PANEL.x + PANEL.w, PANEL.y + 900]) {
  ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const x = lerp(region[0], region[2], r()), y = lerp(region[1], region[3], r()), len = 60 + r() * 220;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.bezierCurveTo(x + len * 0.3, y - 14 - r() * 10, x + len * 0.7, y + 10 + r() * 10, x + len, y - 6); ctx.stroke();
  }
  ctx.restore();
}
function ashFlakes(ctx, n, r, color = 'rgba(26,20,16,0.7)') {
  ctx.fillStyle = color;
  for (let i = 0; i < n; i++) { circle(ctx, lerp(PANEL.x, PANEL.x + PANEL.w, r()), lerp(PANEL.y, PANEL.y + PANEL.h, r()), 1 + r() * 2.5); ctx.fill(); }
}

// ---------- objects ----------
function figure(ctx, x, baseY, h, o = {}) {
  // robed silhouette. o: hood, hat, wide (hat brim), lantern, staff, flip, arms ('down'|'raised'|'out'), color
  const col = o.color || C.ink; const s = h / 100; const dir = o.flip ? -1 : 1;
  ctx.save(); ctx.translate(x, baseY); ctx.scale(dir, 1); ctx.fillStyle = col; ctx.strokeStyle = col;
  // robe
  ctx.beginPath(); ctx.moveTo(-22 * s, 0); ctx.quadraticCurveTo(-24 * s, -50 * s, -12 * s, -76 * s); ctx.lineTo(12 * s, -76 * s); ctx.quadraticCurveTo(26 * s, -50 * s, 24 * s, 0); ctx.closePath(); ctx.fill();
  // head
  const hy = -86 * s; circle(ctx, 0, hy, 10 * s); ctx.fill();
  if (o.hood) { ctx.beginPath(); ctx.moveTo(-14 * s, -74 * s); ctx.quadraticCurveTo(-16 * s, -100 * s, 0, -100 * s); ctx.quadraticCurveTo(16 * s, -100 * s, 14 * s, -74 * s); ctx.closePath(); ctx.fill(); }
  if (o.hat) { // tall crowned hat with brim
    ctx.fillRect(-9 * s, -118 * s, 18 * s, 24 * s); ctx.beginPath(); ctx.ellipse(0, -95 * s, 22 * s, 4 * s, 0, 0, TAU); ctx.fill();
  }
  // arms
  ctx.lineWidth = 6 * s; ctx.lineCap = 'round';
  if (o.arms === 'raised') { line(ctx, -10 * s, -68 * s, -22 * s, -100 * s, col, 6 * s); line(ctx, 10 * s, -68 * s, 22 * s, -100 * s, col, 6 * s); }
  else if (o.arms === 'out') { line(ctx, 10 * s, -66 * s, 34 * s, -60 * s, col, 6 * s); }
  if (o.lantern) { // arm out holding lantern
    line(ctx, 10 * s, -66 * s, 36 * s, -70 * s, col, 6 * s);
    lantern(ctx, 38 * s, -66 * s, 16 * s, o.lantern === true ? C.candle : o.lantern);
  }
  if (o.staff) { line(ctx, -26 * s, 4 * s, -26 * s, -120 * s, col, 4 * s); }
  ctx.restore();
}
function lantern(ctx, x, y, s, flame = C.candle) {
  ctx.save();
  glow(ctx, x, y + s * 0.8, s * 4, flame, 0.55);
  ctx.fillStyle = C.ink;
  ctx.fillRect(x - s * 0.5, y - s * 0.2, s, s * 0.25); // top cap
  ctx.beginPath(); ctx.moveTo(x - s * 0.7, y); ctx.lineTo(x + s * 0.7, y); ctx.lineTo(x + s * 0.55, y + s * 1.8); ctx.lineTo(x - s * 0.55, y + s * 1.8); ctx.closePath();
  ctx.strokeStyle = C.ink; ctx.lineWidth = s * 0.16; ctx.stroke();
  ctx.fillStyle = flame; ctx.fill();
  line(ctx, x, y, x, y + s * 1.8, C.ink, s * 0.1);
  circle(ctx, x, y - s * 0.4, s * 0.2); ctx.strokeStyle = C.ink; ctx.lineWidth = s * 0.12; ctx.stroke();
  ctx.restore();
}
function flame(ctx, x, y, s, color = C.candle) {
  glow(ctx, x, y - s * 0.6, s * 3, color, 0.5);
  ctx.save(); ctx.fillStyle = color;
  ctx.beginPath(); ctx.moveTo(x, y); ctx.bezierCurveTo(x - s * 0.7, y - s * 0.6, x - s * 0.5, y - s * 1.6, x, y - s * 2.2);
  ctx.bezierCurveTo(x + s * 0.5, y - s * 1.6, x + s * 0.7, y - s * 0.6, x, y); ctx.fill();
  ctx.fillStyle = '#FFF0C0'; ctx.beginPath(); ctx.moveTo(x, y); ctx.bezierCurveTo(x - s * 0.3, y - s * 0.4, x - s * 0.2, y - s * 0.9, x, y - s * 1.2);
  ctx.bezierCurveTo(x + s * 0.2, y - s * 0.9, x + s * 0.3, y - s * 0.4, x, y); ctx.fill();
  ctx.restore();
}
function candle(ctx, x, y, w, h, lit = true, flameColor = C.candle, wax = C.bone) {
  ctx.save();
  ctx.fillStyle = wax; ctx.fillRect(x - w / 2, y - h, w, h);
  ctx.strokeStyle = C.ink; ctx.lineWidth = 2.5; ctx.strokeRect(x - w / 2, y - h, w, h);
  // drips
  ctx.fillStyle = wax; ctx.beginPath(); ctx.moveTo(x - w / 2 + 2, y - h + 2); ctx.lineTo(x - w / 2 - 6, y - h + 20); ctx.quadraticCurveTo(x - w / 2 - 10, y - h + 34, x - w / 2 - 2, y - h + 34); ctx.lineTo(x - w / 2 + 2, y - h + 14); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x + w / 2 - 2, y - h); ctx.lineTo(x + w / 2 + 5, y - h + 28); ctx.quadraticCurveTo(x + w / 2 + 9, y - h + 44, x + w / 2 + 1, y - h + 40); ctx.fill(); ctx.stroke();
  // shading hatch
  ctx.beginPath(); ctx.rect(x + w * 0.15, y - h, w * 0.35, h); hatch(ctx, 0.2, 5, 1, 'rgba(26,20,16,0.5)');
  line(ctx, x, y - h, x, y - h - 10, C.ink, 3);
  if (lit) flame(ctx, x, y - h - 8, w * 0.6, flameColor);
  else { ctx.strokeStyle = 'rgba(26,20,16,0.5)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x, y - h - 12); ctx.bezierCurveTo(x + 8, y - h - 30, x - 8, y - h - 40, x + 4, y - h - 60); ctx.stroke(); }
  ctx.restore();
}
function bell(ctx, x, y, s, o = {}) { // y = lip centre
  const col = o.color || C.ink;
  ctx.save(); ctx.fillStyle = col; ctx.strokeStyle = col;
  ctx.beginPath(); ctx.moveTo(-0.62 * s + x, y);
  ctx.bezierCurveTo(x - 0.62 * s, y - 0.25 * s, x - 0.34 * s, y - 0.5 * s, x - 0.34 * s, y - 0.95 * s);
  ctx.quadraticCurveTo(x - 0.34 * s, y - 1.25 * s, x, y - 1.28 * s);
  ctx.quadraticCurveTo(x + 0.34 * s, y - 1.25 * s, x + 0.34 * s, y - 0.95 * s);
  ctx.bezierCurveTo(x + 0.34 * s, y - 0.5 * s, x + 0.62 * s, y - 0.25 * s, x + 0.62 * s, y);
  ctx.quadraticCurveTo(x + 0.66 * s, y + 0.1 * s, x, y + 0.12 * s); ctx.quadraticCurveTo(x - 0.66 * s, y + 0.1 * s, x - 0.62 * s, y); ctx.closePath(); ctx.fill();
  // crown loop
  ctx.lineWidth = s * 0.08; circle(ctx, x, y - 1.36 * s, s * 0.1); ctx.stroke();
  // highlight hatch (parchment lines)
  ctx.beginPath(); ctx.moveTo(x - 0.28 * s, y - 0.9 * s); ctx.quadraticCurveTo(x - 0.4 * s, y - 0.4 * s, x - 0.5 * s, y - 0.05 * s); ctx.lineTo(x - 0.36 * s, y - 0.05 * s); ctx.quadraticCurveTo(x - 0.26 * s, y - 0.4 * s, x - 0.16 * s, y - 0.9 * s); ctx.closePath();
  hatch(ctx, 1.2, 6, 1.4, o.hi || C.parch);
  // bands
  line(ctx, x - 0.5 * s, y - 0.18 * s, x + 0.5 * s, y - 0.18 * s, o.hi || C.parch, 1.6);
  line(ctx, x - 0.33 * s, y - 0.85 * s, x + 0.33 * s, y - 0.85 * s, o.hi || C.parch, 1.4);
  if (o.crack) { ctx.strokeStyle = o.hi || C.parch; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x + 0.1 * s, y + 0.08 * s); ctx.lineTo(x + 0.02 * s, y - 0.25 * s); ctx.lineTo(x + 0.14 * s, y - 0.4 * s); ctx.lineTo(x + 0.04 * s, y - 0.7 * s); ctx.stroke(); }
  // clapper
  if (!o.noClapper) { circle(ctx, x, y + 0.06 * s, s * 0.08); ctx.fillStyle = col; ctx.fill(); }
  ctx.restore();
}
function rope(ctx, pts, w = 5, color = C.blood) {
  ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = w; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); ctx.stroke();
  ctx.strokeStyle = 'rgba(26,20,16,0.55)'; ctx.lineWidth = 1.2; ctx.setLineDash([4, 6]); ctx.stroke();
  ctx.restore();
}
function skull(ctx, x, y, s, color = C.bone, ink = C.ink) {
  ctx.save(); ctx.fillStyle = color; ctx.strokeStyle = ink; ctx.lineWidth = s * 0.06;
  ctx.beginPath(); ctx.arc(x, y - s * 0.12, s * 0.5, Math.PI * 0.9, Math.PI * 2.1);
  ctx.lineTo(x + s * 0.34, y + s * 0.28); ctx.lineTo(x + s * 0.24, y + s * 0.5); ctx.lineTo(x - s * 0.24, y + s * 0.5); ctx.lineTo(x - s * 0.34, y + s * 0.28); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = ink;
  ellipse(ctx, x - s * 0.19, y - s * 0.02, s * 0.13, s * 0.15, 0.2); ctx.fill();
  ellipse(ctx, x + s * 0.19, y - s * 0.02, s * 0.13, s * 0.15, -0.2); ctx.fill();
  ctx.beginPath(); ctx.moveTo(x, y + s * 0.12); ctx.lineTo(x - s * 0.06, y + s * 0.26); ctx.lineTo(x + s * 0.06, y + s * 0.26); ctx.closePath(); ctx.fill();
  for (let i = -2; i <= 2; i++) line(ctx, x + i * s * 0.09, y + s * 0.34, x + i * s * 0.09, y + s * 0.5, ink, s * 0.04);
  ctx.restore();
}
function crow(ctx, x, y, s, flip = false, color = C.ink) {
  ctx.save(); ctx.translate(x, y); ctx.scale(flip ? -1 : 1, 1); ctx.fillStyle = color;
  ctx.beginPath(); ctx.moveTo(-0.5 * s, 0.1 * s); ctx.quadraticCurveTo(-0.2 * s, -0.35 * s, 0.25 * s, -0.3 * s); // back to head
  ctx.lineTo(0.45 * s, -0.38 * s); ctx.lineTo(0.75 * s, -0.28 * s); ctx.lineTo(0.42 * s, -0.22 * s); // beak
  ctx.quadraticCurveTo(0.35 * s, 0.05 * s, 0.05 * s, 0.15 * s); ctx.lineTo(-0.7 * s, 0.35 * s); ctx.lineTo(-0.55 * s, 0.2 * s); ctx.closePath(); ctx.fill();
  // legs
  line(ctx, 0.05 * s, 0.15 * s, 0.05 * s, 0.35 * s, color, s * 0.05); line(ctx, -0.1 * s, 0.17 * s, -0.12 * s, 0.35 * s, color, s * 0.05);
  ctx.restore();
}
function crowFlying(ctx, x, y, s, color = C.ink) {
  ctx.save(); ctx.fillStyle = color; ctx.beginPath();
  ctx.moveTo(x - s, y - s * 0.3); ctx.quadraticCurveTo(x - s * 0.4, y - s * 0.1, x, y + s * 0.1); ctx.quadraticCurveTo(x + s * 0.4, y - s * 0.1, x + s, y - s * 0.3);
  ctx.quadraticCurveTo(x + s * 0.5, y - s * 0.05, x, y + s * 0.25); ctx.quadraticCurveTo(x - s * 0.5, y - s * 0.05, x - s, y - s * 0.3); ctx.fill(); ctx.restore();
}
function coin(ctx, x, y, r, color = C.candle) {
  ctx.save(); circle(ctx, x, y, r); ctx.fillStyle = color; ctx.fill(); ctx.strokeStyle = C.ink; ctx.lineWidth = r * 0.16; ctx.stroke();
  circle(ctx, x, y, r * 0.62); ctx.stroke(); ctx.restore();
}
function shard(ctx, x, y, s, rot = 0, glowIt = true) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
  if (glowIt) glow(ctx, 0, 0, s * 3.2, C.wyrd, 0.75);
  ctx.fillStyle = C.wyrd; ctx.strokeStyle = C.ink; ctx.lineWidth = s * 0.09; ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.moveTo(0, -s); ctx.lineTo(s * 0.45, -s * 0.3); ctx.lineTo(s * 0.3, s * 0.9); ctx.lineTo(-s * 0.32, s * 0.85); ctx.lineTo(-s * 0.5, -s * 0.25); ctx.closePath(); ctx.fill(); ctx.stroke();
  line(ctx, 0, -s, -s * 0.1, s * 0.85, 'rgba(26,20,16,0.6)', s * 0.06); line(ctx, s * 0.45, -s * 0.3, -s * 0.1, s * 0.05, 'rgba(26,20,16,0.5)', s * 0.05);
  line(ctx, -s * 0.3, -s * 0.5, -s * 0.22, s * 0.3, '#DDFFE0', s * 0.07);
  ctx.restore();
}
function crown(ctx, x, y, s, color = C.candle, ink = C.ink) {
  ctx.save(); ctx.fillStyle = color; ctx.strokeStyle = ink; ctx.lineWidth = s * 0.06; ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.moveTo(x - s * 0.5, y); ctx.lineTo(x - s * 0.55, y - s * 0.55); ctx.lineTo(x - s * 0.3, y - s * 0.3); ctx.lineTo(x - s * 0.12, y - s * 0.7);
  ctx.lineTo(x, y - s * 0.38); ctx.lineTo(x + s * 0.12, y - s * 0.7); ctx.lineTo(x + s * 0.3, y - s * 0.3); ctx.lineTo(x + s * 0.55, y - s * 0.55); ctx.lineTo(x + s * 0.5, y); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = C.blood; [-0.55, -0.12, 0.12, 0.55].forEach(k => { circle(ctx, x + s * k, y - s * (Math.abs(k) > 0.3 ? 0.58 : 0.72), s * 0.05); ctx.fill(); ctx.stroke(); });
  ctx.restore();
}
function rat(ctx, x, y, s, flip = false, color = C.ink) {
  ctx.save(); ctx.translate(x, y); ctx.scale(flip ? -1 : 1, 1); ctx.fillStyle = color; ctx.strokeStyle = color;
  ellipse(ctx, 0, 0, s * 0.55, s * 0.3); ctx.fill();
  ellipse(ctx, s * 0.6, -s * 0.05, s * 0.3, s * 0.2, -0.2); ctx.fill(); // head
  ctx.beginPath(); ctx.moveTo(s * 0.8, -s * 0.1); ctx.lineTo(s * 1.02, s * 0.02); ctx.lineTo(s * 0.8, s * 0.1); ctx.fill(); // snout
  circle(ctx, s * 0.55, -s * 0.24, s * 0.09); ctx.fill(); circle(ctx, s * 0.68, -s * 0.24, s * 0.08); ctx.fill(); // ears
  ctx.lineWidth = s * 0.06; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(-s * 0.5, 0.05 * s); ctx.bezierCurveTo(-s * 0.9, -s * 0.2, -s * 1.1, s * 0.3, -s * 1.4, s * 0.05); ctx.stroke(); // tail
  ctx.lineWidth = s * 0.05; [[0.35, 0.1], [-0.25, 0.1]].forEach(([px]) => { line(ctx, px * s, s * 0.25, px * s - s * 0.05, s * 0.42, color, s * 0.05); line(ctx, px * s + s * 0.12, s * 0.25, px * s + s * 0.16, s * 0.42, color, s * 0.05); });
  ctx.fillStyle = C.blood; circle(ctx, s * 0.66, -s * 0.06, s * 0.035); ctx.fill(); // eye
  ctx.restore();
}
function hammer(ctx, x, y, s, angle = 0, color = C.ink) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(angle); ctx.fillStyle = color; ctx.strokeStyle = color;
  // handle
  ctx.lineWidth = s * 0.11; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(0, -s * 0.15); ctx.lineTo(0, s * 1.1); ctx.stroke();
  // wrapping
  for (let i = 0; i < 6; i++) line(ctx, -s * 0.06, s * (0.55 + i * 0.07), s * 0.06, s * (0.6 + i * 0.07), C.parch, 1.3);
  // head
  ctx.beginPath(); ctx.moveTo(-s * 0.55, -s * 0.42); ctx.lineTo(s * 0.55, -s * 0.42); ctx.lineTo(s * 0.5, -s * 0.05); ctx.lineTo(-s * 0.5, -s * 0.05); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.rect(-s * 0.55, -s * 0.42, s * 0.25, s * 0.37); hatch(ctx, 0.9, 5, 1.2, C.parch);
  // twin-tailed comet mark on head
  ctx.strokeStyle = C.parch; ctx.lineWidth = 1.8; circle(ctx, s * 0.12, -s * 0.24, s * 0.06); ctx.stroke();
  ctx.restore();
}
function gallows(ctx, x, y, s, color = C.ink) { // x = post base, y = ground
  ctx.save(); ctx.fillStyle = color;
  ctx.fillRect(x - s * 0.07, y - s * 1.6, s * 0.14, s * 1.6);
  ctx.fillRect(x - s * 0.07, y - s * 1.6, s * 0.95, s * 0.12);
  ctx.beginPath(); ctx.moveTo(x + s * 0.07, y - s * 1.1); ctx.lineTo(x + s * 0.55, y - s * 1.48); ctx.lineTo(x + s * 0.55, y - s * 1.4); ctx.lineTo(x + s * 0.07, y - s * 1.0); ctx.closePath(); ctx.fill();
  // base
  ctx.beginPath(); ctx.moveTo(x - s * 0.35, y); ctx.lineTo(x - s * 0.07, y - s * 0.2); ctx.lineTo(x + s * 0.07, y - s * 0.2); ctx.lineTo(x + s * 0.35, y); ctx.closePath(); ctx.fill();
  ctx.restore();
}
function scales(ctx, x, y, s, color = C.ink) { // y = base
  ctx.save(); ctx.fillStyle = color; ctx.strokeStyle = color; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x - s * 0.3, y); ctx.lineTo(x + s * 0.3, y); ctx.lineTo(x + s * 0.06, y - s * 0.12); ctx.lineTo(x - s * 0.06, y - s * 0.12); ctx.fill();
  ctx.fillRect(x - s * 0.035, y - s * 1.3, s * 0.07, s * 1.2);
  // beam (tilted)
  ctx.save(); ctx.translate(x, y - s * 1.3); ctx.rotate(-0.12);
  ctx.lineWidth = s * 0.06; ctx.beginPath(); ctx.moveTo(-s * 0.7, 0); ctx.lineTo(s * 0.7, 0); ctx.stroke();
  ctx.lineWidth = s * 0.02;
  [-0.7, 0.7].forEach(k => {
    const px = k * s, py = s * 0.55;
    [-0.18, 0.18].forEach(d => line(ctx, px, 0, px + d * s, py, color, s * 0.02));
    ctx.beginPath(); ctx.moveTo(px - s * 0.24, py); ctx.quadraticCurveTo(px, py + s * 0.24, px + s * 0.24, py); ctx.closePath(); ctx.fill();
  });
  ctx.restore(); ctx.restore();
}
function die(ctx, x, y, s, rot, pips, color = C.bone, ink = C.ink) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.fillStyle = color; ctx.strokeStyle = ink; ctx.lineWidth = s * 0.07; ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.roundRect(-s / 2, -s / 2, s, s, s * 0.14); ctx.fill(); ctx.stroke();
  ctx.fillStyle = ink; const p = s * 0.26;
  const layout = { 1: [[0, 0]], 2: [[-p, -p], [p, p]], 3: [[-p, -p], [0, 0], [p, p]], 4: [[-p, -p], [p, -p], [-p, p], [p, p]], 5: [[-p, -p], [p, -p], [0, 0], [-p, p], [p, p]], 6: [[-p, -p], [p, -p], [-p, 0], [p, 0], [-p, p], [p, p]] }[pips];
  layout.forEach(([px, py]) => { circle(ctx, px, py, s * 0.08); ctx.fill(); });
  ctx.restore();
}
function door(ctx, x, y, w, h, color = C.ink) { // arched door, x,y = top-left of rect (arch above)
  ctx.save(); ctx.fillStyle = color; ctx.strokeStyle = color;
  ctx.beginPath(); ctx.moveTo(x, y + h); ctx.lineTo(x, y + w / 2); ctx.arc(x + w / 2, y + w / 2, w / 2, Math.PI, 0); ctx.lineTo(x + w, y + h); ctx.closePath(); ctx.fill();
  // planks
  for (let i = 1; i < 5; i++) line(ctx, x + (i / 5) * w, y + 8, x + (i / 5) * w, y + h, C.parch, 1.4);
  // straps
  [0.35, 0.7].forEach(k => line(ctx, x + 6, y + h * k, x + w - 6, y + h * k, C.parch, 2.2));
  ctx.restore();
}
function chain(ctx, x1, y1, x2, y2, link = 14, color = C.ink) {
  const n = Math.max(2, Math.round(Math.hypot(x2 - x1, y2 - y1) / link)); const a = Math.atan2(y2 - y1, x2 - x1);
  ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = link * 0.2;
  for (let i = 0; i < n; i++) { const t = (i + 0.5) / n; const x = lerp(x1, x2, t), y = lerp(y1, y2, t); ellipse(ctx, x, y, link * 0.55, link * 0.3, a); ctx.stroke(); }
  ctx.restore();
}
function hourglass(ctx, x, y, s, cracked = false, color = C.ink) { // centre
  ctx.save(); ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = s * 0.06;
  // frame plates and pillars
  ctx.fillRect(x - s * 0.55, y - s * 1.05, s * 1.1, s * 0.1); ctx.fillRect(x - s * 0.55, y + s * 0.95, s * 1.1, s * 0.1);
  [-0.5, 0.5].forEach(k => ctx.fillRect(x + k * s - s * 0.03, y - s, s * 0.06, s * 2));
  // glass
  ctx.beginPath(); ctx.moveTo(x - s * 0.4, y - s * 0.95); ctx.lineTo(x + s * 0.4, y - s * 0.95); ctx.bezierCurveTo(x + s * 0.4, y - s * 0.3, x + s * 0.05, y - s * 0.1, x + s * 0.05, y);
  ctx.bezierCurveTo(x + s * 0.05, y + s * 0.1, x + s * 0.4, y + s * 0.3, x + s * 0.4, y + s * 0.95); ctx.lineTo(x - s * 0.4, y + s * 0.95);
  ctx.bezierCurveTo(x - s * 0.4, y + s * 0.3, x - s * 0.05, y + s * 0.1, x - s * 0.05, y); ctx.bezierCurveTo(x - s * 0.05, y - s * 0.1, x - s * 0.4, y - s * 0.3, x - s * 0.4, y - s * 0.95); ctx.closePath();
  ctx.fillStyle = 'rgba(217,205,184,0.35)'; ctx.fill(); ctx.stroke();
  // sand
  ctx.fillStyle = C.candle;
  ctx.beginPath(); ctx.moveTo(x - s * 0.32, y - s * 0.55); ctx.lineTo(x + s * 0.32, y - s * 0.55); ctx.bezierCurveTo(x + s * 0.3, y - s * 0.3, x + s * 0.05, y - s * 0.1, x + s * 0.03, y - s * 0.02);
  ctx.lineTo(x - s * 0.03, y - s * 0.02); ctx.bezierCurveTo(x - s * 0.05, y - s * 0.1, x - s * 0.3, y - s * 0.3, x - s * 0.32, y - s * 0.55); ctx.fill();
  ctx.beginPath(); ctx.moveTo(x - s * 0.4, y + s * 0.95); ctx.lineTo(x + s * 0.4, y + s * 0.95); ctx.lineTo(x + s * 0.36, y + s * 0.75); ctx.quadraticCurveTo(x, y + s * 0.3, x - s * 0.36, y + s * 0.75); ctx.fill();
  line(ctx, x, y - s * 0.02, x, y + s * 0.5, C.candle, s * 0.03);
  if (cracked) { ctx.strokeStyle = color; ctx.lineWidth = s * 0.035; ctx.beginPath(); ctx.moveTo(x + s * 0.4, y + s * 0.5); ctx.lineTo(x + s * 0.3, y + s * 0.62); ctx.lineTo(x + s * 0.36, y + s * 0.72); ctx.lineTo(x + s * 0.25, y + s * 0.85); ctx.stroke();
    ctx.fillStyle = C.candle; for (let i = 0; i < 14; i++) { circle(ctx, x + s * (0.32 + i * 0.03), y + s * (0.6 + i * 0.1 + (i % 2) * 0.04), s * 0.02); ctx.fill(); } }
  ctx.restore();
}
function boat(ctx, x, y, s, color = C.ink) { // x,y = waterline centre
  ctx.save(); ctx.fillStyle = color;
  ctx.beginPath(); ctx.moveTo(x - s, y - s * 0.22); ctx.quadraticCurveTo(x - s * 0.8, y + s * 0.15, x - s * 0.5, y + s * 0.18); ctx.lineTo(x + s * 0.55, y + s * 0.18);
  ctx.quadraticCurveTo(x + s * 0.95, y + s * 0.1, x + s * 1.1, y - s * 0.35); ctx.lineTo(x + s * 0.9, y - s * 0.1); ctx.lineTo(x - s * 0.85, y - s * 0.1); ctx.closePath(); ctx.fill();
  ctx.restore();
}
function tower(ctx, x, baseY, w, h, o = {}, color = C.ink) {
  ctx.save(); ctx.fillStyle = color;
  ctx.beginPath(); ctx.moveTo(x - w / 2 - w * 0.06, baseY); ctx.lineTo(x - w / 2, baseY - h); ctx.lineTo(x + w / 2, baseY - h); ctx.lineTo(x + w / 2 + w * 0.06, baseY); ctx.closePath(); ctx.fill();
  const n = 5; for (let i = 0; i < n; i++) if (i % 2 === 0) ctx.fillRect(x - w / 2 + (i / n) * w, baseY - h - w * 0.14, w / n, w * 0.15);
  if (o.broken) { ctx.fillStyle = C.parch; ctx.beginPath(); ctx.moveTo(x + w * 0.1, baseY - h - w * 0.2); ctx.lineTo(x + w * 0.5 + 2, baseY - h - w * 0.2); ctx.lineTo(x + w * 0.5 + 2, baseY - h * 0.7); ctx.lineTo(x + w * 0.3, baseY - h * 0.8); ctx.closePath(); ctx.fill(); }
  // windows
  ctx.fillStyle = o.lit || C.parch;
  for (let i = 0; i < 3; i++) { const wy = baseY - h * (0.3 + i * 0.22); ctx.beginPath(); ctx.moveTo(x - w * 0.07, wy + w * 0.14); ctx.lineTo(x - w * 0.07, wy); ctx.arc(x, wy, w * 0.07, Math.PI, 0); ctx.lineTo(x + w * 0.07, wy + w * 0.14); ctx.fill(); }
  ctx.restore();
}
function comet(ctx, x, y, s, angle, color = C.candle, tint = null) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(angle);
  glow(ctx, 0, 0, s * 3.5, tint || color, 0.7);
  // two tails
  ctx.fillStyle = color; ctx.globalAlpha = 0.9;
  [[-0.35, 1], [0.35, 0.85]].forEach(([spread, len]) => {
    ctx.beginPath(); ctx.moveTo(0, -s * 0.5); ctx.quadraticCurveTo(spread * s * 2.5, -s * 4 * len * 0.5, spread * s * 5, -s * 9 * len); ctx.quadraticCurveTo(spread * s * 1.6, -s * 5 * len, 0, s * 0.5); ctx.closePath(); ctx.fill();
  });
  ctx.globalAlpha = 1;
  // tail streak hatch
  ctx.strokeStyle = 'rgba(26,20,16,0.35)'; ctx.lineWidth = 1.2;
  for (let i = 0; i < 12; i++) { const k = (i / 12 - 0.5); ctx.beginPath(); ctx.moveTo(k * s * 0.6, -s * 0.5); ctx.quadraticCurveTo(k * s * 3.5, -s * 3.5, k * s * 5.5, -s * 7.5); ctx.stroke(); }
  circle(ctx, 0, 0, s); ctx.fillStyle = color; ctx.fill(); ctx.strokeStyle = C.ink; ctx.lineWidth = s * 0.14; ctx.stroke();
  circle(ctx, -s * 0.25, -s * 0.25, s * 0.3); ctx.fillStyle = '#FFF2CC'; ctx.fill();
  ctx.restore();
}
function boneHand(ctx, x, y, s, color = C.bone, ink = C.ink) { // palm centre, fingers up
  ctx.save(); ctx.fillStyle = color; ctx.strokeStyle = ink; ctx.lineWidth = s * 0.05; ctx.lineCap = 'round';
  // wrist bones
  [-0.22, 0.22].forEach(k => { ctx.beginPath(); ctx.roundRect(x + k * s - s * 0.12, y + s * 0.45, s * 0.24, s * 0.7, s * 0.1); ctx.fill(); ctx.stroke(); });
  // palm (carpals / metacarpals)
  for (let i = 0; i < 4; i++) { const fx = x + (i - 1.5) * s * 0.28; ctx.beginPath(); ctx.roundRect(fx - s * 0.09, y - s * 0.4, s * 0.18, s * 0.85, s * 0.08); ctx.fill(); ctx.stroke(); }
  // fingers: segments
  const fingers = [[-1.5, 0.75, -0.25], [-0.5, 0.95, -0.1], [0.5, 0.9, 0.1], [1.5, 0.7, 0.25]];
  fingers.forEach(([k, len, spread]) => {
    let fx = x + k * s * 0.28, fy = y - s * 0.42; const a = -Math.PI / 2 + spread;
    [0.42, 0.34, 0.26].forEach(seg => {
      const L = seg * len * s * 1.3; const nx = fx + Math.cos(a) * L, ny = fy + Math.sin(a) * L;
      ctx.save(); ctx.translate((fx + nx) / 2, (fy + ny) / 2); ctx.rotate(a + Math.PI / 2); ctx.beginPath(); ctx.roundRect(-s * 0.08, -L / 2, s * 0.16, L, s * 0.07); ctx.fill(); ctx.stroke(); ctx.restore();
      fx = nx; fy = ny;
    });
  });
  // thumb
  let tx = x + s * 0.55, ty = y + s * 0.1; const ta = -Math.PI / 4;
  [0.5, 0.4].forEach(seg => { const L = seg * s; const nx = tx + Math.cos(ta) * L, ny = ty + Math.sin(ta) * L; ctx.save(); ctx.translate((tx + nx) / 2, (ty + ny) / 2); ctx.rotate(ta + Math.PI / 2); ctx.beginPath(); ctx.roundRect(-s * 0.09, -L / 2, s * 0.18, L, s * 0.07); ctx.fill(); ctx.stroke(); ctx.restore(); tx = nx; ty = ny; });
  ctx.restore();
}
function gravestone(ctx, x, y, w, h, color = C.ink) {
  ctx.save(); ctx.fillStyle = color;
  ctx.beginPath(); ctx.moveTo(x - w / 2, y); ctx.lineTo(x - w / 2, y - h + w / 2); ctx.arc(x, y - h + w / 2, w / 2, Math.PI, 0); ctx.lineTo(x + w / 2, y); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(x - w / 2 + 10, y - 10); ctx.lineTo(x - w / 2 + 10, y - h + w / 2); ctx.arc(x, y - h + w / 2, w / 2 - 10, Math.PI, 0); ctx.lineTo(x + w / 2 - 10, y - 10); ctx.closePath();
  ctx.strokeStyle = C.parch; ctx.lineWidth = 1.6; ctx.stroke();
  ctx.restore();
}
function ship(ctx, x, y, s, color = C.ink) { // waterline centre
  ctx.save(); ctx.fillStyle = color; ctx.strokeStyle = color;
  ctx.beginPath(); ctx.moveTo(x - s * 1.1, y - s * 0.35); ctx.quadraticCurveTo(x - s * 0.9, y + s * 0.2, x - s * 0.5, y + s * 0.22); ctx.lineTo(x + s * 0.7, y + s * 0.22); ctx.quadraticCurveTo(x + s * 1.05, y + s * 0.15, x + s * 1.2, y - s * 0.45);
  ctx.lineTo(x + s * 1.0, y - s * 0.2); ctx.lineTo(x - s * 0.95, y - s * 0.15); ctx.closePath(); ctx.fill();
  // masts
  ctx.lineWidth = s * 0.05; [[-0.35, 1.9], [0.35, 1.6]].forEach(([k, hh]) => {
    const mx = x + k * s; line(ctx, mx, y - s * 0.15, mx, y - s * hh, color, s * 0.05);
    // sails (black)
    [[0.35, 0.55], [0.75, 0.42]].forEach(([top, hgt]) => { const ty = y - s * hh * (1 - top) ; ctx.beginPath(); ctx.moveTo(mx - s * 0.36, ty - s * hgt * 0.5); ctx.lineTo(mx + s * 0.36, ty - s * hgt * 0.5); ctx.quadraticCurveTo(mx + s * 0.42, ty, mx + s * 0.32, ty + s * hgt * 0.5); ctx.lineTo(mx - s * 0.32, ty + s * hgt * 0.5); ctx.quadraticCurveTo(mx - s * 0.42, ty, mx - s * 0.36, ty - s * hgt * 0.5); ctx.fill(); });
  });
  // rigging
  ctx.lineWidth = 1.2; line(ctx, x - s * 0.35, y - s * 1.9, x + s * 1.15, y - s * 0.4, color, 1.2); line(ctx, x - s * 0.35, y - s * 1.9, x - s * 1.05, y - s * 0.3, color, 1.2); line(ctx, x + s * 0.35, y - s * 1.6, x - s * 0.35, y - s * 1.9, color, 1.2);
  ctx.restore();
}
function eye(ctx, x, y, w, color = C.ink) {
  ctx.save(); ctx.fillStyle = color; ctx.strokeStyle = color; ctx.lineWidth = w * 0.06;
  ctx.beginPath(); ctx.moveTo(x - w / 2, y); ctx.quadraticCurveTo(x, y - w * 0.42, x + w / 2, y); ctx.quadraticCurveTo(x, y + w * 0.42, x - w / 2, y); ctx.closePath(); ctx.stroke();
  circle(ctx, x, y, w * 0.17); ctx.fill(); circle(ctx, x, y, w * 0.07); ctx.fillStyle = C.parch; ctx.fill();
  ctx.restore();
}

// ---------- text ----------
function fitText(ctx, text, maxW, font, minPx, maxPx) {
  for (let px = maxPx; px >= minPx; px -= 1) { ctx.font = font.replace('{px}', px); if (ctx.measureText(text).width <= maxW) return px; }
  return minPx;
}
function wrap(ctx, text, maxW) {
  const words = text.split(' '); const lines = []; let cur = '';
  words.forEach(w => { const t = cur ? cur + ' ' + w : w; if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t; });
  if (cur) lines.push(cur); return lines;
}
function textGlow(ctx, text, x, y, color, blur) { ctx.save(); ctx.shadowColor = color; ctx.shadowBlur = blur; ctx.fillStyle = color; ctx.fillText(text, x, y); ctx.restore(); }

// ---------- ornaments ----------
function fleuron(ctx, x, y, s, color = C.gold, rot = 0) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = s * 0.08; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.bezierCurveTo(s * 0.1, -s * 0.6, s * 0.7, -s * 0.5, s, -s); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.bezierCurveTo(-s * 0.1, -s * 0.6, -s * 0.7, -s * 0.5, -s, -s); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -s * 0.9); ctx.stroke();
  [[s, -s], [-s, -s]].forEach(([px, py]) => { circle(ctx, px, py, s * 0.12); ctx.fill(); });
  ctx.beginPath(); ctx.moveTo(0, -s * 0.9); ctx.lineTo(-s * 0.12, -s * 1.1); ctx.lineTo(0, -s * 1.4); ctx.lineTo(s * 0.12, -s * 1.1); ctx.closePath(); ctx.fill();
  ctx.restore();
}
function cornerOrnament(ctx, x, y, s, color, rot) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 2; ctx.lineCap = 'round';
  // L-bracket with scrolls
  ctx.beginPath(); ctx.moveTo(0, s); ctx.lineTo(0, 0); ctx.lineTo(s, 0); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(s * 0.35, 0); ctx.bezierCurveTo(s * 0.35, s * 0.35, s * 0.7, s * 0.35, s * 0.7, s * 0.12); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, s * 0.35); ctx.bezierCurveTo(s * 0.35, s * 0.35, s * 0.35, s * 0.7, s * 0.12, s * 0.7); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(s * 0.12, s * 0.12); ctx.lineTo(s * 0.32, s * 0.2); ctx.lineTo(s * 0.4, s * 0.4); ctx.lineTo(s * 0.2, s * 0.32); ctx.closePath(); ctx.fill();
  circle(ctx, s * 0.7, s * 0.12, 2.6); ctx.fill(); circle(ctx, s * 0.12, s * 0.7, 2.6); ctx.fill();
  ctx.restore();
}
function tinySkull(ctx, x, y, s, color) {
  ctx.save(); ctx.fillStyle = color; circle(ctx, x, y - s * 0.1, s * 0.5); ctx.fill(); ctx.fillRect(x - s * 0.3, y + s * 0.1, s * 0.6, s * 0.35);
  ctx.fillStyle = C.soot; circle(ctx, x - s * 0.18, y - s * 0.08, s * 0.13); ctx.fill(); circle(ctx, x + s * 0.18, y - s * 0.08, s * 0.13); ctx.fill();
  for (let i = -1; i <= 1; i++) ctx.fillRect(x + i * s * 0.18 - 1, y + s * 0.2, 2, s * 0.22);
  ctx.restore();
}
