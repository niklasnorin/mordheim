export interface ChronicleEntry {
  scenarioId: string;
  date: string;
  title: string;
  body: string;
}

/** Newest battle first. Each entry links to its full report under /scenarios/. */
export const chronicle: ChronicleEntry[] = [
  {
    scenarioId: 'scenario-01-the-merchants-debt',
    date: 'Date unrecorded',
    title: 'The Merchant’s Debt',
    body: 'The Nordost Kin follow a whispered promise of gems into an abandoned market, only to find the Bitterbrows pursuing an ancestral grudge at the same shop. In their first encounter — Occupy, with three objective buildings — Baldur holds the watchtower, Torgrim claims the merchant’s house, and Biorn and Ragnar overcome the rear ruin’s defender. The kin win the ground, but Mjølnir loses a hand and the cellar’s secrets remain below.',
  },
];
