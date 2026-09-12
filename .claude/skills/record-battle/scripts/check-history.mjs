#!/usr/bin/env node
/**
 * Check the battle records against the rosters, the Chronicle and the calendar.
 *
 *   node .claude/skills/record-battle/scripts/check-history.mjs
 *
 * Fails (exit 1) when a record names a warband or member the roster does not have, when its written Imperial
 * date disagrees with `playedOn`, when a file under src/data/history/ is not registered in history.ts, when a
 * Chronicle entry points at no record, or when sequences repeat. Warns about things a game master may want
 * to look at. Run from the repository root with Node 22 or newer; no build step needed.
 */
import { readdirSync } from 'node:fs';
import { history } from '../../../../src/data/history.ts';
import { warbands } from '../../../../src/data/warbands.ts';
import { chronicle } from '../../../../src/data/chronicle.ts';
import { imperialForDate, formatImperial, parseImperial } from '../../../../src/lib/calendar.ts';

const errors = [];
const warnings = [];
const fail = (m) => errors.push(m);
const warn = (m) => warnings.push(m);

const byId = new Map(warbands.map((w) => [w.id, w]));
const files = readdirSync(new URL('../../../../src/data/history/', import.meta.url)).filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, ''));
const registered = new Set(history.map((r) => r.id));
for (const f of files) if (!registered.has(f)) fail(`src/data/history/${f}.json is not imported in src/data/history.ts`);

const sequences = new Map();
for (const record of history) {
  const at = `record ${record.id}`;
  if (sequences.has(record.sequence)) fail(`${at}: sequence ${record.sequence} is also used by ${sequences.get(record.sequence)}`);
  sequences.set(record.sequence, record.id);
  if (!files.includes(record.id)) fail(`${at}: no file src/data/history/${record.id}.json (the id must match the file name)`);

  try {
    const written = parseImperial(record.date);
    if (record.playedOn) {
      const expected = formatImperial(imperialForDate(record.playedOn));
      if (formatImperial(written) !== expected) fail(`${at}: date "${record.date}" but playedOn ${record.playedOn} is "${expected}"`);
    } else warn(`${at}: no playedOn; the warriors' stories cannot lay this battle among the nights`);
  } catch (e) {
    fail(`${at}: date "${record.date}" does not parse: ${e.message}`);
  }

  const participants = new Set();
  for (const snap of record.warbands) {
    const warband = byId.get(snap.warbandId);
    if (!warband) { fail(`${at}: warband "${snap.warbandId}" is not in src/data/warbands.ts`); continue; }
    if (snap.name !== warband.name) warn(`${at}: ${snap.warbandId} is "${snap.name}" here and "${warband.name}" in the roster`);
    const members = new Map(warband.members.map((m) => [m.id, m]));
    for (const m of snap.members) {
      participants.add(m.memberId);
      const rostered = members.get(m.memberId);
      if (!rostered) { fail(`${at}: member "${m.memberId}" is not in ${warband.id}'s roster`); continue; }
      if (!['active', 'injured', 'dead'].includes(m.status)) fail(`${at}: ${m.memberId} has status "${m.status}"`);
      if (m.status === 'dead' && !rostered.dead) warn(`${at}: ${m.memberId} fell here but is not marked dead in the roster`);
      if (!m.highlight || !m.lowlight) warn(`${at}: ${m.memberId} is missing a highlight or a lowlight`);
      if (m.rank !== rostered.rank) warn(`${at}: ${m.memberId} is a ${m.rank} here and a ${rostered.rank} in the roster`);
    }
    if (!record.report.perspectives.some((p) => p.warbandId === snap.warbandId)) warn(`${at}: no perspective for ${snap.warbandId}`);
  }
  for (const p of record.report.perspectives) if (!record.warbands.some((w) => w.warbandId === p.warbandId)) fail(`${at}: perspective for "${p.warbandId}", which did not take part`);
  for (const ooa of record.report.outOfAction) {
    if (!participants.has(ooa.attackerId)) fail(`${at}: outOfAction attackerId "${ooa.attackerId}" is not a participant`);
    if (ooa.targetId && !participants.has(ooa.targetId)) fail(`${at}: outOfAction targetId "${ooa.targetId}" is not a participant`);
  }
  if (record.report.rulebookScenario === undefined || record.report.winCondition === undefined) fail(`${at}: rulebookScenario and winCondition must be a string or null, never missing`);
}

for (const entry of chronicle) {
  if (!registered.has(entry.scenarioId)) fail(`chronicle "${entry.title}": scenarioId "${entry.scenarioId}" has no record`);
  else {
    const record = history.find((r) => r.id === entry.scenarioId);
    if (record.date !== entry.date) warn(`chronicle "${entry.title}": date "${entry.date}" but the record says "${record.date}"`);
  }
}
for (const record of history) if (!chronicle.some((c) => c.scenarioId === record.id)) warn(`record ${record.id} has no Chronicle entry`);

// Standings drift: the roster's battle count should not lag behind the archives.
for (const warband of warbands) {
  const fought = history.filter((r) => r.warbands.some((w) => w.warbandId === warband.id)).length;
  if (warband.battles < fought) warn(`${warband.id}: roster says ${warband.battles} battles, the archives hold ${fought}`);
}

for (const w of warnings) console.log(`warn  ${w}`);
for (const e of errors) console.log(`error ${e}`);
console.log(errors.length ? `\n${errors.length} error(s), ${warnings.length} warning(s)` : `\nok: ${history.length} record(s), ${warnings.length} warning(s)`);
process.exit(errors.length ? 1 : 0);
