// Card front composition: soot ground, gold frame, parchment window, title band. Tilts are shown by the app, not on the card.
'use strict';
const ERRAND_LABEL = { scavenge: 'Scavenge', carouse: 'Carouse', train: 'Train', spy: 'Spy', pray: 'Pray', trade: 'Trade' };

function drawSootGround(ctx, seed) {
  ctx.fillStyle = C.soot; ctx.fillRect(0, 0, W, H);
  const g = ctx.createRadialGradient(W / 2, H * 0.45, 100, W / 2, H / 2, H * 0.75);
  g.addColorStop(0, 'rgba(42,39,36,0.55)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  mottle(ctx, 0, 0, W, H, seed + 11, 0.35);
}
function drawFrame(ctx) {
  ctx.save();
  // outer double border
  ctx.strokeStyle = C.gold; ctx.lineWidth = 3; ctx.strokeRect(40, 40, W - 80, H - 80);
  ctx.lineWidth = 1.2; ctx.strokeStyle = C.goldPale; ctx.strokeRect(52, 52, W - 104, H - 104);
  // corner ornaments
  const s = 62;
  cornerOrnament(ctx, 66, 66, s, C.gold, 0);
  cornerOrnament(ctx, W - 66, 66, s, C.gold, Math.PI / 2);
  cornerOrnament(ctx, W - 66, H - 66, s, C.gold, Math.PI);
  cornerOrnament(ctx, 66, H - 66, s, C.gold, -Math.PI / 2);
  // side rules midpoints: small lozenges
  ctx.fillStyle = C.gold;
  [[46, H / 2], [W - 46, H / 2]].forEach(([x, y]) => { ctx.beginPath(); ctx.moveTo(x, y - 14); ctx.lineTo(x + 6, y); ctx.lineTo(x, y + 14); ctx.lineTo(x - 6, y); ctx.closePath(); ctx.fill(); });
  ctx.restore();
}
function drawParchment(ctx, seed) {
  ctx.save();
  // ink-bleed shadow behind window
  ctx.save(); panelPath(ctx, -4); ctx.shadowColor = 'rgba(224,163,74,0.35)'; ctx.shadowBlur = 40; ctx.fillStyle = C.ash; ctx.fill(); ctx.restore();
  panelPath(ctx); ctx.save(); ctx.clip();
  const g = ctx.createLinearGradient(0, PANEL.y, 0, PANEL.y + PANEL.h);
  g.addColorStop(0, '#E6DAC0'); g.addColorStop(0.55, '#DBCDAC'); g.addColorStop(1, '#CBBB97');
  ctx.fillStyle = g; ctx.fillRect(PANEL.x, PANEL.y, PANEL.w, PANEL.h);
  mottle(ctx, PANEL.x, PANEL.y, PANEL.w, PANEL.h, seed, 0.28);
  // foxing spots
  const r = rng(seed + 3);
  for (let i = 0; i < 22; i++) { const x = PANEL.x + r() * PANEL.w, y = PANEL.y + r() * PANEL.h, rad = 6 + r() * 40; glow(ctx, x, y, rad, 'rgba(120,90,40,0.5)', 0.22); }
  ctx.restore();
  ctx.restore();
}
function drawParchmentEdge(ctx) {
  ctx.save();
  // inner darkening vignette + burnt edge
  panelPath(ctx); ctx.clip();
  const g = ctx.createRadialGradient(W / 2, PANEL.y + PANEL.h * 0.5, PANEL.w * 0.25, W / 2, PANEL.y + PANEL.h * 0.5, PANEL.h * 0.62);
  g.addColorStop(0, 'rgba(60,40,20,0)'); g.addColorStop(0.8, 'rgba(60,40,20,0.08)'); g.addColorStop(1, 'rgba(40,25,10,0.4)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  panelPath(ctx); ctx.lineWidth = 22; ctx.strokeStyle = 'rgba(26,20,16,0.5)'; ctx.filter = 'blur(9px)'; ctx.stroke(); ctx.filter = 'none';
  ctx.restore();
  // gold frame lines around the window
  ctx.save(); panelPath(ctx, -8); ctx.strokeStyle = C.gold; ctx.lineWidth = 3; ctx.stroke();
  panelPath(ctx, -16); ctx.strokeStyle = C.goldPale; ctx.lineWidth = 1; ctx.globalAlpha = 0.7; ctx.stroke(); ctx.restore();
}
function drawNumeral(ctx, numeral) {
  const cx = W / 2, cy = 122;
  ctx.save();
  // cartouche
  ctx.fillStyle = C.ash; ctx.strokeStyle = C.gold; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(cx - 120, cy); ctx.lineTo(cx - 95, cy - 30); ctx.lineTo(cx + 95, cy - 30); ctx.lineTo(cx + 120, cy); ctx.lineTo(cx + 95, cy + 30); ctx.lineTo(cx - 95, cy + 30); ctx.closePath(); ctx.fill(); ctx.stroke();
  line(ctx, cx - 300, cy, cx - 135, cy, C.gold, 1.5); line(ctx, cx + 135, cy, cx + 300, cy, C.gold, 1.5);
  [cx - 300, cx + 300].forEach(x => { circle(ctx, x, cy, 4); ctx.fillStyle = C.gold; ctx.fill(); });
  ctx.font = "700 40px 'Cinzel'"; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  textGlow(ctx, numeral, cx, cy + 2, C.candle, 14); ctx.fillStyle = C.goldPale; ctx.fillText(numeral, cx, cy + 2);
  ctx.restore();
}
function drawTitleBand(ctx, omen) {
  const cx = W / 2;
  ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  // title
  const px = fitText(ctx, omen.title, W - 240, "700 {px}px 'Grenze Gotisch'", 52, 84);
  ctx.font = `700 ${px}px 'Grenze Gotisch'`;
  const ty = 1400;
  ctx.shadowColor = 'rgba(224,163,74,0.45)'; ctx.shadowBlur = 24; ctx.fillStyle = C.bone; ctx.fillText(omen.title, cx, ty);
  ctx.shadowBlur = 0; ctx.fillStyle = C.bone; ctx.fillText(omen.title, cx, ty);
  // rule with fleuron
  line(ctx, cx - 260, ty + 34, cx - 30, ty + 34, C.gold, 1.5); line(ctx, cx + 30, ty + 34, cx + 260, ty + 34, C.gold, 1.5);
  fleuron(ctx, cx, ty + 44, 14, C.gold, Math.PI); fleuron(ctx, cx, ty + 24, 14, C.gold, 0);
  // reading
  ctx.font = "italic 400 38px 'EB Garamond'"; ctx.fillStyle = 'rgba(217,205,184,0.9)';
  const lines = wrap(ctx, omen.reading, W - 240);
  lines.forEach((l, i) => ctx.fillText(l, cx, ty + 104 + i * 46));
  ctx.restore();
}
function renderFront(omen, index, sceneFn) {
  const canvas = document.getElementById('card'); canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d'); const seed = 1000 + index * 97;
  drawSootGround(ctx, seed);
  drawFrame(ctx);
  drawParchment(ctx, seed);
  // scene inside the window
  ctx.save(); panelPath(ctx); ctx.clip(); sceneFn(ctx, rng(seed + 5)); ctx.restore();
  drawParchmentEdge(ctx);
  drawNumeral(ctx, omen.numeral);
  drawTitleBand(ctx, omen);
  grain(ctx, 0.09, seed + 99);
  return canvas.toDataURL('image/png');
}
