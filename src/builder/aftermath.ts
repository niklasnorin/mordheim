/**
 * What a played game gives each warrior, suggested from the record for the table to agree: the rulebook's experience
 * (one for coming through it, one for each enemy a hero put out of action, one more for a winning leader), who went
 * out of action and must roll for it, and whose new experience brings an advance. Pure; the keeper enters the figures.
 */
import { HENCHMAN_ADVANCES, HERO_ADVANCES } from '../campaign/jobs.ts';
import type { Warrior } from './rules.ts';

export interface GameRecord {
  result: 'victory' | 'defeat' | 'draw' | null;
  /** Who was brought, and how each fared; empty means the whole warband fought. */
  members: { memberId: string; status: 'active' | 'injured' | 'dead' }[];
  takedowns: { attackerId: string; targetId: string | null }[];
}
export interface Award {
  warriorId: string;
  fought: boolean;
  /** Came through it: not dead. */
  survived: number;
  takedowns: number;
  leader: number;
  suggested: number;
  /** Members of theirs put out of action, to roll for: a hero's serious injury, a henchman's 1–2 on a D6. */
  outOfAction: string[];
  /** The advances the new experience brings, as thresholds crossed. */
  advances: number;
}

export function advancesBetween(kind: 'hero' | 'henchmen', from: number, to: number): number {
  const table = kind === 'hero' ? HERO_ADVANCES : HENCHMAN_ADVANCES;
  return table.filter((t) => t > from && t <= to).length;
}

export function aftermath(warriors: Warrior[], game: GameRecord): Award[] {
  const brought = new Set(game.members.map((m) => m.memberId));
  const status = new Map(game.members.map((m) => [m.memberId, m.status]));
  const downedBy = new Map<string, number>();
  const fell = new Set<string>();
  for (const t of game.takedowns) { downedBy.set(t.attackerId, (downedBy.get(t.attackerId) ?? 0) + 1); if (t.targetId) fell.add(t.targetId); }
  return warriors.map((w) => {
    const ms = w.members;
    const fought = brought.size === 0 || ms.some((m) => brought.has(m));
    const alive = ms.filter((m) => status.get(m) !== 'dead');
    const survived = fought && alive.length > 0 ? 1 : 0;
    const takedowns = w.kind === 'hero' ? ms.reduce((n, m) => n + (downedBy.get(m) ?? 0), 0) : 0;
    const leader = fought && game.result === 'victory' && w.skills.includes('Leader') ? 1 : 0;
    const suggested = survived + takedowns + leader;
    const outOfAction = ms.filter((m) => fell.has(m) || status.get(m) === 'injured');
    return { warriorId: w.id, fought, survived, takedowns, leader, suggested, outOfAction, advances: advancesBetween(w.kind, w.experience, w.experience + suggested) };
  });
}
