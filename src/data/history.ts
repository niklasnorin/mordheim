import type { Statline } from './warbands';
import merchantsDebt from './history/scenario-01-the-merchants-debt.json';

/** A member's condition at the end of a scenario. */
export type MemberStatus = 'active' | 'injured' | 'dead';

/** A warband's result in a scenario. */
export type ScenarioResult = 'victory' | 'defeat' | 'draw';

/** Snapshot of a single hero or henchman as they stood in one scenario. */
export interface MemberSnapshot {
  /** Matches Member.id in warbands.ts. */
  memberId: string;
  name: string;
  role: string;
  rank: 'hero' | 'henchman';
  /** 'dead' means the warrior fell in this scenario. */
  status: MemberStatus;
  stats: Statline;
  experience?: number;
  equipment: string[];
  skills: string[];
  /** This warrior's finest moment in the scenario. */
  highlight: string;
  /** This warrior's worst moment in the scenario. */
  lowlight: string;
}

/** Snapshot of a warband's roster and treasury as it stood after one scenario. */
export interface WarbandSnapshot {
  /** Matches Warband.id in warbands.ts. */
  warbandId: string;
  name: string;
  result: ScenarioResult;
  rating: number;
  battles: number;
  victories: number;
  wyrdstone: number;
  gold: number;
  /** The warband's finest moments in the scenario. */
  highlights: string[];
  /** The warband's worst moments in the scenario. */
  lowlights: string[];
  /** Every member who took part in the scenario. */
  members: MemberSnapshot[];
}

export interface BattleReport {
  /** Use the rulebook title, not the campaign chapter title; null means not recorded. */
  rulebookScenario: string | null;
  winCondition: string | null;
  outcome: string;
  prologue: string;
  battle: string[];
  epilogue: string;
  perspectives: {
    warbandId: string;
    prologue: string;
    epilogue: string;
    accomplishments: string;
  }[];
  loot: string[];
  campaignNotes: string[];
  /** Only confirmed out-of-action results; an empty list does not mean none occurred. */
  outOfAction: {
    attackerId: string;
    target: string;
    targetId?: string;
    detail: string;
  }[];
}

/** One scenario played in the campaign, with a snapshot of every participating warband. */
export interface ScenarioRecord {
  id: string;
  /** 1-based play order; higher = more recent. */
  sequence: number;
  /** Date the scenario was played, in Imperial calendar. */
  date: string;
  scenario: string;
  summary: string;
  report: BattleReport;
  warbands: WarbandSnapshot[];
}

/**
 * All scenarios played, ordered oldest first. Add one JSON file per battle under
 * ./history/ and import it here as the campaign progresses.
 */
export const history: ScenarioRecord[] = [merchantsDebt as ScenarioRecord];

export function getScenarioUrl(id: string): string {
  return `${import.meta.env.BASE_URL.replace(/\/$/, '')}/scenarios/${id}/`;
}

/** One chapter in a member's story: their snapshot in a single scenario. */
export interface MemberStoryEntry {
  scenario: ScenarioRecord;
  warband: WarbandSnapshot;
  snapshot: MemberSnapshot;
}

/**
 * Follow a single hero or henchman across the campaign, scenario by scenario.
 * Returns one entry per scenario the member took part in, oldest first.
 */
export function getMemberStory(memberId: string): MemberStoryEntry[] {
  const story: MemberStoryEntry[] = [];
  for (const scenario of history) {
    for (const warband of scenario.warbands) {
      const snapshot = warband.members.find((m) => m.memberId === memberId);
      if (snapshot) story.push({ scenario, warband, snapshot });
    }
  }
  return story;
}

/** One chapter in a warband's story: its snapshot in a single scenario. */
export interface WarbandStoryEntry {
  scenario: ScenarioRecord;
  snapshot: WarbandSnapshot;
}

/**
 * Follow a warband across the campaign, scenario by scenario.
 * Returns one entry per scenario the warband took part in, oldest first.
 */
export function getWarbandStory(warbandId: string): WarbandStoryEntry[] {
  const story: WarbandStoryEntry[] = [];
  for (const scenario of history) {
    const snapshot = scenario.warbands.find((w) => w.warbandId === warbandId);
    if (snapshot) story.push({ scenario, snapshot });
  }
  return story;
}
