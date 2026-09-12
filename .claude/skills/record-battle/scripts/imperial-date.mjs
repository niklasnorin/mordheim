#!/usr/bin/env node
/**
 * Print the Imperial date for a real day, as the archives spell it.
 *
 *   node .claude/skills/record-battle/scripts/imperial-date.mjs 2026-09-05
 *   → Marktag, 5th of Pflugzeit, 2007 IC   (night -4)
 *
 * With no argument, today in the campaign's time zone. Reads src/lib/calendar.ts directly, so it can never
 * disagree with what the site prints. Run from the repository root with Node 22 or newer.
 */
import { imperialForDate, formatImperial } from '../../../../src/lib/calendar.ts';
import { localDate, nightForDate } from '../../../../src/curfew/engine.ts';

const arg = process.argv[2];
if (arg && !/^\d{4}-\d{2}-\d{2}$/.test(arg)) {
  console.error('usage: imperial-date.mjs [YYYY-MM-DD]');
  process.exit(2);
}
const date = arg ?? localDate();
console.log(`${formatImperial(imperialForDate(date))}   (night ${nightForDate(date)})`);
