/** What the campaign's record says about a warband, for the Night engine. Pure over a roster the server has loaded. */
import type { Warband } from '../campaign/model.ts';

/** The warbands as they stand, and who came out of the most recent played scenario injured, by warband. */
export interface Roster { warbands: Warband[]; injured: Record<string, string[]> }

export const EMPTY_ROSTER: Roster = { warbands: [], injured: {} };

export function warbandById(roster: Roster, id: string): Warband | undefined { return roster.warbands.find((w) => w.id === id); }

/** The other warbands, for the rumours and the encounters. The engine picks one a night. */
export function rivalsOf(roster: Roster, id: string): Warband[] { return roster.warbands.filter((w) => w.id !== id); }

/** Members who came out of the most recent played scenario injured. */
export function injuredInLastBattle(roster: Roster, warbandId: string): string[] { return roster.injured[warbandId] ?? []; }
