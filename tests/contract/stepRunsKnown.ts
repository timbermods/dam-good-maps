// The known list of step runs and stair edges (`validate/stepRuns.ts`): the 128² default maps, seeds 1 to 12 of each
// theme, that still carry a flight of even one-tile steps or a level's edge at 45° in even steps, each with the most of
// the two together it may carry. The list may only shrink: a map not on it carries none, and a map on it no more than its
// number (planning's look round, item (b), 2026-11-13 and 2026-11-14). Before the mend (generator 0.10.23) 64 of the 84
// maps carried 1,179 runs and 79 carried 452 stair edges (1,631 in all); after it 26 carry 58, laid by the stages after the
// snap, in ground the late break may not move (a kept-off place's, or within 3 tiles of the water) or after it.
export const STEP_RUNS_KNOWN: Readonly<Record<string, number>> = {
  "any:8": 2,
  "any:9": 2,
  "any:10": 1,
  "any:12": 1,
  "riverValley:2": 1,
  "riverValley:4": 1,
  "riverValley:9": 3,
  "canyon:2": 1,
  "canyon:3": 1,
  "canyon:4": 1,
  "canyon:8": 3,
  "canyon:9": 1,
  "canyon:12": 2,
  "highlands:6": 7,
  "highlands:9": 4,
  "highlands:10": 1,
  "highlands:11": 5,
  "delta:1": 11,
  "delta:2": 2,
  "delta:5": 2,
  "delta:6": 1,
  "delta:9": 1,
  "delta:11": 1,
  "delta:12": 1,
  "islands:4": 1,
  "islands:6": 1,
};

/** The runs and stair edges a map may carry: its number on the list, else none. */
export function allowedRuns(theme: string, seed: number): number {
  return STEP_RUNS_KNOWN[`${theme}:${seed}`] ?? 0;
}
