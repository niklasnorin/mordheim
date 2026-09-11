/**
 * What the Town Cryer may print from a night. Pure: the same night always yields the same dispatches.
 *
 * Every headline the ledger wrote (a title change, an epithet, a planted flourish) is printed. Beyond that,
 * the broadsheet occasionally picks up one member's night as a "happening": a boon or a poor night more
 * often than a fair one, never a night on standing orders. One happening per warband per night at most.
 */
import { CAMPAIGN, DEFAULT_LOCATION, hashSeed, locationById, pick, rng, type Location, type NightResult, type Outcome, type WarbandLike } from './engine.ts';
import type { Headline } from './ledger.ts';

export interface Dispatch {
  /** Stable per (warband, night, item), so writing a night twice never prints twice. */
  key: string;
  warbandId: string;
  night: number;
  kind: 'headline' | 'happening' | 'notice';
  headline: string;
  body?: string;
}

const PRINT_CHANCE: Record<Outcome, number> = { boon: 0.6, poor: 0.4, fair: 0.2 };

function fill(template: string, slots: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, k) => slots[k] ?? `{${k}}`);
}

/** The dispatches one resolved night gives the Cryer, headlines first. */
export function dispatchesForNight(warband: WarbandLike, night: NightResult, headlines: Headline[]): Dispatch[] {
  const out: Dispatch[] = [];
  headlines.filter((h) => h.night === night.night).forEach((h, i) => {
    out.push({ key: `${warband.id}:${night.night}:h${i}`, warbandId: warband.id, night: night.night, kind: 'headline', headline: h.text });
  });
  const happening = happeningFor(warband, night);
  if (happening) out.push(happening);
  return out;
}

/** The one member's night the broadsheet picks up, if the dice say so. The headline is worded where the night happened. */
export function happeningFor(warband: WarbandLike, night: NightResult): Dispatch | null {
  const r = rng(hashSeed(CAMPAIGN.id, 'cryer', warband.id, night.night));
  const location = locationById(night.locationId);
  for (const res of night.results) {
    if (res.standing) continue;
    const member = warband.members.find((m) => m.id === res.memberId);
    if (!member) continue;
    if (r() >= PRINT_CHANCE[res.outcome]) continue;
    const bank = location.cryer.headlines[res.errand]?.[res.outcome] ?? DEFAULT_LOCATION.cryer.headlines[res.errand]?.[res.outcome];
    if (!bank?.length) continue;
    const slots = { first: member.name.split(' ')[0], name: member.name, warband: warband.name };
    return {
      key: `${warband.id}:${night.night}:e`, warbandId: warband.id, night: night.night, kind: 'happening',
      headline: fill(pick(r, bank), slots),
      body: `${res.prose} ${night.detail}`,
    };
  }
  return null;
}

export function bylineFor(warbandId: string, night: number, location: Location = DEFAULT_LOCATION): string {
  return pick(rng(hashSeed(CAMPAIGN.id, 'byline', warbandId, night)), location.cryer.bylines);
}
