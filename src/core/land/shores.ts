// Shores that wander (planning's ruling on #236 of 2026-11-15, ruled water: "shores that wander with the land, bent as
// every bank is"). A lake's shore lies where its water meets the land's next level, so on land whose contour runs
// straight (a tilted plain's bands, a shelf cut to the lake's floor along them: Delta 256² seed 3's box-sided lakes) the
// shore runs ruler-straight. Along every straight stretch of a planned lake's shore (`SHORES.run` shore tiles or more
// whose centres lie within half a tile of one line, at any angle: `straightRuns`), the bank is notched: plain pieces of
// 2 to 5 tiles, then a notch of 2 to 4 tiles where the bank is taken down to the lake's floor, so the water reaches a
// tile into it and the shore steps aside as a worn one does. A notch takes ground only (D111): on a bank a level over
// the lake each tile of it goes down one level, on into the land while the ground behind climbs a level a tile (so no
// step grows), stopping at the first flat (up to `SHORES.depth` tiles); a cliff's bank only its first tile. It is left
// out where it would open the lake to lower ground, meet other water, leave a step beside it higher than the bank it cut
// (a diagonal one more), or reach the map's last `SHORES.margin` tiles. Integers only, deterministic per seed.

import { stream } from "../math/rng";
import { drainage } from "./drainage";
import type { Lake } from "./hydro";

export const SHORES = {
  /** A straight stretch of this many shore tiles or more is notched (the ruled-water measure's run). */
  run: 8,
  /** Plain shore between notches, and a notch's length along the shore, tiles. */
  plain: [2, 5] as const,
  notch: [2, 4] as const,
  /** How far a notch reaches into the land at most, tiles. */
  depth: 3,
  /** Tiles from the map's edge nothing is cut in. */
  margin: 2,
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

/** Notch the straight stretches of the planned lakes' shores (see the file's header), in place: `water` is the plan's
 *  (`Hydro.water`: lakes 2, channels 1, floors 3) and the lakes' tiles, which gain the tiles the water now reaches.
 *  Returns the tiles taken down. */
export function bendShores(
  h: Uint8Array,
  W: number,
  H: number,
  water: Uint8Array,
  lakes: Lake[],
  seed: number,
): number {
  const N = W * H;
  const lake = new Uint8Array(N);
  const lakeAt = new Int32Array(N).fill(-1);
  // (the planned lakes, and any water the land holds standing in a hollow, as the settle will find it)
  const filled = drainage(h, W, H, { eight: false }).filled;
  for (let i = 0; i < N; i++) if (water[i] === 2 || (water[i] !== 1 && filled[i] > h[i])) lake[i] = 1;
  lakes.forEach((lk, k) => {
    for (const i of lk.tiles) if (water[i] === 2) lakeAt[i] = k;
  });
  const m = SHORES.margin;
  const inside = (x: number, y: number) => x >= m && y >= m && x < W - m && y < H - m;
  const rng = stream(seed, "shores");
  /** Land a notch may take: no lake, no channel (a channel's cleared floor is land). */
  const land = (i: number) => !lake[i] && water[i] !== 1;
  const lowered = new Uint8Array(N);
  let cut = 0;
  for (const loop of outlines(lake, W, H)) {
    const n = loop.length;
    if (n < SHORES.run) continue;
    const dryNext = (t: number): boolean => {
      const x = t % W;
      const y = (t - x) / W;
      for (const [dx, dy] of N4) {
        const xx = x + dx;
        const yy = y + dy;
        if (inside(xx, yy) && land(yy * W + xx)) return true;
      }
      return false;
    };
    const flags = loop.map(dryNext);
    const start = flags.every(Boolean) ? 0 : flags.findIndex((f, k) => f && !flags[(k + n - 1) % n]);
    if (start < 0) continue;
    const seqs: number[][] = [];
    let cur: number[] = [];
    for (let s = 0; s < n; s++) {
      const k = (start + s) % n;
      if (flags[k]) cur.push(loop[k]);
      else if (cur.length) {
        seqs.push(cur);
        cur = [];
      }
    }
    if (cur.length) seqs.push(cur);
    for (const seq of seqs) {
      for (const [i0, i1] of straightRuns(seq, W, SHORES.run)) {
        const ax = seq[i0] % W,
          ay = (seq[i0] - ax) / W;
        const bx = seq[i1] % W,
          by = (seq[i1] - bx) / W;
        const tx = bx - ax,
          ty = by - ay;

        // plain, notch, plain, … along the stretch, from a drawn offset
        let k = i0 + rng.int(SHORES.plain[0], SHORES.plain[1] + 1);
        while (k <= i1) {
          const len = rng.int(SHORES.notch[0], SHORES.notch[1] + 1);
          const tiles = seq.slice(k, Math.min(i1 + 1, k + len));
          k += len + rng.int(SHORES.plain[0], SHORES.plain[1] + 1);
          cut += notch(tiles, tx, ty);
        }
      }
    }
  }
  return cut;

  /** One notch behind these shore tiles (the stretch heading tx, ty): every column or none. */
  function notch(shore: readonly number[], tx: number, ty: number): number {
    const cols: { s: number; tiles: number[]; k: number }[] = [];
    for (const s of shore) {
      if (lowered[s]) continue;
      const sx = s % W,
        sy = (s - sx) / W;
      // the way into the land: the dry side across the stretch
      let best: [number, number] | null = null;
      let score = 0;
      for (const [dx, dy] of N4) {
        const xx = sx + dx,
          yy = sy + dy;
        if (!inside(xx, yy) || !land(yy * W + xx)) continue;
        const c = tx * dy - ty * dx;
        const a = c < 0 ? -c : c;
        if (a > score) {
          score = a;
          best = [dx, dy];
        }
      }
      if (!best) continue;
      const [dx, dy] = best;
      const tiles: number[] = [];
      let x = sx + dx,
        y = sy + dy;
      // the first tile takes the lake tile's level and its water: a bank a level over the lake is notched on into the
      // land while it climbs a level a tile (each tile a level down, so no step grows); a cliff's bank only its first
      // tile, its sides as high as the cliff was
      const k = h[y * W + x] - h[s];
      if (k < 1) continue;
      for (;;) {
        const c = y * W + x;
        if (!inside(x, y) || !land(c) || lowered[c]) return 0;
        tiles.push(c);
        const nx = x + dx,
          ny = y + dy;
        if (!inside(nx, ny)) return 0;
        const b = ny * W + nx;
        if (!land(b)) return 0;
        if (h[b] === h[c]) break;
        if (k > 1 && h[b] > h[c]) break;
        if (k > 1 || h[b] !== h[c] + 1 || tiles.length >= SHORES.depth) return 0;
        x = nx;
        y = ny;
      }
      cols.push({ s, tiles, k });
    }
    if (!cols.length) return 0;
    const drop = new Map<number, number>();
    const lim = new Map<number, number>();
    for (const c of cols)
      c.tiles.forEach((t, q) => {
        drop.set(t, q === 0 ? c.k : 1);
        lim.set(t, c.k);
      });
    for (const [t, d] of drop) h[t] -= d;
    const front = new Set(cols.map((c) => c.tiles[0]));
    let ok = true;
    for (const t of drop.keys()) {
      const x = t % W,
        y = (t - x) / W;
      const L = lim.get(t)!;
      for (const [dx, dy] of N8) {
        const xx = x + dx,
          yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const j = yy * W + xx;
        if (drop.has(j)) continue;
        const d = h[j] - h[t];
        const side = dx === 0 || dy === 0;
        if (lake[j]) {
          if (d > 0 && side) ok = false;
          continue;
        }
        // (no step higher beside it than the bank it cut, and a diagonal one more; a tile the water now takes opens
        // onto no lower ground)
        if (d > (side ? L : L + 1) || d < -(side ? L : L + 1)) ok = false;
        if (front.has(t) && d <= 0) ok = false;
      }
      if (!ok) break;
    }
    if (!ok) {
      for (const [t, d] of drop) h[t] += d;
      return 0;
    }

    for (const c of cols) {
      for (const t of c.tiles) lowered[t] = 1;
      const f = c.tiles[0];
      lake[f] = 1;
      // (a planned lake's notch joins the lake; water the land merely holds stays the settle's)
      const k = lakeAt[c.s];
      if (k >= 0) {
        water[f] = 2;
        lakes[k].tiles.push(f);
        lakeAt[f] = k;
      }
    }
    return drop.size;
  }
}
