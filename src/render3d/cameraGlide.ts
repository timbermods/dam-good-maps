// The camera keys' motion (Timberborn's): held, WASD and the arrows move the camera every frame, a
// quick ease-in to full speed and a short glide to a stop; Q and E turn it; Shift is faster. A frame
// at a time from the keys held and the time since the last frame, with no page and no clock of its
// own, so its pace is checked exactly (tests/unit/cameraGlide.test.ts).

/** How fast the camera is going on each axis (-1..1 of full speed), and whether Shift is down. */
export interface Glide {
  x: number;
  y: number;
  yaw: number;
  fast: boolean;
}

export const STILL: Glide = { x: 0, y: 0, yaw: 0, fast: false };

/** The longest frame the glide takes at once (s): a stalled page never throws the camera. */
export const MAX_DT = 0.05;
/** Full speed pans a screen's height in about 1.4 s; Shift is this many times as fast. */
export const PAN_PER_SECOND = 0.7;
export const FAST_PAN = 2.5;
/** Turning (radians a second at full speed); Shift turns this many times as fast. */
export const YAW_PER_SECOND = 1.6;
export const FAST_YAW = 1.8;

/** Which way the held keys ask to go. */
export function wanted(held: ReadonlySet<string>, orbit: boolean): { x: number; y: number; yaw: number } {
  return {
    x: (held.has("d") || held.has("arrowright") ? 1 : 0) - (held.has("a") || held.has("arrowleft") ? 1 : 0),
    y: (held.has("w") || held.has("arrowup") ? 1 : 0) - (held.has("s") || held.has("arrowdown") ? 1 : 0),
    yaw: orbit ? (held.has("q") ? 1 : 0) - (held.has("e") ? 1 : 0) : 0,
  };
}

/** One frame: the glide eased toward what is wanted (in about 0.12 s, out in about 0.18 s), and how
 *  far the view goes this frame (`pan` in screen heights across and up, `yaw` in radians). `moving`
 *  is false once it has come to rest. */
export function glideStep(g: Glide, want: { x: number; y: number; yaw: number }, seconds: number): { glide: Glide; pan: { x: number; y: number }; yaw: number; moving: boolean } {
  const dt = Math.min(MAX_DT, Math.max(0, seconds));
  const next: Glide = { ...g };
  for (const k of ["x", "y", "yaw"] as const) {
    const rate = want[k] ? 1 / 0.12 : 1 / 0.18;
    const d = want[k] - g[k];
    next[k] = g[k] + Math.sign(d) * Math.min(Math.abs(d), rate * dt);
  }
  const moving = Math.abs(next.x) > 1e-3 || Math.abs(next.y) > 1e-3 || Math.abs(next.yaw) > 1e-3;
  if (!moving) return { glide: next, pan: { x: 0, y: 0 }, yaw: 0, moving };
  const px = PAN_PER_SECOND * (next.fast ? FAST_PAN : 1) * dt;
  return { glide: next, pan: { x: -next.x * px, y: next.y * px }, yaw: next.yaw ? next.yaw * YAW_PER_SECOND * (next.fast ? FAST_YAW : 1) * dt : 0, moving };
}
