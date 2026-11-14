// The known list of step runs (`validate/stepRuns.ts`): the 128² default maps, seeds 1 to 12 of each theme, that still
// carry a flight of even one-tile steps, each with the most runs it may carry. The list may only shrink: a map not on it
// carries none, and a map on it no more than its number (planning's look round, item (b), 2026-11-13). Before the mend
// (generator 0.10.22) 66 of the 84 maps carried 1,225 runs; these 25 are laid by the stages after the snap, in ground
// the late break may not move (a kept-off place's, or within 3 tiles of the water) or after it.
export const STEP_RUNS_KNOWN: Readonly<Record<string, number>> = {
  "any:3": 3,
  "any:9": 1,
  "riverValley:1": 3,
  "riverValley:9": 10,
  "riverValley:11": 2,
  "canyon:9": 2,
  "delta:5": 1,
  "delta:8": 1,
  "delta:10": 2,
};

/** The runs a map may carry: its number on the list, else none. */
export function allowedRuns(theme: string, seed: number): number {
  return STEP_RUNS_KNOWN[`${theme}:${seed}`] ?? 0;
}
