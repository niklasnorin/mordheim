// Scenes 0–XIV. Each receives (ctx, r) with the parchment window already clipped.
'use strict';
const PX = PANEL.x, PY = PANEL.y, PW = PANEL.w, PH = PANEL.h, CX = PANEL.x + PANEL.w / 2, PB = PANEL.y + PANEL.h;
const INKH = 'rgba(26,20,16,0.55)'; // hatch ink

function nightSky(ctx, r, horizon, o = {}) {
  skyHatch(ctx, PX, PY, PW, horizon, 'rgba(26,20,16,0.5)', o.minGap || 7, o.maxGap || 30, r);
  if (o.stars !== false) stars(ctx, o.stars || 18, PX + 30, PY + 60, PX + PW - 30, horizon - 120, r, C.parch);
}
function cityFloor(ctx, r, horizon, o = {}) {
  skyline(ctx, horizon, o.height || 260, r);
  ground(ctx, horizon + (o.drop || 30), r);
  if (o.rubble !== false) rubble(ctx, PX, PX + PW, horizon + (o.drop || 30) - 6, o.rubble || 18, r, C.ink);
}
function litWindows(ctx, n, r, y0, y1, color = C.candle) {
  for (let i = 0; i < n; i++) { const x = PX + 40 + r() * (PW - 80), y = lerp(y0, y1, r()); glow(ctx, x, y, 22, color, 0.5); ctx.fillStyle = color; ctx.fillRect(x - 3, y - 6, 6, 12); }
}

const SCENES = {};

// 0 — The Ash Wind: a hooded wanderer leaning into a storm of ash, cloak streaming, city half-erased.
SCENES['ash-wind'] = (ctx, r) => {
  const horizon = 980;
  skyHatch(ctx, PX, PY, PW, horizon, 'rgba(26,20,16,0.5)', 7, 30, r);
  windLines(ctx, 70, r, 'rgba(26,20,16,0.7)', [PX - 40, PY + 120, PX + PW, horizon]);
  ctx.save(); ctx.globalAlpha = 0.5; skyline(ctx, horizon - 40, 220, r); ctx.restore();
  ground(ctx, horizon, r);
  // wanderer
  ctx.save(); ctx.translate(CX - 40, horizon + 10); ctx.rotate(-0.12); figure(ctx, 0, 0, 520, { hood: true, staff: true }); ctx.restore();
  // streaming cloak
  ctx.fillStyle = C.ink; ctx.beginPath(); ctx.moveTo(CX - 20, horizon - 360); ctx.quadraticCurveTo(CX + 120, horizon - 420, CX + 300, horizon - 300); ctx.quadraticCurveTo(CX + 160, horizon - 330, CX + 60, horizon - 240); ctx.closePath(); ctx.fill();
  ashFlakes(ctx, 260, r, 'rgba(26,20,16,0.65)'); ashFlakes(ctx, 90, r, 'rgba(217,205,184,0.9)');
  windLines(ctx, 30, r, 'rgba(26,20,16,0.5)', [PX, horizon + 40, PX + PW, PB]);
};

// I — The Drowned Bell: a great bell sunk in black water, its rope rising to nothing.
SCENES['drowned-bell'] = (ctx, r) => {
  const waterY = 760;
  nightSky(ctx, r, waterY - 200, { stars: 12 });
  skyline(ctx, waterY - 190, 160, r);
  // water fill
  ctx.fillStyle = 'rgba(26,20,16,0.85)'; ctx.fillRect(PX, waterY - 190 + 40, PW, PB - waterY + 200);
  const g = ctx.createLinearGradient(0, waterY - 150, 0, PB); g.addColorStop(0, 'rgba(26,20,16,0)'); g.addColorStop(1, 'rgba(14,13,12,0.9)'); ctx.fillStyle = g; ctx.fillRect(PX, waterY - 150, PW, PB - waterY + 150);
  water(ctx, PX, PX + PW, waterY - 140, PB, r, 'rgba(203,187,154,0.35)');
  // bell (parchment-toned so it reads against the black water) with a submerged half
  rope(ctx, [[CX, PY + 40], [CX - 4, waterY - 300], [CX, waterY - 250]], 6, C.blood);
  bell(ctx, CX, waterY + 20, 300, { color: C.parch, hi: C.ink });
  // waterline distort: dark band across the bell
  ctx.save(); ctx.beginPath(); ctx.rect(PX, waterY - 30, PW, 600); ctx.clip();
  ctx.globalAlpha = 0.55; bell(ctx, CX + 6, waterY + 20, 300, { color: C.ink, hi: C.parch, noClapper: true }); ctx.restore();
  ripples(ctx, CX, waterY - 30, 380, 5, 'rgba(203,187,154,0.6)');
  // bubbles
  ctx.strokeStyle = 'rgba(203,187,154,0.6)'; ctx.lineWidth = 1.5;
  for (let i = 0; i < 14; i++) { circle(ctx, CX - 120 + r() * 240, waterY + 60 + r() * 380, 2 + r() * 6); ctx.stroke(); }
  skull(ctx, CX + 250, PB - 60, 70, 'rgba(203,187,154,0.55)', 'rgba(26,20,16,0.9)');
};

// II — The Hanged Merchant: a gibbet at a crossroads, coins spilling from the dead man's purse.
SCENES['hanged-merchant'] = (ctx, r) => {
  const horizon = 1020;
  nightSky(ctx, r, horizon - 60, { stars: 14 });
  moon(ctx, PX + 150, PY + 300, 70, C.parch, 0.7);
  cityFloor(ctx, r, horizon - 40, { height: 200, rubble: 10 });
  gallows(ctx, CX - 190, horizon + 10, 520);
  // hanged figure
  const hx = CX + 200; const ropeTop = horizon + 10 - 520 * 1.55;
  rope(ctx, [[hx, ropeTop], [hx, ropeTop + 120]], 6, C.blood);
  ctx.save(); ctx.translate(hx, ropeTop + 120); ctx.rotate(0.06);
  ctx.fillStyle = C.ink; circle(ctx, 0, 24, 30); ctx.fill(); // head, slumped
  ctx.beginPath(); ctx.moveTo(-40, 50); ctx.lineTo(40, 50); ctx.lineTo(48, 260); ctx.lineTo(-48, 260); ctx.closePath(); ctx.fill(); // coat
  ctx.fillRect(-36, 250, 26, 130); ctx.fillRect(10, 250, 26, 130); // legs
  line(ctx, -34, 70, -70, 210, C.ink, 18); line(ctx, 34, 70, 66, 220, C.ink, 18); // arms hanging
  // waistcoat buttons & chain
  ctx.fillStyle = C.candle; [90, 130, 170, 210].forEach(y => { circle(ctx, 0, y, 5); ctx.fill(); });
  // purse, spilling
  ctx.fillStyle = C.blood; ellipse(ctx, 62, 240, 22, 28); ctx.fill();
  ctx.restore();
  for (let i = 0; i < 16; i++) coin(ctx, hx + 50 + r() * 60 - 30 + i * 3, ropeTop + 400 + i * 40 + r() * 20, 10 + r() * 6);
  coin(ctx, hx + 20, horizon + 10, 14); coin(ctx, hx + 90, horizon + 18, 13); coin(ctx, hx + 60, horizon + 4, 12);
  crow(ctx, CX - 190 + 520 * 0.8, horizon + 10 - 520 * 1.6, 60, true);
  // sign on post
  ctx.fillStyle = C.parch; ctx.fillRect(CX - 240, horizon - 400, 100, 60); ctx.strokeStyle = C.ink; ctx.lineWidth = 3; ctx.strokeRect(CX - 240, horizon - 400, 100, 60);
  ctx.fillStyle = C.ink; ctx.font = "600 26px 'EB Garamond'"; ctx.textAlign = 'center'; ctx.fillText('SOLD', CX - 190, horizon - 358);
};

// III — Green Light Under Ash: a wyrdstone shard glowing through a cairn of ash and ruin.
SCENES['green-light-under-ash'] = (ctx, r) => {
  const horizon = 900;
  skyHatch(ctx, PX, PY, PW, horizon, 'rgba(26,20,16,0.75)', 4, 22, r);
  skyline(ctx, horizon - 20, 300, r);
  ground(ctx, horizon + 20, r);
  // mound
  ctx.fillStyle = C.ink; ctx.beginPath(); ctx.moveTo(PX - 20, PB); ctx.quadraticCurveTo(CX - 100, horizon - 140, CX + 60, horizon - 230); ctx.quadraticCurveTo(CX + 300, horizon - 100, PX + PW + 20, PB); ctx.closePath(); ctx.fill();
  // the light within
  glow(ctx, CX, horizon - 40, 340, C.wyrd, 0.55);
  glow(ctx, CX, horizon - 40, 160, C.wyrd, 0.9);
  // cracks of light through the mound
  ctx.strokeStyle = C.wyrd; ctx.lineCap = 'round';
  for (let i = 0; i < 9; i++) { const a = -Math.PI * 0.15 - i * 0.09 + r() * 0.05 - Math.PI * 0.2; ctx.lineWidth = 2 + r() * 4; ctx.beginPath(); let x = CX, y = horizon - 40; ctx.moveTo(x, y); for (let k = 0; k < 6; k++) { x += Math.cos(a) * (30 + r() * 30); y += Math.sin(a) * (30 + r() * 30) - 10; ctx.lineTo(x, y); } ctx.stroke(); }
  shard(ctx, CX, horizon - 40, 70, -0.3);
  shard(ctx, CX - 60, horizon + 10, 34, 0.9, false); shard(ctx, CX + 70, horizon + 20, 28, -1.2, false);
  // rubble edges in parchment
  rubble(ctx, PX, PX + PW, horizon - 40, 30, r, C.parchDark, 1.2); rubble(ctx, CX - 250, CX + 250, horizon - 150, 14, r, C.parch, 0.9);
  ashFlakes(ctx, 120, r, 'rgba(217,205,184,0.8)');
  // rats fleeing
  rat(ctx, PX + 130, PB - 90, 60, false, C.parchDark); rat(ctx, PX + PW - 140, PB - 70, 50, true, C.parchDark);
};

// IV — Sigmar's Hammer, Reversed: the warhammer hung head-down above an altar, an eye opening behind it.
SCENES['hammer-reversed'] = (ctx, r) => {
  nightSky(ctx, r, 1000, { stars: false, minGap: 6, maxGap: 30 });
  rays(ctx, CX, 560, 200, 620, 64, C.ink, 1.6, 0.6, r);
  // great eye behind
  ctx.save(); ctx.globalAlpha = 0.9; eye(ctx, CX, 560, 560, C.ink); ctx.restore();
  glow(ctx, CX, 560, 120, C.blood, 0.6);
  // altar
  ctx.fillStyle = C.ink; ctx.fillRect(CX - 260, 1080, 520, 40); ctx.fillRect(CX - 220, 1120, 440, 200);
  ctx.beginPath(); ctx.rect(CX - 220, 1120, 440, 200); hatch(ctx, 0, 10, 1.2, C.parch);
  candle(ctx, CX - 190, 1080, 26, 120, true); candle(ctx, CX + 190, 1080, 26, 90, true);
  // hammer, reversed (head down), hanging from a chain
  chain(ctx, CX, PY + 20, CX, PY + 150, 16, C.ink);
  hammer(ctx, CX, 700, 330, Math.PI);
  // blood drop from the head
  ctx.fillStyle = C.blood; ctx.beginPath(); ctx.moveTo(CX + 30, 800); ctx.quadraticCurveTo(CX + 50, 850, CX + 30, 870); ctx.quadraticCurveTo(CX + 10, 850, CX + 30, 800); ctx.fill();
  circle(ctx, CX + 40, 1075, 14); ctx.fill();
  skyline(ctx, 1000, 180, r, 'rgba(26,20,16,0.35)');
};

// V — The Rat King's Court: a crowned rat enthroned in a sewer arch, courtiers in the dark.
SCENES['rat-kings-court'] = (ctx, r) => {
  // sewer tunnel: dark arch with brick hatching
  ctx.fillStyle = C.ink; ctx.fillRect(PX, PY, PW, PH);
  ctx.save(); ctx.beginPath(); ctx.moveTo(PX + 100, PB); ctx.lineTo(PX + 100, PY + 420); ctx.arc(CX, PY + 420, PW / 2 - 100, Math.PI, 0); ctx.lineTo(PX + PW - 100, PB); ctx.closePath(); ctx.clip();
  ctx.fillStyle = C.parchDark; ctx.fillRect(PX, PY, PW, PH);
  // depth gradient
  const g = ctx.createRadialGradient(CX, 880, 60, CX, 880, 520); g.addColorStop(0, 'rgba(26,20,16,0.95)'); g.addColorStop(0.5, 'rgba(26,20,16,0.5)'); g.addColorStop(1, 'rgba(26,20,16,0)'); ctx.fillStyle = g; ctx.fillRect(PX, PY, PW, PH);
  // bricks
  ctx.strokeStyle = 'rgba(26,20,16,0.6)'; ctx.lineWidth = 2;
  for (let y = PY + 60; y < PB; y += 44) { line(ctx, PX, y, PX + PW, y, 'rgba(26,20,16,0.6)', 2); for (let x = PX + ((y / 44) % 2) * 45; x < PX + PW; x += 90) line(ctx, x, y, x, y + 44, 'rgba(26,20,16,0.6)', 2); }
  // water channel
  ctx.fillStyle = 'rgba(26,20,16,0.85)'; ctx.fillRect(PX, 1120, PW, 200); water(ctx, PX, PX + PW, 1130, PB, r, 'rgba(111,207,122,0.35)');
  ctx.restore();
  // arch stones
  ctx.strokeStyle = C.parchDark; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(CX, PY + 420, PW / 2 - 100, Math.PI, 0); ctx.stroke();
  for (let a = Math.PI; a <= TAU; a += Math.PI / 14) line(ctx, CX + Math.cos(a) * (PW / 2 - 100), PY + 420 + Math.sin(a) * (PW / 2 - 100), CX + Math.cos(a) * (PW / 2 - 60), PY + 420 + Math.sin(a) * (PW / 2 - 60), C.parchDark, 4);
  // throne of bones
  ctx.fillStyle = C.parch;
  for (let i = 0; i < 40; i++) { const x = CX - 150 + r() * 300, y = 1060 - r() * 220 * (1 - Math.abs(x - CX) / 200); ctx.save(); ctx.translate(x, y); ctx.rotate(r() * TAU); ctx.beginPath(); ctx.roundRect(-20, -4, 40, 8, 4); ctx.fill(); ctx.restore(); }
  for (let i = 0; i < 6; i++) skull(ctx, CX - 130 + i * 52, 1080 - Math.abs(i - 2.5) * 20, 40, C.parch, C.ink);
  // rat king
  glow(ctx, CX, 900, 220, C.candle, 0.35);
  rat(ctx, CX, 900, 160, false, C.ink);
  crown(ctx, CX + 96, 858, 60);
  // courtiers: eyes in the dark
  ctx.fillStyle = C.blood;
  for (let i = 0; i < 22; i++) { const x = PX + 40 + r() * (PW - 80), y = 700 + r() * 380; if (Math.abs(x - CX) < 200 && y > 780) continue; circle(ctx, x, y, 3); ctx.fill(); circle(ctx, x + 12, y, 3); ctx.fill(); }
  rat(ctx, PX + 160, 1110, 70, false, C.ink); rat(ctx, PX + PW - 160, 1105, 70, true, C.ink); rat(ctx, PX + 300, 1130, 50, true, C.ink);
};

// VI — The Empty Cradle: a cradle by a shuttered window, a single candle, a rocking that has stopped.
SCENES['empty-cradle'] = (ctx, r) => {
  // interior wall hatch
  skyHatch(ctx, PX, PY, PW, 1040, 'rgba(26,20,16,0.55)', 9, 9, r);
  ctx.fillStyle = C.ink; ctx.fillRect(PX, 1040, PW, PB - 1040);
  ctx.beginPath(); ctx.rect(PX, 1040, PW, PB - 1040); hatch(ctx, 0, 12, 1.2, C.parchDark);
  // window with night behind
  ctx.fillStyle = C.ink; ctx.fillRect(CX + 90, PY + 200, 220, 320);
  ctx.save(); ctx.beginPath(); ctx.rect(CX + 90, PY + 200, 220, 320); ctx.clip();
  stars(ctx, 12, CX + 100, PY + 210, CX + 300, PY + 440, r, C.parch);
  moon(ctx, CX + 240, PY + 290, 34, C.parch, 0.45, C.ink);
  skyline(ctx, PY + 520, 120, r, 'rgba(26,20,16,1)', CX + 80, CX + 320);
  ctx.restore();
  ctx.strokeStyle = C.parchDark; ctx.lineWidth = 10; ctx.strokeRect(CX + 90, PY + 200, 220, 320); line(ctx, CX + 200, PY + 200, CX + 200, PY + 520, C.parchDark, 6); line(ctx, CX + 90, PY + 360, CX + 310, PY + 360, C.parchDark, 6);
  // cradle
  const cx = CX - 110, cy = 1000;
  ctx.fillStyle = C.ink; ctx.strokeStyle = C.ink; ctx.lineWidth = 8; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.arc(cx, cy - 130, 190, 0.25, Math.PI - 0.25); ctx.stroke(); // rocker
  ctx.beginPath(); ctx.moveTo(cx - 170, cy - 210); ctx.lineTo(cx - 140, cy - 60); ctx.lineTo(cx + 140, cy - 60); ctx.lineTo(cx + 170, cy - 210); ctx.closePath(); ctx.fill();
  // hood
  ctx.beginPath(); ctx.moveTo(cx - 170, cy - 210); ctx.quadraticCurveTo(cx - 170, cy - 380, cx - 20, cy - 380); ctx.lineTo(cx - 20, cy - 210); ctx.closePath(); ctx.fill();
  // blanket inside, empty hollow
  ctx.fillStyle = C.parch; ctx.beginPath(); ctx.moveTo(cx - 150, cy - 210); ctx.quadraticCurveTo(cx, cy - 170, cx + 150, cy - 210); ctx.lineTo(cx + 140, cy - 190); ctx.quadraticCurveTo(cx, cy - 150, cx - 140, cy - 190); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.rect(cx - 140, cy - 210, 280, 30); hatch(ctx, 0.3, 5, 1, INKH);
  // slats
  for (let i = -3; i <= 3; i++) line(ctx, cx + i * 40, cy - 200, cx + i * 36, cy - 70, C.parchDark, 2);
  // rocking motion ghost
  ctx.save(); ctx.globalAlpha = 0.18; ctx.translate(cx, cy - 130); ctx.rotate(0.12); ctx.translate(-cx, -(cy - 130)); ctx.fillStyle = C.ink; ctx.beginPath(); ctx.moveTo(cx - 170, cy - 210); ctx.lineTo(cx - 140, cy - 60); ctx.lineTo(cx + 140, cy - 60); ctx.lineTo(cx + 170, cy - 210); ctx.closePath(); ctx.fill(); ctx.restore();
  // stool and candle
  ctx.fillStyle = C.ink; ctx.fillRect(CX + 150, 980, 120, 14); ctx.fillRect(CX + 160, 994, 12, 60); ctx.fillRect(CX + 248, 994, 12, 60);
  candle(ctx, CX + 210, 980, 26, 110, true);
  // a small shoe on the floor
  ctx.fillStyle = C.blood; ellipse(ctx, cx - 240, 1070, 26, 12); ctx.fill(); ctx.fillRect(cx - 250, 1048, 22, 22);
};

// VII — The Lantern-Bearer: a hooded figure in fog, lantern raised, looking straight out of the card.
SCENES['lantern-bearer'] = (ctx, r) => {
  const horizon = 1060;
  skyHatch(ctx, PX, PY, PW, horizon, 'rgba(26,20,16,0.45)', 6, 20, r);
  ctx.save(); ctx.globalAlpha = 0.35; skyline(ctx, horizon - 100, 340, r); ctx.restore();
  ctx.save(); ctx.globalAlpha = 0.6; skyline(ctx, horizon - 40, 220, r); ctx.restore();
  ground(ctx, horizon, r);
  // fog bands
  for (let i = 0; i < 8; i++) { const y = 700 + i * 60; ctx.save(); ctx.globalAlpha = 0.10 + r() * 0.08; ctx.filter = 'blur(14px)'; const g = ctx.createLinearGradient(0, y - 40, 0, y + 40); g.addColorStop(0, 'rgba(203,187,154,0)'); g.addColorStop(0.5, C.parch); g.addColorStop(1, 'rgba(203,187,154,0)'); ctx.fillStyle = g; ctx.fillRect(PX - 40, y - 40, PW + 80, 80); ctx.restore(); }
  // figure, large, lantern raised
  glow(ctx, CX + 150, 560, 380, C.candle, 0.45);
  figure(ctx, CX - 30, horizon + 30, 760, { hood: true });
  line(ctx, CX + 20, 560, CX + 130, 480, C.ink, 40);
  lantern(ctx, CX + 150, 470, 46);
  // face: two pale points under the hood
  ctx.fillStyle = C.candle; circle(ctx, CX - 48, 400, 4); ctx.fill(); circle(ctx, CX - 14, 400, 4); ctx.fill();
  // rats / footprints in light
  ctx.fillStyle = 'rgba(224,163,74,0.2)'; ctx.beginPath(); ctx.moveTo(CX + 150, 520); ctx.lineTo(CX - 120, PB); ctx.lineTo(CX + 420, PB); ctx.closePath(); ctx.fill();
  ashFlakes(ctx, 60, r, 'rgba(217,205,184,0.7)');
};

// VIII — The Comet: the twin-tailed comet tearing the sky above the city, rooftops burning.
SCENES['the-comet'] = (ctx, r) => {
  const horizon = 1040;
  skyHatch(ctx, PX, PY, PW, horizon - 20, 'rgba(26,20,16,0.85)', 3, 18, r);
  stars(ctx, 30, PX + 30, PY + 40, PX + PW - 30, horizon - 300, r, C.parch);
  // shockwave rings
  ctx.strokeStyle = 'rgba(26,20,16,0.35)'; for (let i = 1; i <= 5; i++) { ctx.lineWidth = 1.4; circle(ctx, CX + 60, 660, 80 * i); ctx.stroke(); }
  comet(ctx, CX + 60, 660, 62, Math.PI * 0.82, C.candle, 'rgba(111,207,122,0.7)');
  ctx.save(); ctx.globalAlpha = 0.3; comet(ctx, CX + 60, 660, 62, Math.PI * 0.82, C.wyrd); ctx.restore();
  skyline(ctx, horizon, 300, r);
  // fires in the city
  for (let i = 0; i < 7; i++) { const x = PX + 60 + r() * (PW - 120), y = horizon - 40 - r() * 140; glow(ctx, x, y, 50 + r() * 40, C.candle, 0.7); flame(ctx, x, y + 20, 14 + r() * 12, C.candle); }
  ground(ctx, horizon + 30, r);
  // fleeing figures
  figure(ctx, CX - 260, horizon + 30, 130, { hood: true, arms: 'raised' }); figure(ctx, CX - 180, horizon + 34, 110, { arms: 'raised', flip: true }); figure(ctx, CX + 300, horizon + 30, 120, { hood: true, flip: true });
  ashFlakes(ctx, 100, r, 'rgba(224,163,74,0.8)');
};

// IX — The Broken Bell: a cracked bell still swinging in a ruined belfry, bats or crows startled.
SCENES['broken-bell'] = (ctx, r) => {
  nightSky(ctx, r, 1100, { stars: 16 });
  moon(ctx, PX + 170, PY + 250, 60, C.parch, 1);
  // belfry frame
  ctx.fillStyle = C.ink;
  ctx.fillRect(PX + 120, PY + 200, 60, PH); ctx.fillRect(PX + PW - 180, PY + 200, 60, PH);
  ctx.beginPath(); ctx.moveTo(PX + 90, PY + 230); ctx.lineTo(CX, PY + 20); ctx.lineTo(PX + PW - 90, PY + 230); ctx.lineTo(PX + PW - 90, PY + 270); ctx.lineTo(CX, PY + 60); ctx.lineTo(PX + 90, PY + 270); ctx.closePath(); ctx.fill();
  ctx.fillRect(PX + 120, PY + 250, PW - 240, 40);
  // broken masonry on left pillar
  ctx.fillStyle = C.parch; ctx.beginPath(); ctx.moveTo(PX + 120, 700); ctx.lineTo(PX + 180, 680); ctx.lineTo(PX + 180, 760); ctx.lineTo(PX + 150, 740); ctx.closePath(); ctx.fill();
  // stone floor
  ground(ctx, 1100, r); rubble(ctx, PX, PX + PW, 1094, 22, r);
  // bell, swung, cracked
  ctx.save(); ctx.translate(CX, PY + 290); ctx.rotate(0.22);
  line(ctx, 0, 0, 0, 60, C.ink, 10);
  bell(ctx, 0, 400, 330, { crack: true });
  ctx.restore();
  // motion arcs
  ctx.strokeStyle = 'rgba(26,20,16,0.45)'; ctx.lineWidth = 2; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(CX, PY + 290, 480 + i * 18, Math.PI * 0.35, Math.PI * 0.5); ctx.stroke(); }
  // a fallen piece of bell
  ctx.fillStyle = C.ink; ctx.beginPath(); ctx.moveTo(CX + 150, 1100); ctx.quadraticCurveTo(CX + 200, 1040, CX + 260, 1090); ctx.lineTo(CX + 250, 1108); ctx.closePath(); ctx.fill();
  crowFlying(ctx, PX + 260, PY + 420, 40); crowFlying(ctx, PX + 330, PY + 360, 30); crowFlying(ctx, PX + PW - 300, PY + 520, 34);
  // sound rings
  ctx.strokeStyle = 'rgba(26,20,16,0.35)'; ctx.setLineDash([6, 10]); for (let i = 1; i <= 3; i++) { circle(ctx, CX + 80, 640, 300 + i * 60); ctx.stroke(); } ctx.setLineDash([]);
};

// X — The Fence's Scales: a pair of scales in a cellar, a skull on one pan and coin on the other; the coin wins.
SCENES['fences-scales'] = (ctx, r) => {
  // cellar
  ctx.fillStyle = 'rgba(26,20,16,0.12)'; ctx.fillRect(PX, PY, PW, PH);
  skyHatch(ctx, PX, PY, PW, 1000, 'rgba(26,20,16,0.5)', 8, 8, r);
  // hanging things in shadow: keys, a dagger, rope
  ctx.strokeStyle = C.ink; ctx.lineWidth = 3;
  [[PX + 120, 260], [PX + 200, 300], [PX + PW - 150, 240], [PX + PW - 230, 320]].forEach(([x, l]) => { line(ctx, x, PY, x, PY + l, C.ink, 3); circle(ctx, x, PY + l + 14, 14); ctx.stroke(); ctx.fillRect(x - 3, PY + l + 26, 6, 40); ctx.fillRect(x + 3, PY + l + 50, 10, 5); });
  // table
  ctx.fillStyle = C.ink; ctx.fillRect(PX + 40, 1000, PW - 80, 30); ctx.fillRect(PX + 80, 1030, 30, 260); ctx.fillRect(PX + PW - 110, 1030, 30, 260);
  ctx.beginPath(); ctx.rect(PX + 40, 1000, PW - 80, 30); hatch(ctx, 0, 6, 1, C.parchDark);
  glow(ctx, CX, 800, 380, C.candle, 0.35);
  scales(ctx, CX, 1000, 380);
  // pans contents (approximate pan positions from scales(): beam rotated -0.12)
  const bx = CX, by = 1000 - 380 * 1.3; const ang = -0.12;
  const lp = [bx + Math.cos(ang) * -266 - Math.sin(ang) * 209, by + Math.sin(ang) * -266 + Math.cos(ang) * 209];
  const rp = [bx + Math.cos(ang) * 266 - Math.sin(ang) * 209, by + Math.sin(ang) * 266 + Math.cos(ang) * 209];
  skull(ctx, lp[0], lp[1] - 40, 80, C.parch, C.ink);
  coin(ctx, rp[0] - 18, rp[1] - 14, 22); coin(ctx, rp[0] + 16, rp[1] - 18, 22); coin(ctx, rp[0], rp[1] - 42, 20);
  // wyrdstone on the table, a single glint of green
  shard(ctx, CX + 250, 985, 28, 0.6, true); shard(ctx, CX + 290, 990, 20, -0.6, false);
  // the fence's hands on the table edge
  ctx.fillStyle = C.ink; [CX - 300, CX + 220].forEach(x => { ellipse(ctx, x, 1000, 46, 16); ctx.fill(); for (let i = 0; i < 4; i++) ctx.fillRect(x - 36 + i * 22, 960, 12, 44); });
  candle(ctx, PX + 130, 1000, 22, 80, true);
};

// XI — The Plague Doctor: beaked mask, wide hat, a tally staff; chalk crosses on the doors behind.
SCENES['plague-doctor'] = (ctx, r) => {
  const horizon = 1080;
  skyHatch(ctx, PX, PY, PW, horizon, 'rgba(26,20,16,0.6)', 6, 22, r);
  // street of doors
  ctx.fillStyle = 'rgba(26,20,16,0.85)'; ctx.fillRect(PX, PY + 200, PW, horizon - PY - 200);
  ctx.beginPath(); ctx.rect(PX, PY + 200, PW, horizon - PY - 200); hatch(ctx, 0, 14, 1, C.parchDark);
  [PX + 60, PX + 300, PX + PW - 240].forEach((x, i) => { door(ctx, x, 640, 130, 440, C.parchDark);
    // red cross
    ctx.strokeStyle = C.blood; ctx.lineWidth = 12; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x + 30, 760); ctx.lineTo(x + 100, 900); ctx.moveTo(x + 100, 760); ctx.lineTo(x + 30, 900); ctx.stroke(); });
  ground(ctx, horizon, r);
  // doctor
  const fx = CX + 40, base = horizon + 30, h = 760, s = h / 100;
  ctx.fillStyle = C.ink;
  ctx.beginPath(); ctx.moveTo(fx - 30 * s, 0 + base); ctx.quadraticCurveTo(fx - 30 * s, base - 50 * s, fx - 14 * s, base - 78 * s); ctx.lineTo(fx + 14 * s, base - 78 * s); ctx.quadraticCurveTo(fx + 30 * s, base - 50 * s, fx + 30 * s, base); ctx.closePath(); ctx.fill();
  // coat buttons
  ctx.fillStyle = C.parch; for (let i = 0; i < 7; i++) { circle(ctx, fx, base - 70 * s + i * 8 * s, 2.5 * s * 0.6); ctx.fill(); }
  // head with hat & beak
  ctx.fillStyle = C.ink; circle(ctx, fx, base - 88 * s, 11 * s); ctx.fill();
  ctx.beginPath(); ctx.moveTo(fx + 6 * s, base - 88 * s); ctx.quadraticCurveTo(fx + 30 * s, base - 84 * s, fx + 40 * s, base - 72 * s); ctx.quadraticCurveTo(fx + 26 * s, base - 78 * s, fx + 6 * s, base - 80 * s); ctx.closePath(); ctx.fill(); // beak
  ctx.fillRect(fx - 10 * s, base - 120 * s, 20 * s, 24 * s); ellipse(ctx, fx, base - 96 * s, 30 * s, 4.5 * s); ctx.fill(); // hat
  // glass eye
  circle(ctx, fx + 3 * s, base - 90 * s, 4 * s); ctx.fillStyle = C.blood; ctx.fill(); ctx.strokeStyle = C.parch; ctx.lineWidth = 1.5; ctx.stroke();
  // staff with tallies
  line(ctx, fx - 40 * s, base + 4 * s, fx - 40 * s, base - 130 * s, C.ink, 6);
  ctx.strokeStyle = C.parch; for (let i = 0; i < 14; i++) line(ctx, fx - 44 * s, base - 120 * s + i * 7 * s, fx - 36 * s, base - 118 * s + i * 7 * s, C.parch, 1.6);
  line(ctx, fx - 26 * s, base - 66 * s, fx - 40 * s, base - 60 * s, C.ink, 5 * s);
  // fumes from the beak
  ctx.strokeStyle = 'rgba(26,20,16,0.4)'; ctx.lineWidth = 2; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(fx + 40 * s, base - 72 * s + i * 4); ctx.bezierCurveTo(fx + 60 * s, base - 90 * s, fx + 50 * s, base - 110 * s, fx + 70 * s, base - 130 * s - i * 20); ctx.stroke(); }
  crow(ctx, PX + 120, 640, 50, false, C.ink);
};

// XII — The Witch Hunter: a silhouette in a doorway, hat brim and torch, the tavern gone silent.
SCENES['witch-hunter'] = (ctx, r) => {
  // tavern interior: dark, with a bright doorway
  ctx.fillStyle = C.ink; ctx.fillRect(PX, PY, PW, PH);
  ctx.beginPath(); ctx.rect(PX, PY, PW, PH); hatch(ctx, 0, 16, 1, 'rgba(203,187,154,0.18)');
  // doorway of pale light
  const dx = CX - 170, dy = PY + 130, dw = 340, dh = 900;
  ctx.fillStyle = C.parch; ctx.beginPath(); ctx.moveTo(dx, dy + dh); ctx.lineTo(dx, dy + dw / 2); ctx.arc(dx + dw / 2, dy + dw / 2, dw / 2, Math.PI, 0); ctx.lineTo(dx + dw, dy + dh); ctx.closePath(); ctx.fill();
  ctx.save(); ctx.beginPath(); ctx.moveTo(dx, dy + dh); ctx.lineTo(dx, dy + dw / 2); ctx.arc(dx + dw / 2, dy + dw / 2, dw / 2, Math.PI, 0); ctx.lineTo(dx + dw, dy + dh); ctx.closePath(); ctx.clip();
  skyHatch(ctx, dx, dy, dw, dy + dh, 'rgba(26,20,16,0.35)', 6, 6, r);
  // rain
  ctx.strokeStyle = 'rgba(26,20,16,0.4)'; ctx.lineWidth = 1.2; for (let i = 0; i < 80; i++) { const x = dx + r() * dw, y = dy + r() * dh; line(ctx, x, y, x - 8, y + 40, 'rgba(26,20,16,0.4)', 1.2); }
  ctx.restore();
  // light spill on floor
  ctx.fillStyle = 'rgba(203,187,154,0.35)'; ctx.beginPath(); ctx.moveTo(dx, dy + dh); ctx.lineTo(dx + dw, dy + dh); ctx.lineTo(dx + dw + 220, PB); ctx.lineTo(dx - 220, PB); ctx.closePath(); ctx.fill();
  // floorboards
  for (let i = 0; i < 9; i++) line(ctx, PX, dy + dh + i * 30, PX + PW, dy + dh + i * 30, 'rgba(203,187,154,0.15)', 1.5);
  // the hunter: black on pale
  const base = dy + dh + 10;
  figure(ctx, CX, base, 720, { hat: true });
  // long coat flare
  ctx.fillStyle = C.ink; ctx.beginPath(); ctx.moveTo(CX - 90, base - 500); ctx.lineTo(CX - 150, base); ctx.lineTo(CX + 150, base); ctx.lineTo(CX + 90, base - 500); ctx.closePath(); ctx.fill();
  // wide brim
  ellipse(ctx, CX, base - 690, 180, 26); ctx.fill();
  // torch
  line(ctx, CX + 70, base - 470, CX + 200, base - 640, C.ink, 30);
  glow(ctx, CX + 210, base - 700, 160, C.candle, 0.8); flame(ctx, CX + 210, base - 640, 40);
  // a hammer pendant, small, gold
  ctx.save(); ctx.translate(CX, base - 440); ctx.scale(0.5, 0.5); hammer(ctx, 0, 0, 90, 0, C.candle); ctx.restore();
  // abandoned tankards on a table edge, foreground
  ctx.fillStyle = C.ink; ctx.fillRect(PX, PB - 120, 260, 120); ctx.fillRect(PX + PW - 260, PB - 120, 260, 120);
  [PX + 60, PX + 150, PX + PW - 200, PX + PW - 100].forEach(x => { ctx.fillStyle = C.parchDark; ctx.fillRect(x, PB - 190, 44, 70); ctx.strokeStyle = C.parchDark; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(x + 48, PB - 155, 16, -Math.PI / 2, Math.PI / 2); ctx.stroke(); });
};

// XIII — The Crooked Dice: two bone dice mid-tumble over a tavern table, a cup, spilled coins, a hidden third die.
SCENES['crooked-dice'] = (ctx, r) => {
  ctx.fillStyle = 'rgba(26,20,16,0.2)'; ctx.fillRect(PX, PY, PW, PH);
  skyHatch(ctx, PX, PY, PW, 720, 'rgba(26,20,16,0.55)', 7, 7, r);
  // table
  ctx.fillStyle = C.ink; ctx.beginPath(); ctx.moveTo(PX - 20, 720); ctx.lineTo(PX + PW + 20, 720); ctx.lineTo(PX + PW + 20, PB); ctx.lineTo(PX - 20, PB); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.rect(PX, 720, PW, PB - 720); hatch(ctx, 0.04, 22, 1.4, 'rgba(203,187,154,0.25)');
  // candle light
  glow(ctx, CX, 780, 420, C.candle, 0.35);
  // cup, overturned
  ctx.save(); ctx.translate(CX + 220, 900); ctx.rotate(1.9); ctx.fillStyle = C.parchDark; ctx.beginPath(); ctx.moveTo(-60, -90); ctx.lineTo(60, -90); ctx.lineTo(48, 90); ctx.lineTo(-48, 90); ctx.closePath(); ctx.fill(); ctx.strokeStyle = C.ink; ctx.lineWidth = 3; ctx.stroke(); ellipse(ctx, 0, -90, 60, 16); ctx.fillStyle = C.ink; ctx.fill(); ctx.restore();
  // dice, big, mid-air with motion arcs
  ctx.strokeStyle = 'rgba(203,187,154,0.45)'; ctx.lineWidth = 2; ctx.setLineDash([8, 12]); ctx.beginPath(); ctx.arc(CX - 200, 900, 260, -Math.PI * 0.9, -Math.PI * 0.25); ctx.stroke(); ctx.setLineDash([]);
  die(ctx, CX - 140, 620, 150, -0.35, 1); die(ctx, CX + 40, 700, 140, 0.5, 1);
  // shadows
  ctx.fillStyle = 'rgba(14,13,12,0.6)'; ellipse(ctx, CX - 140, 860, 90, 24); ctx.fill(); ellipse(ctx, CX + 40, 900, 80, 20); ctx.fill();
  // the third die, under a sleeve at the table's edge
  ctx.fillStyle = C.ink; ctx.beginPath(); ctx.moveTo(PX - 20, 1000); ctx.quadraticCurveTo(PX + 200, 940, PX + 330, 1060); ctx.lineTo(PX + 330, PB); ctx.lineTo(PX - 20, PB); ctx.closePath(); ctx.fill();
  die(ctx, PX + 300, 1080, 60, 0.2, 6); ctx.fillStyle = C.ink; ctx.beginPath(); ctx.moveTo(PX + 250, 1030); ctx.quadraticCurveTo(PX + 330, 1020, PX + 340, 1110); ctx.lineTo(PX + 240, 1120); ctx.closePath(); ctx.fill();
  // coins and a knife
  for (let i = 0; i < 9; i++) coin(ctx, CX + 100 + r() * 260, 1000 + r() * 220, 14 + r() * 8);
  ctx.save(); ctx.translate(CX - 60, 1180); ctx.rotate(-0.3); ctx.fillStyle = C.parch; ctx.beginPath(); ctx.moveTo(-160, 0); ctx.lineTo(60, -12); ctx.lineTo(70, 0); ctx.lineTo(60, 12); ctx.closePath(); ctx.fill(); ctx.strokeStyle = C.ink; ctx.lineWidth = 2; ctx.stroke(); ctx.fillStyle = C.ink; ctx.fillRect(60, -18, 90, 36); ctx.restore();
  // shadowy players either side
  ctx.fillStyle = 'rgba(26,20,16,0.85)'; ellipse(ctx, PX + 40, 520, 120, 190); ctx.fill(); ellipse(ctx, PX + PW - 40, 540, 120, 190); ctx.fill();
  ctx.fillStyle = C.blood; circle(ctx, PX + 70, 480, 4); ctx.fill(); circle(ctx, PX + PW - 70, 500, 4); ctx.fill();
};

// XIV — The Pit: two fighters in a torchlit ring, the crowd a wall of hats and raised fists.
SCENES['the-pit'] = (ctx, r) => {
  skyHatch(ctx, PX, PY, PW, 640, 'rgba(26,20,16,0.55)', 6, 14, r);
  ctx.fillStyle = 'rgba(26,20,16,0.35)'; ctx.fillRect(PX, 640, PW, PB - 640);
  ctx.beginPath(); ctx.rect(PX, 640, PW, PB - 640); hatch(ctx, 0.0, 9, 1.2, 'rgba(26,20,16,0.5)');
  ctx.fillStyle = C.ink; ctx.beginPath(); ctx.ellipse(CX, 960, 470, 250, 0, 0, TAU); ctx.fill();
  // torchlight on the pit floor
  glow(ctx, CX, 900, 520, C.candle, 0.55);
  ctx.fillStyle = C.parchDark; ellipse(ctx, CX, 960, 400, 200); ctx.fill();
  ctx.save(); ellipse(ctx, CX, 960, 400, 200); ctx.clip(); ctx.fillStyle = C.parch; ellipse(ctx, CX, 960, 400, 200); ctx.fill(); mottle(ctx, CX - 400, 760, 800, 400, 77, 0.6);
  // blood on sand
  ctx.fillStyle = C.blood; for (let i = 0; i < 12; i++) { ellipse(ctx, CX - 80 + r() * 200, 960 + r() * 120, 6 + r() * 18, 3 + r() * 8); ctx.fill(); }
  ctx.restore();
  // ring wall
  ctx.strokeStyle = C.ink; ctx.lineWidth = 14; ellipse(ctx, CX, 960, 400, 200); ctx.stroke();
  // crowd: silhouettes ringed around the top half, tiers
  for (let tier = 0; tier < 3; tier++) {
    const ry = 700 - tier * 110; const n = 14 + tier * 4;
    for (let i = 0; i < n; i++) {
      const x = PX + 20 + (i / (n - 1)) * (PW - 40) + (r() - 0.5) * 20, y = ry + Math.sin((i / (n - 1)) * Math.PI) * 60 + (r() - 0.5) * 20;
      const s = 60 + tier * 10; const col = tier === 0 ? C.ink : `rgba(26,20,16,${0.9 - tier * 0.25})`;
      ctx.fillStyle = col; circle(ctx, x, y - s * 0.55, s * 0.18); ctx.fill(); ctx.beginPath(); ctx.moveTo(x - s * 0.3, y); ctx.quadraticCurveTo(x, y - s * 0.55, x + s * 0.3, y); ctx.fill();
      if (r() < 0.4) { ctx.fillRect(x - s * 0.16, y - s * 0.95, s * 0.32, s * 0.28); ellipse(ctx, x, y - s * 0.68, s * 0.3, s * 0.05); ctx.fill(); }
      if (r() < 0.5) { line(ctx, x + s * 0.2, y - s * 0.3, x + s * 0.35, y - s * 0.95, col, s * 0.08); circle(ctx, x + s * 0.35, y - s * 1.0, s * 0.09); ctx.fill(); }
    }
  }
  // parchment highlights on the front-row crowd (rim light from the pit)
  ctx.save(); ctx.globalAlpha = 0.5; ctx.strokeStyle = C.candle; ctx.lineWidth = 2; ellipse(ctx, CX, 760, 430, 130); ctx.stroke(); ctx.restore();
  // torches
  [[PX + 70, 640], [PX + PW - 70, 640]].forEach(([x, y]) => { line(ctx, x, y + 160, x, y, C.parchDark, 10); glow(ctx, x, y - 30, 120, C.candle, 0.8); flame(ctx, x, y, 34); });
  // fighters
  const fy = 1010;
  ctx.fillStyle = C.ink;
  // left: lunging with club
  ctx.save(); ctx.translate(CX - 120, fy); ctx.rotate(0.25); figure(ctx, 0, 0, 330, { arms: 'out' }); ctx.restore();
  line(ctx, CX - 20, fy - 180, CX + 40, fy - 300, C.ink, 22); ctx.fillStyle = C.ink; ellipse(ctx, CX + 50, fy - 316, 26, 40, 0.5); ctx.fill();
  // right: reeling, arm up
  ctx.save(); ctx.translate(CX + 150, fy + 10); ctx.rotate(-0.35); figure(ctx, 0, 0, 320, { arms: 'raised', flip: true }); ctx.restore();
  // blood spray
  ctx.fillStyle = C.blood; for (let i = 0; i < 18; i++) { circle(ctx, CX + 120 + r() * 120, fy - 320 + r() * 120, 2 + r() * 5); ctx.fill(); }
  // coins tossed in
  for (let i = 0; i < 6; i++) coin(ctx, PX + 100 + r() * (PW - 200), 760 + r() * 60, 8);
};
