// A view's time for its animations: the force moments, the pops and puffs, the edit glow (milliseconds, as
// performance.now). Each renderer has its own (`MapRenderer.now`): the wall clock for the player's view, the video's
// time for a recording (the time-lapse), which draws its frames faster or slower than real time while the player's
// view runs beside it. Reads that measure how long work took stay on the wall clock.

export interface Clock {
  /** The time now, in milliseconds. */
  now(): number;
  /** The caller draws every frame at its own time (a recording): the animations ask for no frames of their own, and the
   *  renderer moves them on to the time before each frame it draws. */
  readonly driven: boolean;
}

/** The wall clock: the player's view. */
export const WALL_CLOCK: Clock = { now: () => performance.now(), driven: false };
