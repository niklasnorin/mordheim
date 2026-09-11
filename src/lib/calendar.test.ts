import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ANCHOR, DAYS_IN_YEAR, MONTHS, WEEKDAYS, addDays, formatImperial, fromOrdinal, imperialForDate, ordinal, parseImperial } from './calendar.ts';
import { history } from '../data/history.ts';
import { dateForNight } from '../curfew/engine.ts';

test('the year has 400 days, twelve months of 32 or 33 and six holy days, Hexenstag first', () => {
  assert.equal(DAYS_IN_YEAR, 400);
  assert.equal(MONTHS.filter((m) => m.holy).length, 6);
  assert.ok(MONTHS.filter((m) => !m.holy).every((m) => m.days === 32 || m.days === 33));
  assert.equal(MONTHS[0].name, 'Hexenstag');
  assert.equal(WEEKDAYS.length, 8);
});

test('ordinals round-trip and a year rolls over at Hexenstag', () => {
  for (let n = 0; n < 3 * DAYS_IN_YEAR; n += 7) assert.equal(ordinal(fromOrdinal(n)), n);
  const eve = parseImperial('33rd of Vorhexen, 2007');
  const next = addDays(eve, 1);
  assert.deepEqual([next.month, next.year, next.holy, next.weekday], ['Hexenstag', 2008, true, undefined]);
  assert.deepEqual([addDays(next, 1).month, addDays(next, 1).day], ['Nachexen', 1]);
});

test('the anchor is the first game, and the weekday the record gives', () => {
  assert.equal(ANCHOR.date, history[0].playedOn);
  assert.equal(formatImperial(ANCHOR.imperial), history[0].date);
  assert.equal(imperialForDate('2026-09-05').weekday, 'Marktag');
});

test('holy days fall outside the week: the weekday after one carries on from the one before', () => {
  const before = parseImperial('33rd of Jahrdrung, 2007');
  const holy = addDays(before, 1), after = addDays(before, 2);
  assert.equal(holy.month, 'Mitterfruhl');
  assert.equal(holy.weekday, undefined);
  assert.equal(after.month, 'Pflugzeit');
  assert.equal(WEEKDAYS.indexOf(after.weekday!), (WEEKDAYS.indexOf(before.weekday!) + 1) % 8);
  // counted back from the anchor: Marktag 5 Pflugzeit, so 1 Pflugzeit is Angestag and 33 Jahrdrung Konistag
  assert.equal(parseImperial('1st of Pflugzeit, 2007').weekday, 'Angestag');
  assert.equal(before.weekday, 'Konistag');
});

test('real days count on from the anchor, and so do the Curfew nights', () => {
  assert.equal(formatImperial(imperialForDate('2026-09-06')), 'Backertag, 6th of Pflugzeit, 2007 IC');
  assert.equal(formatImperial(imperialForDate('2026-09-13')), 'Marktag, 13th of Pflugzeit, 2007 IC', 'eight days on, the same weekday');
  assert.equal(formatImperial(imperialForDate('2026-09-04')), 'Aubentag, 4th of Pflugzeit, 2007 IC');
  assert.equal(formatImperial(imperialForDate(dateForNight(1))), 'Festag, 10th of Pflugzeit, 2007 IC', 'night 1 is 10 September');
  // 33 Pflugzeit is 3 October; then Sigmarzeit
  assert.equal(formatImperial(imperialForDate('2026-10-04'), 'short'), '1st of Sigmarzeit, 2007');
});

test('dates read as they are written, in every style', () => {
  for (const text of ['Marktag, 5th of Pflugzeit, 2007 IC', '5th of Pflugzeit, 2007', '5 Pflugzeit 2007', 'Mitterfruhl, 2007 IC', 'Hexenstag 2008']) {
    const d = parseImperial(text);
    assert.equal(formatImperial(parseImperial(formatImperial(d)), 'short'), formatImperial(d, 'short'), text);
  }
  assert.equal(formatImperial(parseImperial('Mitterfruhl, 2007 IC'), 'day'), 'Mitterfruhl');
  assert.equal(formatImperial(parseImperial('Marktag, 5th of Pflugzeit, 2007 IC'), 'day'), 'Marktag, 5th of Pflugzeit');
  assert.equal(formatImperial(parseImperial('22nd of Pflugzeit, 2007')), 'Backertag, 22nd of Pflugzeit, 2007 IC');
  assert.throws(() => parseImperial('Wellentag, 5th of Pflugzeit, 2007 IC'), /Marktag/);
  assert.throws(() => parseImperial('34th of Pflugzeit, 2007'));
  assert.throws(() => parseImperial('5th of Octember, 2007'));
});
