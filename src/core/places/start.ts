// Where a real place's start may move (D245: the start goes to the best spot its own land offers;
// moving it toward water is fine). With the edges open (D151) the rivers run on off the map instead
// of pooling behind the survey's sealed border, so a start the survey put beside that pooled water
// can stand in a river now (`start.dry`) or far from any (`start.water`). The spots offered keep
// the land as it is: the district center's 3×3 and its door on one level already, its 5×5 dry and
// clear of water sources, a shore a pump works from within the walk the water rule allows. Spots whose
// land can give the start's land floors (D515: the walkable land, and the moist ground for the first
// farms and a forester, which no object makes) come first, then the rest; each nearest the survey's
// start first. Trees, bushes and ruins make room for the start (`startTiles`), as they
// do for a start moved in the editor (doc/start.ts). tools/real-places.ts builds each in turn and
// keeps the best the checks pass. Pure and deterministic.

import { WET } from "../validate/playability";
import { padFloods, shoreWalkFrom } from "../gen/settler";
import { reachAt, walkDistance } from "../analysis/walk";
import type { PlaceData } from "./place";

/** The tiles a start at corner (x, y), facing Cw0, stands on and opens onto: its 3×3 and its door. */
export function startTiles(W: number, at: readonly [number, number]): number[] {
  const [x, y] = at;
  const out = [(y - 1) * W + x + 1];
  for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 3; dx++) out.push((y + dy) * W + x + dx);
  return out;
}

/** How far from the map's edge the start's middle stands, at least (its 5×5 and door on the map,
 *  with a tile to spare). */
const EDGE_MARGIN = 4;
/** The walk to a pump's shore a spot may need, on its own level (a place has no stairs): under
 *  Normal's Water without stairs rule (20) with a margin, as the check walks round objects the
 *  estimate does not see. */
const SHORE_WALK = 16;
/** The least distance between two spots offered, in tiles. */
const SPACING = 4;

/** Spots for the start's StartingLocation (its corner, facing Cw0 as every place's start does),
 *  nearest the place's own start first (after those whose land fits, with `land`), at most `limit`. `depth` and `contamination` are the
 *  place's settled water; `shore` false drops the shore (a dry spot where the place has no water a
 *  pump works from); `walk` widens the shore's walk (`SHORE_WALK`, tiles); `land` ranks the spots
 *  whose land can give the start's land floors first (`landFits`). */
export function placeStartSpots(p: PlaceData, heights: Uint8Array, depth: ArrayLike<number>, contamination: ArrayLike<number>, opts: { limit?: number; shore?: boolean; walk?: number; land?: StartLand } = {}): [number, number][] {
  const limit = opts.limit ?? 12;
  const { W, H } = p;
  const taken = new Uint8Array(W * H);
  for (const [x, y] of p.sources) taken[y * W + x] = 1;
  const reach = opts.walk ?? SHORE_WALK;
  const shore = opts.shore === false ? null : shoreWalkFrom(heights, W, H, depth, contamination, reach);
  // (the start's corner is its middle less one; its door is the middle's tile two to the south)
  const fromX = p.start[0] + 1;
  const fromY = p.start[1] + 1;
  const spots: { x: number; y: number; d: number; fits: boolean }[] = [];
  const plates = opts.land ? dryPlates(heights, W, H, depth) : null;
  for (let y = EDGE_MARGIN; y < H - EDGE_MARGIN; y++)
    for (let x = EDGE_MARGIN; x < W - EDGE_MARGIN; x++) {
      const L = heights[y * W + x];
      let ok = heights[(y - 2) * W + x] === L && !taken[(y - 2) * W + x];
      for (let dy = -2; dy <= 2 && ok; dy++)
        for (let dx = -2; dx <= 2 && ok; dx++) {
          const i = (y + dy) * W + x + dx;
          if (depth[i] > WET) ok = false;
          else if (Math.abs(dx) <= 1 && Math.abs(dy) <= 1 && (heights[i] !== L || taken[i])) ok = false;
        }
      if (!ok || padFloods(heights, W, H, depth, x, y, L)) continue;
      // a shore within the walk from the 3×3 (the check walks from its middle, a tile further)
      let walk = shore ? Infinity : 0;
      if (shore)
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) walk = Math.min(walk, shore[(y + dy) * W + x + dx] + Math.max(Math.abs(dx), Math.abs(dy)));
      if (!(walk <= reach)) continue;
      spots.push({ x, y, d: (x - fromX) * (x - fromX) + (y - fromY) * (y - fromY), fits: false });
    }
  // (the land's estimate walks every spot: only those the shore and the 3×3 let through)
  if (opts.land && plates) for (const s of spots) s.fits = landFits(heights, W, H, plates, s.x, s.y, opts.land);
  spots.sort((a, b) => Number(b.fits) - Number(a.fits) || a.d - b.d || a.y - b.y || a.x - b.x);
  // (spots a few tiles apart: neighbours a tile apart would mostly pass and fail together)
  const out: { x: number; y: number }[] = [];
  for (const s of spots) {
    if (out.length >= limit) break;
    if (!out.some((o) => Math.max(Math.abs(o.x - s.x), Math.abs(o.y - s.y)) < SPACING)) out.push(s);
  }
  return out.map((s) => [s.x - 1, s.y - 1]);
}

/** The start's land floors a spot is ranked by (D515; the tool reads them from the checks' own limits):
 *  `reach` dry tiles walkable from the start (`start.reach`), and `moist` moist tiles within `within`
 *  tiles' walk (`start.farmland`'s first farms and `start.forester`'s plot beyond them). `moisture` is
 *  the place's settled soil moisture. Objects make neither: a spot short of them stays short. */
export interface StartLand {
  moisture: ArrayLike<number>;
  reach: number;
  moist: number;
  within: number;
}

/** The dry tiles of each level joined side to side (a place has no slopes, so the start's walk keeps to
 *  its own level): each tile's plate and each plate's size. */
function dryPlates(h: Uint8Array, W: number, H: number, depth: ArrayLike<number>): Plates {
  const wet = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) if (depth[i] > WET) wet[i] = 1;
  const label = new Int32Array(W * H).fill(-1);
  const size: number[] = [];
  const queue = new Int32Array(W * H);
  for (let s = 0; s < W * H; s++) {
    if (label[s] >= 0 || wet[s]) continue;
    const k = size.length;
    let head = 0;
    let tail = 0;
    queue[tail++] = s;
    label[s] = k;
    while (head < tail) {
      const i = queue[head++];
      const x = i % W;
      for (const j of [x > 0 ? i - 1 : -1, x + 1 < W ? i + 1 : -1, i - W, i + W]) {
        if (j < 0 || j >= W * H || label[j] >= 0 || wet[j] || h[j] !== h[i]) continue;
        label[j] = k;
        queue[tail++] = j;
      }
    }
    size.push(tail);
  }
  return { label, size, wet };
}

/** The dry plates (`dryPlates`) and the wet tiles that part them. */
interface Plates {
  label: Int32Array;
  size: number[];
  wet: Uint8Array;
}

/** Whether a start whose middle stands at (x, y) has land for the start's land floors, by the checks'
 *  own measures estimated: its plate's dry tiles (the walkable land) and the moist dry tiles within
 *  `within` tiles' walk of its 3×3 (a tile beside the walk a step further, as the farmland check reaches). */
function landFits(h: Uint8Array, W: number, H: number, plates: Plates, x: number, y: number, land: StartLand): boolean {
  if (plates.size[plates.label[y * W + x]] < land.reach) return false;
  const wet = plates.wet;
  const walk = walkDistance(h, W, H, wet, [], { x, y }, land.within + 1);
  let moist = 0;
  for (let i = 0; i < W * H; i++) if (!wet[i] && land.moisture[i] > 0 && reachAt(walk, W, H, i) <= land.within) moist++;
  return moist >= land.moist;
}
