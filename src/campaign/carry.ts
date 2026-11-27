/**
 * Carrying a warband from one campaign into another (`docs/campaigns.md` §5), as a rule: pure, the same in the browser
 * and on the server. The old campaign's record never changes; the warband is copied, and this says what goes across.
 *
 *  - As is: the living warriors, as they stand, with the roster, the gold and the wyrdstone.
 *  - Adjusted: the same, put through the new campaign's policy (heroes only, the experience a warrior keeps, old
 *    wounds healed, the gold and wyrdstone brought). It is a proposal: the keeper may change anything before they
 *    approve it, through the roster's draw-up (`warbands.carry` holds it until then).
 *  - Start over: the name, the crest and the story; a fresh roster founded with the new campaign's crowns, and any
 *    heroes named as veterans: their names, portraits and epithets, on fresh stats with no experience.
 *
 * The ids are the server's to choose (`newIdFor`); a plan names the old ones.
 */
import type { Bundle } from '../builder/catalogue.ts';
import type { Roster, Selection } from '../builder/evaluate.ts';
import { findSelection, removeSelection, setCount, walk } from '../builder/roster.ts';
import { warriorsOf } from '../builder/rules.ts';
import type { CarryMode, CarryPolicy } from './campaign.ts';

/** A warrior as the carry-over reads them. */
export interface CarryMember {
  id: string;
  name: string;
  rank: 'hero' | 'henchman';
  role: string;
  dead: boolean;
  experience?: number | null;
  skills: string[];
  injuries: string[];
  equipment: string[];
}

export interface CarrySource {
  members: CarryMember[];
  /** The roster, for a warband the builder keeps; null for one written by hand. */
  roster: Roster | null;
  gold: number;
  shards: number;
}

export interface CarryChoices {
  /** For a start over: the heroes who come back as veterans, by id. */
  veterans?: string[];
}

/** A warrior who comes across, and what is changed on the way. */
export interface PlannedMember {
  fromId: string;
  name: string;
  rank: 'hero' | 'henchman';
  experience: number | null;
  skills: string[];
  injuries: string[];
  equipment: string[];
  /** A start over's veteran: the name and the face, nothing else. */
  veteran: boolean;
  /** What the road changed, in words. */
  changes: string[];
}

export interface CarryPlan {
  mode: CarryMode;
  members: PlannedMember[];
  /** Who stays behind, and why. */
  left: { id: string; name: string; why: string }[];
  /** The roster that comes across (old member ids); null when it is written by hand or founded afresh. */
  roster: Roster | null;
  gold: number;
  shards: number;
  /** Everything the policy changed, in words, for the keeper to read before they approve. */
  notes: string[];
}

/** Whether a mode needs the keeper's approval before the warband stands in the new campaign. */
export const needsApproval = (mode: CarryMode, built: boolean): boolean => mode === 'start-over' || (mode === 'adjusted' && built);

const capped = (n: number, cap: number | null) => (cap === null ? n : Math.min(n, cap));

/** The roster with these warriors' selections taken off. */
function without(roster: Roster, ids: string[]): Roster {
  let r = roster;
  for (const id of ids) if (findSelection(r.selections, id)) r = removeSelection(r, id);
  return r;
}

/** Every member id a roster names. */
export function rosterMembers(roster: Roster): string[] {
  const out: string[] = [];
  walk(roster.selections, (s: Selection) => { for (const m of s.members ?? []) out.push(m); });
  return out;
}

/**
 * What goes across. A built roster is adjusted through the builder's own helpers, so it stays a roster the catalogue
 * reads; a warband written by hand is adjusted warrior by warrior.
 */
export function carryPlan(src: CarrySource, policy: CarryPolicy, mode: CarryMode, choices: CarryChoices = {}, b?: Bundle | null): CarryPlan {
  const living = src.members.filter((m) => !m.dead);
  const left: CarryPlan['left'] = src.members.filter((m) => m.dead).map((m) => ({ id: m.id, name: m.name, why: 'fell, and the dead stay where they fell' }));
  const notes: string[] = [];
  const plain = (m: CarryMember, changes: string[] = []): PlannedMember => ({
    fromId: m.id, name: m.name, rank: m.rank, experience: m.experience ?? null, skills: [...m.skills], injuries: [...m.injuries], equipment: [...m.equipment], veteran: false, changes,
  });

  if (mode === 'start-over') {
    const wanted = new Set(choices.veterans ?? []);
    const members = living.filter((m) => wanted.has(m.id)).map((m): PlannedMember => ({
      fromId: m.id, name: m.name, rank: m.rank, experience: 0, skills: [], injuries: [], equipment: [], veteran: true, changes: ['a veteran: the name and the face, on fresh stats with no experience'],
    }));
    for (const m of living) if (!wanted.has(m.id)) left.push({ id: m.id, name: m.name, why: 'stays behind; the warband starts over' });
    notes.push('The warband starts over: its roster is founded afresh with the campaign’s crowns.');
    if (members.length) notes.push(`${members.length} ${members.length === 1 ? 'veteran comes' : 'veterans come'} back by name.`);
    return { mode, members, left, roster: null, gold: 0, shards: 0, notes };
  }

  const adjust = mode === 'adjusted';
  const gold = adjust ? capped(src.gold, policy.goldCap) : src.gold;
  const shards = adjust ? capped(src.shards, policy.shardCap) : src.shards;
  if (gold < src.gold) notes.push(`Of ${src.gold} crowns, ${gold} come across.`);
  if (shards < src.shards) notes.push(`Of ${src.shards} shards of wyrdstone, ${shards} come across.`);

  if (src.roster && b) {
    let roster = src.roster;
    const changes = new Map<string, string[]>();
    const note = (ids: string[], text: string) => { for (const id of ids) changes.set(id, [...(changes.get(id) ?? []), text]); };
    if (adjust) {
      const warriors = warriorsOf(b, roster);
      if (policy.heroesOnly) {
        const groups = warriors.filter((w) => w.kind === 'henchmen');
        roster = without(roster, groups.map((w) => w.id));
        for (const w of groups) for (const id of w.members) { const m = living.find((x) => x.id === id); if (m) left.push({ id, name: m.name, why: 'a henchman; only heroes come across' }); }
        if (groups.length) notes.push(`The henchmen stay behind: ${groups.map((g) => g.type).join(', ')}.`);
      }
      for (const w of warriorsOf(b, roster)) {
        if (policy.experienceCap !== null && w.experienceId && w.experience > policy.experienceCap) {
          roster = policy.experienceCap > 0 ? setCount(roster, w.experienceId, policy.experienceCap) : without(roster, [w.experienceId]);
          note(w.members, `experience ${w.experience} → ${policy.experienceCap}`);
        }
        if (policy.healInjuries) {
          const wounds = w.parts.filter((p) => p.kind === 'injury');
          if (wounds.length) { roster = without(roster, wounds.map((p) => p.id)); note(w.members, `healed of ${wounds.map((p) => p.name).join(', ')}`); }
        }
      }
      if (policy.experienceCap !== null) notes.push(`A warrior keeps at most ${policy.experienceCap} experience.`);
      if (policy.healInjuries) notes.push('Old wounds heal on the road.');
    }
    const on = new Set(rosterMembers(roster));
    const wasOn = new Set(rosterMembers(src.roster));
    const members: PlannedMember[] = [];
    for (const m of living) {
      if (on.has(m.id)) { members.push(plain(m, changes.get(m.id) ?? [])); continue; }
      if (wasOn.has(m.id)) continue; // taken off the roster by the policy, and listed as left above
      // one written by hand beside the roster comes as written, unless only heroes do
      if (adjust && policy.heroesOnly && m.rank === 'henchman') { left.push({ id: m.id, name: m.name, why: 'a henchman; only heroes come across' }); continue; }
      members.push(plain(m, ['written by hand beside the roster']));
    }
    return { mode, members, left, roster, gold, shards, notes };
  }

  // a warband written by hand: warrior by warrior
  const members: PlannedMember[] = [];
  for (const m of living) {
    if (adjust && policy.heroesOnly && m.rank === 'henchman') { left.push({ id: m.id, name: m.name, why: 'a henchman; only heroes come across' }); continue; }
    const p = plain(m);
    if (adjust && policy.experienceCap !== null && (p.experience ?? 0) > policy.experienceCap) { p.changes.push(`experience ${p.experience} → ${policy.experienceCap}`); p.experience = policy.experienceCap; }
    if (adjust && policy.healInjuries && p.injuries.length) { p.changes.push(`healed of ${p.injuries.join(', ')}`); p.injuries = []; }
    members.push(p);
  }
  if (adjust && policy.heroesOnly && left.some((l) => /henchman/.test(l.why))) notes.push('The henchmen stay behind.');
  if (adjust && policy.experienceCap !== null) notes.push(`A warrior keeps at most ${policy.experienceCap} experience.`);
  if (adjust && policy.healInjuries) notes.push('Old wounds heal on the road.');
  return { mode, members, left, roster: null, gold, shards, notes };
}

/** The roster with every member id put through a map: the copy names the new warriors. */
export function remapRoster(roster: Roster, ids: Map<string, string>): Roster {
  const r = structuredClone(roster) as Roster;
  walk(r.selections, (s: Selection) => { if (s.members) s.members = s.members.filter((m) => ids.has(m)).map((m) => ids.get(m)!); });
  return r;
}

/** A fresh id for a copy: the old one with the new campaign's address after it, and a number if even that is taken. */
export function newIdFor(old: string, suffix: string, taken: Set<string>): string {
  const stem = `${old}-${suffix}`.slice(0, 60);
  let id = stem, k = 2;
  while (taken.has(id)) id = `${stem}-${k++}`;
  taken.add(id);
  return id;
}
