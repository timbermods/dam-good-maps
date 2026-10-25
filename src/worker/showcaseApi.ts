// Showcase mode's messages (D488 (2); core/gen/showcase.ts): the page and the showcase's own worker
// (showcase.worker.ts) talk only in these. Types and the beats' names only, so the page imports them
// without the core.
//
// The page sends `start` (a spec and the time allowed); the worker answers with a `candidate` message
// after each map it makes (how many so far, the map's preview and arc, the best three so far) and one
// `done` at the end, whose picks carry everything the page needs to show and open each at once (the
// same `GenerateResponse` a generation gives, its project file among it). `stop` ends the search after
// the map being made (a `done` with what it found); terminating the worker ends it at once.

import type { Arc, BeatId } from "../core/gen/showcaseBeats";
import type { MapSpec } from "../core/spec/mapspec";
import type { GenerateResponse } from "./api";

// (the beats' ids in order and their labels, from a module with no imports: the page never loads the
// generator for them)
export { BEATS, BEAT_NAMES, type Beat } from "../core/gen/showcaseBeats";
export type { Arc, BeatId };

export type ShowcaseRequest =
  /** Search from `spec` (its siblings in order, the map itself first) for `budgetMs`. With `tries`, it
   *  makes exactly that many maps and the budget is ignored (an earlier search's `tried` reproduces its
   *  picks, however long they take). */
  | { kind: "start"; spec: MapSpec; budgetMs: number; tries?: number }
  | { kind: "stop" };

/** A map the search made, as the page lists it. */
export interface ShowcaseView {
  /** Its place in the search (0: the asked map) and its variation (its share link's `vr`). */
  index: number;
  variation: number;
  /** Its share spec: generating it gives this map, byte for byte. */
  spec: MapSpec;
  passed: boolean;
  /** Its six beats (null when it failed a check). */
  arc: Arc | null;
  /** What it is offered by (higher is better); -Infinity when it failed a check. */
  score: number;
  /** One line: how many beats it has and the two strongest in a player's words. */
  note: string;
  name?: string;
}

/** A small look at a map: its land and its settled water (1 where wet). */
export interface ShowcasePreview {
  W: number;
  H: number;
  heights: Uint8Array;
  water: Uint8Array;
}

export type ShowcaseMessage =
  /** A map made: `tried` so far, `elapsedMs` since the start, the map (with its preview when it entered
   *  the best three) and the best three so far, best first (each one's preview came with its own
   *  candidate message). */
  | { kind: "candidate"; tried: number; elapsedMs: number; candidate: ShowcaseView; preview: ShowcasePreview | null; best: ShowcaseView[] }
  /** The end: the best three, best first, each ready to open (`response.project`), and whether a stop
   *  ended it early. `tried` reproduces it (`start` with `tries: tried`). */
  | { kind: "done"; tried: number; elapsedMs: number; stopped: boolean; best: ShowcasePickView[] }
  | { kind: "error"; message: string };

export interface ShowcasePickView extends ShowcaseView {
  response: GenerateResponse;
}
