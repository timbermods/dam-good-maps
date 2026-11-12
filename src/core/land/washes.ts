// Dry washes and an old bed across the dry land (D517; planning's ruling on #236, 2026-11-12, item 2): each of the game's
// own maps has one or two winding dry channels, a bed two or three tiles wide and a level or two deep, meandering
// between the mesas. One pass shared by every generator path (the themes' land stage, `gen/generate.ts`, and the
// premises' ground, `premise/generate.ts`), run on the finished land before its water settles.
//
// They are a net at the map's scale, a few per map, never a gully on every plate: each runs where rain would run (the
// flow the priority flood gives on the land, softened and warped so its line follows the land's own curves), from a
// head where enough land drains through it down to its end. A bed follows its warped line, never the grid: its edges
// are the line's, widened by a varying half width and swung by a slow sideways meander. It ends at water (a lake or a
// river), short of the water by a lip a level over the water's own level, so a dam that lifts the water or a notch in
// the lip lets it in; or in a dry hollow one or two levels under the land round it that fills when water is led in. One wash may take a
// side branch joining it. One old bed a map, where a lake has the room: a sinuous one-level trough from just behind a
// lake's lip out into the dry land, its floor at the lake's own level, so one notch in the lip (or a levee's gap) sets
// it running again.
//
// The point is irrigation: a player who dams a wash's mouth or leads a canal into it greens its floor first. So the
// beds keep off what the start keeps (its bench, farmland, forester's plot and ways out: the caller's `keepOff`), off
// the water and a lake's rim (no tile beside water is cut, and none within two tiles of it goes under that water's
// level plus one), and they move no water: a dry bed, a dry hollow and a lip. Nor do they take land from the walk:
// each stretch of a bed steps up to the land by a natural ramp, and a bed that would part the land's level walk, or
// that the colony can't step into, is undone as it is cut (`cutsWalk`).

import { fbm, valueNoise } from "../math/noise";
import type { Rng } from "../math/rng";
import { MinHeap } from "../math/grid";
import { sqrt } from "../math/portable";
import { walkDistance } from "../analysis/walk";

/** The pass's numbers. */
export const WASHES = {
  /** Washes on a 128² map, by area elsewhere (one at least where the land gives one). */
  per128: [2, 3] as const,
  /** The chance a wash takes a side branch joining it. */
  branch: 0.5,
  /** A wash's length along its line, tiles: at least, and at most on a 128² map (by side elsewhere). */
  least: 16,
  most: 64,
  /** A side branch: at least this long. */
  branchLeast: 10,
  /** Land draining through a tile, tiles: where a wash begins, and where it ends at least. */
  headArea: 16,
  trunkArea: 120,
  /** Washes' lines at least this far apart (Chebyshev), but where a branch joins. */
  apart: 14,
  /** No bed within this many tiles of the map's edge. */
  edge: 8,
  /** The land the flow is read on: the heights softened over this radius and warped by noise of this cell and
   *  amplitude (levels), so a line on a flat follows the noise's curves and a line on a slope runs down it. */
  blur: 3,
  warp: { cell: 10, amp: 0.9 },
  /** The bed's half width, tiles (2 to 3 across), varying along it with this wavelength. */
  radius: [1.0, 1.65] as const,
  radiusCell: 9,
  /** The sideways meander: at most this far off the flow's line, with this wavelength. */
  meander: 1.6,
  meanderCell: 14,
  /** The centre line smoothed over this many points each side. */
  smooth: 2,
  /** The deepest a bed cuts under the lowest ground beside it: deeper and it ends there, in a hollow. */
  cutMost: 2,
  /** A dry hollow at a wash's end: its radius and how deep under the land round it (its ring at the bed's floor, a
   *  level under the land; a two-deep one's core a level under that). */
  hollow: { radius: [2.0, 3.0] as const, depth: [1, 2] as const },
  /** The old bed: its length, and the most its ground at the lake's end stands over the lake's level. */
  old: { least: 16, most: 44, rim: 2 },
  /** The start's ground the beds keep off (`startKeepOff`): its walk out to this many tiles (its farmland's and
   *  forester's 20, its wood's, and a margin), its whole bench, and its ways out with this margin. */
  startWalk: 32,
  wayMargin: 2,
  /** A natural ramp up each bank every this many tiles along a bed (and one at its head), and one into its hollow, so
   *  the colony walks into a bed and across it: a bed cuts no land off from the start (`start.reach`). */
  slopeEvery: 12,
  /** A part of a level region a bed cuts off with less ground than this, tiles, is let go (a pocket by the bed's side);
   *  a bed that parts a region into two bigger parts, or that the colony can't step into, is undone. */
  pocket: 12,
  /** No crossing ramp (`slopeEvery`'s) within this many tiles (Chebyshev) of a place a start may take: there the
   *  build's derived slopes join the beds to the start's ground (their tree reaches 40 tiles out, `features/slopes.ts`),
   *  and a ramp would hold off one of theirs within their spacing (12). The ramps a bed needs to stay joined go
   *  anywhere. */
  rampClear: 52,
} as const;

export interface WashInput {
  W: number;
  H: number;
  /** The land: cut where the beds and hollows go. */
  heights: Uint8Array;
  /** The water's surface level on each water tile (planned or pre-filled); NaN on dry ground. */
  surface: Float64Array;
  /** The standing lakes, each its tiles: the old bed starts behind one's lip. */
  lakes: readonly (readonly number[])[];
  /** Ground the beds keep off: the start's ground and ways out, objects' squares, the works'. */
  keepOff: Uint8Array;
  /** The lowest a bed's floor goes (the beds' floor, `genome.ts` `BED_FLOOR`). */
  floor: number;
  rng: Rng;
  /** The noise's seed (the warp, the meander and the widths). */
  seed: number;
  /** The places a start may take: no crossing ramp goes into a bed near one (`WASHES.rampClear`). */
  starts?: readonly { x: number; y: number }[];
}

export interface Wash {
  kind: "wash" | "branch" | "old";
  /** Where it ends: short of water by its lip, in a dry hollow, or in another wash. */
  end: "water" | "hollow" | "join";
  /** Its centre line, head to mouth, tiles. */
  line: number[];
  /** The floor at each point of the line. */
  floor: number[];
  /** The tiles it cut. */
  tiles: number[];
  /** The hollow at its end, when it ends in one. */
  hollow?: number[];
}

export interface Washes {
  beds: Wash[];
  /** Each bed tile and hollow tile (1 + the bed's index). */
  mask: Uint16Array;
  /** Natural ramps into the beds and hollows, (low tile, high tile) pairs: the colony walks into them and across. */
  steps: [number, number][];
}

/** A dry hollow's tiles and each one's floor. */
interface Hollow {
  tiles: number[];
  floors: number[];
}

/** A filled pit's tiles stand this much over the one they drain to, so a flat drains. */
const FILL_EPS = 1e-6;
/** A diagonal step's drop counts by 1/√2. */
const DIAG = 0.7071067811865476;
const N8X = [1, -1, 0, 0, 1, 1, -1, -1];
const N8Y = [0, 0, 1, -1, 1, -1, 1, -1];

/** The heights softened over `r` tiles (a box blur, done twice: rows then columns). */
function soften(
  h: ArrayLike<number>,
  W: number,
  H: number,
  r: number,
): Float64Array {
  const a = new Float64Array(W * H);
  const b = new Float64Array(W * H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      let s = 0;
      let n = 0;
      for (let k = -r; k <= r; k++) {
        const xx = x + k;
        if (xx < 0 || xx >= W) continue;
        s += h[y * W + xx];
        n++;
      }
      a[y * W + x] = s / n;
    }
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      let s = 0;
      let n = 0;
      for (let k = -r; k <= r; k++) {
        const yy = y + k;
        if (yy < 0 || yy >= H) continue;
        s += a[yy * W + x];
        n++;
      }
      b[y * W + x] = s / n;
    }
  return b;
}

/** Where rain would run on `F`: the priority flood (`drainage.ts`'s, eight ways) from the water and the map's edge fills
 *  every pit a hair over its spill, and each tile then sends its rain down the steepest way on the filled surface, so
 *  the flow gathers into the land's valleys (a flood's own receivers run in parallel down a slope and never gather).
 *  Each tile's receiver (-1 at an outlet) and the land draining through it. */
function flow(
  F: Float64Array,
  wet: Uint8Array,
  W: number,
  H: number,
): { rcv: Int32Array; area: Float64Array } {
  const N = W * H;
  const seen = new Uint8Array(N);
  const filled = new Float64Array(N);
  const order = new Int32Array(N);
  const heap = new MinHeap();
  const outlet = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    const x = i % W;
    const y = (i - x) / W;
    if (wet[i] || x === 0 || y === 0 || x === W - 1 || y === H - 1) {
      seen[i] = 1;
      outlet[i] = 1;
      filled[i] = F[i];
      heap.push(F[i], i);
    }
  }
  let n = 0;
  while (heap.size) {
    const c = heap.pop();
    const lv = heap.lastKey;
    if (lv > filled[c]) continue;
    order[n++] = c;
    const x = c % W;
    const y = (c - x) / W;
    for (let k = 0; k < 8; k++) {
      const xx = x + N8X[k];
      const yy = y + N8Y[k];
      if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
      const j = yy * W + xx;
      if (seen[j]) continue;
      seen[j] = 1;
      filled[j] = F[j] > lv + FILL_EPS ? F[j] : lv + FILL_EPS;
      heap.push(filled[j], j);
    }
  }
  const rcv = new Int32Array(N).fill(-1);
  for (let i = 0; i < N; i++) {
    if (outlet[i]) continue;
    const x = i % W;
    const y = (i - x) / W;
    let best = -1;
    let drop = 0;
    for (let k = 0; k < 8; k++) {
      const xx = x + N8X[k];
      const yy = y + N8Y[k];
      if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
      const j = yy * W + xx;
      const d = (filled[i] - filled[j]) * (k < 4 ? 1 : DIAG);
      if (d > drop) {
        drop = d;
        best = j;
      }
    }
    rcv[i] = best;
  }
  // (accumulated from the highest filled tile down: the flood's order reversed)
  const area = new Float64Array(N).fill(1);
  for (let k = n - 1; k >= 0; k--) {
    const r = rcv[order[k]];
    if (r >= 0) area[r] += area[order[k]];
  }
  return { rcv, area };
}

/** A line's points (tile centres), smoothed and swung sideways by the meander. */
function curveOf(
  line: readonly number[],
  W: number,
  seed: number,
  smooth: number,
): { x: number[]; y: number[] } {
  const n = line.length;
  const px = line.map((i) => i % W);
  const py = line.map((i) => (i - (i % W)) / W);
  const sx: number[] = [];
  const sy: number[] = [];
  for (let s = 0; s < n; s++) {
    let ax = 0;
    let ay = 0;
    let c = 0;
    for (let k = -smooth; k <= smooth; k++) {
      const j = Math.min(n - 1, Math.max(0, s + k));
      ax += px[j];
      ay += py[j];
      c++;
    }
    sx.push(ax / c);
    sy.push(ay / c);
  }
  // (the meander: a slow swing across the line's own direction, nothing at its two ends)
  const x: number[] = [];
  const y: number[] = [];
  for (let s = 0; s < n; s++) {
    const a = Math.max(0, s - 2);
    const b = Math.min(n - 1, s + 2);
    let tx = sx[b] - sx[a];
    let ty = sy[b] - sy[a];
    const len = sqrt(tx * tx + ty * ty) || 1;
    tx /= len;
    ty /= len;
    const fade = Math.min(1, s / 6, (n - 1 - s) / 6);
    const off =
      WASHES.meander * fade * valueNoise(seed, s, 0, WASHES.meanderCell);
    x.push(sx[s] - ty * off);
    y.push(sy[s] + tx * off);
  }
  return { x, y };
}

/** The washes and the old bed (see the file's header), cut into `heights`. */
export function planWashes(inp: WashInput): Washes {
  const { W, H, heights: h, surface, keepOff, rng } = inp;
  const N = W * H;
  const h0 = h.slice();
  const mask = new Uint16Array(N);
  const beds: Wash[] = [];
  const wet = new Uint8Array(N);
  for (let i = 0; i < N; i++) wet[i] = surface[i] === surface[i] ? 1 : 0;
  // (the level a tile's floor keeps over the water near it: none within one tile of water is cut at all; within two,
  // none goes under the water's level plus one)
  const near1 = new Uint8Array(N);
  const minFloor = new Int32Array(N).fill(-1);
  for (let i = 0; i < N; i++) {
    if (!wet[i]) continue;
    const x = i % W;
    const y = (i - x) / W;
    const lv = Math.floor(surface[i]) + 1;
    for (let dy = -2; dy <= 2; dy++)
      for (let dx = -2; dx <= 2; dx++) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const j = yy * W + xx;
        if (Math.abs(dx) <= 1 && Math.abs(dy) <= 1) near1[j] = 1;
        if (lv > minFloor[j]) minFloor[j] = lv;
      }
  }
  const e = WASHES.edge;
  const allowed = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    const x = i % W;
    const y = (i - x) / W;
    allowed[i] =
      !wet[i] &&
      !near1[i] &&
      !keepOff[i] &&
      x >= e &&
      y >= e &&
      x < W - e &&
      y < H - e
        ? 1
        : 0;
  }
  // the flow: where rain would run on the land, softened and warped
  const F = soften(h0, W, H, WASHES.blur);
  for (let i = 0; i < N; i++) {
    const x = i % W;
    const y = (i - x) / W;
    F[i] += WASHES.warp.amp * fbm(inp.seed, x, y, WASHES.warp.cell);
  }
  const { rcv, area } = flow(F, wet, W, H);
  // (each tile's donor with the most land draining through it, among the allowed)
  const donor = new Int32Array(N).fill(-1);
  for (let j = 0; j < N; j++) {
    const p = rcv[j];
    if (p < 0 || !allowed[j]) continue;
    if (
      donor[p] < 0 ||
      area[j] > area[donor[p]] ||
      (area[j] === area[donor[p]] && j < donor[p])
    )
      donor[p] = j;
  }
  const scale = Math.max(1, Math.min(W, H) / 128);
  const most = Math.round(WASHES.most * scale);
  /** The line up from `i`, head first, by the donors with the most land draining, while it has its head's flow. */
  const upFrom = (
    i: number,
    cap: number,
    skip?: (j: number) => boolean,
  ): number[] => {
    const line = [i];
    let c = i;
    while (line.length < cap) {
      const d = donor[c];
      if (d < 0 || area[d] < WASHES.headArea || (skip && skip(d))) break;
      line.push(d);
      c = d;
    }
    return line.reverse();
  };

  // ---- a bed cut along a line: its floor down the line, where it must end, and the tiles it takes
  const taken = new Int32Array(N).fill(-1); // a bed tile's floor
  interface Cut {
    line: number[];
    floor: number[];
    tiles: number[];
    tileFloor: number[];
    end: Wash["end"];
  }
  /** The bed along `line` (head to mouth) as it would be cut, ended where it must; null when what is left is short.
   *  `start` is the old bed's floor at its head; `join`, a floor the line may not go under where it meets a bed. */
  const cutAlong = (
    line: number[],
    salt: number,
    least: number,
    opts: { start?: number; join?: boolean; lake?: Uint8Array } = {},
  ): Cut | null => {
    const n = line.length;
    const { x, y } = curveOf(
      line,
      W,
      (inp.seed + salt * 0x9e3779b1) >>> 0,
      WASHES.smooth,
    );
    const rSeed = (inp.seed ^ (salt * 0x85ebca6b)) >>> 0;
    const floor: number[] = [];
    const stamps: number[][] = [];
    let end: Wash["end"] = "hollow";
    let prev = opts.start ?? Infinity;
    let last = n;
    for (let s = 0; s < n; s++) {
      const r =
        WASHES.radius[0] +
        (WASHES.radius[1] - WASHES.radius[0]) *
          (0.5 + 0.5 * valueNoise(rSeed, s, 7, WASHES.radiusCell));
      const cx = x[s];
      const cy = y[s];
      const ci = Math.round(cy) * W + Math.round(cx);
      // (the line meets another bed: a branch ends there, at a floor no lower than the bed's)
      if (opts.join && taken[line[s]] >= 0) {
        end = "join";
        last = s;
        break;
      }
      if (!allowed[ci]) {
        last = s;
        end =
          minFloor[line[s]] >= 0 || (s + 1 < n && minFloor[line[s + 1]] >= 0)
            ? "water"
            : "hollow";
        break;
      }
      const tiles: number[] = [];
      let low = Infinity;
      for (let yy = Math.floor(cy - r); yy <= Math.ceil(cy + r); yy++)
        for (let xx = Math.floor(cx - r); xx <= Math.ceil(cx + r); xx++) {
          if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
          if ((xx - cx) * (xx - cx) + (yy - cy) * (yy - cy) > r * r) continue;
          const t = yy * W + xx;
          if (!allowed[t]) continue;
          tiles.push(t);
          if (h0[t] < low) low = h0[t];
        }
      if (!tiles.length) {
        last = s;
        break;
      }
      // (a level under the lowest ground beside it: two under where it runs along a step's foot or the land rises)
      let f = Math.min(prev, low - 1);
      if (opts.start !== undefined) f = Math.min(f, opts.start);
      if (f < inp.floor) f = inp.floor;
      // (too deep under the ground beside it: the bed ends here, in a hollow)
      if (low - f > WASHES.cutMost) {
        last = s;
        end = "hollow";
        break;
      }
      // (near water a floor keeps over the water's level: short of that, the bed ends by its lip)
      let under = false;
      // (the old bed's own lake: its floor keeps at the lake's level there, behind the lip)
      for (const t of tiles)
        if (
          minFloor[t] >= 0 &&
          f < minFloor[t] &&
          !(opts.lake?.[t] && opts.start !== undefined && f >= opts.start)
        )
          under = true;
      if (under) {
        last = s;
        end = "water";
        break;
      }
      floor.push(f);
      stamps.push(tiles);
      prev = f;
    }
    if (last < least) return null;
    const keep = Math.min(last, floor.length);
    // (a line longer than the most keeps its lower reach)
    const from = Math.max(0, keep - most);
    if (keep - from < least) return null;
    const tileFloor = new Map<number, number>();
    for (let s = from; s < keep; s++)
      for (const t of stamps[s]) {
        const f = floor[s];
        if (h0[t] - f > WASHES.cutMost) continue;
        const was = tileFloor.get(t);
        if (was === undefined || f < was) tileFloor.set(t, f);
      }
    return {
      line: line.slice(from, keep),
      floor: floor.slice(from, keep),
      tiles: [...tileFloor.keys()],
      tileFloor: [...tileFloor.values()],
      end,
    };
  };
  /** The tiles within `r` (Chebyshev) of a bed's line: no other line comes this near. */
  const nearLine = new Uint8Array(N);
  const markNear = (line: readonly number[], r: number) => {
    for (const i of line) {
      const x = i % W;
      const y = (i - x) / W;
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx >= 0 && yy >= 0 && xx < W && yy < H) nearLine[yy * W + xx] = 1;
        }
    }
  };
  /** The dry hollow at a bed's end: one or two levels under the land round it (its ring at the bed's last floor, a
   *  two-deep one's core a level under that, so a ramp goes down each step), closed all round (none of the ground
   *  beside it as low but its own bed's last stretch), at least five tiles; null where the land gives none. */
  const hollowFor = (c: Cut, salt: number): Hollow | null => {
    const at = c.line[c.line.length - 1];
    const ax = at % W;
    const ay = (at - ax) / W;
    const r =
      WASHES.hollow.radius[0] +
      (WASHES.hollow.radius[1] - WASHES.hollow.radius[0]) * rng.float();
    const dh =
      WASHES.hollow.depth[0] +
      rng.int(0, WASHES.hollow.depth[1] - WASHES.hollow.depth[0] + 1);
    // (its ring at the bed's last floor, a level under the land round it; a two-deep one's core a level under that, so
    // the colony steps down into it from its rim as into the bed)
    const ring = c.floor[c.floor.length - 1];
    const f = ring - (dh - 1);
    if (f < inp.floor) return null;
    const hSeed = (inp.seed ^ (salt * 0xc2b2ae35)) >>> 0;
    const out: number[] = [];
    const floors: number[] = [];
    const R = Math.ceil(r * 1.3);
    const inside = new Map<number, number>();
    const core = 0.3 * r * r;
    for (let dy = -R; dy <= R; dy++)
      for (let dx = -R; dx <= R; dx++) {
        const xx = ax + dx;
        const yy = ay + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const t = yy * W + xx;
        const rr = r * (1 + 0.3 * valueNoise(hSeed, xx, yy, 3));
        if (dx * dx + dy * dy > rr * rr) continue;
        const ft = dx * dx + dy * dy <= core ? f : ring;
        if (
          !allowed[t] ||
          taken[t] >= 0 ||
          h0[t] <= ft ||
          (minFloor[t] >= 0 && ft < minFloor[t])
        )
          continue;
        // (no deeper under the ground it is dug in than the bed's cut, a core a level more)
        if (h0[t] - ft > WASHES.cutMost + (ft < ring ? 1 : 0)) continue;
        out.push(t);
        floors.push(ft);
        inside.set(t, ft);
      }
    if (out.length < 5 || !floors.includes(f)) return null;
    // (closed: the ground beside it stands over its floor; its own bed's last stretch is part of the basin, the bed
    // rising up its length)
    for (const [t, ft] of inside) {
      const x = t % W;
      const y = (t - x) / W;
      for (const n of [
        x + 1 < W ? t + 1 : -1,
        x > 0 ? t - 1 : -1,
        y + 1 < H ? t + W : -1,
        y > 0 ? t - W : -1,
      ]) {
        if (n < 0 || inside.has(n)) continue;
        const q = c.tiles.indexOf(n);
        if (q >= 0 && c.tileFloor[q] >= ring) continue;
        const lv =
          q >= 0
            ? c.tileFloor[q]
            : taken[n] >= 0
              ? Math.min(h[n], taken[n])
              : h[n];
        if (lv <= ft || wet[n]) return null;
      }
    }
    return { tiles: out, floors };
  };
  /** Cut a bed into the land: its tiles, its hollow, and the mask. */
  const apply = (c: Cut, kind: Wash["kind"], hollow: Hollow | null): void => {
    const k = beds.length + 1;
    const tiles: number[] = [];
    c.tiles.forEach((t, q) => {
      const f = c.tileFloor[q];
      if (taken[t] >= 0 && taken[t] <= f) return;
      if (h[t] > f) h[t] = f;
      taken[t] = f;
      mask[t] = k;
      tiles.push(t);
    });
    const wash: Wash = {
      kind,
      end: c.end,
      line: c.line,
      floor: c.floor,
      tiles,
    };
    if (hollow) {
      hollow.tiles.forEach((t, q) => {
        const f = hollow.floors[q];
        if (h[t] > f) h[t] = f;
        taken[t] = f;
        mask[t] = k;
      });
      wash.hollow = hollow.tiles;
    }
    beds.push(wash);
  };

  // (a bed that cuts the land's level walk in two, or that the colony can't step into, is undone: the washes take no
  // land from the start's walk, `start.reach`. Near a place a start may take no crossing ramp goes in,
  // `WASHES.rampClear`: there the build's derived slopes join the start's own ground)
  const clear = (lo: number): boolean => {
    const x = lo % W;
    const y = (lo - x) / W;
    return !(inp.starts ?? []).some(
      (p) => Math.max(Math.abs(p.x - x), Math.abs(p.y - y)) <= WASHES.rampClear,
    );
  };
  /** The ramps into the beds; a stretch they can't join to the land smaller than a pocket is first left uncut (a tile
   *  or two the bed's edge stranded under a single bank). */
  const rampsOf = (): [number, number][] => {
    for (;;) {
      const { steps, stranded } = rampsInto(
        beds,
        h,
        mask,
        wet,
        keepOff,
        W,
        H,
        clear,
      );
      const small = stranded.filter((c) => c.length < WASHES.pocket);
      if (!small.length) return steps;
      const drop = new Set<number>();
      for (const c of small)
        for (const t of c) {
          h[t] = h0[t];
          mask[t] = 0;
          taken[t] = -1;
          drop.add(t);
        }
      for (const bed of beds) {
        bed.tiles = bed.tiles.filter((t) => !drop.has(t));
        if (bed.hollow) bed.hollow = bed.hollow.filter((t) => !drop.has(t));
      }
    }
  };
  let steps: [number, number][] = [];
  /** Undo the beds that cut the walk (above), after a step to each part a bed parted where one stands; the ramps of
   *  the rest in `steps`. Run as each wash is cut, so one undone makes way for the next. */
  const guard = (): void => {
    steps = rampsOf();
    while (beds.length) {
      let walk = cutsWalk(beds, h, h0, mask, steps, W, H);
      if (!walk.bad.size) break;
      // (first a step from the bed up to each part of a level region it parted, where the bed beside it is a level under)
      const more = stepsToBanks(walk.parts, h, mask, wet, keepOff, steps, W, H);
      if (more.length) {
        steps = [...steps, ...more];
        walk = cutsWalk(beds, h, h0, mask, steps, W, H);
        if (!walk.bad.size) break;
      }
      const cuts = walk.bad;
      // (a branch and its wash, the bed before it, go together: a branch's floor may stand in its wash's)
      beds.forEach((bed, k) => {
        if (bed.kind === "branch" && (cuts.has(k - 1) || cuts.has(k))) {
          cuts.add(k - 1);
          cuts.add(k);
        }
      });
      const keep: Wash[] = [];
      beds.forEach((bed, k) => {
        if (!cuts.has(k)) {
          keep.push(bed);
          return;
        }
        for (const t of [...bed.tiles, ...(bed.hollow ?? [])])
          if (mask[t] === k + 1) {
            h[t] = h0[t];
            taken[t] = -1;
          }
      });
      beds.length = 0;
      beds.push(...keep);
      mask.fill(0);
      beds.forEach((bed, k) => {
        for (const t of [...bed.tiles, ...(bed.hollow ?? [])]) mask[t] = k + 1;
      });
      steps = rampsOf();
    }
  };

  // ---- the washes: the trunks with the most land draining through their lower ends, spaced, each perhaps a branch
  const want = Math.round(
    ((WASHES.per128[0] + rng.int(0, WASHES.per128[1] - WASHES.per128[0] + 1)) *
      N) /
      (128 * 128),
  );
  const ends: { i: number; score: number }[] = [];
  for (let i = 0; i < N; i++) {
    if (!allowed[i] || area[i] < WASHES.trunkArea) continue;
    const p = rcv[i];
    if (p >= 0 && allowed[p]) continue;
    // (a wash that runs to water is the likelier: its mouth is where a dam lets the water in)
    let toWater = false;
    for (let c = p, k = 0; c >= 0 && k < 4 && !toWater; c = rcv[c], k++)
      if (wet[c]) toWater = true;
    ends.push({
      i,
      score: area[i] * (toWater ? 1.5 : 1) * (0.7 + 0.6 * rng.float()),
    });
  }
  ends.sort((a, b) => b.score - a.score || a.i - b.i);
  let salt = 1;
  for (const c of ends) {
    if (beds.filter((b) => b.kind === "wash").length >= Math.max(1, want))
      break;
    if (nearLine[c.i]) continue;
    const line = upFrom(c.i, most + 20, (j) => !!nearLine[j]);
    if (line.length < WASHES.least) continue;
    if (line.some((j) => nearLine[j])) continue;
    const cut = cutAlong(line, salt++, WASHES.least);
    if (!cut) continue;
    // (a wash that does not reach water ends in its hollow, or is none)
    const hollow = cut.end === "hollow" ? hollowFor(cut, salt) : null;
    if (cut.end === "hollow" && !hollow) continue;
    apply(cut, "wash", hollow);
    markNear(cut.line, WASHES.apart);
    // (a side branch: the next-largest flow joining it in its middle reach, traced up)
    if (rng.float() < WASHES.branch) {
      let best: number[] | null = null;
      for (let s = 4; s < cut.line.length - 4; s++) {
        const p = cut.line[s];
        const upstream = cut.line[s - 1];
        const px = p % W;
        const py = (p - px) / W;
        for (let k = 0; k < 8; k++) {
          const xx = px + N8X[k];
          const yy = py + N8Y[k];
          if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
          const d = yy * W + xx;
          if (
            d === upstream ||
            rcv[d] !== p ||
            !allowed[d] ||
            area[d] < 2 * WASHES.headArea ||
            taken[d] >= 0
          )
            continue;
          const up = upFrom(d, most, (j) => taken[j] >= 0);
          if (
            up.length >= WASHES.branchLeast &&
            (!best || up.length > best.length)
          )
            best = [...up, p];
        }
      }
      if (best) {
        const b = cutAlong(best, salt++, WASHES.branchLeast, { join: true });
        const bh = b && b.end === "hollow" ? hollowFor(b, salt) : null;
        if (b && (b.end !== "hollow" || bh)) {
          apply(b, "branch", bh);
          markNear(b.line, Math.round(WASHES.apart / 2));
        }
      }
    }
    guard();
  }

  // ---- the old bed: from behind a lake's lip, at the lake's own level, out into the dry land
  {
    let best: { cut: Cut; hollow: Hollow | null; score: number } | null = null;
    const lakes = [...inp.lakes]
      .filter((l) => l.length >= 12)
      .sort((a, b) => b.length - a.length)
      .slice(0, 4);
    for (const lake of lakes) {
      let top = -Infinity;
      for (const i of lake) if (surface[i] > top) top = surface[i];
      if (!(top > -Infinity)) continue;
      const S = Math.floor(top);
      // (the tiles two from the lake, past a dry lip a level over it)
      const own = new Uint8Array(N);
      for (const i of lake) own[i] = 1;
      const ring: number[] = [];
      const seen = new Uint8Array(N);
      for (const i of lake) {
        const x = i % W;
        const y = (i - x) / W;
        for (let dy = -2; dy <= 2; dy++)
          for (let dx = -2; dx <= 2; dx++) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) !== 2) continue;
            const xx = x + dx;
            const yy = y + dy;
            if (xx < e || yy < e || xx >= W - e || yy >= H - e) continue;
            const t = yy * W + xx;
            if (seen[t] || !allowed[t]) continue;
            seen[t] = 1;
            if (
              h0[t] <= S ||
              h0[t] > S + WASHES.old.rim ||
              nearLine[t] ||
              taken[t] >= 0
            )
              continue;
            ring.push(t);
          }
      }
      // (the ground within two tiles of this lake, where the old bed's floor keeps at the lake's level, not over it)
      const lakeNear = new Uint8Array(N);
      for (const i of lake) {
        const x = i % W;
        const y = (i - x) / W;
        for (let dy = -2; dy <= 2; dy++)
          for (let dx = -2; dx <= 2; dx++) {
            const xx = x + dx;
            const yy = y + dy;
            if (xx >= 0 && yy >= 0 && xx < W && yy < H)
              lakeNear[yy * W + xx] = 1;
          }
      }
      rng.shuffle(ring);
      for (const t of ring.slice(0, 40)) {
        // (down the flow from there, away from the lake)
        const line = [t];
        let c = t;
        while (line.length < WASHES.old.most + 10) {
          const p = rcv[c];
          if (p < 0 || wet[p] || own[p] || nearLine[p] || taken[p] >= 0) break;
          line.push(p);
          c = p;
        }
        if (line.length < WASHES.old.least) continue;
        // (it leaves the lake: its line ends well away from it)
        const lx = line[line.length - 1] % W;
        const ly = (line[line.length - 1] - lx) / W;
        const tx = t % W;
        const ty = (t - tx) / W;
        if ((lx - tx) * (lx - tx) + (ly - ty) * (ly - ty) < 100) continue;
        const cut = cutAlong(
          line.slice(0, WASHES.old.most),
          salt++,
          WASHES.old.least,
          { start: S, lake: lakeNear },
        );
        if (!cut || cut.line[0] !== t) continue;
        const hollow = cut.end === "hollow" ? hollowFor(cut, salt) : null;
        if (cut.end === "hollow" && !hollow) continue;
        const score = cut.line.length * (0.8 + 0.4 * rng.float());
        if (!best || score > best.score) best = { cut, hollow, score };
      }
    }
    if (best) apply(best.cut, "old", best.hollow);
  }
  guard();
  return { beds, mask, steps };
}

/** The start's ground a bed keeps off (D515's five numbers): for each place a start may stand, its bench (the dry
 *  ground at its level joined to its 3×3 without a step, at any distance, `startBench`'s flood), the ground within
 *  `WASHES.startWalk` tiles' walk of it, and its ways out (`ways`, the natural ramps' tiles) with a margin. Marked into
 *  `out`. */
export function startKeepOff(
  h: Uint8Array,
  W: number,
  H: number,
  starts: readonly { x: number; y: number }[],
  ways: readonly number[],
  out: Uint8Array,
): void {
  const N = W * H;
  for (const st of starts) {
    if (st.x < 0 || st.y < 0 || st.x >= W || st.y >= H) continue;
    const walk = walkDistance(h, W, H, null, [], st, WASHES.startWalk + 1);
    for (let i = 0; i < N; i++) if (walk[i] <= WASHES.startWalk) out[i] = 1;
    const level = h[st.y * W + st.x];
    const queue: number[] = [];
    const seen = new Uint8Array(N);
    for (let y = st.y - 1; y <= st.y + 1; y++)
      for (let x = st.x - 1; x <= st.x + 1; x++) {
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        const i = y * W + x;
        if (h[i] === level && !seen[i]) {
          seen[i] = 1;
          queue.push(i);
        }
      }
    for (let q = 0; q < queue.length; q++) {
      const i = queue[q];
      out[i] = 1;
      const x = i % W;
      const y = (i - x) / W;
      for (const n of [
        x + 1 < W ? i + 1 : -1,
        x > 0 ? i - 1 : -1,
        y + 1 < H ? i + W : -1,
        y > 0 ? i - W : -1,
      ]) {
        if (n < 0 || seen[n] || h[n] !== level) continue;
        seen[n] = 1;
        queue.push(n);
      }
    }
  }
  const m = WASHES.wayMargin;
  for (const i of ways) {
    const x = i % W;
    const y = (i - x) / W;
    for (let dy = -m; dy <= m; dy++)
      for (let dx = -m; dx <= m; dx++) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx >= 0 && yy >= 0 && xx < W && yy < H) out[yy * W + xx] = 1;
      }
  }
}

/** Each bed's and hollow's tiles as one mask (the dead stands' dry beds, `deadStands.ts`). */
export function bedMask(beds: readonly Wash[], N: number): Uint8Array {
  const out = new Uint8Array(N);
  for (const b of beds) {
    for (const t of b.tiles) out[t] = 1;
    for (const t of b.hollow ?? []) out[t] = 1;
  }
  return out;
}

/** The beds (by index) that cut the land's level walk: where a bed crossed ground at one level (`h0`'s 4-connected
 *  level regions), every part of it the bed left must still be joined over ground at one level and the ramps
 *  (`steps`, both ways) on the land as cut; and every bed tile must join ground off the beds. A bed that fails is one
 *  the walk would lose land to. */
function cutsWalk(
  beds: readonly Wash[],
  h: Uint8Array,
  h0: Uint8Array,
  mask: Uint16Array,
  steps: readonly [number, number][],
  W: number,
  H: number,
): { bad: Set<number>; parts: number[][] } {
  const N = W * H;
  const parent = new Int32Array(N);
  for (let i = 0; i < N; i++) parent[i] = i;
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  const join = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[ra < rb ? rb : ra] = ra < rb ? ra : rb;
  };
  const before = new Int32Array(N);
  for (let i = 0; i < N; i++) before[i] = i;
  const findB = (i: number): number => {
    while (before[i] !== i) {
      before[i] = before[before[i]];
      i = before[i];
    }
    return i;
  };
  for (let i = 0; i < N; i++) {
    const x = i % W;
    for (const j of [x + 1 < W ? i + 1 : -1, i + W < N ? i + W : -1]) {
      if (j < 0) continue;
      if (h[i] === h[j]) join(i, j);
      if (h0[i] === h0[j]) {
        const a = findB(i);
        const b = findB(j);
        if (a !== b) before[a < b ? b : a] = a < b ? a : b;
      }
    }
  }
  for (const [a, b] of steps) join(a, b);
  const bad = new Set<number>();
  // (the ground each joined part holds off the beds, as cut)
  const size = new Map<number, number>();
  for (let i = 0; i < N; i++) {
    if (mask[i]) continue;
    const r = find(i);
    size.set(r, (size.get(r) ?? 0) + 1);
  }
  // (each level region a bed crossed: its ground beside the beds, by the part each tile joins as cut)
  const banks = new Map<number, Map<number, number[]>>();
  for (let t = 0; t < N; t++) {
    if (!mask[t]) continue;
    // (a stretch the colony can't step into or out of)
    if (!size.has(find(t))) bad.add(mask[t] - 1);
    const x = t % W;
    const y = (t - x) / W;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const xx = x + dx;
      const yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
      const n = yy * W + xx;
      if (mask[n] || h0[n] !== h0[t]) continue;
      const region = findB(n);
      let parts = banks.get(region);
      if (!parts) banks.set(region, (parts = new Map()));
      const r = find(n);
      const part = parts.get(r);
      if (part) part.push(n);
      else parts.set(r, [n]);
    }
  }
  // (a region parted into two parts or more that each hold a pocket's ground or more; a pocket cut off is let go)
  const split = new Set<number>();
  const parts: number[][] = [];
  for (const [region, byRoot] of banks) {
    let big = 0;
    for (const r of byRoot.keys()) if (size.get(r)! >= WASHES.pocket) big++;
    if (big < 2) continue;
    split.add(region);
    for (const part of byRoot.values()) parts.push(part);
  }
  if (split.size)
    for (let t = 0; t < N; t++)
      if (mask[t] && split.has(findB(t))) bad.add(mask[t] - 1);
  return { bad, parts };
}

/** A step from a bed up to each of `parts` (ground beside the beds): on the first of its tiles with a bed tile a level
 *  under it beside it and the bed's tile behind that one at the same level, no tile of it already a step's. */
function stepsToBanks(
  parts: readonly number[][],
  h: Uint8Array,
  mask: Uint16Array,
  wet: Uint8Array,
  keepOff: Uint8Array,
  steps: readonly [number, number][],
  W: number,
  H: number,
): [number, number][] {
  const used = new Set<number>();
  for (const [a, b] of steps) {
    used.add(a);
    used.add(b);
  }
  const out: [number, number][] = [];
  for (const part of parts) {
    let done = false;
    for (const n of part) {
      if (done) break;
      if (keepOff[n] || wet[n] || used.has(n)) continue;
      const x = n % W;
      const y = (n - x) / W;
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const tx = x + dx;
        const ty = y + dy;
        const bx = tx + dx;
        const by = ty + dy;
        if (
          bx < 0 ||
          by < 0 ||
          bx >= W ||
          by >= H ||
          tx < 0 ||
          ty < 0 ||
          tx >= W ||
          ty >= H
        )
          continue;
        const t = ty * W + tx;
        const b = by * W + bx;
        if (
          !mask[t] ||
          !mask[b] ||
          h[t] + 1 !== h[n] ||
          h[b] !== h[t] ||
          used.has(t) ||
          used.has(b)
        )
          continue;
        out.push([t, n]);
        used.add(t);
        used.add(n);
        done = true;
        break;
      }
    }
  }
  return out;
}

/** Natural ramps into the beds (`WASHES.slopeEvery`): every stretch of a bed or its hollow at one level is joined to the
 *  land, from the highest down, by ground at its own level beside it or a step up onto ground already joined (a bank,
 *  or a stretch joined before it), so none is cut off (the stretches none joins are `stranded`); and at points along
 *  each bed's line where `crossAt` lets them, a step up each bank (one each side of the line), so the colony crosses
 *  it. A step stands on a low tile with the high tile a level over it on one side and a tile at its own level on the
 *  other (`standingSteps`). (low tile, high tile) pairs, a tile once. */
function rampsInto(
  beds: readonly Wash[],
  h: Uint8Array,
  mask: Uint16Array,
  wet: Uint8Array,
  keepOff: Uint8Array,
  W: number,
  H: number,
  crossAt: (lo: number) => boolean,
): { steps: [number, number][]; stranded: number[][] } {
  const out: [number, number][] = [];
  const used = new Set<number>();
  const D4 = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as const;
  /** A step up from `t` to ground a level over it that `up` takes, the tile behind `t` one `inside` takes, in a
   *  direction not yet `taken`. */
  const stepFrom = (
    t: number,
    inside: (i: number) => boolean,
    up: (i: number) => boolean,
    taken: Set<string>,
    side?: (dx: number, dy: number) => number,
  ): boolean => {
    const x = t % W;
    const y = (t - x) / W;
    for (const [dx, dy] of D4) {
      const key = side ? `${side(dx, dy)}` : `${dx},${dy}`;
      if (key === "0" || taken.has(key)) continue;
      const nx = x + dx;
      const ny = y + dy;
      const bx = x - dx;
      const by = y - dy;
      if (
        nx < 0 ||
        ny < 0 ||
        nx >= W ||
        ny >= H ||
        bx < 0 ||
        by < 0 ||
        bx >= W ||
        by >= H
      )
        continue;
      const n = ny * W + nx;
      const b = by * W + bx;
      if (
        h[n] !== h[t] + 1 ||
        h[b] !== h[t] ||
        !up(n) ||
        !inside(b) ||
        wet[n] ||
        used.has(t) ||
        used.has(n) ||
        used.has(b)
      )
        continue;
      out.push([t, n]);
      used.add(t);
      used.add(n);
      taken.add(key);
      return true;
    }
    return false;
  };
  const bank = (i: number) => mask[i] === 0 && !keepOff[i];
  // (each stretch of a bed or hollow at one level, 4-connected, joined to the land: from the highest down, by ground
  // at its own level beside it or else a step up onto ground already joined, a bank or a stretch joined before it)
  const comp = new Int32Array(W * H).fill(-1);
  const comps: { tiles: number[]; level: number }[] = [];
  beds.forEach((bed, k) => {
    const own = k + 1;
    for (const t0 of [...bed.tiles, ...(bed.hollow ?? [])].sort(
      (a, b) => a - b,
    )) {
      if (mask[t0] !== own || comp[t0] >= 0) continue;
      const id = comps.length;
      const tiles = [t0];
      comp[t0] = id;
      for (let q = 0; q < tiles.length; q++) {
        const c = tiles[q];
        const x = c % W;
        const y = (c - x) / W;
        for (const [dx, dy] of D4) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
          const n = yy * W + xx;
          if (comp[n] < 0 && mask[n] === own && h[n] === h[c]) {
            comp[n] = id;
            tiles.push(n);
          }
        }
      }
      comps.push({ tiles, level: h[t0] });
    }
  });
  const linked = new Uint8Array(comps.length);
  const order = comps
    .map((_, id) => id)
    .sort((a, b) => comps[b].level - comps[a].level || a - b);
  for (const id of order) {
    const { tiles } = comps[id];
    const level = (i: number) => {
      const x = i % W;
      const y = (i - x) / W;
      for (const [dx, dy] of D4) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const n = yy * W + xx;
        if (
          h[n] === h[i] &&
          !wet[n] &&
          (mask[n] === 0
            ? true
            : comp[n] >= 0 && comp[n] !== id && linked[comp[n]])
        )
          return true;
      }
      return false;
    };
    if (tiles.some(level)) {
      linked[id] = 1;
      continue;
    }
    const inComp = (i: number) => comp[i] === id;
    const up = (i: number) =>
      mask[i] === 0 ? bank(i) : comp[i] >= 0 && linked[comp[i]] === 1;
    const taken = new Set<string>();
    for (const t of [...tiles].sort((a, b) => a - b))
      if (stepFrom(t, inComp, up, taken)) {
        linked[id] = 1;
        break;
      }
  }
  beds.forEach((bed, k) => {
    const own = k + 1;
    const mine = (i: number) => mask[i] === own;
    // (across: a step up each bank at points along the line)
    const hollow = new Set(bed.hollow ?? []);
    const inBed = (i: number) => mine(i) && !hollow.has(i);
    for (
      let s = 1;
      s < bed.line.length - 1;
      s += s === 1 ? WASHES.slopeEvery - 1 : WASHES.slopeEvery
    ) {
      const c = bed.line[s];
      if (!crossAt(c)) continue;
      const cx = c % W;
      const cy = (c - cx) / W;
      const near: number[] = [];
      for (let dy = -2; dy <= 2; dy++)
        for (let dx = -2; dx <= 2; dx++) {
          const xx = cx + dx;
          const yy = cy + dy;
          if (xx >= 0 && yy >= 0 && xx < W && yy < H && inBed(yy * W + xx))
            near.push(yy * W + xx);
        }
      near.sort(
        (a, b) =>
          Math.abs((a % W) - cx) +
            Math.abs(Math.floor(a / W) - cy) -
            (Math.abs((b % W) - cx) + Math.abs(Math.floor(b / W) - cy)) ||
          a - b,
      );
      // (which bank a step climbs: the side of the line's normal its way up points to)
      const p = bed.line[s - 1];
      const q = bed.line[s + 1];
      const tx = (q % W) - (p % W);
      const ty = Math.floor(q / W) - Math.floor(p / W);
      const side = (dx: number, dy: number) => Math.sign(-ty * dx + tx * dy);
      const taken = new Set<string>();
      let got = 0;
      for (const t of near) {
        if (got >= 2) break;
        if (stepFrom(t, (i) => inBed(i) && h[i] === h[t], bank, taken, side))
          got++;
      }
    }
  });
  return {
    steps: out,
    stranded: comps.filter((_, id) => !linked[id]).map((c) => c.tiles),
  };
}
