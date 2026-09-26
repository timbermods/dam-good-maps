// Rivers from the terrain's drainage, design version 2: version 1's hydrology (../proto/hydro.ts)
// with two changes. The main river (the largest flow) cuts `hanging` levels deeper than the rest, so
// the valleys of its tributaries hang above it and their water falls where they join (hanging
// valleys). And knickpoints: where a river's bed falls 3 levels or more within a short reach, the
// drops gather into one fall at the head of the reach, and the river below cuts down to the foot of
// the reach, as a waterfall retreats and leaves a gorge (`knick` sets the reach, longer as
// Verticality rises). And spring lakes: a closed hollow of 100+ tiles that no river crosses may
// hold a spring at its head (`lakeSprings`, by theme; D171: never inside the lake), so the hollow fills to its rim and
// spills out as a stream: lakes where the land holds water, not only where a river happens to
// pass (task b: water over the workshop's range). Version 1's notes follow.
//
// Rivers from the terrain's drainage (the M9 design, "emergence"): no river is drawn. Water enters
// where the ground lets it (edge inflows at the low points of the upstream edges, springs on high
// ground), follows the eroded field's drainage to a map edge, and cuts its channel below the ground
// round it (one level; a canyon river cuts deeper and clears a floor beside its channel). Where its
// path crosses a closed hollow of the snapped terrain, the hollow fills: a lake, its level set by
// the rim where the water leaves (a lake too big for the map's water budget has its outlet cut down
// until it fits, and the cut is a gorge). Where the bed drops two levels or more between
// neighbouring points, the water falls. Tributaries end where they meet a river already cut:
// confluences. A river may split round an island, and fan into several mouths near its outlet.
//
// Every channel is carved from its polyline exactly as the build's river rasterizer measures it (the
// distance from the tile centre to the path), so the build puts its edge sources on the same mouth
// tiles (PLAN §7.6: a sealed mouth).

import { featureId } from "../../../src/core/features/ids";
import type { BedStep, Edge, Point, RiverFeature } from "../../../src/core/features/schema";
import { density } from "../../../src/core/gen/calibrated";
import { hash32 } from "../../../src/core/math/hash";
import { fbm } from "../../../src/core/math/noise";
import { stream, type Rng } from "../../../src/core/math/rng";
import { drainage } from "../proto/erode";
import type { Genome } from "../proto/genome";
import { clamp, DIRS8 } from "../proto/num";

export interface Lake {
  tiles: number[];
  /** The level the outlet channel leaves at: the lake stands just above it. */
  outletBed: number;
  river: string;
}

export interface Arm {
  kind: "split" | "mouth";
  river: string;
  path: Point[];
}

export interface Hydro {
  rivers: RiverFeature[];
  /** Channel tiles (1), kept lake tiles (2) and cleared floor (3). */
  water: Uint8Array;
  lakes: Lake[];
  falls: { x: number; y: number; drop: number; river: string }[];
  arms: Arm[];
  flowTotal: number;
}

const MIN_WIDTH = 2.4;
const MAX_WIDTH = 8.4;

/** Width that keeps a flow about half a level deep in its channel, well inside banks one level
 *  high (the current generator measures 0.44 deep at 3.6 blocks/s in 4.4 tiles, D26). */
export function widthFor(flow: number): number {
  return Math.round(clamp(flow / 0.75, MIN_WIDTH, MAX_WIDTH) * 10) / 10;
}

function edgeOf(i: number, W: number, H: number): Edge | null {
  const x = i % W;
  const y = (i - x) / W;
  if (x === 0) return "west";
  if (x === W - 1) return "east";
  if (y === 0) return "south";
  if (y === H - 1) return "north";
  return null;
}

/** The edges on the outlet side of a flow direction (two for a diagonal). */
function downstreamEdges(dir: number): Edge[] {
  const [fx, fy] = DIRS8[dir];
  const out: Edge[] = [];
  if (fx > 0.1) out.push("east");
  if (fx < -0.1) out.push("west");
  if (fy > 0.1) out.push("north");
  if (fy < -0.1) out.push("south");
  return out;
}

const OPPOSITE: Record<Edge, Edge> = { east: "west", west: "east", north: "south", south: "north" };

/** Chaikin corner cutting, then samples about every `step` tiles, keeping both ends. */
function smoothPath(pts0: Point[], iters: number, step: number): Point[] {
  let pts = pts0;
  for (let it = 0; it < iters && pts.length > 2; it++) {
    const out: Point[] = [pts[0]];
    for (let k = 0; k + 1 < pts.length; k++) {
      const [ax, ay] = pts[k];
      const [bx, by] = pts[k + 1];
      out.push([0.75 * ax + 0.25 * bx, 0.75 * ay + 0.25 * by], [0.25 * ax + 0.75 * bx, 0.25 * ay + 0.75 * by]);
    }
    out.push(pts[pts.length - 1]);
    pts = out;
  }
  const res: Point[] = [pts[0]];
  let acc = 0;
  for (let k = 1; k < pts.length; k++) {
    const dx = pts[k][0] - pts[k - 1][0];
    const dy = pts[k][1] - pts[k - 1][1];
    acc += Math.sqrt(dx * dx + dy * dy);
    if (acc >= step || k === pts.length - 1) {
      res.push(pts[k]);
      acc = 0;
    }
  }
  return res.map(([x, y]) => [Math.round(x * 100) / 100, Math.round(y * 100) / 100]);
}

interface Stamp {
  d: Float64Array;
  s: Float64Array;
  /** Tiles the stamp reached. */
  tiles: number[];
}

/** Exact distance from each tile near a polyline to it, and the arc position of the nearest point
 *  (as the build's pathField measures it, but only within `reach` tiles). */
function stamp(path: Point[], W: number, H: number, reach: number): Stamp {
  const N = W * H;
  const d = new Float64Array(N).fill(Infinity);
  const s = new Float64Array(N);
  const seen = new Uint8Array(N);
  const tiles: number[] = [];
  let cum = 0;
  for (let k = 0; k + 1 < path.length; k++) {
    const [ax, ay] = path[k];
    const vx = path[k + 1][0] - ax;
    const vy = path[k + 1][1] - ay;
    const l2 = vx * vx + vy * vy;
    const len = Math.sqrt(l2);
    const x0 = Math.max(0, Math.floor(Math.min(ax, ax + vx) - reach));
    const x1 = Math.min(W - 1, Math.ceil(Math.max(ax, ax + vx) + reach));
    const y0 = Math.max(0, Math.floor(Math.min(ay, ay + vy) - reach));
    const y1 = Math.min(H - 1, Math.ceil(Math.max(ay, ay + vy) + reach));
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        let t = l2 > 0 ? ((x - ax) * vx + (y - ay) * vy) / l2 : 0;
        if (t < 0) t = 0;
        else if (t > 1) t = 1;
        const px = ax + t * vx - x;
        const py = ay + t * vy - y;
        const dd = Math.sqrt(px * px + py * py);
        const i = y * W + x;
        if (!seen[i]) {
          seen[i] = 1;
          tiles.push(i);
        }
        if (dd < d[i]) {
          d[i] = dd;
          s[i] = cum + t * len;
        }
      }
    cum += len;
  }
  return { d, s, tiles };
}

function arcLength(p: Point[]): number {
  let l = 0;
  for (let k = 0; k + 1 < p.length; k++) {
    const dx = p[k + 1][0] - p[k][0];
    const dy = p[k + 1][1] - p[k][1];
    l += Math.sqrt(dx * dx + dy * dy);
  }
  return l;
}

function pointAt(p: Point[], s: number): { p: Point; n: Point } {
  let acc = 0;
  for (let k = 0; k + 1 < p.length; k++) {
    const dx = p[k + 1][0] - p[k][0];
    const dy = p[k + 1][1] - p[k][1];
    const l = Math.sqrt(dx * dx + dy * dy);
    if (acc + l >= s && l > 0) {
      const t = (s - acc) / l;
      return { p: [p[k][0] + t * dx, p[k][1] + t * dy], n: [-dy / l, dx / l] };
    }
    acc += l;
  }
  const a = p[p.length - 2];
  const b = p[p.length - 1];
  const l = Math.sqrt((b[0] - a[0]) * (b[0] - a[0]) + (b[1] - a[1]) * (b[1] - a[1])) || 1;
  return { p: b, n: [-(b[1] - a[1]) / l, (b[0] - a[0]) / l] };
}

interface Head {
  cell: number;
  kind: "edge" | "spring";
  edge?: Edge;
  flow: number;
}

/** Valley lakes a map is drawn with, by theme (the mean; design version 2: lakes take the land's
 *  shape). */
const TROUGHS: Record<string, number> = { riverValley: 0.8, canyon: 0.5, highlands: 1, lakeBasin: 1.3, delta: 0.3, islands: 0.3 };

export function planHydro(E: Float64Array, h: Uint8Array, g: Genome & { hanging?: number; knick?: number; lakeSprings?: number; wander?: number; wanderCell?: number }, seed: number, W: number, H: number, attempt: number): Hydro {
  const N = W * H;
  const rng = stream(seed, "hydro", attempt);
  const down = downstreamEdges(g.flowDir);
  const up: Edge[] = g.tiltKind === "radial" ? (["west", "east", "south", "north"] as Edge[]).filter((e) => !down.includes(e)) : down.map((e) => OPPOSITE[e]);
  const onUp = (i: number) => {
    const e = edgeOf(i, W, H);
    return !!e && up.includes(e);
  };
  // the water's way on the eroded field, a little noise so it wanders where the ground is flat;
  // the upstream edges do not drain (water comes in there)
  const rs = hash32(seed, "route", attempt);
  const Er = new Float64Array(N);
  const wander = g.wander ?? 0.9;
  const wanderCell = g.wanderCell ?? 14;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) Er[y * W + x] = E[y * W + x] + wander * fbm(rs, x, y, wanderCell, 2);
  const dr = drainage(Er, W, H, { outlet: (i) => !onUp(i), epsilon: 1e-6 });
  const downLen = new Float64Array(N);
  for (let q = 0; q < dr.order.length; q++) {
    const i = dr.order[q];
    const r = dr.rcv[i];
    downLen[i] = r < 0 ? 0 : downLen[r] + 1;
  }
  const flowTotal = Math.round(density("water_strength_per_10k", N) * (N / 1e4) * g.hydro.flowMul * 100) / 100;
  const heads: Head[] = [];
  const side = Math.min(W, H);
  const borderDist = (i: number) => {
    const x = i % W;
    const y = (i - x) / W;
    return Math.min(x, y, W - 1 - x, H - 1 - y);
  };
  // ---- paths: each head down its receivers, until an edge or a river already traced; a head
  // whose path hugs the map edge (its water would drain there) or is too short is passed over
  const owner = new Int32Array(N).fill(-1);
  const traced: { k: number; head: Head; cells: number[]; joins: number }[] = [];
  const trace = (hd: Head): boolean => {
    const k = heads.length;
    const cells: number[] = [];
    let c = hd.cell;
    let joins = -1;
    const guard = new Set<number>();
    while (c >= 0 && !guard.has(c)) {
      guard.add(c);
      if (owner[c] >= 0) {
        joins = owner[c];
        cells.push(c);
        break;
      }
      cells.push(c);
      c = dr.rcv[c];
    }
    if (cells.length < 12) return false;
    for (let q = 10; q < cells.length - 10; q++) if (borderDist(cells[q]) < 4) return false;
    heads.push(hd);
    for (const i of cells) if (owner[i] < 0) owner[i] = k;
    traced.push({ k, head: hd, cells, joins });
    return true;
  };
  // edge inflows: low points of the upstream edges with long paths inland
  if (g.hydro.inflows > 0) {
    const cands: [number, number][] = [];
    for (let i = 0; i < N; i++) {
      if (!onUp(i)) continue;
      const e = edgeOf(i, W, H)!;
      const x = i % W;
      const y = (i - x) / W;
      const along = e === "west" || e === "east" ? y : x;
      const span = e === "west" || e === "east" ? H : W;
      if (along < 12 || along > span - 13) continue;
      if (downLen[i] < 0.6 * side) continue;
      cands.push([-E[i] + 0.012 * downLen[i] + 1.5 * rng.float(), i]);
    }
    cands.sort((a, b) => b[0] - a[0] || a[1] - b[1]);
    let n = 0;
    for (const [, i] of cands) {
      if (n >= g.hydro.inflows) break;
      const x = i % W;
      const y = (i - x) / W;
      if (heads.some((hd) => Math.abs((hd.cell % W) - x) + Math.abs(Math.floor(hd.cell / W) - y) < 0.3 * side)) continue;
      if (trace({ cell: i, kind: "edge", edge: edgeOf(i, W, H)!, flow: 0 })) n++;
    }
  }
  // springs: high inland ground with a long way down
  const wantSprings = g.hydro.springs + (heads.length === 0 ? 1 : 0);
  if (wantSprings > 0) {
    const cands: [number, number][] = [];
    for (let y = 12; y < H - 12; y++)
      for (let x = 12; x < W - 12; x++) {
        const i = y * W + x;
        if (downLen[i] < 0.35 * side || owner[i] >= 0) continue;
        cands.push([E[i] + 0.01 * downLen[i] + 3 * rng.float(), i]);
      }
    cands.sort((a, b) => b[0] - a[0] || a[1] - b[1]);
    let n = 0;
    for (const [, i] of cands) {
      if (n >= wantSprings) break;
      const x = i % W;
      const y = (i - x) / W;
      if (heads.some((hd) => Math.abs((hd.cell % W) - x) + Math.abs(Math.floor(hd.cell / W) - y) < 26)) continue;
      if (trace({ cell: i, kind: "spring", flow: 0 })) n++;
    }
  }
  // spring lakes: a big closed hollow no river crosses gets a spring at its head, just above its
  // highest edge, so the water begins above the lake it makes and runs down into it (D171: a
  // source starts a river, never inside a lake or a river)
  if ((g.lakeSprings ?? 0) > 0) {
    const fl = drainage(h, W, H, { eight: false });
    const seen = new Uint8Array(N);
    const hollows: { low: number; size: number; head: number }[] = [];
    for (let s0 = 0; s0 < N; s0++) {
      if (seen[s0] || !(fl.filled[s0] - h[s0] >= 1)) continue;
      const q = [s0];
      seen[s0] = 1;
      let low = s0;
      for (let k = 0; k < q.length; k++) {
        const i = q[k];
        if (h[i] < h[low] || (h[i] === h[low] && i < low)) low = i;
        const x = i % W;
        const y = (i - x) / W;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
          const j = yy * W + xx;
          if (seen[j] || !(fl.filled[j] - h[j] >= 1)) continue;
          seen[j] = 1;
          q.push(j);
        }
      }
      if (q.length < 100 || q.some((i) => owner[i] >= 0)) continue;
      // the head: the hollow's highest edge tile, then up to three tiles further uphill
      let head = -1;
      for (const i of q) {
        const x = i % W;
        const y = (i - x) / W;
        let edge = false;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
          if (!(fl.filled[yy * W + xx] - h[yy * W + xx] >= 1)) edge = true;
        }
        if (edge && (head < 0 || h[i] > h[head])) head = i;
      }
      for (let step = 0; step < 3 && head >= 0; step++) {
        const x = head % W;
        const y = (head - x) / W;
        let up = -1;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
          const j = yy * W + xx;
          if (owner[j] >= 0 || h[j] <= h[head]) continue;
          if (up < 0 || h[j] > h[up]) up = j;
        }
        if (up < 0) break;
        head = up;
      }
      if (head >= 0) hollows.push({ low, size: q.length, head });
    }
    hollows.sort((a, b) => b.size - a.size || a.low - b.low);
    for (const hl of hollows.slice(0, 4)) {
      if (rng.float() >= (g.lakeSprings ?? 0)) continue;
      const x = hl.head % W;
      const y = (hl.head - x) / W;
      if (x < 6 || y < 6 || x > W - 7 || y > H - 7) continue;
      trace({ cell: hl.head, kind: "spring", flow: 0 });
    }
  }
  // the map's flow goes to the heads that made it: inflows carry most, springs a share each
  const nIn = heads.filter((hd) => hd.kind === "edge").length;
  const nSp = heads.length - nIn;
  const springShare = nIn ? Math.min(0.35, 0.12 * nSp) : 1;
  for (const hd of heads) {
    hd.flow = hd.kind === "edge" ? (flowTotal * (1 - (nSp ? springShare : 0))) / nIn : (flowTotal * springShare) / nSp;
    hd.flow = Math.round(Math.max(0.5, hd.flow) * 100) / 100;
  }

  // ---- valley lakes (Kyler, 2026-09-25: lakes take the land's shape): a stretch of a river's valley
  //      deepened in its middle, as ice or a slide-free trough leaves it. The lake that fills it
  //      follows the land's contours, long along the valley, with fingers up the side valleys
  //      whose floors lie below its level. Only ground is taken away; none is raised (D111).
  {
    const tr = stream(seed, "trough", attempt);
    let n = Math.floor((TROUGHS[g.theme] ?? 0.5) + tr.float());
    const scale = side / 128;
    const byLength = traced.slice().sort((a, b) => b.cells.length - a.cells.length || a.k - b.k);
    for (const t of byLength) {
      if (n <= 0) break;
      const cells = t.cells;
      const len = Math.round((20 + 25 * tr.float()) * scale);
      if (cells.length < len + 16) continue;
      const a0 = Math.floor((cells.length - len - 8) * (0.15 + 0.6 * tr.float()));
      const a1 = a0 + len;
      if (cells.slice(a0, a1 + 1).some((c) => borderDist(c) < 8)) continue;
      const level = h[cells[a1]];
      if (level < 2) continue;
      const reach = (5 + 7 * tr.float()) * scale;
      const pts = cells.slice(a0, a1 + 1).map((c) => [c % W, Math.floor(c / W)] as [number, number]);
      let x0 = W;
      let y0 = H;
      let x1 = 0;
      let y1 = 0;
      for (const [x, y] of pts) {
        x0 = Math.min(x0, x);
        y0 = Math.min(y0, y);
        x1 = Math.max(x1, x);
        y1 = Math.max(y1, y);
      }
      const R = Math.ceil(reach);
      for (let y = Math.max(1, y0 - R); y <= Math.min(H - 2, y1 + R); y++)
        for (let x = Math.max(1, x0 - R); x <= Math.min(W - 2, x1 + R); x++) {
          const i = y * W + x;
          if (h[i] > level + 1 || (owner[i] >= 0 && owner[i] !== t.k)) continue;
          // the nearest point of the stretch, and how far along it lies
          let best = Infinity;
          let at = 0;
          for (let k = 0; k < pts.length; k++) {
            const dx = pts[k][0] - x;
            const dy = pts[k][1] - y;
            const d2 = dx * dx + dy * dy;
            if (d2 < best) {
              best = d2;
              at = k;
            }
          }
          const d = Math.sqrt(best);
          if (d > reach) continue;
          const u = at / (pts.length - 1);
          const depth = Math.round((1 + 2.5 * 4 * u * (1 - u)) * (1 - d / reach) + 0.4);
          const target = level - depth;
          if (depth > 0 && target >= 0 && h[i] > target) h[i] = target;
        }
      n--;
    }
  }

  // ---- lakes: the closed hollows of the snapped terrain
  const lv = drainage(h, W, H, { eight: false });
  const depth = new Float64Array(N);
  for (let i = 0; i < N; i++) depth[i] = lv.filled[i] - h[i];
  const water = new Uint8Array(N);
  const lakes: Lake[] = [];
  const lakeOf = new Int32Array(N).fill(-1);
  const budget = g.hydro.lakeBudget * N;
  const rivers: RiverFeature[] = [];
  const falls: Hydro["falls"] = [];
  const arms: Arm[] = [];
  const fs = hash32(seed, "floor", attempt);

  const flood = (from: number, below: number): number[] => {
    const seen = new Uint8Array(N);
    const q = [from];
    seen[from] = 1;
    for (let k = 0; k < q.length; k++) {
      const i = q[k];
      const x = i % W;
      const y = (i - x) / W;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const j = yy * W + xx;
        if (seen[j] || h[j] >= below) continue;
        seen[j] = 1;
        q.push(j);
      }
    }
    return q;
  };
  const hollow = (seedCell: number): { tiles: number[]; sill: number } | null => {
    if (!(depth[seedCell] > 0)) return null;
    let sill = lv.filled[seedCell];
    let tiles = flood(seedCell, sill);
    // cut the outlet down until the lake fits the budget
    while (tiles.length > budget && sill > 1) {
      sill--;
      const lowest = tiles.reduce((m, i) => (h[i] < h[m] ? i : m), tiles[0]);
      if (h[lowest] >= sill) return null;
      tiles = flood(lowest, sill);
    }
    if (tiles.length < 6) return null;
    return { tiles, sill };
  };

  /** The bed along a path, sampled every tile of arc: never rising, `cut` levels below the lowest
   *  ground round it, and at a lake's outlet level where it leaves a lake. */
  const profileOf = (path: Point[], width: number, cut: number, withLakes: boolean, rid: string, startBed = Infinity, endBed = -Infinity) => {
    const st = stamp(path, W, H, Math.ceil(width / 2 + g.hydro.floor * 1.5 + 3));
    const L = arcLength(path);
    const n = Math.max(2, Math.ceil(L));
    const prof = new Float64Array(n + 1);
    const lakeAt = new Uint8Array(n + 1);
    let run = startBed;
    let inLake = -1;
    for (let j = 0; j <= n; j++) {
      const { p: [px, py] } = pointAt(path, (j * L) / n);
      const ci = Math.round(py) * W + Math.round(px);
      const inside = px >= 0 && py >= 0 && px <= W - 1 && py <= H - 1;
      const r = width / 2;
      let ring = Infinity;
      const R = r + 1.6;
      for (let y = Math.max(0, Math.floor(py - R)); y <= Math.min(H - 1, Math.ceil(py + R)); y++)
        for (let x = Math.max(0, Math.floor(px - R)); x <= Math.min(W - 1, Math.ceil(px + R)); x++) {
          const i = y * W + x;
          if (water[i] === 1 || water[i] === 2 || st.d[i] < r) continue;
          const dx = x - px;
          const dy = y - py;
          if (dx * dx + dy * dy > R * R) continue;
          if (h[i] < ring) ring = h[i];
        }
      if (!Number.isFinite(ring)) ring = Number.isFinite(run) ? run + 1 : h[Math.max(0, Math.min(N - 1, ci))] + 1;
      if (withLakes && inside && depth[ci] > 0 && lakeOf[ci] < 0 && inLake < 0) {
        const lk = hollow(ci);
        if (lk) {
          const id = lakes.length;
          for (const i of lk.tiles) {
            lakeOf[i] = id;
            water[i] = 2;
          }
          lakes.push({ tiles: lk.tiles, outletBed: lk.sill - 1, river: rid });
          inLake = id;
        }
      }
      if (inLake >= 0 && inside && lakeOf[ci] === inLake) {
        prof[j] = Math.min(run, lakes[inLake].outletBed);
        lakeAt[j] = 1;
        continue;
      }
      if (inLake >= 0) {
        run = lakes[inLake].outletBed;
        inLake = -1;
      }
      run = Math.min(run, ring - cut);
      if (run < endBed) run = endBed;
      if (run < 0) run = 0;
      prof[j] = Math.round(run);
    }
    return { st, prof, L, n, lakeAt };
  };

  /** Cut a channel (and its floor) along a profile. */
  const carve = (st: Stamp, prof: Float64Array, L: number, n: number, width: number, floorHalf: number, rid: string): void => {
    for (const i of st.tiles) {
      if (water[i] === 2) continue;
      const d = st.d[i];
      const x = i % W;
      const y = (i - x) / W;
      const j = Math.min(n, Math.max(0, Math.round((st.s[i] / L) * n)));
      const b = prof[j];
      if (d < width / 2) {
        if (h[i] > b) h[i] = b;
        water[i] = 1;
      } else if (floorHalf > 0 && water[i] !== 1 && d < width / 2 + floorHalf * (1 + 0.45 * fbm(fs, x, y, 11, 2))) {
        if (h[i] > b + 1) h[i] = b + 1;
        if (!water[i]) water[i] = 3;
      }
    }
    void rid;
  };

  const roleOf = (k: number) => (heads[k].kind === "edge" ? `river/inflow/${k}` : `river/spring/${k}`);
  // the main river: the largest flow (the first head on a tie)
  let mainK = 0;
  for (let k = 1; k < heads.length; k++) if (heads[k].flow > heads[mainK].flow) mainK = k;
  const hanging = Math.round(g.hanging ?? 0);
  const exits = new Map<string, { path: Point[]; prof: Float64Array; L: number; n: number; width: number }>();
  for (const tr of traced) {
    const hd = tr.head;
    const role = roleOf(tr.k);
    const rid = featureId(seed, "river", role);
    const cells = tr.cells;
    let path = smoothPath(cells.map((i) => [i % W, Math.floor(i / W)] as Point), 3, 1);
    const hx = hd.cell % W;
    const hy = Math.floor(hd.cell / W);
    if (hd.kind === "edge") {
      const e = hd.edge!;
      path = [[e === "west" ? -1 : e === "east" ? W : hx, e === "south" ? -1 : e === "north" ? H : hy], [hx, hy], ...path.slice(1)];
    }
    const last = cells[cells.length - 1];
    const exitEdge = tr.joins < 0 ? edgeOf(last, W, H) : null;
    if (exitEdge) {
      const lx = last % W;
      const ly = Math.floor(last / W);
      path.push([exitEdge === "west" ? -1 : exitEdge === "east" ? W : lx, exitEdge === "south" ? -1 : exitEdge === "north" ? H : ly]);
    }
    const width = widthFor(hd.flow);
    // canyons: the bigger rivers cut deeper and clear wider floors
    const big = hd.flow >= 1.2;
    const cut = 1 + (big ? Math.round(g.hydro.incise) : 0) + (tr.k === mainK ? hanging : 0);
    const floorHalf = big ? g.hydro.floor : g.hydro.floor * 0.3;
    const { st, prof, L, n, lakeAt } = profileOf(path, width, cut, true, rid);
    // knickpoints: a steep reach's drops gather at its head; the reach below is cut to its foot
    const win = Math.round(g.knick ?? 0);
    if (win > 0)
      for (let j = 0; j < n; j++) {
        if (!(prof[j + 1] < prof[j]) || lakeAt[j] || lakeAt[j + 1]) continue;
        let foot = -1;
        for (let k = j + 1; k <= Math.min(n, j + win); k++) {
          if (lakeAt[k]) break;
          if (prof[k] < prof[k - 1] && prof[j] - prof[k] >= 3) foot = k;
        }
        if (foot < 0) continue;
        for (let k = j + 1; k < foot; k++) prof[k] = prof[foot];
        j = foot;
      }
    // pools: below a drop the water scours its bed a level deeper for a few tiles, where the reach
    // below is long enough to keep a lip (pools and riffles: standing water deep enough to pump)
    const bedOf = prof.slice();
    for (let j = 1; j <= n; j++) {
      if (!(prof[j - 1] - prof[j] >= 1) || prof[j] < 1) continue;
      let level = 0;
      for (let q = j; q <= n && prof[q] === prof[j]; q++) level++;
      if (level >= 8) for (let q = j; q < j + 3; q++) bedOf[q] = prof[j] - 1;
    }
    carve(st, bedOf, L, n, width, floorHalf, rid);
    const steps: BedStep[] = [];
    for (let j = 1; j <= n; j++) {
      const drop = prof[j - 1] - prof[j];
      if (drop >= 1) steps.push({ at: Math.round(((j * L) / n) * 100) / 100, drop });
      if (drop >= 2) {
        const { p: [px, py] } = pointAt(path, (j * L) / n);
        if (px >= 0 && py >= 0 && px < W && py < H) falls.push({ x: Math.round(px), y: Math.round(py), drop, river: rid });
      }
    }
    exits.set(rid, { path, prof, L, n, width });
    const entry = hd.kind === "edge" ? { edge: hd.edge! } : { spring: [hx, hy] as Point };
    const exit = tr.joins >= 0 ? { river: featureId(seed, "river", roleOf(tr.joins)) } : { edge: exitEdge ?? ("east" as Edge) };
    rivers.push({
      id: rid,
      kind: "river",
      origin: "generated",
      role,
      locked: false,
      params: { path, width, bedDepth: 1, bedProfile: { start: prof[0], steps }, flow: hd.flow, style: "meandering", entry, exit, badwater: false },
    });
  }

  // ---- a river splits round an island: a second arm leaves it and rejoins it downstream
  const main = rivers[0];
  if (main && rng.float() < g.hydro.split) {
    const m = exits.get(main.id)!;
    for (let tries = 0; tries < 6; tries++) {
      const len = 26 + 20 * rng.float();
      const s0 = m.L * (0.2 + 0.45 * rng.float());
      const s1 = s0 + len;
      if (s1 > m.L - 6) continue;
      const j0 = Math.round((s0 / m.L) * m.n);
      const j1 = Math.round((s1 / m.L) * m.n);
      // no lake on the stretch, and the arm's ends inside the map
      let ok = true;
      for (let j = j0; j <= j1 && ok; j++) {
        const { p } = pointAt(m.path, (j * m.L) / m.n);
        const ci = Math.round(p[1]) * W + Math.round(p[0]);
        if (p[0] < 4 || p[1] < 4 || p[0] > W - 5 || p[1] > H - 5 || lakeOf[ci] >= 0) ok = false;
      }
      if (!ok) continue;
      const sideSign = rng.float() < 0.5 ? 1 : -1;
      const off = sideSign * (m.width / 2 + 5 + 7 * rng.float());
      const pts: Point[] = [];
      for (let k = 0; k <= 12; k++) {
        const t = k / 12;
        const { p, n: nn } = pointAt(m.path, s0 + t * len);
        const o = off * 4 * t * (1 - t) * (1 + 0.25 * (rng.float() - 0.5));
        pts.push([p[0] + nn[0] * o, p[1] + nn[1] * o]);
      }
      const armPath = smoothPath(pts, 2, 1);
      if (armPath.some(([x, y]) => x < 2 || y < 2 || x > W - 3 || y > H - 3)) continue;
      const aw = Math.max(MIN_WIDTH, Math.round(0.6 * m.width * 10) / 10);
      const pa = profileOf(armPath, aw, 1, false, main.id, m.prof[j0], m.prof[j1]);
      carve(pa.st, pa.prof, pa.L, pa.n, aw, 0, main.id);
      arms.push({ kind: "split", river: main.id, path: armPath });
      break;
    }
  }

  // ---- a delta: near its mouth, the main river fans into two or three more mouths on its edge
  if (main && "edge" in main.params.exit && rng.float() < g.hydro.delta) {
    const m = exits.get(main.id)!;
    const e = main.params.exit.edge;
    const s0 = Math.max(m.L * 0.55, m.L - (26 + 18 * rng.float()));
    const { p: p0 } = pointAt(m.path, s0);
    const end = m.path[m.path.length - 2];
    const k = 1 + (rng.float() < 0.5 ? 1 : 0);
    const alongEdge = e === "west" || e === "east" ? 1 : 0;
    for (let a = 0; a < k; a++) {
      const sgn = a % 2 === 0 ? 1 : -1;
      const shift = sgn * (13 + 9 * rng.float()) * (1 + Math.floor(a / 2));
      const ex = alongEdge ? (e === "west" ? -1 : W) : clamp(end[0] + shift, 6, W - 7);
      const ey = alongEdge ? clamp(end[1] + shift, 6, H - 7) : e === "south" ? -1 : H;
      const mid: Point = [(p0[0] + ex) / 2 + (alongEdge ? 0 : 0) + (rng.float() - 0.5) * 6, (p0[1] + ey) / 2 + (rng.float() - 0.5) * 6];
      const pts: Point[] = [];
      for (let q = 0; q <= 16; q++) {
        const t = q / 16;
        // a quadratic curve from the fork through the middle point to the new mouth
        const x = (1 - t) * (1 - t) * p0[0] + 2 * t * (1 - t) * mid[0] + t * t * ex;
        const y = (1 - t) * (1 - t) * p0[1] + 2 * t * (1 - t) * mid[1] + t * t * ey;
        pts.push([x, y]);
      }
      const armPath = smoothPath(pts, 1, 1);
      const aw = Math.max(MIN_WIDTH, Math.round(0.6 * m.width * 10) / 10);
      const j0 = Math.round((s0 / m.L) * m.n);
      const pa = profileOf(armPath, aw, 1, false, main.id, m.prof[j0]);
      carve(pa.st, pa.prof, pa.L, pa.n, aw, 0, main.id);
      arms.push({ kind: "mouth", river: main.id, path: armPath });
    }
  }
  return { rivers, water, lakes, falls, arms, flowTotal };
}

export type { Rng };
