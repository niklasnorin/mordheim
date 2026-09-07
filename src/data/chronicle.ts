export interface ChronicleEntry {
  scenarioId: string;
  date: string;
  title: string;
  body: string;
}

/** Newest battle first. Each entry links to its full report under /scenarios/. */
export const chronicle: ChronicleEntry[] = [];
