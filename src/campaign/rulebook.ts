/** The scenarios of the Mordheim rulebook, as a game master may pick them for an upcoming game. Anything else is custom. */
export const RULEBOOK_SCENARIOS = [
  'Defend the Find', 'Skirmish', 'Wyrdstone Hunt', 'Breakthrough', 'Street Fight', 'Chance Encounter', 'Hidden Treasure', 'Occupy', 'Surprise Attack',
] as const;
export type RulebookScenario = (typeof RULEBOOK_SCENARIOS)[number];

/** Where the rulebook scenarios are written out, as the campaign notes have cited them since the first game. */
const RULES_BASE = 'https://mordheimer.net/docs/campaigns/scenarios/mordheim-rulebook';

/**
 * The rules for a rulebook scenario, by name. Null for a custom scenario, or for a name the rulebook does not
 * have: a link that guesses would be worse than none.
 */
export function rulebookUrl(name: string | null | undefined): string | null {
  if (!name) return null;
  const known = (RULEBOOK_SCENARIOS as readonly string[]).find((r) => r.toLowerCase() === name.trim().toLowerCase());
  return known ? `${RULES_BASE}/${known.toLowerCase().replace(/[^a-z0-9]+/g, '-')}` : null;
}

/**
 * What each rulebook scenario counts, for the battle tracker's tally. The others are decided by who routs and who
 * is left standing, so they tally nothing beyond the out-of-action results; a game master may still name one.
 */
export const RULEBOOK_TALLIES: Readonly<Partial<Record<RulebookScenario, string>>> = {
  'Wyrdstone Hunt': 'Shards',
  'Breakthrough': 'Warriors through',
  'Occupy': 'Buildings held',
  'Hidden Treasure': 'Treasure found',
};
