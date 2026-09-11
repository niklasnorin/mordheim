/**
 * The Imperial Calendar, as the Empire keeps it.
 *
 * A year has 400 days: twelve months of 32 or 33 days and six intercalary holy days that belong to no
 * month and no weekday. The week has eight days. Years are counted "IC", Imperial Calendar, from the
 * coronation of Sigmar. The campaign's clock is anchored on its first game: a real date that fell on a
 * known Imperial one (`anchor` in campaign.json), and every real day since is one Imperial day.
 *
 * Pure and shared: the Town Cryer dates its issues with it, the Curfew its nights, the archives its battles.
 */
import campaign from '../data/curfew/campaign.json' with { type: 'json' };

export interface MonthDef { name: string; days: number; /** A single holy day outside the months and the week. */ holy: boolean }

/** The year in order, Hexenstag first. */
export const MONTHS: readonly MonthDef[] = [
  { name: 'Hexenstag', days: 1, holy: true },
  { name: 'Nachexen', days: 32, holy: false },
  { name: 'Jahrdrung', days: 33, holy: false },
  { name: 'Mitterfruhl', days: 1, holy: true },
  { name: 'Pflugzeit', days: 33, holy: false },
  { name: 'Sigmarzeit', days: 33, holy: false },
  { name: 'Sommerzeit', days: 33, holy: false },
  { name: 'Sonnstill', days: 1, holy: true },
  { name: 'Vorgeheim', days: 33, holy: false },
  { name: 'Geheimnistag', days: 1, holy: true },
  { name: 'Nachgeheim', days: 32, holy: false },
  { name: 'Erntezeit', days: 33, holy: false },
  { name: 'Mittherbst', days: 1, holy: true },
  { name: 'Brauzeit', days: 33, holy: false },
  { name: 'Kaldezeit', days: 33, holy: false },
  { name: 'Ulriczeit', days: 33, holy: false },
  { name: 'Mondstille', days: 1, holy: true },
  { name: 'Vorhexen', days: 33, holy: false },
];
export const DAYS_IN_YEAR = MONTHS.reduce((a, m) => a + m.days, 0);
/** Weekdays outside the holy days: 394 a year. */
const WEEKDAYS_IN_YEAR = MONTHS.filter((m) => !m.holy).reduce((a, m) => a + m.days, 0);

/** The eight days of the week. */
export const WEEKDAYS = ['Wellentag', 'Aubentag', 'Marktag', 'Backertag', 'Bezahltag', 'Konistag', 'Angestag', 'Festag'] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export interface ImperialDate {
  year: number;
  /** Month name, or the holy day's name. */
  month: string;
  /** 1-based day of the month; 1 on a holy day. */
  day: number;
  /** Undefined on a holy day, which falls outside the week. */
  weekday?: Weekday;
  /** True on one of the six intercalary holy days. */
  holy: boolean;
}

// ───────────────────────── counting days ─────────────────────────

/** Days from the first day of year 0 (Hexenstag, 0 IC) to this date. */
export function ordinal(d: { year: number; month: string; day: number }): number {
  const idx = monthIndex(d.month);
  let n = d.year * DAYS_IN_YEAR;
  for (let i = 0; i < idx; i++) n += MONTHS[i].days;
  return n + d.day - 1;
}
/** The date `n` days after Hexenstag, 0 IC. */
export function fromOrdinal(n: number): ImperialDate {
  const year = Math.floor(n / DAYS_IN_YEAR);
  let rest = n - year * DAYS_IN_YEAR;
  for (const m of MONTHS) {
    if (rest < m.days) return { year, month: m.name, day: rest + 1, holy: m.holy, weekday: m.holy ? undefined : weekdayAt(n) };
    rest -= m.days;
  }
  throw new Error('unreachable');
}
function monthIndex(name: string): number {
  const idx = MONTHS.findIndex((m) => m.name.toLowerCase() === name.toLowerCase());
  if (idx < 0) throw new Error(`No such month in the Imperial Calendar: ${name}`);
  return idx;
}
/** How many weekdays (days not holy) lie before ordinal `n`. Holy days do not advance the week. */
function weekdaysBefore(n: number): number {
  const year = Math.floor(n / DAYS_IN_YEAR);
  let rest = n - year * DAYS_IN_YEAR, count = year * WEEKDAYS_IN_YEAR;
  for (const m of MONTHS) {
    if (rest < m.days) return count + (m.holy ? 0 : rest);
    rest -= m.days;
    if (!m.holy) count += m.days;
  }
  return count;
}

// ───────────────────────── the anchor ─────────────────────────

export interface Anchor { date: string; imperial: ImperialDate }
/** The first game: the real date it was played and the Imperial date it was, as recorded. It must name the weekday; the week is counted from it. */
const anchorRead = readImperial(campaign.anchor.imperial);
if (!anchorRead.weekday) throw new Error(`The campaign anchor must name its weekday: "${campaign.anchor.imperial}"`);
const ANCHOR_ORDINAL = ordinal(anchorRead);
const ANCHOR_WEEKDAY = WEEKDAYS.indexOf(anchorRead.weekday);
export const ANCHOR: Anchor = { date: campaign.anchor.date, imperial: fromOrdinal(ANCHOR_ORDINAL) };

function weekdayAt(n: number): Weekday {
  const shift = weekdaysBefore(n) - weekdaysBefore(ANCHOR_ORDINAL);
  return WEEKDAYS[(((ANCHOR_WEEKDAY + shift) % WEEKDAYS.length) + WEEKDAYS.length) % WEEKDAYS.length];
}

function utcDay(isoDate: string): number {
  const [y, m, d] = isoDate.split('-').map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86400000);
}
/** The Imperial date of a real calendar day (YYYY-MM-DD): one real day is one Imperial day, counted from the anchor. */
export function imperialForDate(isoDate: string): ImperialDate {
  return fromOrdinal(ANCHOR_ORDINAL + utcDay(isoDate) - utcDay(ANCHOR.date));
}
/** The Imperial date a given number of days after another. */
export function addDays(d: ImperialDate, days: number): ImperialDate { return fromOrdinal(ordinal(d) + days); }

// ───────────────────────── reading and writing ─────────────────────────

const ORDINAL_SUFFIX = (n: number) => (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th');

/**
 * "Marktag, 5th of Pflugzeit, 2007 IC"; a holy day reads "Mitterfruhl, 2007 IC".
 * `short` drops the weekday and the era: "5th of Pflugzeit, 2007"; `day` drops the year too: "Marktag, 5th of Pflugzeit".
 */
export function formatImperial(d: ImperialDate, style: 'long' | 'short' | 'day' = 'long'): string {
  if (d.holy) return style === 'day' ? d.month : `${d.month}, ${d.year}${style === 'long' ? ' IC' : ''}`;
  const dayOf = `${d.day}${ORDINAL_SUFFIX(d.day)} of ${d.month}`;
  if (style === 'short') return `${dayOf}, ${d.year}`;
  if (style === 'day') return `${d.weekday}, ${dayOf}`;
  return `${d.weekday}, ${dayOf}, ${d.year} IC`;
}

/** The parts of a written date, weekday as written (not checked). */
function readImperial(text: string): { year: number; month: string; day: number; weekday?: Weekday } {
  const s = text.trim();
  const holy = /^(\w+),?\s+(\d{1,4})(?:\s*IC)?$/i.exec(s);
  if (holy && MONTHS.some((m) => m.holy && m.name.toLowerCase() === holy[1].toLowerCase())) return { year: Number(holy[2]), month: MONTHS[monthIndex(holy[1])].name, day: 1 };
  const m = /^(?:(\w+),\s*)?(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?(\w+),?\s+(\d{1,4})(?:\s*IC)?$/i.exec(s);
  if (!m) throw new Error(`Not an Imperial date: "${text}"`);
  const def = MONTHS[monthIndex(m[3])];
  const day = Number(m[2]);
  if (def.holy || day < 1 || day > def.days) throw new Error(`No such day in the Imperial Calendar: "${text}"`);
  const weekday = m[1] ? WEEKDAYS.find((w) => w.toLowerCase() === m[1].toLowerCase()) : undefined;
  if (m[1] && !weekday) throw new Error(`No such weekday in the Imperial Calendar: "${m[1]}"`);
  return { year: Number(m[4]), month: def.name, day, weekday };
}
/** Read a date as formatImperial writes it, with or without weekday and era. A weekday that does not fit the date is refused. */
export function parseImperial(text: string): ImperialDate {
  const read = readImperial(text);
  const date = fromOrdinal(ordinal(read));
  if (read.weekday && date.weekday !== read.weekday) throw new Error(`${text} is a ${date.weekday}, not a ${read.weekday}`);
  return date;
}
