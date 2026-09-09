// Scenes XV–XXIX.
'use strict';

// XV — The Drowned Quarter: a flooded street, rooftops as islands, a lone boat, a drowned steeple.
SCENES['drowned-quarter'] = (ctx, r) => {
  const waterY = 860;
  nightSky(ctx, r, waterY - 20, { stars: 10 });
  ctx.save(); ctx.globalAlpha = 0.5; skyline(ctx, waterY - 120, 260, r); ctx.restore();
  // water body
  ctx.fillStyle = 'rgba(26,20,16,0.82)'; ctx.fillRect(PX, waterY, PW, PB - waterY);
  // roofs breaking the surface
  ctx.fillStyle = C.ink;
  [[PX + 60, 200, 110], [PX + 360, 150, 80], [PX + PW - 260, 230, 130]].forEach(([x, w, h]) => { ctx.beginPath(); ctx.moveTo(x, waterY + 10); ctx.lineTo(x + w / 2, waterY - h); ctx.lineTo(x + w, waterY + 10); ctx.closePath(); ctx.fill();
    // chimney
    ctx.fillRect(x + w * 0.65, waterY - h * 0.75, 18, h * 0.5); });
  // steeple with cross, half drowned
  tower(ctx, CX + 40, waterY + 40, 90, 420, { lit: C.parch });
  ctx.fillStyle = C.ink; ctx.beginPath(); ctx.moveTo(CX - 15, waterY - 380); ctx.lineTo(CX + 40, waterY - 520); ctx.lineTo(CX + 95, waterY - 380); ctx.closePath(); ctx.fill();
  // reflections
  ctx.save(); ctx.globalAlpha = 0.25; ctx.translate(0, waterY * 2 + 20); ctx.scale(1, -1); tower(ctx, CX + 40, waterY - 20, 90, 420, {}, C.parch); ctx.restore();
  water(ctx, PX, PX + PW, waterY + 8, PB, r, 'rgba(203,187,154,0.45)');
  // boat with hooded rower
  boat(ctx, CX - 200, 1080, 130, C.parch);
  figure(ctx, CX - 200, 1085, 150, { hood: true, color: C.parch }); line(ctx, CX - 170, 1000, CX - 90, 1130, C.parch, 5);
  ripples(ctx, CX - 200, 1105, 260, 3, 'rgba(203,187,154,0.5)');
  // floating debris and a drowned lantern's last glow
  glow(ctx, PX + 200, 1180, 60, C.candle, 0.5);
  ctx.fillStyle = C.parch; for (let i = 0; i < 10; i++) { ctx.save(); ctx.translate(PX + 40 + r() * (PW - 80), 900 + r() * 360); ctx.rotate(r() * 0.4); ctx.fillRect(-20, -3, 40, 6); ctx.restore(); }
  crowFlying(ctx, PX + 200, 400, 30, C.ink); crowFlying(ctx, PX + 250, 440, 22, C.ink);
};

// XVI — The Sisters' Candle: a convent window lit above a dark street, a single robed silhouette inside.
SCENES['sisters-candle'] = (ctx, r) => {
  const horizon = 1140;
  nightSky(ctx, r, horizon - 40, { stars: 14, minGap: 5, maxGap: 22 });
  // convent wall, filling the frame, dark stone
  ctx.fillStyle = 'rgba(26,20,16,0.9)'; ctx.fillRect(PX + 120, PY + 60, PW - 240, horizon - PY - 60);
  ctx.beginPath(); ctx.rect(PX + 120, PY + 60, PW - 240, horizon - PY - 60); hatch(ctx, 0, 30, 1, 'rgba(203,187,154,0.18)');
  // buttress silhouettes
  ctx.fillStyle = C.ink; ctx.beginPath(); ctx.moveTo(PX + 120, horizon); ctx.lineTo(PX + 120, PY + 200); ctx.lineTo(PX + 60, PY + 400); ctx.lineTo(PX + 60, horizon); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(PX + PW - 120, horizon); ctx.lineTo(PX + PW - 120, PY + 200); ctx.lineTo(PX + PW - 60, PY + 400); ctx.lineTo(PX + PW - 60, horizon); ctx.closePath(); ctx.fill();
  // roofline
  ctx.beginPath(); ctx.moveTo(PX + 100, PY + 80); ctx.lineTo(CX, PY - 40); ctx.lineTo(PX + PW - 100, PY + 80); ctx.closePath(); ctx.fill();
  // dark windows
  ctx.fillStyle = C.soot; [[CX - 200, 420], [CX + 200, 420], [CX - 200, 760], [CX + 200, 760]].forEach(([x, y]) => { ctx.beginPath(); ctx.moveTo(x - 40, y + 130); ctx.lineTo(x - 40, y); ctx.quadraticCurveTo(x, y - 70, x + 40, y); ctx.lineTo(x + 40, y + 130); ctx.fill(); });
  // the lit window
  const wx = CX, wy = 560;
  glow(ctx, wx, wy + 60, 300, C.candle, 0.7);
  ctx.fillStyle = C.candle; ctx.beginPath(); ctx.moveTo(wx - 70, wy + 220); ctx.lineTo(wx - 70, wy); ctx.quadraticCurveTo(wx, wy - 120, wx + 70, wy); ctx.lineTo(wx + 70, wy + 220); ctx.fill();
  ctx.save(); ctx.beginPath(); ctx.moveTo(wx - 70, wy + 220); ctx.lineTo(wx - 70, wy); ctx.quadraticCurveTo(wx, wy - 120, wx + 70, wy); ctx.lineTo(wx + 70, wy + 220); ctx.clip();
  // sister silhouette, praying, inside
  figure(ctx, wx, wy + 230, 250, { hood: true, arms: 'raised' });
  candle(ctx, wx + 48, wy + 200, 12, 50, true, '#FFF0C0', C.bone);
  ctx.restore();
  // leading
  ctx.strokeStyle = C.ink; ctx.lineWidth = 5; line(ctx, wx, wy - 60, wx, wy + 220, C.ink, 5); line(ctx, wx - 70, wy + 80, wx + 70, wy + 80, C.ink, 5); line(ctx, wx - 70, wy + 150, wx + 70, wy + 150, C.ink, 5);
  ctx.lineWidth = 8; ctx.beginPath(); ctx.moveTo(wx - 70, wy + 220); ctx.lineTo(wx - 70, wy); ctx.quadraticCurveTo(wx, wy - 120, wx + 70, wy); ctx.lineTo(wx + 70, wy + 220); ctx.stroke();
  // street below, a watcher looking up
  ground(ctx, horizon, r); rubble(ctx, PX, PX + PW, horizon - 6, 14, r);
  figure(ctx, CX + 260, horizon + 30, 190, { hood: true, flip: true });
  // light pooling on wet cobbles
  ctx.fillStyle = 'rgba(224,163,74,0.25)'; ellipse(ctx, wx, horizon + 40, 200, 30); ctx.fill();
  moon(ctx, PX + 90, PY + 200, 40, C.parch, 0.35);
};

// XVII — The Black Sails: a nameless ship on the Stir, sails black against a bruised sky, lanterns on the quay.
SCENES['black-sails'] = (ctx, r) => {
  const waterY = 980;
  skyHatch(ctx, PX, PY, PW, waterY, 'rgba(26,20,16,0.5)', 5, 34, r);
  stars(ctx, 8, PX + 40, PY + 40, PX + PW - 40, 500, r, C.parch);
  moon(ctx, PX + PW - 190, PY + 220, 64, C.parch, 0.85);
  ctx.save(); ctx.globalAlpha = 0.55; skyline(ctx, waterY - 60, 240, r); ctx.restore();
  // river
  ctx.fillStyle = 'rgba(26,20,16,0.7)'; ctx.fillRect(PX, waterY, PW, PB - waterY);
  water(ctx, PX, PX + PW, waterY + 10, PB, r, 'rgba(203,187,154,0.5)');
  // ship
  ship(ctx, CX - 20, waterY, 230);
  // reflection
  ctx.save(); ctx.globalAlpha = 0.18; ctx.translate(0, waterY * 2 + 60); ctx.scale(1, -1); ship(ctx, CX - 20, waterY + 30, 230, C.parch); ctx.restore();
  // no name: a blank nameplate on the hull
  ctx.fillStyle = C.parch; ctx.fillRect(CX + 40, waterY - 2, 120, 22); ctx.strokeStyle = C.ink; ctx.lineWidth = 2; ctx.strokeRect(CX + 40, waterY - 2, 120, 22);
  // quay, foreground right, with lanterns and a waiting figure
  ctx.fillStyle = C.ink; ctx.beginPath(); ctx.moveTo(PX + PW - 300, PB); ctx.lineTo(PX + PW - 300, 1140); ctx.lineTo(PX + PW + 20, 1100); ctx.lineTo(PX + PW + 20, PB); ctx.closePath(); ctx.fill();
  // mooring posts
  [PX + PW - 270, PX + PW - 150].forEach(x => { ctx.fillRect(x - 10, 1060, 20, 90); rope(ctx, [[x, 1070], [x - 120, 1090], [x - 240, 1050]], 4, C.parchDark); });
  glow(ctx, PX + PW - 90, 1000, 120, C.candle, 0.6); line(ctx, PX + PW - 90, 1120, PX + PW - 90, 960, C.ink, 8); lantern(ctx, PX + PW - 90, 960, 22);
  figure(ctx, PX + PW - 200, 1130, 240, { hood: true, flip: true });
  // crates of shards, one open
  ctx.fillStyle = C.parchDark; ctx.fillRect(PX + PW - 290, 1080, 60, 60); ctx.strokeStyle = C.ink; ctx.lineWidth = 2; ctx.strokeRect(PX + PW - 290, 1080, 60, 60);
  shard(ctx, PX + PW - 262, 1078, 14, 0.4, true);
  crowFlying(ctx, PX + 160, 520, 34); crowFlying(ctx, PX + 220, 470, 26);
};

// XVIII — The Nameless Grave: a blank headstone, swept clean, a fresh candle and a crow that will not leave.
SCENES['nameless-grave'] = (ctx, r) => {
  const horizon = 960;
  nightSky(ctx, r, horizon - 40, { stars: 16, minGap: 6, maxGap: 26 });
  moon(ctx, CX + 220, PY + 240, 90, C.parch, 0.6);
  ctx.save(); ctx.globalAlpha = 0.6; skyline(ctx, horizon - 60, 260, r); ctx.restore();
  // graveyard wall and gate
  ctx.fillStyle = C.ink; ctx.fillRect(PX, horizon - 160, PW, 140); for (let i = 0; i < 12; i++) ctx.fillRect(PX + i * 72, horizon - 190, 40, 40);
  ctx.beginPath(); ctx.rect(PX, horizon - 160, PW, 140); hatch(ctx, 0, 18, 1, 'rgba(203,187,154,0.2)');
  ground(ctx, horizon, r);
  // other stones, leaning, weathered, with names scratched
  [[PX + 120, 80, 150, -0.1], [PX + 240, 70, 120, 0.15], [PX + PW - 150, 90, 160, 0.08], [PX + PW - 280, 60, 110, -0.2]].forEach(([x, w, h, a]) => { ctx.save(); ctx.translate(x, horizon + 20); ctx.rotate(a); gravestone(ctx, 0, 0, w, h, C.ink); for (let i = 0; i < 4; i++) line(ctx, -w * 0.3, -h * 0.65 + i * 14, w * 0.3, -h * 0.65 + i * 14, C.parchDark, 1.5); ctx.restore(); });
  // the nameless stone: parchment-toned, blank, clean
  glow(ctx, CX - 40, 900, 180, C.candle, 0.4);
  gravestone(ctx, CX - 40, horizon + 40, 200, 380, C.parch);
  ctx.strokeStyle = C.ink; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(CX - 140, horizon + 40); ctx.lineTo(CX - 140, horizon - 240); ctx.arc(CX - 40, horizon - 240, 100, Math.PI, 0); ctx.lineTo(CX + 60, horizon + 40); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(CX - 130, horizon + 30); ctx.lineTo(CX - 130, horizon - 240); ctx.arc(CX - 40, horizon - 240, 90, Math.PI, 0); ctx.lineTo(CX + 50, horizon + 30); ctx.closePath(); hatch(ctx, 0.5, 6, 0.8, 'rgba(26,20,16,0.25)');
  // mound, flowers dead, a candle
  ctx.fillStyle = C.ink; ellipse(ctx, CX - 40, horizon + 60, 150, 30); ctx.fill();
  candle(ctx, CX + 90, horizon + 50, 22, 90, true);
  // dead flowers
  ctx.strokeStyle = C.parchDark; ctx.lineWidth = 3; for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.moveTo(CX - 130 + i * 18, horizon + 50); ctx.quadraticCurveTo(CX - 140 + i * 18, horizon - 10, CX - 150 + i * 22, horizon - 40 + i * 6); ctx.stroke(); }
  // a broom left against the stone
  line(ctx, CX + 70, horizon + 40, CX + 30, horizon - 300, C.ink, 6); ctx.fillStyle = C.ink; ctx.beginPath(); ctx.moveTo(CX + 60, horizon + 40); ctx.lineTo(CX + 30, horizon - 30); ctx.lineTo(CX + 110, horizon - 30); ctx.lineTo(CX + 120, horizon + 40); ctx.closePath(); ctx.fill();
  crow(ctx, CX - 40, horizon - 330, 80, false);
  ashFlakes(ctx, 40, r, 'rgba(217,205,184,0.7)');
};

// XIX — The Whispering Wall: a cracked wall shaped like an ear, a figure pressed to it, words leaking as script.
SCENES['whispering-wall'] = (ctx, r) => {
  // wall fills the frame
  ctx.fillStyle = 'rgba(26,20,16,0.75)'; ctx.fillRect(PX, PY, PW, PH);
  // stone courses
  ctx.strokeStyle = 'rgba(203,187,154,0.35)'; ctx.lineWidth = 2;
  for (let y = PY + 40; y < PB; y += 70) { line(ctx, PX, y, PX + PW, y, 'rgba(203,187,154,0.35)', 2); for (let x = PX + ((y / 70) % 2) * 70; x < PX + PW; x += 140) line(ctx, x, y, x, y + 70, 'rgba(203,187,154,0.35)', 2); }
  // the crack: a jagged fissure running the height of the wall, lit from within
  glow(ctx, CX + 110, 640, 300, C.candle, 0.35);
  const fis = []; let fy = PY - 10, fxx = CX + 60; const left = [], right = [];
  while (fy < 1290) { const w = 6 + Math.max(0, 60 - Math.abs(fy - 640) * 0.12) * (0.4 + r() * 0.8); left.push([fxx - w / 2, fy]); right.push([fxx + w / 2, fy]); fy += 40 + r() * 40; fxx += (r() - 0.5) * 70 + (640 - fy) * 0.02; }
  ctx.fillStyle = C.parch; poly(ctx, left.concat(right.reverse())); ctx.fill();
  glow(ctx, CX + 110, 640, 90, C.candle, 0.6);
  // hairline cracks branching off
  ctx.strokeStyle = C.parch; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
  left.forEach((p, i) => { if (i % 2) return; ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(p[0] - 30 - r() * 60, p[1] + (r() - 0.5) * 60); ctx.lineTo(p[0] - 60 - r() * 80, p[1] + (r() - 0.5) * 90); ctx.stroke(); });
  right.forEach((p, i) => { if (i % 2) return; ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(p[0] + 30 + r() * 60, p[1] + (r() - 0.5) * 60); ctx.lineTo(p[0] + 60 + r() * 80, p[1] + (r() - 0.5) * 90); ctx.stroke(); });
  // listener pressed to the wall, in profile, one hand flat on the stone
  const bx = CX - 220, base = 1290;
  ctx.fillStyle = C.ink;
  ctx.beginPath(); ctx.moveTo(bx - 150, base); ctx.quadraticCurveTo(bx - 150, 820, bx - 70, 740); ctx.lineTo(bx + 70, 720); ctx.quadraticCurveTo(bx + 140, 820, bx + 150, base); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.ellipse(bx + 30, 650, 84, 96, 0.15, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.moveTo(bx + 100, 630); ctx.lineTo(bx + 150, 660); ctx.lineTo(bx + 104, 690); ctx.closePath(); ctx.fill();
  // hood falling back
  ctx.beginPath(); ctx.moveTo(bx - 60, 620); ctx.quadraticCurveTo(bx - 80, 520, bx + 20, 540); ctx.quadraticCurveTo(bx - 20, 600, bx - 30, 700); ctx.closePath(); ctx.fill();
  // arm and hand flat on the wall beside the crack
  line(ctx, bx + 60, 800, bx + 200, 720, C.ink, 44);
  ctx.beginPath(); ctx.ellipse(bx + 215, 705, 34, 44, -0.3, 0, TAU); ctx.fill();
  for (let i = 0; i < 4; i++) { ctx.save(); ctx.translate(bx + 205 + i * 18, 672); ctx.rotate(-0.55 + i * 0.22); ctx.fillRect(-8, -64, 16, 70); ctx.restore(); }
  // whispers: tiny script lines leaking from the crack
  ctx.strokeStyle = 'rgba(26,20,16,0.8)'; ctx.lineWidth = 1.6;
  for (let i = 0; i < 26; i++) { let x = CX + 200 + r() * 200, y = 380 + r() * 560; ctx.beginPath(); ctx.moveTo(x, y); for (let k = 0; k < 14; k++) { x += 6; y += (r() - 0.5) * 8; ctx.lineTo(x, y); } ctx.stroke(); }
  ctx.font = "italic 400 26px 'EB Garamond'"; ctx.fillStyle = 'rgba(26,20,16,0.75)'; ctx.textAlign = 'left';
  ['third bell', 'the fence knows', 'Hanna', 'not tonight', 'under the ash', 'Rudi saw'].forEach((w, i) => { ctx.save(); ctx.translate(CX + 210 + (i % 2) * 90, 420 + i * 90); ctx.rotate(-0.08 + r() * 0.16); ctx.fillText(w, 0, 0); ctx.restore(); });
  // rats at the base, listening too
  rat(ctx, CX + 200, 1240, 60, true); rat(ctx, CX + 320, 1250, 50, false);
  ctx.fillStyle = C.ink; ctx.fillRect(PX, 1270, PW, 30);
};

// XX — The Tower on the Rock: a river tower with its great chain raised, a toll keeper's lantern.
SCENES['tower-on-the-rock'] = (ctx, r) => {
  const waterY = 1060;
  nightSky(ctx, r, waterY - 20, { stars: 18, minGap: 6, maxGap: 34 });
  moon(ctx, PX + 150, PY + 230, 56, C.parch, 0.5);
  ctx.save(); ctx.globalAlpha = 0.5; skyline(ctx, waterY - 30, 180, r, C.ink, PX, CX - 100); skyline(ctx, waterY - 30, 180, r, C.ink, CX + 260, PX + PW); ctx.restore();
  // river and rock
  ctx.fillStyle = 'rgba(26,20,16,0.7)'; ctx.fillRect(PX, waterY, PW, PB - waterY);
  water(ctx, PX, PX + PW, waterY + 10, PB, r, 'rgba(203,187,154,0.45)');
  ctx.fillStyle = C.ink; ctx.beginPath(); ctx.moveTo(CX - 200, waterY + 40); ctx.lineTo(CX - 170, waterY - 60); ctx.lineTo(CX - 60, waterY - 110); ctx.lineTo(CX + 120, waterY - 90); ctx.lineTo(CX + 200, waterY + 40); ctx.closePath(); ctx.fill();
  // tower
  tower(ctx, CX, waterY - 90, 200, 620, {});
  // window glow
  glow(ctx, CX, waterY - 90 - 620 * 0.52, 90, C.candle, 0.7); ctx.fillStyle = C.candle; ctx.beginPath(); ctx.moveTo(CX - 14, waterY - 90 - 620 * 0.52 + 28); ctx.lineTo(CX - 14, waterY - 90 - 620 * 0.52); ctx.arc(CX, waterY - 90 - 620 * 0.52, 14, Math.PI, 0); ctx.lineTo(CX + 14, waterY - 90 - 620 * 0.52 + 28); ctx.fill();
  // the chain, raised across the river to the far bank
  chain(ctx, CX - 100, waterY - 380, PX - 10, waterY - 200, 22, C.ink);
  chain(ctx, CX + 100, waterY - 380, PX + PW + 10, waterY - 220, 22, C.ink);
  // chain drips
  ctx.fillStyle = 'rgba(203,187,154,0.6)'; for (let i = 0; i < 10; i++) { circle(ctx, lerp(PX, CX - 100, r()), waterY - 300 + r() * 40, 2); ctx.fill(); }
  // a small boat turned back
  boat(ctx, PX + 220, waterY + 90, 90, C.parch); figure(ctx, PX + 220, waterY + 95, 100, { hood: true, color: C.parch });
  // gulls / crows
  crowFlying(ctx, CX + 300, 420, 30); crowFlying(ctx, CX + 360, 380, 22);
  // toll sign on the rock
  ctx.fillStyle = C.parch; ctx.fillRect(CX + 130, waterY - 60, 90, 44); ctx.strokeStyle = C.ink; ctx.lineWidth = 2; ctx.strokeRect(CX + 130, waterY - 60, 90, 44);
  coin(ctx, CX + 175, waterY - 38, 14);
};

// XXI — The Beggar King: a ragged man on a throne of crates, a paper crown, a bowl held out, hands offering coins.
SCENES['beggar-king'] = (ctx, r) => {
  // alley
  skyHatch(ctx, PX, PY, PW, 1120, 'rgba(26,20,16,0.55)', 7, 12, r);
  ctx.fillStyle = 'rgba(26,20,16,0.85)'; ctx.beginPath(); ctx.moveTo(PX, PY); ctx.lineTo(PX + 200, PY); ctx.lineTo(PX + 120, 1120); ctx.lineTo(PX, 1120); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(PX + PW, PY); ctx.lineTo(PX + PW - 200, PY); ctx.lineTo(PX + PW - 120, 1120); ctx.lineTo(PX + PW, 1120); ctx.closePath(); ctx.fill();
  ground(ctx, 1120, r);
  // throne of crates and barrels
  ctx.fillStyle = C.ink; [[CX - 200, 900, 130, 220], [CX + 70, 940, 140, 180], [CX - 100, 780, 200, 140]].forEach(([x, y, w, h]) => { ctx.fillRect(x, y, w, h); ctx.beginPath(); ctx.rect(x, y, w, h); hatch(ctx, 0, 14, 1.2, 'rgba(203,187,154,0.25)'); });
  ctx.fillStyle = C.ink; ellipse(ctx, CX + 200, 1060, 70, 30); ctx.fill(); ctx.fillRect(CX + 130, 900, 140, 160); ctx.beginPath(); ctx.rect(CX + 130, 900, 140, 160); hatch(ctx, Math.PI / 2, 16, 1.2, 'rgba(203,187,154,0.25)');
  // the king
  glow(ctx, CX, 700, 300, C.candle, 0.35);
  const base = 1120, fx = CX - 10;
  figure(ctx, fx, base, 560, { arms: 'out' });
  // rags: parchment tears on the robe
  ctx.fillStyle = C.parch; for (let i = 0; i < 7; i++) { ctx.beginPath(); const x = fx - 70 + r() * 140, y = 860 + r() * 240; ctx.moveTo(x, y); ctx.lineTo(x + 18, y + 10); ctx.lineTo(x + 6, y + 30); ctx.closePath(); ctx.fill(); }
  // paper crown, crooked
  ctx.save(); ctx.translate(fx + 4, base - 560 * 0.905); ctx.rotate(-0.16); crown(ctx, 0, 0, 110, C.parch); ctx.restore();
  // bowl held out
  ctx.fillStyle = C.ink; ctx.beginPath(); ctx.arc(fx + 210, base - 330, 50, 0, Math.PI); ctx.closePath(); ctx.fill(); ellipse(ctx, fx + 210, base - 330, 50, 12); ctx.fillStyle = C.parchDark; ctx.fill();
  coin(ctx, fx + 200, base - 340, 12); coin(ctx, fx + 222, base - 336, 10);
  // supplicants kneeling at the edge of the light, holding out coins
  figure(ctx, PX + 150, 1130, 260, { hood: true, arms: 'out' }); coin(ctx, PX + 250, 970, 14);
  figure(ctx, PX + PW - 150, 1130, 240, { hood: true, arms: 'out', flip: true }); coin(ctx, PX + PW - 240, 980, 14);
  for (let i = 0; i < 7; i++) coin(ctx, fx - 120 + r() * 240, 1100 + r() * 40, 10 + r() * 5);
  // sceptre: a broken bottle
  line(ctx, fx - 120, base - 300, fx - 160, base - 520, C.ink, 14); ctx.fillStyle = C.parchDark; ctx.beginPath(); ctx.moveTo(fx - 170, base - 540); ctx.lineTo(fx - 150, base - 520); ctx.lineTo(fx - 140, base - 560); ctx.lineTo(fx - 160, base - 570); ctx.lineTo(fx - 175, base - 555); ctx.closePath(); ctx.fill();
  // dog at his feet
  ctx.fillStyle = C.ink; ellipse(ctx, fx + 120, 1090, 70, 30); ctx.fill(); circle(ctx, fx + 190, 1070, 24); ctx.fill(); ctx.beginPath(); ctx.moveTo(fx + 200, 1060); ctx.lineTo(fx + 235, 1075); ctx.lineTo(fx + 205, 1085); ctx.fill();
  rat(ctx, fx - 260, 1110, 50);
};

// XXII — The Cracked Hourglass: an hourglass leaking sand onto a map of the city; the sand buries the streets.
SCENES['cracked-hourglass'] = (ctx, r) => {
  skyHatch(ctx, PX, PY, PW, 980, 'rgba(26,20,16,0.5)', 7, 12, r);
  rays(ctx, CX, 640, 180, 560, 48, C.ink, 1.4, 0.45, r);
  // table with a map
  ctx.fillStyle = C.ink; ctx.fillRect(PX, 980, PW, PB - 980);
  ctx.fillStyle = C.parch; ctx.save(); ctx.translate(CX, 1130); ctx.rotate(-0.05); ctx.fillRect(-380, -110, 760, 220); ctx.strokeStyle = C.ink; ctx.lineWidth = 2; ctx.strokeRect(-380, -110, 760, 220);
  // map: streets as ink lines, a river
  ctx.strokeStyle = C.ink; ctx.lineWidth = 2; for (let i = 0; i < 18; i++) { ctx.beginPath(); const x = -360 + r() * 720, y = -100 + r() * 200; ctx.moveTo(x, y); ctx.lineTo(x + (r() - 0.5) * 240, y + (r() - 0.5) * 120); ctx.lineTo(x + (r() - 0.5) * 240, y + (r() - 0.5) * 160); ctx.stroke(); }
  ctx.lineWidth = 8; ctx.strokeStyle = 'rgba(26,20,16,0.55)'; ctx.beginPath(); ctx.moveTo(-380, 40); ctx.bezierCurveTo(-100, -60, 100, 120, 380, 0); ctx.stroke();
  ctx.fillStyle = C.blood; circle(ctx, -120, -30, 6); ctx.fill(); circle(ctx, 160, 50, 6); ctx.fill();
  ctx.restore();
  // hourglass, large
  glow(ctx, CX, 640, 240, C.candle, 0.3);
  hourglass(ctx, CX, 640, 300, true);
  // sand pouring from the crack onto the map, piling
  ctx.fillStyle = C.candle; ctx.beginPath(); ctx.moveTo(CX + 96, 800); ctx.quadraticCurveTo(CX + 120, 900, CX + 130, 1000); ctx.lineTo(CX + 100, 1000); ctx.quadraticCurveTo(CX + 100, 900, CX + 86, 800); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(CX - 60, 1020); ctx.quadraticCurveTo(CX + 120, 900, CX + 320, 1030); ctx.quadraticCurveTo(CX + 130, 1000, CX - 60, 1020); ctx.fill();
  ctx.beginPath(); ctx.moveTo(CX - 40, 1030); ctx.quadraticCurveTo(CX + 120, 960, CX + 300, 1040); ctx.closePath(); ctx.fill();
  for (let i = 0; i < 40; i++) { circle(ctx, CX + 80 + r() * 90, 820 + r() * 200, 1.5 + r() * 2); ctx.fill(); }
  // moth around the light
  crowFlying(ctx, CX - 180, 420, 14); crowFlying(ctx, CX + 200, 380, 12);
};

// XXIII — The Twin Moons: pale Mannslieb and green Morrslieb over the city, every shadow doubled.
SCENES['twin-moons'] = (ctx, r) => {
  const horizon = 1000;
  skyHatch(ctx, PX, PY, PW, horizon, 'rgba(26,20,16,0.75)', 4, 26, r);
  stars(ctx, 26, PX + 30, PY + 40, PX + PW - 30, horizon - 200, r, C.parch);
  // moons
  glow(ctx, CX - 190, PY + 300, 220, C.parch, 0.35); moon(ctx, CX - 190, PY + 300, 110, C.parch, 1);
  glow(ctx, CX + 190, PY + 340, 260, C.wyrd, 0.5); moon(ctx, CX + 190, PY + 340, 96, '#9FE0A6', 1);
  // Morrslieb's face: something grinning
  ctx.fillStyle = 'rgba(26,20,16,0.55)'; ellipse(ctx, CX + 158, PY + 318, 16, 22, 0.3); ctx.fill(); ellipse(ctx, CX + 224, PY + 314, 16, 22, -0.3); ctx.fill();
  ctx.strokeStyle = 'rgba(26,20,16,0.55)'; ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(CX + 150, PY + 372); ctx.lineTo(CX + 165, PY + 362); ctx.lineTo(CX + 180, PY + 374); ctx.lineTo(CX + 195, PY + 360); ctx.lineTo(CX + 210, PY + 374); ctx.lineTo(CX + 228, PY + 364); ctx.stroke();
  ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(CX + 120, PY + 300); ctx.lineTo(CX + 140, PY + 330); ctx.lineTo(CX + 130, PY + 360); ctx.stroke(); ctx.beginPath(); ctx.moveTo(CX + 262, PY + 290); ctx.lineTo(CX + 250, PY + 330); ctx.lineTo(CX + 268, PY + 362); ctx.stroke();
  ctx.save(); ctx.globalAlpha = 0.5; skyline(ctx, horizon, 340, r); ctx.restore();
  ground(ctx, horizon + 30, r);
  // a lone figure with two shadows
  const fx = CX - 20, base = horizon + 40;
  [[-1, 'rgba(111,207,122,0.55)'], [1, 'rgba(217,205,184,0.55)']].forEach(([dir, col]) => {
    ctx.save(); ctx.translate(fx, base); ctx.transform(1, 0, dir * 1.6, -0.45, 0, 0); ctx.translate(-fx, -base); ctx.globalAlpha = 0.7; figure(ctx, fx, base, 300, { hood: true, color: col }); ctx.restore();
  });
  figure(ctx, fx - 5, base - 4, 300, { hood: true, color: C.parch }); figure(ctx, fx + 5, base - 4, 300, { hood: true, color: 'rgba(111,207,122,0.9)' }); figure(ctx, fx, base, 300, { hood: true });
  // green light catching the wet roofs
  ctx.fillStyle = 'rgba(111,207,122,0.25)'; for (let i = 0; i < 20; i++) ctx.fillRect(CX + r() * 400, horizon - 200 + r() * 180, 3 + r() * 20, 2);
  // shards half-buried glinting
  shard(ctx, PX + 140, PB - 90, 18, 0.5, true); shard(ctx, PX + PW - 120, PB - 60, 14, -0.7, true);
  crowFlying(ctx, PX + 120, 560, 26); crowFlying(ctx, PX + 170, 600, 20);
};

// XXIV — The Sealed Door: a great door with a wax seal and chain, scratches on the inside face showing through the gap.
SCENES['sealed-door'] = (ctx, r) => {
  // wall
  ctx.fillStyle = 'rgba(26,20,16,0.8)'; ctx.fillRect(PX, PY, PW, PH);
  ctx.strokeStyle = 'rgba(203,187,154,0.3)'; for (let y = PY + 40; y < PB; y += 64) { line(ctx, PX, y, PX + PW, y, 'rgba(203,187,154,0.3)', 2); for (let x = PX + ((y / 64) % 2) * 64; x < PX + PW; x += 128) line(ctx, x, y, x, y + 64, 'rgba(203,187,154,0.3)', 2); }
  // ivy / roots creeping
  ctx.strokeStyle = C.ink; ctx.lineWidth = 4; ctx.lineCap = 'round'; for (let i = 0; i < 8; i++) { ctx.beginPath(); let x = PX + r() * PW, y = PY; ctx.moveTo(x, y); for (let k = 0; k < 8; k++) { x += (r() - 0.5) * 80; y += 40 + r() * 60; ctx.lineTo(x, y); } ctx.stroke(); }
  // the door
  const dx = CX - 210, dy = 420, dw = 420, dh = 860;
  ctx.fillStyle = C.parchDark; ctx.beginPath(); ctx.moveTo(dx - 30, dy + dh); ctx.lineTo(dx - 30, dy + dw / 2); ctx.arc(dx + dw / 2, dy + dw / 2, dw / 2 + 30, Math.PI, 0); ctx.lineTo(dx + dw + 30, dy + dh); ctx.closePath(); ctx.fill(); // frame stones
  door(ctx, dx, dy, dw, dh, C.ink);
  // gap at the bottom with a sliver of light and scratches
  ctx.fillStyle = C.candle; ctx.fillRect(dx + 10, dy + dh - 14, dw - 20, 14); glow(ctx, CX, dy + dh, 120, C.candle, 0.5);
  // hinges and studs
  ctx.fillStyle = C.parchDark; [0.2, 0.55, 0.85].forEach(k => { ctx.fillRect(dx, dy + dh * k, 70, 18); ctx.fillRect(dx + dw - 70, dy + dh * k, 70, 18); });
  for (let i = 0; i < 5; i++) for (let j = 0; j < 9; j++) { circle(ctx, dx + 40 + i * (dw - 80) / 4, dy + 60 + j * (dh - 120) / 8, 4); ctx.fill(); }
  // chain across
  chain(ctx, dx - 30, dy + 500, dx + dw + 30, dy + 560, 26, C.parchDark);
  // wax seal, large, blood red, with a hammer imprint
  glow(ctx, CX, dy + 530, 90, C.blood, 0.5);
  ctx.fillStyle = C.blood; ctx.beginPath(); for (let i = 0; i < 24; i++) { const a = i * TAU / 24; const rad = 70 + (i % 2 ? 6 : -4) + r() * 6; ctx.lineTo(CX + Math.cos(a) * rad, dy + 530 + Math.sin(a) * rad); } ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(26,20,16,0.6)'; ctx.lineWidth = 3; circle(ctx, CX, dy + 530, 52); ctx.stroke();
  ctx.save(); ctx.translate(CX, dy + 530); ctx.scale(0.55, 0.55); hammer(ctx, 0, 20, 90, 0, 'rgba(26,20,16,0.85)'); ctx.restore();
  // drips of wax
  ctx.fillStyle = C.blood; [[-30, 60], [10, 80], [40, 50]].forEach(([ox, l]) => { ctx.beginPath(); ctx.moveTo(CX + ox - 6, dy + 590); ctx.lineTo(CX + ox + 6, dy + 590); ctx.lineTo(CX + ox + 4, dy + 590 + l); ctx.arc(CX + ox, dy + 590 + l, 5, 0, Math.PI); ctx.closePath(); ctx.fill(); });
  // scratches on the stones beside the door
  ctx.strokeStyle = 'rgba(203,187,154,0.55)'; ctx.lineWidth = 2; for (let i = 0; i < 20; i++) { const x = (i < 10 ? dx - 120 : dx + dw + 60) + r() * 50, y = 700 + r() * 500; line(ctx, x, y, x + 6, y + 40 + r() * 30, 'rgba(203,187,154,0.55)', 2); }
  // dead candle on the step
  ctx.fillStyle = C.ink; ctx.fillRect(dx - 60, dy + dh, dw + 120, 30);
  candle(ctx, dx - 20, dy + dh, 18, 50, false);
};

// XXV — The Wyrd Lantern: a lantern burning green in a sifter's hand, the ruins lit wrong, shadows the wrong way.
SCENES['wyrd-lantern'] = (ctx, r) => {
  const horizon = 1080;
  skyHatch(ctx, PX, PY, PW, horizon, 'rgba(26,20,16,0.75)', 4, 20, r);
  ctx.save(); ctx.globalAlpha = 0.7; skyline(ctx, horizon - 20, 380, r); ctx.restore();
  ground(ctx, horizon, r);
  // ruins lit green
  glow(ctx, CX + 120, 620, 520, C.wyrd, 0.45);
  glow(ctx, CX + 120, 620, 220, C.wyrd, 0.8);
  // rubble field
  rubble(ctx, PX, PX + PW, horizon - 10, 30, r, C.ink, 1.4);
  rubble(ctx, CX - 200, CX + 400, horizon - 80, 16, r, 'rgba(111,207,122,0.35)', 1.2);
  // sifter: crouched figure holding lantern high
  const fx = CX - 120, base = horizon + 20;
  figure(ctx, fx, base, 620, { hood: true });
  line(ctx, fx + 50, 560, fx + 200, 520, C.ink, 40);
  lantern(ctx, CX + 120, 560, 60, C.wyrd);
  // green rim-light on the figure's edge
  ctx.save(); ctx.globalAlpha = 0.55; ctx.strokeStyle = C.wyrd; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(fx + 40, 470); ctx.quadraticCurveTo(fx + 120, 700, fx + 140, base); ctx.stroke(); ctx.restore();
  // green-lit face
  ctx.fillStyle = C.wyrd; circle(ctx, fx - 4, 430, 4); ctx.fill(); circle(ctx, fx + 24, 430, 4); ctx.fill();
  // shadows cast the wrong way: long thin shapes toward the light
  ctx.fillStyle = 'rgba(26,20,16,0.7)'; for (let i = 0; i < 7; i++) { const x = PX + 60 + r() * (PW - 120); ctx.beginPath(); ctx.moveTo(x, horizon + 10); ctx.lineTo(x + 30, horizon + 10); ctx.lineTo(CX + 120 + (r() - 0.5) * 80, 620); ctx.closePath(); ctx.fill(); }
  // shards showing through rubble
  shard(ctx, CX + 300, horizon - 30, 22, 0.4); shard(ctx, CX - 300, horizon - 10, 18, -0.9); shard(ctx, CX + 60, horizon + 10, 16, 1.4);
  // cough: a sprinkle of green motes near the hood
  ctx.fillStyle = C.wyrd; for (let i = 0; i < 24; i++) { circle(ctx, fx - 40 + r() * 120, 380 + r() * 140, 1 + r() * 2); ctx.fill(); }
  ashFlakes(ctx, 60, r, 'rgba(217,205,184,0.6)');
};

// XXVI — The Carrion Crown: a crown of crows settling on a dead king's skull atop a heap of the fallen.
SCENES['carrion-crown'] = (ctx, r) => {
  const horizon = 1000;
  skyHatch(ctx, PX, PY, PW, horizon, 'rgba(26,20,16,0.6)', 5, 24, r);
  rays(ctx, CX, 560, 160, 520, 56, C.ink, 1.4, 0.4, r);
  ctx.save(); ctx.globalAlpha = 0.5; skyline(ctx, horizon - 20, 220, r); ctx.restore();
  ground(ctx, horizon + 20, r);
  // heap of the fallen: silhouettes tangled
  ctx.fillStyle = C.ink; ctx.beginPath(); ctx.moveTo(PX - 20, PB); ctx.quadraticCurveTo(CX - 200, 780, CX, 720); ctx.quadraticCurveTo(CX + 220, 780, PX + PW + 20, PB); ctx.closePath(); ctx.fill();
  // limbs from the heap
  for (let i = 0; i < 10; i++) { const x = CX - 300 + r() * 600, y = 900 + r() * 200; ctx.save(); ctx.translate(x, y); ctx.rotate(-Math.PI / 2 + (r() - 0.5) * 1.6); ctx.fillRect(-10, 0, 20, 90 + r() * 60); ellipse(ctx, 0, -10, 18, 12); ctx.fill(); ctx.restore(); }
  for (let i = 0; i < 5; i++) skull(ctx, CX - 260 + i * 130, 960 + Math.abs(i - 2) * 30, 50, C.parch, C.ink);
  // the skull king
  glow(ctx, CX, 640, 160, C.candle, 0.3);
  skull(ctx, CX, 640, 240, C.parch, C.ink);
  // crown of crows: perched around the crown
  ctx.save(); ctx.translate(CX, 540);
  crown(ctx, 0, 0, 240, C.ink, C.parch);
  ctx.restore();
  crow(ctx, CX - 100, 470, 70, false); crow(ctx, CX + 100, 470, 70, true); crow(ctx, CX, 420, 76, false); crow(ctx, CX - 40, 450, 50, true); crow(ctx, CX + 60, 455, 50, false);
  crowFlying(ctx, CX - 260, 380, 40); crowFlying(ctx, CX + 300, 340, 36); crowFlying(ctx, CX + 260, 470, 26);
  // blood from the eye sockets
  ctx.fillStyle = C.blood; [[-46, 634], [46, 634]].forEach(([ox, y]) => { ctx.beginPath(); ctx.moveTo(CX + ox - 6, y); ctx.lineTo(CX + ox + 6, y); ctx.lineTo(CX + ox + 3, y + 90); ctx.arc(CX + ox, y + 90, 4, 0, Math.PI); ctx.closePath(); ctx.fill(); });
  ashFlakes(ctx, 30, r, 'rgba(26,20,16,0.5)');
};

// XXVII — The Ferryman: a punt on black water, a hooded boatman, a passenger who does not look back.
SCENES['the-ferryman'] = (ctx, r) => {
  const waterY = 900;
  skyHatch(ctx, PX, PY, PW, waterY, 'rgba(26,20,16,0.6)', 5, 26, r);
  // fog on the far bank
  ctx.save(); ctx.globalAlpha = 0.3; skyline(ctx, waterY - 40, 200, r); ctx.restore();
  for (let i = 0; i < 6; i++) { ctx.save(); ctx.globalAlpha = 0.12; ctx.filter = 'blur(16px)'; ctx.fillStyle = C.parch; ellipse(ctx, PX + r() * PW, waterY - 60 - r() * 120, 200 + r() * 200, 30); ctx.fill(); ctx.restore(); }
  // water
  ctx.fillStyle = 'rgba(26,20,16,0.88)'; ctx.fillRect(PX, waterY, PW, PB - waterY);
  water(ctx, PX, PX + PW, waterY + 20, PB, r, 'rgba(203,187,154,0.3)');
  // the light on the prow, reflected
  glow(ctx, CX + 210, 900, 240, C.candle, 0.5);
  ctx.fillStyle = 'rgba(224,163,74,0.25)'; ctx.beginPath(); ctx.moveTo(CX + 190, 940); ctx.lineTo(CX + 230, 940); ctx.lineTo(CX + 280, PB); ctx.lineTo(CX + 120, PB); ctx.closePath(); ctx.fill();
  // punt
  boat(ctx, CX, 1010, 300, C.ink);
  line(ctx, CX + 300, 1010 - 300 * 0.35, CX + 300, 900, C.ink, 8); lantern(ctx, CX + 300, 880, 30);
  // ferryman standing at the stern with pole
  figure(ctx, CX - 190, 985, 460, { hood: true });
  line(ctx, CX - 150, 700, CX - 30, 1200, C.ink, 10);
  line(ctx, CX - 160, 720, CX - 130, 760, C.ink, 24);
  // passenger seated, back to us, hands folded
  ctx.fillStyle = C.ink; ctx.beginPath(); ctx.moveTo(CX + 30, 985); ctx.quadraticCurveTo(CX + 30, 820, CX + 100, 800); ctx.quadraticCurveTo(CX + 170, 820, CX + 170, 985); ctx.closePath(); ctx.fill();
  circle(ctx, CX + 100, 780, 34); ctx.fill();
  // a single coin held up by the ferryman's free hand
  coin(ctx, CX - 250, 700, 20);
  // faces in the water
  ctx.save(); ctx.globalAlpha = 0.35; skull(ctx, PX + 160, 1180, 60, C.parch, C.ink); skull(ctx, PX + PW - 200, 1230, 50, C.parch, C.ink); skull(ctx, PX + 380, 1260, 44, C.parch, C.ink); ctx.restore();
  ripples(ctx, CX - 30, 1200, 200, 3, 'rgba(203,187,154,0.4)');
  // reeds
  ctx.strokeStyle = C.ink; ctx.lineWidth = 4; for (let i = 0; i < 12; i++) { const x = PX + 20 + r() * 160; ctx.beginPath(); ctx.moveTo(x, PB); ctx.quadraticCurveTo(x + 10, 1180, x + (r() - 0.5) * 40, 1080 + r() * 80); ctx.stroke(); }
  crowFlying(ctx, PX + PW - 160, 460, 30);
};

// XXVIII — The Bone Hand: a skeletal hand open in offering, three charms on cords: a bone, a key, an eye.
SCENES['bone-hand'] = (ctx, r) => {
  skyHatch(ctx, PX, PY, PW, PB, 'rgba(26,20,16,0.55)', 6, 16, r);
  rays(ctx, CX, 700, 120, 640, 72, C.ink, 1.4, 0.5, r);
  // dark cloth sleeve rising from below
  ctx.fillStyle = C.ink; ctx.beginPath(); ctx.moveTo(CX - 260, PB); ctx.quadraticCurveTo(CX - 200, 1000, CX - 130, 960); ctx.lineTo(CX + 130, 960); ctx.quadraticCurveTo(CX + 200, 1000, CX + 260, PB); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(CX - 260, PB); ctx.quadraticCurveTo(CX - 200, 1000, CX - 130, 960); ctx.lineTo(CX + 130, 960); ctx.quadraticCurveTo(CX + 200, 1000, CX + 260, PB); ctx.closePath(); hatch(ctx, 1.1, 14, 1.2, 'rgba(203,187,154,0.2)');
  glow(ctx, CX, 720, 300, C.candle, 0.3);
  boneHand(ctx, CX, 800, 220, C.parch, C.ink);
  // three charms hanging from the fingers on cords
  const charms = [[CX - 150, 560, 'bone'], [CX, 470, 'key'], [CX + 150, 560, 'eye']];
  charms.forEach(([x, y, kind]) => {
    rope(ctx, [[x, y - 160], [x - 4, y - 60], [x, y]], 3, C.parchDark);
    glow(ctx, x, y + 20, 80, C.candle, 0.35);
    if (kind === 'bone') { ctx.fillStyle = C.parch; ctx.strokeStyle = C.ink; ctx.lineWidth = 3; ctx.save(); ctx.translate(x, y + 30); ctx.rotate(0.4); ctx.beginPath(); ctx.roundRect(-40, -8, 80, 16, 8); ctx.fill(); ctx.stroke(); [-40, 40].forEach(k => { circle(ctx, k, -8, 10); ctx.fill(); ctx.stroke(); circle(ctx, k, 8, 10); ctx.fill(); ctx.stroke(); }); ctx.restore(); }
    if (kind === 'key') { ctx.fillStyle = C.candle; ctx.strokeStyle = C.ink; ctx.lineWidth = 3; circle(ctx, x, y + 20, 24); ctx.fill(); ctx.stroke(); circle(ctx, x, y + 20, 10); ctx.fillStyle = C.parch; ctx.fill(); ctx.stroke(); ctx.fillStyle = C.candle; ctx.fillRect(x - 7, y + 40, 14, 90); ctx.strokeRect(x - 7, y + 40, 14, 90); ctx.fillRect(x + 7, y + 110, 20, 10); ctx.strokeRect(x + 7, y + 110, 20, 10); ctx.fillRect(x + 7, y + 90, 14, 10); ctx.strokeRect(x + 7, y + 90, 14, 10); }
    if (kind === 'eye') { ctx.fillStyle = C.parch; circle(ctx, x, y + 30, 34); ctx.fill(); ctx.strokeStyle = C.ink; ctx.lineWidth = 3; ctx.stroke(); eye(ctx, x, y + 30, 54, C.ink); ctx.fillStyle = C.blood; circle(ctx, x, y + 30, 6); ctx.fill(); }
  });
  // small candles at the wrist
  candle(ctx, CX - 200, 1120, 16, 60, true); candle(ctx, CX + 200, 1120, 16, 80, true);
  // moths
  crowFlying(ctx, CX - 250, 400, 14, C.parchDark); crowFlying(ctx, CX + 280, 440, 12, C.parchDark);
};

// XXIX — The Last Candle: a candle stub burning down in a vast dark room, the dawn a grey line at the shutter.
SCENES['last-candle'] = (ctx, r) => {
  // black room
  ctx.fillStyle = 'rgba(26,20,16,0.92)'; ctx.fillRect(PX, PY, PW, PH);
  // the shutter with a grey seam of dawn
  ctx.fillStyle = C.parchDark; ctx.fillRect(CX + 150, PY + 140, 12, 520); glow(ctx, CX + 156, PY + 400, 90, C.parch, 0.25);
  ctx.strokeStyle = 'rgba(203,187,154,0.25)'; ctx.lineWidth = 3; ctx.strokeRect(CX + 40, PY + 140, 240, 520); for (let i = 1; i < 8; i++) line(ctx, CX + 40, PY + 140 + i * 65, CX + 280, PY + 140 + i * 65, 'rgba(203,187,154,0.2)', 2);
  // table
  ctx.fillStyle = 'rgba(203,187,154,0.18)'; ctx.fillRect(PX + 60, 1000, PW - 120, 20);
  // candle pool of light
  glow(ctx, CX - 80, 880, 420, C.candle, 0.7);
  glow(ctx, CX - 80, 900, 180, C.candle, 0.9);
  // wax pooled on the table
  ctx.fillStyle = C.bone; ctx.beginPath(); ctx.ellipse(CX - 80, 1000, 110, 26, 0, 0, TAU); ctx.fill(); ctx.strokeStyle = C.ink; ctx.lineWidth = 2; ctx.stroke();
  for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.ellipse(CX - 80 + (r() - 0.5) * 200, 1004 + (r() - 0.5) * 30, 14 + r() * 30, 6 + r() * 6, 0, 0, TAU); ctx.fill(); ctx.stroke(); }
  // the stub
  candle(ctx, CX - 80, 1000, 60, 70, true);
  flame(ctx, CX - 80, 922, 44);
  // things at the edge of the light: a letter, a ring, a knife
  ctx.fillStyle = C.parch; ctx.save(); ctx.translate(CX + 120, 990); ctx.rotate(-0.2); ctx.fillRect(-70, -50, 140, 100); ctx.fillStyle = 'rgba(26,20,16,0.6)'; for (let i = 0; i < 6; i++) ctx.fillRect(-56, -36 + i * 14, 100 - (i === 5 ? 50 : 0), 2); ctx.restore();
  coin(ctx, CX - 260, 990, 14, C.candle);
  // a hand resting near the candle, asleep
  ctx.fillStyle = C.ink; ellipse(ctx, CX - 330, 990, 90, 34, 0.1); ctx.fill(); for (let i = 0; i < 4; i++) { ctx.save(); ctx.translate(CX - 260 + i * 6, 975 + i * 12); ctx.rotate(-0.2); ctx.fillRect(0, -10, 70 - i * 6, 18); ctx.restore(); }
  ctx.beginPath(); ctx.moveTo(PX - 20, 1020); ctx.lineTo(CX - 380, 960); ctx.lineTo(CX - 330, 1020); ctx.lineTo(PX - 20, 1120); ctx.closePath(); ctx.fill();
  // smoke rising
  ctx.strokeStyle = 'rgba(203,187,154,0.35)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(CX - 80, 860); ctx.bezierCurveTo(CX - 40, 780, CX - 130, 700, CX - 70, 600); ctx.bezierCurveTo(CX - 30, 520, CX - 110, 460, CX - 90, 380); ctx.stroke();
  // a moth
  crowFlying(ctx, CX - 20, 800, 16, C.parch);
};
