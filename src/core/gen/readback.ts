// Features read back out of the field (docs/m9-design.md §12; ROADMAP M9a): what the processes
// made, described as features so the document, the analysis, the editor's tools and M12's Claude
// can name and grab them. The rivers and the badwater hollows come from the hydrology and the
// hazards as they are planned; this adds the natural lakes: the hollows the rivers fill, each an
// outline of its water (tile corners, so the outline's mask is the lake's tiles), its outlet where
// its river leaves it, at the sill it spills over. They describe the field and never shape it: the
// field `contains` them, so the build leaves their ground alone.

import { featureId } from "../features/ids";
import type { LakeFeature, Point } from "../features/schema";
import type { Hydro } from "../land/hydro";

/** The outer boundary of the tiles of `mask` that hold `seed`, as a polygon through tile corners
 *  (corner (x, y) of tile (x, y) at (x − 0.5, y − 0.5)), straight runs merged, counter-clockwise. */
export function outlineOf(mask: Uint8Array, W: number, H: number, seed: number): Point[] {
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && mask[y * W + x] > 0;
  // the lowest row's first tile of the component is on its outer boundary: start at its south side
  const sx = seed % W;
  const sy = (seed - sx) / W;
  // walk the boundary with the tiles on the left (a square tracing on corners)
  const pts: [number, number][] = [];
  let x = sx;
  let y = sy;
  // direction: 0 east, 1 north, 2 west, 3 south (along corner edges)
  let dir = 0;
  const startX = x;
  const startY = y;
  const guard = 8 * W * H;
  for (let step = 0; step < guard; step++) {
    pts.push([x, y]);
    // corner (x, y); the four tiles round it: (x−1, y−1) SW, (x, y−1) SE, (x−1, y) NW, (x, y) NE
    const turnOrder = [(dir + 3) & 3, dir, (dir + 1) & 3, (dir + 2) & 3]; // right, straight, left, back
    let moved = false;
    for (const d of turnOrder) {
      // moving from corner (x, y) in direction d along an edge with a mask tile on its left
      const [lx, ly] = d === 0 ? [x, y] : d === 1 ? [x - 1, y] : d === 2 ? [x - 1, y - 1] : [x, y - 1];
      const [rx, ry] = d === 0 ? [x, y - 1] : d === 1 ? [x, y] : d === 2 ? [x - 1, y] : [x - 1, y - 1];
      if (inside(lx, ly) && !inside(rx, ry)) {
        dir = d;
        x += d === 0 ? 1 : d === 2 ? -1 : 0;
        y += d === 1 ? 1 : d === 3 ? -1 : 0;
        moved = true;
        break;
      }
    }
    if (!moved || (x === startX && y === startY)) break;
  }
  // merge straight runs: keep the corners where the boundary turns
  const out: Point[] = [];
  const n = pts.length;
  for (let k = 0; k < n; k++) {
    const [px, py] = pts[(k + n - 1) % n];
    const [cx, cy] = pts[k];
    const [nx, ny] = pts[(k + 1) % n];
    if ((cx - px) * (ny - cy) - (cy - py) * (nx - cx) !== 0) out.push([cx - 0.5, cy - 0.5]);
  }
  return out;
}

/** The natural lakes the hydrology found, as lake features. */
export function lakeFeatures(hy: Pick<Hydro, "lakes" | "rivers">, W: number, H: number, seed: number): LakeFeature[] {
  const out: LakeFeature[] = [];
  hy.lakes.forEach((lk, k) => {
    if (lk.tiles.length < 6) return;
    const mask = new Uint8Array(W * H);
    for (const i of lk.tiles) mask[i] = 1;
    let first = lk.tiles[0];
    for (const i of lk.tiles) if (i < first) first = i;
    const outline = outlineOf(mask, W, H, first);
    if (outline.length < 3) return;
    // where its river leaves it: the first point of the river's course past the lake's water
    const river = hy.rivers.find((r) => r.id === lk.river);
    let at: Point = outline[0];
    if (river) {
      let wasIn = false;
      for (const [px, py] of river.params.path) {
        const x = Math.round(px);
        const y = Math.round(py);
        const isIn = x >= 0 && y >= 0 && x < W && y < H && mask[y * W + x] > 0;
        if (wasIn && !isIn) {
          at = [Math.round(px * 100) / 100, Math.round(py * 100) / 100];
          break;
        }
        wasIn = wasIn || isIn;
      }
    }
    const role = `lake/natural/${k}`;
    out.push({
      id: featureId(seed, "lake", role),
      kind: "lake",
      origin: "generated",
      role,
      locked: false,
      params: {
        outline,
        floorDepth: 1,
        outlet: { at, sill: lk.outletBed + 1, to: river ? "river" : "none", ...(river ? { target: river.id } : {}) },
        inflow: { rivers: river ? [river.id] : [] },
        planned: false,
        natural: true,
      },
    });
  });
  return out;
}
