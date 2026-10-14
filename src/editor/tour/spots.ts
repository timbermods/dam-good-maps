// Where the 20-second tour works (D377): spots on the map in front of the player, chosen from its land by
// rules, never by coordinates, so the same map always gets the same tour and every map gets a sensible one:
// a slope for the river (Carve), flat dry ground for the crater (Craterize), then, once those have played, flat
// dry ground for the hill and for the shelf the hill's level is carried to (Raise, Flatten). Pure: heights and
// water in, tiles out.

import { naturalSize } from "../../core/forces/craterize";

export interface Tile {
  x: number;
  y: number;
}

export interface TourGround {
  W: number;
  H: number;
  heights: ArrayLike<number>;
  /** Water depth per tile (more than a film wet). */
  depth: ArrayLike<number>;
  /** The tiles the map's objects stand on (trees, ruins, the start...), which the spots keep clear of. */
  objects?: readonly Tile[];
}

/** What the two forces work on. */
export interface ForceSpots {
  /** The river's course, its higher end first (points a few tiles apart). */
  river: Tile[];
  crater: Tile;
  /** The Power the crater is struck at, and the radius it makes (tiles): a fraction of the map, never most of it. */
  craterPower: number;
  craterRadius: number;
}

/** What the brushes work on: where the hill rises, and a spot near it to level. */
export interface BrushSpots {
  hill: Tile;
  shelf: Tile;
}

/** How far the river's band reaches from its course, and the hill and the shelf from their middles (tiles). */
export const RIVER_REACH = 6;
export const HILL_REACH = 7;
export const SHELF_REACH = 5;

/** The crater's Power for a map: its width about three tenths of the map's, so the rest of the tour has land to
 *  work on (the default Power's crater is half a small map). On Power's steps of five. */
export function craterPowerFor(W: number, H: number): number {
  const width = Math.max(20, Math.min(46, Math.round(Math.min(W, H) * 0.3)));
  return Math.max(5, Math.min(100, Math.round((100 * ((width - 6) / 112) ** (1 / 1.4)) / 5) * 5));
}

const WET = 0.05;

/** The tiles' flatness round (x, y): the share of the disc of radius `r` that is dry and at the middle's own level,
 *  0 to 1 (a disc off the map is 0); halved when water lies within three tiles of it (it is on its way). */
export function flatness(g: TourGround, x: number, y: number, r: number, taken?: Uint8Array): number {
  const { W, H, heights, depth } = g;
  if (x - r < 0 || y - r < 0 || x + r >= W || y + r >= H) return 0;
  const h0 = heights[y * W + x];
  let n = 0;
  let flat = 0;
  let near = false;
  const r2 = r * r;
  const w = r + 3;
  for (let dy = -w; dy <= w; dy++)
    for (let dx = -w; dx <= w; dx++) {
      const yy = y + dy;
      const xx = x + dx;
      if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
      const i = yy * W + xx;
      const d2 = dx * dx + dy * dy;
      if (d2 > w * w) continue;
      if (depth[i] > WET) near = true;
      if (d2 > r2) continue;
      n++;
      if (heights[i] === h0 && !(depth[i] > WET) && !taken?.[i]) flat++;
    }
  return (flat / n) * (near ? 0.5 : 1);
}

const dist = (a: Tile, b: Tile) => Math.hypot(a.x - b.x, a.y - b.y);
const alongDist = (p: Tile, line: readonly Tile[]) => {
  let best = Infinity;
  for (const q of line) best = Math.min(best, dist(p, q));
  return best;
};

function takenTiles(g: TourGround): Uint8Array {
  const taken = new Uint8Array(g.W * g.H);
  for (const o of g.objects ?? []) if (o.x >= 0 && o.y >= 0 && o.x < g.W && o.y < g.H) taken[o.y * g.W + o.x] = 1;
  return taken;
}

/** The river's course: from the best slope, the ground's own way down. Candidates every four tiles in the middle of
 *  the map; each follows the steepest way down (steps of two to three tiles, never uphill, never back on itself)
 *  until it reaches water, the edge or a hollow; the longest drop wins, the first found on a tie. */
function riverCourse(g: TourGround, margin: number): Tile[] {
  const { W, H, heights, depth } = g;
  const steps = 13;
  let best: Tile[] = [];
  let bestScore = -Infinity;
  for (let y = margin; y < H - margin; y += 4)
    for (let x = margin; x < W - margin; x += 4) {
      if (depth[y * W + x] > WET) continue;
      const path: Tile[] = [{ x, y }];
      let at = { x, y };
      let dir: Tile = { x: 0, y: 0 };
      for (let s = 0; s < steps; s++) {
        const here = heights[at.y * W + at.x];
        const along = Math.hypot(dir.x, dir.y);
        let next: Tile | null = null;
        let nextH = Infinity;
        let nextAlign = -2;
        for (let dy = -3; dy <= 3; dy++)
          for (let dx = -3; dx <= 3; dx++) {
            const d = Math.hypot(dx, dy);
            if (d < 2 || d > 3.2) continue;
            const nx = at.x + dx;
            const ny = at.y + dy;
            if (nx < margin || ny < margin || nx >= W - margin || ny >= H - margin) continue;
            if (depth[ny * W + nx] > WET) continue;
            const h = heights[ny * W + nx];
            // (never uphill, never back toward where it came from; the lowest tile, else the straightest on)
            if (h > here) continue;
            const align = along ? (dx * dir.x + dy * dir.y) / (d * along) : 0;
            if (along && align < -0.2) continue;
            if (h < nextH || (h === nextH && align > nextAlign)) {
              next = { x: nx, y: ny };
              nextH = h;
              nextAlign = align;
            }
          }
        if (!next) break;
        dir = { x: next.x - at.x, y: next.y - at.y };
        at = next;
        path.push(at);
      }
      if (path.length < 5) continue;
      const drop = heights[y * W + x] - heights[at.y * W + at.x];
      // (a drop is what makes a river; length shows it off; a path that ended in a hollow short of that is worth less)
      const score = drop * 6 + path.length * 2 - (path.length < steps ? 2 : 0);
      if (score > bestScore) {
        bestScore = score;
        best = path;
      }
    }
  if (best.length) return best;
  // (no way down anywhere: a straight line across the middle, which Carve still cuts)
  const y = Math.floor(H / 2);
  return [0, 1, 2, 3, 4, 5].map((k) => ({ x: Math.floor(W / 2) - 15 + k * 6, y }));
}

/** The best spot for a round shape: flat ground inside `margin` of the edge, clear of what is already on the map
 *  (`avoid`: tiles and the distance to keep from each) and of objects, nearest `near` among equally flat ground. When
 *  nothing clears everything the distances are eased, a little at a time, until something does. */
function flatSpot(g: TourGround, r: number, margin: number, avoid: { tiles: readonly Tile[]; keep: number }[], near: Tile, taken: Uint8Array, where?: (p: Tile) => boolean): Tile {
  const { W, H } = g;
  const step = W * H > 150 * 150 ? 3 : 2;
  for (const ease of [1, 0.75, 0.5, 0.3, 0]) {
    let best: Tile | null = null;
    let bestScore = -Infinity;
    for (let y = margin; y < H - margin; y += step)
      for (let x = margin; x < W - margin; x += step) {
        const p = { x, y };
        let clear = true;
        for (const a of avoid) if (alongDist(p, a.tiles) < a.keep * ease) clear = false;
        if (!clear || (where && !where(p))) continue;
        const f = flatness(g, x, y, r, taken);
        // (flat first: a tenth of the flatness is worth ten tiles of walking)
        const score = f * 100 - dist(p, near) * 0.5;
        if (score > bestScore) {
          bestScore = score;
          best = p;
        }
      }
    if (best) return best;
  }
  // (no ground to choose from: the middle of the map)
  return { x: Math.floor(W / 2), y: Math.floor(H / 2) };
}

/** Where the forces work: a river down the best slope, and a crater on flat ground well clear of it. */
export function forceSpots(g: TourGround): ForceSpots {
  const { W, H } = g;
  const edge = Math.max(10, Math.round(Math.min(W, H) * 0.12));
  const river = riverCourse(g, edge);
  const craterPower = craterPowerFor(W, H);
  const craterRadius = naturalSize(craterPower) / 2;
  const mid = river[Math.floor(river.length / 2)];
  const crater = flatSpot(g, 8, edge + 6, [{ tiles: river, keep: RIVER_REACH + craterRadius + 3 }], mid, takenTiles(g));
  return { river, crater, craterPower, craterRadius };
}

/** Where the brushes work, on the land as it stands (the forces have played, and their water is on its way): flat dry
 *  ground for the hill, clear of the river and the crater, and a spot for the shelf a little way from it. */
export function brushSpots(g: TourGround, f: ForceSpots): BrushSpots {
  const { W, H } = g;
  const edge = Math.max(10, Math.round(Math.min(W, H) * 0.12));
  const taken = takenTiles(g);
  const mid = f.river[Math.floor(f.river.length / 2)];
  const stage = { x: (mid.x + f.crater.x) / 2, y: (mid.y + f.crater.y) / 2 };
  const hill = flatSpot(g, 7, edge + 4, [{ tiles: f.river, keep: RIVER_REACH + HILL_REACH + 3 }, { tiles: [f.crater], keep: f.craterRadius + 1 + HILL_REACH + 3 }], stage, taken);
  const shelf = flatSpot(
    g,
    4,
    edge + 4,
    [
      { tiles: f.river, keep: RIVER_REACH + SHELF_REACH + 3 },
      { tiles: [f.crater], keep: f.craterRadius + 1 + SHELF_REACH + 3 },
    ],
    hill,
    taken,
    // (a hill's width and a little more away, and not far: the two share a close view)
    (p) => dist(p, hill) >= 12 && dist(p, hill) <= 18,
  );
  return { hill, shelf };
}
