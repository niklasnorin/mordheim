#!/usr/bin/env node
/**
 * Lint the Curfew content: every location pack, the Moons, the Omens and the charms.
 *
 *   node .claude/skills/curfew-pack/scripts/lint-pack.mjs                      # all packs
 *   node .claude/skills/curfew-pack/scripts/lint-pack.mjs fussenbach           # one pack
 *   node .claude/skills/curfew-pack/scripts/lint-pack.mjs fussenbach --month   # also warn where a bank is thin for a month of play
 *
 * Errors (exit 1): a slot the engine does not fill, `{rivalMember}` outside `encounters`, a redirect or inherit
 * to an errand the place lacks, a missing `unavailable` line, a Moon tie-in for an unknown Moon or errand, a
 * charm placed at a location that does not exist, a Cryer headline bank or epithet list missing for an errand
 * the place has. Warnings: STYLE.md breaches the engine cannot catch (exclamation marks, "days/weeks/months",
 * "loot", "team", "party") and, with --month, banks below the size PLAN.md §2a asks of a pack meant for a month
 * of nightly play. `npm test` enforces the hard minimums; this is the finer comb to run before you commit prose.
 *
 * Which slots the engine fills where (src/curfew/engine.ts `resolveNight`, src/curfew/cryer.ts `happeningFor`):
 *   templates, pairs, moonTies   {name} {first} {they} {them} {their} {district} {omen} {rival} {other}
 *   encounters                   the same, plus {rivalMember}
 *   rumours                      {rival} only
 *   cryer.headlines              {first} {name} {warband}
 *   arrival                      {warband}
 *   details, closers, return, cityProvides, quiet, unavailable, blurbs, bylines   no slots; printed as written
 */
import { LOCATIONS, MOONS, OMENS, TOKENS, ERRANDS } from '../../../../src/curfew/engine.ts';

const only = process.argv.slice(2).find((a) => !a.startsWith('--'));
const month = process.argv.includes('--month');
const errors = [];
const warnings = [];
const fail = (m) => errors.push(m);
const warn = (m) => warnings.push(m);

const PROSE_SLOTS = ['name', 'first', 'they', 'them', 'their', 'district', 'omen', 'rival', 'other'];
const ENCOUNTER_SLOTS = [...PROSE_SLOTS, 'rivalMember'];
const RUMOUR_SLOTS = ['rival'];
const HEADLINE_SLOTS = ['first', 'name', 'warband'];
const NO_SLOTS = [];
const MONTH_TARGET = { boon: 12, fair: 16, poor: 12, standing: 6 };

const style = (text, at) => {
  if (/!/.test(text)) warn(`${at}: exclamation mark — "${text.slice(0, 60)}"`);
  if (/\b(days?|weeks?|months?)\b/i.test(text)) warn(`${at}: says days/weeks/months; STYLE.md wants nights, Moons, the Season — "${text.slice(0, 60)}"`);
  if (/\bloot\b/i.test(text)) warn(`${at}: "loot"; wyrdstone is the green, slivers, shards — "${text.slice(0, 60)}"`);
  if (/\b(the team|the party)\b/i.test(text)) warn(`${at}: "team"/"party"; say the warband, the kin, the company`);
};
const slots = (text, allowed, at) => {
  for (const [, slot] of text.matchAll(/\{(\w+)\}/g)) if (!allowed.includes(slot)) fail(`${at}: slot {${slot}} is not filled here (allowed: ${allowed.join(', ')})`);
  style(text, at);
};
const bank = (list, allowed, at) => { if (Array.isArray(list)) for (const [i, t] of list.entries()) slots(t, allowed, `${at}[${i}]`); };
const thin = (m) => { if (month) warn(m); };

const moonIds = new Set(MOONS.map((m) => m.id));
const locationIds = new Set(LOCATIONS.map((l) => l.id));

for (const loc of LOCATIONS) {
  if (only && loc.id !== only) continue;
  const at = `locations/${loc.id}.json`;
  for (const e of ERRANDS) {
    if (loc.errands.includes(e)) {
      const t = loc.templates[e];
      if (!t) { fail(`${at}: templates.${e} missing`); continue; }
      for (const k of ['boon', 'fair', 'poor', 'standing']) {
        if (!t[k]) { fail(`${at}: templates.${e}.${k} missing`); continue; }
        bank(t[k], PROSE_SLOTS, `${at} templates.${e}.${k}`);
        if (t[k].length < MONTH_TARGET[k]) thin(`${at}: templates.${e}.${k} has ${t[k].length}; a month of play wants ${MONTH_TARGET[k]}+`);
      }
      if (!loc.cryer?.headlines?.[e]) fail(`${at}: cryer.headlines.${e} missing`);
      else for (const k of ['boon', 'fair', 'poor']) { const h = loc.cryer.headlines[e][k] ?? []; bank(h, HEADLINE_SLOTS, `${at} cryer.headlines.${e}.${k}`); if (h.length < 8) thin(`${at}: cryer.headlines.${e}.${k} has ${h.length}; a month wants 8+`); }
      if (!loc.epithets?.[e]) fail(`${at}: epithets.${e} missing`); else if (loc.epithets[e].length < 10) thin(`${at}: epithets.${e} has ${loc.epithets[e].length}; a month wants 10+`);
      if (!loc.blurbs?.[e]) warn(`${at}: blurbs.${e} missing; the Watch falls back to the engine's generic blurb`);
    } else {
      if (!loc.unavailable?.[e]) fail(`${at}: unavailable.${e} missing; the Watch shows this line greyed`);
      if (loc.redirect?.[e] && !loc.errands.includes(loc.redirect[e])) fail(`${at}: redirect.${e} → ${loc.redirect[e]}, which the place lacks`);
      if (loc.templates?.[e]) warn(`${at}: templates.${e} present but the place has no ${e}`);
    }
  }
  for (const [e, from] of Object.entries(loc.inherits ?? {})) if (!loc.errands.includes(e)) fail(`${at}: inherits.${e} for an errand the place lacks`); else if (!ERRANDS.includes(from)) fail(`${at}: inherits.${e} from unknown errand ${from}`);
  for (const [m, e] of Object.entries(loc.moonBoost ?? {})) { if (!moonIds.has(m)) fail(`${at}: moonBoost for unknown Moon ${m}`); if (!loc.errands.includes(e)) fail(`${at}: moonBoost.${m} → ${e}, which the place lacks`); }
  for (const [m, ties] of Object.entries(loc.moonTies ?? {})) {
    if (!moonIds.has(m)) fail(`${at}: moonTies for unknown Moon ${m}`);
    for (const [e, lines] of Object.entries(ties)) { if (!ERRANDS.includes(e)) fail(`${at}: moonTies.${m}.${e} is not an errand`); bank(Array.isArray(lines) ? lines : [lines], PROSE_SLOTS, `${at} moonTies.${m}.${e}`); }
  }
  bank(loc.pairs, PROSE_SLOTS, `${at} pairs`);
  bank(loc.encounters, ENCOUNTER_SLOTS, `${at} encounters`);
  bank(loc.rumours, RUMOUR_SLOTS, `${at} rumours`);
  for (const key of ['return', 'cityProvides', 'quiet', 'details', 'closers']) bank(loc[key], NO_SLOTS, `${at} ${key}`);
  if (loc.arrival) slots(loc.arrival, ['warband'], `${at} arrival`);
  for (const [k, v] of Object.entries(loc.unavailable ?? {})) style(v, `${at} unavailable.${k}`);
  for (const b of loc.cryer?.bylines ?? []) style(b, `${at} cryer.bylines`);
  if ((loc.rumours?.length ?? 0) < 40) thin(`${at}: ${loc.rumours?.length ?? 0} rumours; a month wants 40+`);
  if ((loc.details?.length ?? 0) < 40) thin(`${at}: ${loc.details?.length ?? 0} details; a month wants 40+`);
  if ((loc.encounters?.length ?? 0) < 18) thin(`${at}: ${loc.encounters?.length ?? 0} encounters; a month wants 18+`);
}

for (const m of MOONS) for (const [e, line] of Object.entries(m.ties)) { if (!ERRANDS.includes(e)) fail(`moons.json ${m.id}: tie for unknown errand ${e}`); slots(line, PROSE_SLOTS, `moons.json ${m.id}.ties.${e}`); }
for (const o of OMENS) { style(o.reading, `omens.json ${o.id}.reading`); for (const [e, v] of Object.entries(o.tilt)) { if (!ERRANDS.includes(e)) fail(`omens.json ${o.id}: tilt for unknown errand ${e}`); if (v < -2 || v > 2) fail(`omens.json ${o.id}: tilt.${e} = ${v}, outside -2..2`); } }
for (const t of TOKENS) { if (t.location && !locationIds.has(t.location)) fail(`tokens.json ${t.id}: location "${t.location}" is not a pack`); if (!['fortune', 'ground', 'market', 'sight'].includes(t.type)) fail(`tokens.json ${t.id}: type "${t.type}"`); if (/!/.test(t.effect)) warn(`tokens.json ${t.id}.effect: exclamation mark`); }
const ids = TOKENS.map((t) => t.id); for (const id of new Set(ids)) if (ids.filter((x) => x === id).length > 1) fail(`tokens.json: id "${id}" repeats`);

for (const w of warnings) console.log(`warn  ${w}`);
for (const e of errors) console.log(`error ${e}`);
console.log(errors.length ? `\n${errors.length} error(s), ${warnings.length} warning(s)` : `\nok, ${warnings.length} warning(s)`);
process.exit(errors.length ? 1 : 0);
