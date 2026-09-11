/**
 * What the nights add to a warrior's story. Pure: takes the ledgers as they stand and gives, per member,
 * the entries the Chronicle wrote about them, newest first, and per warband its standing in the taverns.
 * The campaign site merges this with the roster and the battle reports from the repository.
 */
import { ERRAND_LABEL, titleFor, type Errand, type Outcome, type WarbandLike } from './engine.ts';
import type { WarbandState } from './ledger.ts';

export interface NightEntry {
  night: number;
  warbandId: string;
  /** Where the night happened; nights from before the campaign could move have none, and were in Mordheim. */
  locationId?: string;
  errand: Errand;
  errandLabel: string;
  outcome: Outcome;
  standing: boolean;
  prose: string;
  /** The charm they brought back, by name, if any. */
  token?: string;
  rumour?: string;
}

export interface MemberNights {
  entries: NightEntry[];
  /** Nights out, all told. */
  nightsOut: number;
  /** The name the taverns gave them, if any. */
  epithet?: string;
  shards: number;
  renown: number;
}

export interface WarbandStanding {
  warbandId: string;
  title: string;
  renown: number;
  favour: number;
  shards: number;
  /** Nights the Chronicle has written for this ledger. */
  nights: number;
  /** Nights that sent somebody out. */
  nightsOut: number;
  charms: number;
}

export interface Ledger { warband: WarbandLike; state: WarbandState }

export function memberNights(ledgers: Ledger[]): Record<string, MemberNights> {
  const out: Record<string, MemberNights> = {};
  for (const { warband, state } of ledgers) {
    for (const night of state.nights) {
      for (const r of night.results) {
        const m = (out[r.memberId] ??= { entries: [], nightsOut: 0, shards: 0, renown: 0 });
        m.entries.push({ night: night.night, warbandId: warband.id, locationId: night.locationId, errand: r.errand, errandLabel: ERRAND_LABEL[r.errand], outcome: r.outcome, standing: r.standing, prose: r.prose, token: r.token?.name, rumour: r.rumour });
        m.nightsOut += 1;
        m.shards += r.shards;
        m.renown += r.renown;
      }
    }
    for (const [memberId, epithet] of Object.entries(state.epithets)) (out[memberId] ??= { entries: [], nightsOut: 0, shards: 0, renown: 0 }).epithet = epithet;
  }
  for (const m of Object.values(out)) m.entries.sort((a, b) => b.night - a.night);
  return out;
}

export function warbandStandings(ledgers: Ledger[]): Record<string, WarbandStanding> {
  const out: Record<string, WarbandStanding> = {};
  for (const { warband, state } of ledgers) {
    out[warband.id] = {
      warbandId: warband.id, title: titleFor(state.renown), renown: state.renown, favour: state.favour, shards: state.shards,
      nights: state.nights.length, nightsOut: state.nights.filter((n) => n.results.length > 0).length, charms: state.hand.length,
    };
  }
  return out;
}
