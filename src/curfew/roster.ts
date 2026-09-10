/** What the campaign's own records say about a warband, for the Night engine. Pure. */
import { warbands, type Warband } from '../data/warbands.ts';
import { history } from '../data/history.ts';

export function warbandById(id: string): Warband | undefined { return warbands.find((w) => w.id === id); }

/** The other warband, for the rumours. With more than two, the one registered first that is not yours. */
export function rivalOf(id: string): Warband | undefined { return warbands.find((w) => w.id !== id); }

/** Members who came out of the most recent recorded battle injured. */
export function injuredInLastBattle(warbandId: string): string[] {
  const record = history.slice().sort((a, b) => a.sequence - b.sequence).at(-1);
  return record?.warbands.find((w) => w.warbandId === warbandId)?.members.filter((m) => m.status === 'injured').map((m) => m.memberId) ?? [];
}
