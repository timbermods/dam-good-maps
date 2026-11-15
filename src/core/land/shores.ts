// Shores that wander (planning's rulings on #236 of 2026-11-15, ruled water: "shores that wander with the land", made
// where the shore is made). A lake's shore lies where its water meets the land's next level, so on land whose contour
// runs straight (a tilted plain's bands: Delta 256² seed 3's box-sided lakes) the shore runs ruler-straight. Once the
// shelves are cut, every planned lake's shore (and any water the land holds in a hollow) is laid on a noised contour
// (`SHORES.cell`): from the bank a level over the surface into the land, climbing a level a tile at most and up to
// `SHORES.rise` levels over the surface, a tile `d` in is a bay's where the noise stands over
// `SHORES.from + SHORES.step · d`, up to `SHORES.depth` tiles. Each bay is cut to the lake's floor, a level under the
// surface, so it holds water and not a sheet, and the ground round it is graded down a level a tile (up to
// `SHORES.grade` tiles), so no step grows. Ground is only taken (D111); a bay is left out where its grading would touch a
// channel, other water or the map's last `SHORES.margin` tiles, or leave ground at or under the surface beside lower
// ground the lake would spill to. Deterministic per seed. `straightRuns` and `inStrip` read straight stretches for the
// ruled-water measure (tools/ruled-water.ts).

import { hash32 } from "../math/hash";
import { fbm } from "../math/noise";
import { BED_FLOOR } from "./genome";
import { drainage } from "./drainage";
import type { Lake } from "./hydro";

export const SHORES = {
  /** The straight-run length `straightRuns` reads (the ruled-water measure's run). */
  run: 8,
  /** The noised contour: its cell (tiles), the noise a bay's first tile needs, and how much more each tile further in. */
  cell: 6,
  from: -0.1,
  step: 0.12,
  /** How far a bay reaches into the land at most, tiles, and how far round it the ground may be graded down. */
  depth: 6,
  grade: 4,
  /** How high over the surface the ground a bay is cut into may stand, levels. */
  rise: 3,
  /** Tiles from the map's edge nothing is cut in. */
  margin: 3,
} as const;

// (this order settles a tie when a notch picks its way into the land, so it stays as the maps were made with)
const N4: readonly [number, number][] = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
];
const N8: readonly [number, number][] = [
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
  [0, -1],
  [1, -1],
];

/** The outlines of a region (4-connected), each its own tiles in the order its edge runs, the region on the left. */
export function outlines(region: Uint8Array, W: number, H: number): number[][] {
  const inR = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && region[y * W + x] === 1;
  const V = (x: number, y: number) => y * (W + 1) + x;
  const out = new Map<number, { to: number; dir: number; tile: number }[]>();
  const add = (from: number, to: number, dir: number, tile: number) => {
    const l = out.get(from);
    if (l) l.push({ to, dir, tile });
    else out.set(from, [{ to, dir, tile }]);
  };
  let edges = 0;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (!inR(x, y)) continue;
      const t = y * W + x;
      if (!inR(x, y - 1)) {
        add(V(x, y), V(x + 1, y), 0, t);
        edges++;
      }
      if (!inR(x + 1, y)) {
        add(V(x + 1, y), V(x + 1, y + 1), 1, t);
        edges++;
      }
      if (!inR(x, y + 1)) {
        add(V(x + 1, y + 1), V(x, y + 1), 2, t);
        edges++;
      }
      if (!inR(x - 1, y)) {
        add(V(x, y + 1), V(x, y), 3, t);
        edges++;
      }
    }
  const loops: number[][] = [];
  const starts = [...out.keys()].sort((a, b) => a - b);
  for (const v0 of starts) {
    const l0 = out.get(v0)!;
    while (l0.length) {
      let e = l0.pop()!;
      const tiles: number[] = [];
      for (let guard = 0; ; guard++) {
        if (tiles[tiles.length - 1] !== e.tile) tiles.push(e.tile);
        const next = out.get(e.to);
        if (!next || !next.length || guard > edges) break;
        // (at a vertex with two ways on, a diagonal pinch, keep to this tile's own corner: the left turn first)
        let k = 0;
        if (next.length > 1) {
          k = next.findIndex((n) => n.dir === (e.dir + 1) % 4);
          if (k < 0) k = next.findIndex((n) => n.dir === e.dir);
          if (k < 0) k = 0;
        }
        e = next.splice(k, 1)[0];
      }
      if (tiles.length > 1 && tiles[0] === tiles[tiles.length - 1]) tiles.pop();
      if (tiles.length) loops.push(tiles);
    }
  }
  return loops;
}

/** Whether integer points fit a strip under one tile wide (every centre within half a tile of one line): some edge of
 *  their hull has every point nearer its line than 1 (cross² < length², exact on integers). */
export function inStrip(pts: readonly [number, number][]): boolean {
  if (pts.length < 3) return true;
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: [number, number], a: [number, number], b: [number, number]) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo: [number, number][] = [];
  for (const q of p) {
    while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop();
    lo.push(q);
  }
  const hi: [number, number][] = [];
  for (let k = p.length - 1; k >= 0; k--) {
    const q = p[k];
    while (hi.length >= 2 && cross(hi[hi.length - 2], hi[hi.length - 1], q) <= 0) hi.pop();
    hi.push(q);
  }
  const hull = lo.slice(0, -1).concat(hi.slice(0, -1));
  if (hull.length < 3) return true;
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i];
    const b = hull[(i + 1) % hull.length];
    const l2 = (b[0] - a[0]) * (b[0] - a[0]) + (b[1] - a[1]) * (b[1] - a[1]);
    if (l2 === 0) continue;
    let ok = true;
    for (const q of hull) {
      const c = cross(a, b, q);
      if (c * c >= l2) {
        ok = false;
        break;
      }
    }
    if (ok) return true;
  }
  return false;
}

/** The straight stretches of a sequence of tiles (an outline's run of shore): from each tile on, the longest stretch
 *  whose tiles fit `inStrip`, taken greedily without overlap; each [first, last] index of `seq` with `min` distinct tiles
 *  or more. */
export function straightRuns(seq: readonly number[], W: number, min: number): [number, number][] {
  const out: [number, number][] = [];
  const pt = (t: number): [number, number] => [t % W, (t - (t % W)) / W];
  for (let i = 0; i + min <= seq.length;) {
    const pts: [number, number][] = [pt(seq[i]), pt(seq[i + 1])];
    let j = i + 1;
    while (j + 1 < seq.length) {
      pts.push(pt(seq[j + 1]));
      if (!inStrip(pts)) break;
      j++;
    }
    if (new Set(seq.slice(i, j + 1)).size >= min) {
      out.push([i, j]);
      i = j + 1;
    } else i++;
  }
  return out;
}

/** The planned lakes' shores on a noised contour (see the file's header), in place: `water` is the plan's (`Hydro.water`:
 *  lakes 2, channels 1, floors 3) and the lakes' tiles, which gain the tiles the water now reaches. Returns the tiles
 *  taken down. */
export function wanderShores(
  h: Uint8Array,
  W: number,
  H: number,
  water: Uint8Array,
  lakes: Lake[],
  seed: number,
): number {
  const N = W * H;
  const filled = drainage(h, W, H, { eight: false }).filled;
  // (the planned lakes, and any water the land holds standing in a hollow, as the settle will find it; each tile's
  // surface the level its water spills at)
  const lake = new Uint8Array(N);
  for (let i = 0; i < N; i++) if (water[i] === 2 || (water[i] !== 1 && filled[i] > h[i])) lake[i] = 1;
  // (each body of water by itself, so no bay joins two)
  const body = new Int32Array(N).fill(-1);
  for (let s0 = 0, id = 0; s0 < N; s0++) {
    if (!lake[s0] || body[s0] >= 0) continue;
    body[s0] = id;
    const st = [s0];
    while (st.length) {
      const i = st.pop()!;
      const x = i % W;
      const y = (i - x) / W;
      for (const [dx, dy] of N4) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const j = yy * W + xx;
        if (lake[j] && body[j] < 0) {
          body[j] = id;
          st.push(j);
        }
      }
    }
    id++;
  }
  const lakeAt = new Int32Array(N).fill(-1);
  lakes.forEach((lk, k) => {
    for (const i of lk.tiles) if (water[i] === 2) lakeAt[i] = k;
  });
  const m = SHORES.margin;
  const inside = (i: number) => {
    const x = i % W;
    const y = (i - x) / W;
    return x >= m && y >= m && x < W - m && y < H - m;
  };
  const dry = (i: number) => !lake[i] && water[i] !== 1;
  // the bays: from every bank a level over its lake's surface, into the ground at that level, as far as the noised
  // contour lets (the deeper in, the higher the noise must stand)
  const bay = new Uint8Array(N);
  const surf = new Int32Array(N).fill(-1);
  const from = new Int32Array(N).fill(-1);
  const dist = new Int32Array(N).fill(-1);
  const q: number[] = [];
  for (let i = 0; i < N; i++) {
    if (!lake[i]) continue;
    const x = i % W;
    const y = (i - x) / W;
    for (const [dx, dy] of N4) {
      const xx = x + dx;
      const yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
      const t = yy * W + xx;
      if (!dry(t) || dist[t] >= 0 || h[t] !== filled[i] + 1 || !inside(t)) continue;
      dist[t] = 1;
      surf[t] = filled[i];
      from[t] = body[i];
      q.push(t);
    }
  }
  const noise = (t: number) => {
    const x = t % W;
    return fbm(hash32(seed, "shores"), x, (t - x) / W, SHORES.cell, 3);
  };
  for (let k = 0; k < q.length; k++) {
    const t = q[k];
    if (noise(t) <= SHORES.from + SHORES.step * dist[t]) continue;
    bay[t] = 1;
    if (dist[t] >= SHORES.depth) continue;
    const x = t % W;
    const y = (t - x) / W;
    for (const [dx, dy] of N4) {
      const xx = x + dx;
      const yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
      const j = yy * W + xx;
      // (on into the land while it climbs no more than a level a tile, up to `SHORES.rise` over the surface)
      if (dist[j] >= 0 || !dry(j) || h[j] < h[t] || h[j] > h[t] + 1 || h[j] > surf[t] + SHORES.rise || !inside(j)) continue;
      dist[j] = dist[t] + 1;
      surf[j] = surf[t];
      from[j] = from[t];
      q.push(j);
    }
  }
  // each bay (a connected piece of it) is cut to the lake's floor, a level under the surface, so it holds water and not a
  // sheet, and the ground round it is taken down so no step beside it grows over one level: a cove graded into the land.
  // A bay is left out when that grading would reach further than `SHORES.grade` tiles, touch a channel, other water or the
  // map's last tiles, or leave ground at or under the surface beside lower ground the lake would spill to.
  const target = new Int32Array(N).fill(-1);
  const seenBay = new Uint8Array(N);
  let cut = 0;
  for (let s0 = 0; s0 < N; s0++) {
    if (!bay[s0] || seenBay[s0]) continue;
    const comp: number[] = [s0];
    seenBay[s0] = 1;
    for (let k = 0; k < comp.length; k++) {
      const t = comp[k];
      const x = t % W;
      const y = (t - x) / W;
      for (const [dx, dy] of N4) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const j = yy * W + xx;
        if (bay[j] && !seenBay[j]) {
          seenBay[j] = 1;
          comp.push(j);
        }
      }
    }
    const S = surf[s0];
    const own = from[s0];
    if (!(S - 1 > BED_FLOOR)) continue;
    const touched: number[] = [];
    const ring = new Map<number, number>();
    let ok = true;
    for (const t of comp) {
      target[t] = S - 1;
      touched.push(t);
      ring.set(t, 0);
    }
    const q2 = comp.slice();
    for (let k = 0; k < q2.length && ok; k++) {
      const i = q2[k];
      const x = i % W;
      const y = (i - x) / W;
      for (const [dx, dy] of N8) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const j = yy * W + xx;
        if (lake[j]) {
          if (body[j] !== own) ok = false;
          continue;
        }
        const cur = target[j] >= 0 ? target[j] : h[j];
        const want = target[i] + 1;
        // (ground under the surface beside the bay or its shore, not the bay's own: the lake would spill there)
        if (target[i] <= S && ring.get(j) !== 0 && cur < S) ok = false;
        if (cur <= want) continue;
        if (!dry(j) || !inside(j) || ring.get(i)! + 1 > SHORES.grade) {
          ok = false;
          break;
        }
        if (target[j] < 0) touched.push(j);
        target[j] = want;
        ring.set(j, ring.get(i)! + 1);
        q2.push(j);
      }
    }
    if (ok)
      for (const t of touched) {
        if (target[t] < h[t]) {
          h[t] = target[t];
          cut++;
        }
      }
    else for (const t of comp) bay[t] = 0;
    for (const t of touched) target[t] = -1;
  }
  for (let t = 0; t < N; t++) {
    if (!bay[t]) continue;
    // (a planned lake's bay joins the lake; water the land merely holds stays the settle's)
    const x = t % W;
    const y = (t - x) / W;
    for (const [dx, dy] of N4) {
      const xx = x + dx;
      const yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
      const j = yy * W + xx;
      if (lakeAt[j] >= 0) {
        lakeAt[t] = lakeAt[j];
        break;
      }
    }
  }
  // (the bays joined to a planned lake through other bay tiles join it too)
  for (let pass = 0; pass < SHORES.depth; pass++)
    for (let t = 0; t < N; t++) {
      if (!bay[t] || lakeAt[t] >= 0) continue;
      const x = t % W;
      const y = (t - x) / W;
      for (const [dx, dy] of N4) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const j = yy * W + xx;
        if (bay[j] && lakeAt[j] >= 0) {
          lakeAt[t] = lakeAt[j];
          break;
        }
      }
    }
  for (let t = 0; t < N; t++)
    if (bay[t] && lakeAt[t] >= 0) {
      water[t] = 2;
      lakes[lakeAt[t]].tiles.push(t);
    }
  return cut;
}
