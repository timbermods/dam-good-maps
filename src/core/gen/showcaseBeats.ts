// Showcase mode's beats (D488 (2)), by name: the ids in their order, their labels and the shape of an
// arc. Kept apart from showcase.ts, with no imports, so the page reads them (through
// worker/showcaseApi.ts) without loading the generator.

export const BEATS = ["vista", "drought", "valley", "project", "landmark", "mystery"] as const;
export type BeatId = (typeof BEATS)[number];

/** Each beat in a few words (the page's labels). */
export const BEAT_NAMES: Record<BeatId, string> = {
  vista: "An opening vista",
  drought: "A first-drought choice",
  valley: "A valley behind a gate",
  project: "A late-game project",
  landmark: "A landmark in view",
  mystery: "A mystery",
};

export interface Beat {
  met: boolean;
  /** How strongly the map has it, 0–1 (a beat not met may still show some of it). */
  strength: number;
  /** What the map shows, in a player's words, with its own numbers (when met). */
  say?: string;
}

export type Arc = Record<BeatId, Beat>;
