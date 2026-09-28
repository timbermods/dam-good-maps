// Which way a real place's two card pictures face (Kyler, 2026-09-25). The 3D overview looks along
// one of the map's axes, the one nearest to the way the land rises, so the low ground is near and
// the high ground far; the map from above is turned by the same quarter turns, so the overview's
// far edge is its top and the two read as one map. The index records the direction
// (PlaceIndexEntry.view): tools/real-places.ts works it out, tools/places-thumbs.ts draws both
// pictures facing it, and the gallery turns each picture's north arrow to match.

/** The direction the overview looks, and so the top of both pictures. */
export type PlaceView = "N" | "E" | "S" | "W";

/** A picture that faces this way is the north-up map turned this many quarter turns clockwise:
 *  north is this many quarter turns clockwise from its top. */
export const VIEW_TURNS: Readonly<Record<PlaceView, 0 | 1 | 2 | 3>> = { N: 0, W: 1, S: 2, E: 3 };

const BY_TURNS: readonly PlaceView[] = ["N", "W", "S", "E"];

/** The 3D view's camera turn for a direction (src/render3d/renderer.ts: yaw 0 stands south of the
 *  map and looks north; a positive yaw stands east and looks west). */
export function viewYaw(view: PlaceView): number {
  return (VIEW_TURNS[view] * Math.PI) / 2;
}

/** Tiles along the edges left out of the land's rise: where a map may be walled. */
const EDGE = 4;

/** The land's mean level, leaving out the edge band. */
export function innerLevel(heights: ArrayLike<number>, W: number, H: number): number {
  let sum = 0;
  let count = 0;
  for (let y = EDGE; y < H - EDGE; y++)
    for (let x = EDGE; x < W - EDGE; x++) {
      sum += heights[y * W + x];
      count++;
    }
  return sum / count;
}

/** The direction to look: along the axis nearest to the way the land rises (from the weighted
 *  middle of the ground below the mean level toward that of the ground above it; tile y grows
 *  northward), or north when the land has no clear rise. */
export function placeView(heights: ArrayLike<number>, W: number, H: number): PlaceView {
  const level = innerLevel(heights, W, H);
  let hx = 0;
  let hy = 0;
  let hw = 0;
  let lx = 0;
  let ly = 0;
  let lw = 0;
  for (let y = EDGE; y < H - EDGE; y++)
    for (let x = EDGE; x < W - EDGE; x++) {
      const d = heights[y * W + x] - level;
      if (d > 0) {
        hx += (x + 0.5) * d;
        hy += (y + 0.5) * d;
        hw += d;
      } else if (d < 0) {
        lx -= (x + 0.5) * d;
        ly -= (y + 0.5) * d;
        lw -= d;
      }
    }
  if (!(hw > 0 && lw > 0)) return "N";
  const vx = hx / hw - lx / lw;
  const vy = hy / hw - ly / lw;
  if (Math.hypot(vx, vy) <= Math.max(W, H) * 0.06) return "N";
  // the camera turn whose way forward, (-sin yaw, cos yaw) in tiles, is nearest the rise
  const q = Math.round(Math.atan2(-vx, vy) / (Math.PI / 2));
  return BY_TURNS[((q % 4) + 4) % 4];
}
