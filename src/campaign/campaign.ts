/**
 * A campaign: one run of play, with its own warbands, scenarios, nights and broadsheet (`docs/campaigns.md`). The
 * record keeps each in the `campaigns` table; this is its shape and the rules read from it, pure and shared by the
 * server, the pages and the tests.
 *
 * The id is forever: the Curfew's dice are seeded with it, so two campaigns never see the same portents and a running
 * one never re-rolls. `start`, `timezone` and `anchor` say which night and which Imperial day a real day is, and are
 * fixed once the campaign is live. The first campaign, `mordheim-2000`, is `DEFAULT_CAMPAIGN`, built from
 * `src/data/curfew/campaign.json`, which stays the built-in default for the tests and the pack linter.
 */
import campaignJson from '../data/curfew/campaign.json' with { type: 'json' };

export type CampaignStatus = 'draft' | 'live' | 'finished' | 'archived';
export const CAMPAIGN_STATUSES: readonly CampaignStatus[] = ['draft', 'live', 'finished', 'archived'];

/** How a warband may be brought over from another campaign (campaign/carry.ts). */
export type CarryMode = 'as-is' | 'adjusted' | 'start-over';
export const CARRY_MODES: readonly CarryMode[] = ['as-is', 'adjusted', 'start-over'];

/** What a campaign proposes for a warband brought over adjusted. The keeper may change anything before approving. */
export interface CarryPolicy {
  /** The ways a warband may come in; empty when none may. */
  modes: CarryMode[];
  /** The most gold it brings; null for all of it. */
  goldCap: number | null;
  /** The most wyrdstone it brings; null for all of it. */
  shardCap: number | null;
  /** Heroes only: the henchmen stay behind. */
  heroesOnly: boolean;
  /** The most experience a warrior keeps; null for all of it. */
  experienceCap: number | null;
  /** Old wounds are healed on the road. */
  healInjuries: boolean;
}

export interface CampaignOptions {
  /** Whether the Curfew's nights run in this campaign. */
  curfew: boolean;
  /** Whether the home page prints the standings table: who has fought and who has won. */
  standingsVisible: boolean;
  /** The builder's warband lists a warband may be founded from; null (or none chosen) for every one. */
  catalogues: string[] | null;
  /** The crowns a warband is founded with. */
  startingCrowns: number;
  /** How warbands may be brought over from other campaigns. */
  carry: CarryPolicy;
}

/** The Curfew's constants: everything in `campaign.json` that is not the campaign's identity or clock. */
export interface CampaignTuning {
  membersPerNight: number;
  nightsPerMoon: number;
  seasonMoons: number;
  favourSoftCap: number;
  flourishCost: number;
  returnAfterNights: number;
  rumourWarmNights: number;
  epithetAfterEntries: number;
  crossroadsChance: number;
  titles: { renown: number; title: string }[];
}

/** A real day that fell on a known Imperial one: the campaign's clock (src/lib/calendar.ts). */
export interface CampaignAnchor { date: string; imperial: string; note?: string }

export interface CampaignConfig extends CampaignTuning {
  id: string;
  slug: string;
  name: string;
  setting: string;
  status: CampaignStatus;
  /** Night 1, as YYYY-MM-DD in the campaign's time zone. */
  start: string;
  timezone: string;
  anchor: CampaignAnchor;
  options: CampaignOptions;
}

export const DEFAULT_CARRY: CarryPolicy = { modes: [...CARRY_MODES], goldCap: null, shardCap: null, heroesOnly: false, experienceCap: null, healInjuries: false };
export const DEFAULT_OPTIONS: CampaignOptions = { curfew: true, standingsVisible: false, catalogues: null, startingCrowns: 500, carry: DEFAULT_CARRY };

const TUNING_KEYS = ['membersPerNight', 'nightsPerMoon', 'seasonMoons', 'favourSoftCap', 'flourishCost', 'returnAfterNights', 'rumourWarmNights', 'epithetAfterEntries', 'crossroadsChance', 'titles'] as const;

/** The tuning out of anything shaped like `campaign.json`, the defaults filling what is missing. */
export function tuningOf(given: unknown, base: CampaignTuning = BUILT_IN_TUNING): CampaignTuning {
  const g = (given && typeof given === 'object' ? given : {}) as Record<string, unknown>;
  const out = { ...base } as Record<string, unknown>;
  for (const k of TUNING_KEYS) {
    const v = g[k];
    if (k === 'titles') { if (Array.isArray(v) && v.every((t) => t && typeof t.renown === 'number' && typeof t.title === 'string')) out.titles = v.map((t) => ({ renown: t.renown, title: t.title })); }
    else if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
  }
  return out as unknown as CampaignTuning;
}

const BUILT_IN_TUNING: CampaignTuning = (() => {
  const j = campaignJson as unknown as Record<string, unknown>;
  const t = {} as Record<string, unknown>;
  for (const k of TUNING_KEYS) t[k] = j[k];
  return t as unknown as CampaignTuning;
})();

const nonNegative = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : null);

/** A campaign's options out of whatever JSON is stored, the defaults filling what is missing or malformed. */
export function optionsOf(given: unknown): CampaignOptions {
  const g = (given && typeof given === 'object' ? given : {}) as Record<string, unknown>;
  const c = (g.carry && typeof g.carry === 'object' ? g.carry : {}) as Record<string, unknown>;
  const modes = Array.isArray(c.modes) ? CARRY_MODES.filter((m) => (c.modes as unknown[]).includes(m)) : [...DEFAULT_CARRY.modes];
  return {
    curfew: typeof g.curfew === 'boolean' ? g.curfew : DEFAULT_OPTIONS.curfew,
    standingsVisible: typeof g.standingsVisible === 'boolean' ? g.standingsVisible : DEFAULT_OPTIONS.standingsVisible,
    // an empty choice of lists is every list
    catalogues: Array.isArray(g.catalogues) && g.catalogues.some((x) => typeof x === 'string' && x) ? g.catalogues.filter((x): x is string => typeof x === 'string' && x.length > 0) : null,
    startingCrowns: nonNegative(g.startingCrowns) ?? DEFAULT_OPTIONS.startingCrowns,
    carry: {
      modes,
      goldCap: nonNegative(c.goldCap),
      shardCap: nonNegative(c.shardCap),
      heroesOnly: c.heroesOnly === true,
      experienceCap: nonNegative(c.experienceCap),
      healInjuries: c.healInjuries === true,
    },
  };
}

export interface CampaignRowLike {
  id: string; slug: string; name: string; setting: string; status: string;
  start: string; timezone: string; anchor: unknown; tuning: unknown; options: unknown;
}

/** A campaign as the engine and the pages read it, from its stored row. */
export function configOf(row: CampaignRowLike): CampaignConfig {
  const a = (row.anchor && typeof row.anchor === 'object' ? row.anchor : {}) as Record<string, unknown>;
  const anchor: CampaignAnchor = {
    date: typeof a.date === 'string' ? a.date : row.start,
    imperial: typeof a.imperial === 'string' ? a.imperial : DEFAULT_CAMPAIGN.anchor.imperial,
    ...(typeof a.note === 'string' ? { note: a.note } : {}),
  };
  return {
    ...tuningOf(row.tuning),
    id: row.id, slug: row.slug, name: row.name, setting: row.setting,
    status: (CAMPAIGN_STATUSES as readonly string[]).includes(row.status) ? (row.status as CampaignStatus) : 'draft',
    start: row.start, timezone: row.timezone, anchor, options: optionsOf(row.options),
  };
}

/** The tuning of a campaign, as stored in its row. */
export function tuningFrom(c: CampaignConfig): CampaignTuning {
  const t = {} as Record<string, unknown>;
  for (const k of TUNING_KEYS) t[k] = c[k];
  return t as unknown as CampaignTuning;
}

/** The first campaign, as `campaign.json` says. Its id has seeded every night since the campaign began. */
export const DEFAULT_CAMPAIGN: CampaignConfig = {
  ...BUILT_IN_TUNING,
  id: campaignJson.id,
  slug: 'mordheim',
  name: 'Mordheim, City of the Damned',
  setting: 'city-of-the-damned',
  status: 'live',
  start: campaignJson.start,
  timezone: campaignJson.timezone,
  anchor: { ...campaignJson.anchor },
  options: optionsOf({}),
};

/** Who may see a campaign: a draft only game masters, anything else everyone. */
export const mayView = (status: CampaignStatus, gm: boolean): boolean => status !== 'draft' || gm;
/** Whether the campaign's nights have stopped and its players may no longer change its record. */
export const isFrozen = (status: CampaignStatus): boolean => status === 'finished' || status === 'archived';
/** Whether the Curfew's nights are resolved for the campaign: live, with the Curfew on. */
export const runsNights = (c: Pick<CampaignConfig, 'status' | 'options'>): boolean => c.status === 'live' && c.options.curfew;
/** Whether a player (not a game master) may change the campaign's record: only while it is live. */
export const playersMayWrite = (status: CampaignStatus): boolean => status === 'live';

/** The words a campaign's status is shown in. */
export const STATUS_WORDS: Record<CampaignStatus, string> = { draft: 'Draft', live: 'Live', finished: 'Finished', archived: 'Archived' };

/** A slug for an address: lower case, letters, digits and single hyphens. */
export function slugify(text: string): string {
  return text.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);
}

/** Whether a slug is good for an address and not a word the site's own paths use. */
export function slugError(slug: string): string | null {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) return 'A slug is lower-case letters and digits, joined by single hyphens.';
  if (slug.length > 48) return 'A slug is at most 48 characters.';
  return null;
}

/** Whether a string is a calendar date, YYYY-MM-DD. */
export const isIsoDate = (s: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));

/** Whether a time zone is one the runtime knows. */
export function isTimeZone(tz: string): boolean {
  try { new Intl.DateTimeFormat('en', { timeZone: tz }); return true; } catch { return false; }
}

// ───────────────────────── the clock ─────────────────────────
// The same arithmetic as the engine's `localDate` and `nightForDate`, for the server to know which night it is in a
// campaign without building its engine. `src/campaign/campaign.test.ts` holds the two to each other.

/** A real day as YYYY-MM-DD where the campaign is played: a night turns over at midnight there. */
export function localDateIn(timeZone: string, now: Date = new Date()): string {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
    const get = (t: string) => parts.find((p) => p.type === t)!.value;
    return `${get('year')}-${get('month')}-${get('day')}`;
  } catch {
    return now.toISOString().slice(0, 10);
  }
}
const utcDay = (date: string): number => { const [y, m, d] = date.split('-').map(Number); return Math.floor(Date.UTC(y, m - 1, d) / 86400000); };
/** The campaign's night on a real day: night 1 is its start, a day before it night 0 or less, when nothing happens. */
export const nightOn = (c: Pick<CampaignConfig, 'start'>, date: string): number => utcDay(date) - utcDay(c.start) + 1;
/** The campaign's night now, by its own clock. */
export const nightNow = (c: Pick<CampaignConfig, 'start' | 'timezone'>, now: Date = new Date()): number => nightOn(c, localDateIn(c.timezone, now));
/** The real day a campaign's night falls on, YYYY-MM-DD. */
export const dateOfNight = (c: Pick<CampaignConfig, 'start'>, night: number): string => new Date((utcDay(c.start) + night - 1) * 86400000).toISOString().slice(0, 10);
