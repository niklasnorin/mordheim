// Card back: soot ground, gold lattice, central medallion with the twin-tailed comet over the ruined city.
'use strict';
function ringText(ctx, text, cx, cy, radius, startAngle, font, color, spacing = 1) {
  ctx.save(); ctx.font = font; ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const chars = [...text]; const widths = chars.map(c => ctx.measureText(c).width * spacing);
  const total = widths.reduce((a, b) => a + b, 0); let a = startAngle - (total / 2) / radius;
  chars.forEach((c, i) => { a += widths[i] / 2 / radius; ctx.save(); ctx.translate(cx + Math.cos(a) * radius, cy + Math.sin(a) * radius); ctx.rotate(a + Math.PI / 2); ctx.fillText(c, 0, 0); ctx.restore(); a += widths[i] / 2 / radius; });
  ctx.restore();
}
function renderBack() {
  const canvas = document.getElementById('card'); canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d'); const r = rng(4242);
  drawSootGround(ctx, 4242);
  // lattice field
  ctx.save(); ctx.beginPath(); ctx.rect(70, 70, W - 140, H - 140); ctx.clip();
  ctx.strokeStyle = 'rgba(184,134,46,0.28)'; ctx.lineWidth = 1.2;
  const step = 70;
  for (let d = -H; d < W + H; d += step) { ctx.beginPath(); ctx.moveTo(d, 0); ctx.lineTo(d + H, H); ctx.stroke(); ctx.beginPath(); ctx.moveTo(d, 0); ctx.lineTo(d - H, H); ctx.stroke(); }
  // motifs at lattice cells: alternating tiny skulls and four-point stars
  for (let y = 70 + step / 2; y < H - 70; y += step) for (let x = 70 + step / 2 + ((Math.round(y / step) % 2) * step / 2); x < W - 70; x += step) {
    const k = Math.round((x + y) / step) % 3;
    if (Math.hypot(x - W / 2, y - H / 2) < 330) continue;
    if (k === 0) tinySkull(ctx, x, y, 12, 'rgba(184,134,46,0.55)');
    else { ctx.fillStyle = 'rgba(184,134,46,0.5)'; ctx.beginPath(); for (let i = 0; i < 8; i++) { const a = i * TAU / 8; const rr = i % 2 ? 2.5 : 9; ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } ctx.closePath(); ctx.fill(); }
  }
  ctx.restore();
  // frame
  drawFrame(ctx);
  ctx.strokeStyle = C.gold; ctx.lineWidth = 2; ctx.strokeRect(70, 70, W - 140, H - 140);
  ctx.strokeStyle = 'rgba(232,197,122,0.6)'; ctx.lineWidth = 1; ctx.strokeRect(80, 80, W - 160, H - 160);
  // medallion
  const cx = W / 2, cy = H / 2, R = 300;
  ctx.save(); circle(ctx, cx, cy, R + 24); ctx.shadowColor = 'rgba(224,163,74,0.5)'; ctx.shadowBlur = 60; ctx.fillStyle = C.soot; ctx.fill(); ctx.restore();
  circle(ctx, cx, cy, R + 24); ctx.fillStyle = C.soot; ctx.fill(); ctx.strokeStyle = C.gold; ctx.lineWidth = 4; ctx.stroke();
  circle(ctx, cx, cy, R - 40); ctx.strokeStyle = C.gold; ctx.lineWidth = 2; ctx.stroke();
  circle(ctx, cx, cy, R + 8); ctx.strokeStyle = 'rgba(232,197,122,0.7)'; ctx.lineWidth = 1; ctx.stroke();
  // ring text
  ringText(ctx, 'TAROT OF THE DAMNED  ✦  NIGHTS IN THE CITY  ✦  ', cx, cy, R - 16, -Math.PI / 2, "700 26px 'Cinzel'", C.goldPale, 1.15);
  ringText(ctx, 'THE CITY TAKES NOTHING FROM THOSE WHO STAY AWAY  ✦  ', cx, cy, R - 16, Math.PI / 2, "700 26px 'Cinzel'", C.goldPale, 1.15);
  // inner scene: comet over the ruined city, gold on soot
  ctx.save(); circle(ctx, cx, cy, R - 48); ctx.clip();
  const ig = ctx.createLinearGradient(0, cy - R, 0, cy + R); ig.addColorStop(0, '#3A342E'); ig.addColorStop(1, C.soot);
  ctx.fillStyle = ig; ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
  mottle(ctx, cx - R, cy - R, R * 2, R * 2, 99, 0.35);
  rays(ctx, cx + 20, cy - 70, 70, R, 56, C.gold, 1.2, 0.35, r);
  stars(ctx, 26, cx - R, cy - R, cx + R, cy + 40, r, C.goldPale);
  const skyR = rng(31337);
  skyline(ctx, cy + 130, 190, skyR, C.soot, cx - R, cx + R);
  ctx.fillStyle = C.soot; ctx.fillRect(cx - R, cy + 160, R * 2, R);
  ctx.save(); ctx.globalAlpha = 0.85; ctx.translate(0, -4); skyline(ctx, cy + 130, 190, rng(31337), C.gold, cx - R, cx + R); ctx.restore();
  ctx.save(); ctx.translate(0, 2); skyline(ctx, cy + 130, 190, rng(31337), C.soot, cx - R, cx + R); ctx.restore();
  ctx.fillStyle = C.soot; ctx.fillRect(cx - R, cy + 160, R * 2, R);
  // lit windows
  ctx.fillStyle = C.candle; [[-160, 40], [-40, 70], [90, 30], [170, 80]].forEach(([ox, oy]) => { glow(ctx, cx + ox, cy + oy, 24, C.candle, 0.6); ctx.fillRect(cx + ox - 3, cy + oy - 6, 6, 12); });
  comet(ctx, cx + 20, cy - 70, 54, Math.PI * 0.78, C.candle);
  ctx.restore();
  // outer bezel dots
  ctx.fillStyle = C.gold; for (let i = 0; i < 48; i++) { const a = i * TAU / 48; circle(ctx, cx + Math.cos(a) * (R + 40), cy + Math.sin(a) * (R + 40), 3); ctx.fill(); }
  // top and bottom cartouches
  [[240, 0], [H - 240, Math.PI]].forEach(([y, rot]) => {
    ctx.save(); ctx.translate(cx, y); ctx.rotate(rot);
    ctx.fillStyle = C.soot; ctx.strokeStyle = C.gold; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(-260, 0); ctx.lineTo(-220, -48); ctx.lineTo(220, -48); ctx.lineTo(260, 0); ctx.lineTo(220, 48); ctx.lineTo(-220, 48); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.font = "700 70px 'Grenze Gotisch'"; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(224,163,74,0.6)'; ctx.shadowBlur = 24; ctx.fillStyle = C.bone; ctx.fillText('Curfew', 0, 4); ctx.shadowBlur = 0; ctx.fillText('Curfew', 0, 4);
    fleuron(ctx, -300, 14, 16, C.gold, 0); fleuron(ctx, 300, 14, 16, C.gold, 0);
    ctx.restore();
  });
  // corner skulls inside the lattice frame
  [[120, 120], [W - 120, 120], [120, H - 120], [W - 120, H - 120]].forEach(([x, y]) => { circle(ctx, x, y, 34); ctx.fillStyle = C.soot; ctx.fill(); ctx.strokeStyle = C.gold; ctx.lineWidth = 2; ctx.stroke(); tinySkull(ctx, x, y, 34, C.gold); });
  grain(ctx, 0.1, 777);
  return canvas.toDataURL('image/png');
}
