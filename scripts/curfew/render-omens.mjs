// Renders the CURFEW Omen deck (30 fronts + card back) to public/curfew/omens/*.png.
// Usage: node scripts/curfew/render-omens.mjs [--only id,id] [--sheet]
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const outDir = path.join(root, 'public', 'curfew', 'omens');
mkdirSync(outDir, { recursive: true });
const deck = JSON.parse(readFileSync(path.join(root, 'src', 'data', 'curfew', 'omens.json'), 'utf8'));

const args = process.argv.slice(2);
const onlyArg = args.indexOf('--only');
const only = onlyArg >= 0 ? new Set(args[onlyArg + 1].split(',')) : null;
const skipBack = args.includes('--no-back');

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1050, height: 1800 } });
page.on('pageerror', e => { console.error('page error:', e.message); });
await page.goto('file://' + path.join(here, 'card.html'));
await page.evaluate(async () => {
  await Promise.all([
    "700 80px 'Grenze Gotisch'", "500 40px 'Grenze Gotisch'", "400 30px 'EB Garamond'", "italic 400 30px 'EB Garamond'", "600 30px 'EB Garamond'",
    "600 22px 'Barlow Condensed'", "700 40px 'Cinzel'", "700 40px 'Cinzel Decorative'",
  ].map(f => document.fonts.load(f)));
  await document.fonts.ready;
});

function save(dataUrl, file) {
  writeFileSync(file, Buffer.from(dataUrl.split(',')[1], 'base64'));
  console.log('wrote', path.relative(root, file));
}

for (const [i, omen] of deck.omens.entries()) {
  if (only && !only.has(omen.id)) continue;
  const dataUrl = await page.evaluate(([omen, i]) => {
    const scene = SCENES[omen.id];
    if (!scene) throw new Error('no scene for ' + omen.id);
    return renderFront(omen, i, scene);
  }, [omen, i]);
  save(dataUrl, path.join(root, 'public', omen.image));
}
if (!skipBack && (!only || only.has('back'))) {
  const dataUrl = await page.evaluate(() => renderBack());
  save(dataUrl, path.join(outDir, 'back.png'));
}
await browser.close();
