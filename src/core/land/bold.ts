// The bold family (docs/design/uplands.md, round 5): above 128², Highlands' and Canyon's rings bunch. The game's bold
// maps (Terraces, Oasis, Hollows, Canyon, Pressure) hold the same calm ring terraces as its gentle ones, but in places
// the rings close up into a wall four to six levels tall within a tile or two, round a form with a name: a mesa, a
// hollow, a gorge's two faces with a bench between. Each wall here is a steep band in a form's smooth profile, laid on
// the graded levels before the edge warp and the snap (`levels.ts` `snapLevels`), never noise, so its line runs as
// smooth as the rings round it; the warp then bends it as it bends them.
//
// - Highlands, mesas (`boldMesas`): two to four tablelands 40–70 tiles across, each standing 4–6 levels over the ring
//   terraces round its rim, its top level enough to build on (a level lower in patches), one or two graded ways up
//   (a tongue of one-level treads, `run` tiles a level). The field the water is planned on stands high under each, so
//   no river is planned across one. Their rims are kept from the walls' notches (`notchWalls`): their ways are their own.
// - Canyon, the gorge (`boldGorge`): where the gorge's wall is steep, a bench is cut into the tableland's edge
//   `rise` levels over the floor, its width wandering along the gorge (none in places, where the wall stands whole),
//   so the gorge's side is two faces, the lower the taller; and one or two hollows off the gorge, a lobed bowl cut into
//   the tableland at its rim, its floor `over` levels over the gorge's, open to it.
// Exact arithmetic throughout: + − × ÷, `portable.sqrt`, the integer-hash noise.

import * as portable from "../math/portable";
import { stream } from "../math/rng";
import { fbm } from "../math/noise";
import { clamp, smoothstep } from "../math/clamp";
import { hash32 } from "../math/hash";
import { sinDet, TWO_PI } from "../math/detmath";
import { formDist, type RingForm } from "./rings";

/** The bold family's numbers. `mesa`: how many a 256² map draws (fewest, most), their radius (tiles, at 256²), the
 *  height of their wall (levels), the calm ground kept between two (tiles past their radii), their wall's width and
 *  their ways' run per level and half width (tiles), the draws tried. `bench`: its rise over the gorge's floor (levels),
 *  its width (tiles) and how far that wanders, over what cell, and how steep (levels a tile) the gorge's wall must be
 *  for one. `hollow`: how many (fewest, most), their radius (tiles), their floor over the gorge's (levels). */
export const BOLD = {
  mesa: { fewest: 2, most: 4, rMin: 21, rMax: 34, hMin: 4, hMax: 6, gap: 14, wall: 1.2, run: 2.2, wayHalf: 3, tries: 80 },
  bench: { rise: 4, width: 9, vary: 8, cell: 64, steep: 0.6 },
  hollow: { fewest: 1, most: 2, rMin: 13, rMax: 20, over: 2, tries: 60 },
} as const;

/** A form's outline for `formDist`: a mesa's or a hollow's, its lobes gentler than the ringed forms'. */
function outline(s: number, x: number, y: number, r: number): RingForm {
  const o = stream(s, "outline");
  return { x, y, r, h: 0, kind: "mesa", s, k1: 2 + Math.floor(2 * o.float()), p1: o.float(), a1: 0.08 + 0.1 * o.float(), k2: 4 + Math.floor(3 * o.float()), p2: o.float(), a2: 0.03 + 0.05 * o.float(), ox: 0, oy: 0 };
}

function median(v: number[]): number {
  const s = v.slice().sort((a, b) => a - b);
  return s.length ? s[s.length >> 1] : 0;
}

/** Highlands' mesas on the graded levels `level` (before the warp and the snap), between `base` and `top`; the field
 *  `E` the water is planned on raised to `eHigh` under each. Returns the tiles about their rims (for `notchWalls` to
 *  leave), or null where none stands. */
export function boldMesas(level: Float64Array, E: Float64Array, W: number, H: number, seed: number, variation: number, base: number, top: number, eHigh: number): Uint8Array | null {
  const side = Math.min(W, H);
  if (side <= 128) return null;
  const M = BOLD.mesa;
  const sizeK = Math.min(1, side / 256);
  const area = (W * H) / (256 * 256);
  const rng = stream(seed, "bold-mesas", variation);
  const want = Math.max(1, Math.round((M.fewest + rng.int(0, M.most - M.fewest + 1)) * area));
  const at = (x: number, y: number) => level[Math.round(clamp(y, 0, H - 1)) * W + Math.round(clamp(x, 0, W - 1))];
  const mesas: { f: RingForm; T: number; ways: [number, number][] }[] = [];
  for (let k = 0; k < want; k++) {
    // of the draws that fit, the one whose wall stands 4–7 over most of the ground round its rim
    let best: { x: number; y: number; r: number; T: number; t: number; wayTurn: number; share: number } | null = null;
    for (let t = 0; t < M.tries; t++) {
      const r = (M.rMin + (M.rMax - M.rMin) * rng.float()) * sizeK;
      const margin = r + 10 * sizeK;
      const x = margin + (W - 1 - 2 * margin) * rng.float();
      const y = margin + (H - 1 - 2 * margin) * rng.float();
      const h = M.hMin + Math.floor((M.hMax - M.hMin + 1) * rng.float());
      const wayTurn = rng.float();
      if (mesas.some((q) => {
        const need = q.f.r + r + M.gap * sizeK;
        return (q.f.x - x) * (q.f.x - x) + (q.f.y - y) * (q.f.y - y) < need * need;
      })) continue;
      // the ground round its rim and under it, read on a coarse grid
      const rim: number[] = [];
      for (let a = 0; a < 24; a++) {
        const th = (TWO_PI * a) / 24;
        rim.push(at(x + 1.08 * r * sinDet(th + TWO_PI / 4), y + 1.08 * r * sinDet(th)));
      }
      let inMin = Infinity;
      let inMax = -Infinity;
      for (let v = -r; v <= r; v += 4)
        for (let u = -r; u <= r; u += 4) {
          if (u * u + v * v > 0.8 * r * r) continue;
          const L = at(x + u, y + v);
          if (L < inMin) inMin = L;
          if (L > inMax) inMax = L;
        }
      const sorted = rim.slice().sort((a, b) => a - b);
      const T = Math.min(Math.round(sorted[18]) + h, top - 1);
      // (the ground under it below its top, and no valley floor under it, where the rivers run)
      if (inMax > T - 0.5 || inMin < base + 2) continue;
      let share = 0;
      for (const L of rim) if (T - L >= M.hMin - 0.5 && T - L <= M.hMax + 1.5) share++;
      share /= rim.length;
      if (share >= 0.6 && (!best || share > best.share)) best = { x, y, r, T, t, wayTurn, share };
    }
    if (!best) continue;
    const { x, y, r, T, t, wayTurn } = best;
    const f = outline(hash32(seed, "bold-mesa", variation, k, t), x, y, r);
    // one way up, two round a long rim, about opposite
    const ways: [number, number][] = [];
    const n = TWO_PI * r > 150 ? 2 : 1;
    for (let w = 0; w < n; w++) {
      const th = TWO_PI * (wayTurn + w * (0.4 + 0.2 * rng.float()));
      ways.push([sinDet(th + TWO_PI / 4), sinDet(th)]);
    }
    mesas.push({ f, T, ways });
  }
  if (!mesas.length) return null;
  const skip = new Uint8Array(W * H);
  for (const { f, T, ways } of mesas) {
    const R = 1.5 * f.r + 2 + M.run * (M.hMax + 2);
    const x0 = Math.max(0, Math.floor(f.x - R));
    const x1 = Math.min(W - 1, Math.ceil(f.x + R));
    const y0 = Math.max(0, Math.floor(f.y - R));
    const y1 = Math.min(H - 1, Math.ceil(f.y + R));
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const i = y * W + x;
        const L = level[i];
        const d = formDist(f, x, y, f.x, f.y, f.r);
        const tin = (1 - d) * f.r;
        // the top, a level lower in patches; the wall a steep band at the rim
        const top0 = T - smoothstep((-0.3 - fbm(f.s + 7, x, y, 22, 2)) / 0.2);
        const w = smoothstep((tin + M.wall / 2) / M.wall);
        let v = L + w * (top0 - L);
        // the ways up: a tongue of one-level treads down from the rim
        for (const [cx, cy] of ways) {
          const along = cx * (x - f.x) + cy * (y - f.y);
          if (along <= 0 || tin > 0) continue;
          const lat = Math.abs(-cy * (x - f.x) + cx * (y - f.y));
          const wr = 1 - smoothstep((lat - M.wayHalf) / 1.5 + 0.5);
          const ramp = T - -tin / M.run;
          if (wr > 0 && ramp > L) v = Math.max(v, L + wr * (ramp - L));
        }
        if (v > L) level[i] = v;
        if (w > 0.3 && E[i] < eHigh) E[i] = eHigh;
        if (d > 0.7 && d < 1.35) skip[i] = 1;
      }
  }
  return skip;
}

/** Each top tile's nearest tile on the gorge's top side beside its floor (`src`) and the distance to it, over the top
 *  side only (a nearest-source sweep, both ways): Infinity and −1 off it or out of reach. */
function nearestRim(low: Uint8Array, W: number, H: number): { dist: Float64Array; src: Int32Array } {
  const N = W * H;
  const dist = new Float64Array(N).fill(Infinity);
  const src = new Int32Array(N).fill(-1);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (low[i]) continue;
      if ((x > 0 && low[i - 1]) || (x + 1 < W && low[i + 1]) || (y > 0 && low[i - W]) || (y + 1 < H && low[i + W])) {
        dist[i] = 0;
        src[i] = i;
      }
    }
  const take = (i: number, x: number, y: number, j: number) => {
    const s = src[j];
    if (s < 0) return;
    const sx = s % W;
    const sy = (s - sx) / W;
    const d = portable.sqrt((x - sx) * (x - sx) + (y - sy) * (y - sy));
    if (d < dist[i]) {
      dist[i] = d;
      src[i] = s;
    }
  };
  for (let pass = 0; pass < 2; pass++) {
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if (low[i]) continue;
        if (x > 0) take(i, x, y, i - 1);
        if (y > 0) {
          take(i, x, y, i - W);
          if (x > 0) take(i, x, y, i - W - 1);
          if (x + 1 < W) take(i, x, y, i - W + 1);
        }
      }
    for (let y = H - 1; y >= 0; y--)
      for (let x = W - 1; x >= 0; x--) {
        const i = y * W + x;
        if (low[i]) continue;
        if (x + 1 < W) take(i, x, y, i + 1);
        if (y + 1 < H) {
          take(i, x, y, i + W);
          if (x + 1 < W) take(i, x, y, i + W + 1);
          if (x > 0) take(i, x, y, i + W - 1);
        }
      }
  }
  return { dist, src };
}

/** Canyon's gorge on the graded levels `level` (before the warp and the snap): its floor's band up to `floorTop`, its
 *  tableland's from `topLo`. A bench cut into the tableland's edge where the wall is steep, and the hollows. */
export function boldGorge(level: Float64Array, W: number, H: number, seed: number, variation: number, floorTop: number, topLo: number): void {
  const side = Math.min(W, H);
  if (side <= 128 || topLo - floorTop < 3) return;
  const N = W * H;
  const B = BOLD.bench;
  const sizeK = Math.min(1, side / 256);
  const mid = (floorTop + topLo) / 2;
  const low = new Uint8Array(N);
  for (let i = 0; i < N; i++) if (level[i] < mid) low[i] = 1;
  const { dist, src } = nearestRim(low, W, H);
  // how steep the wall is where each rim tile stands (levels a tile)
  const steep = (i: number) => {
    const x = i % W;
    const y = (i - x) / W;
    const gx = (level[y * W + Math.min(W - 1, x + 1)] - level[y * W + Math.max(0, x - 1)]) / 2;
    const gy = (level[Math.min(H - 1, y + 1) * W + x] - level[Math.max(0, y - 1) * W + x]) / 2;
    return Math.max(Math.abs(gx), Math.abs(gy));
  };
  const stp = new Float64Array(N).fill(-1);
  const Lb = floorTop + Math.min(B.rise, topLo - floorTop - 1.5);
  const bs = hash32(seed, "gorge-bench", variation);
  const was = level.slice();
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const s = src[i];
      if (s < 0) continue;
      const width = (B.width + B.vary * fbm(bs, x, y, B.cell * sizeK, 2)) * sizeK;
      const D = dist[i];
      if (width < 2.5 || D > width + 2) continue;
      if (stp[s] < 0) stp[s] = steep(s);
      const c = smoothstep((stp[s] - B.steep) / 0.4);
      const L = was[i];
      const P = Lb + (L - Lb) * smoothstep((D - width) / 1.2);
      if (c > 0 && L > P) level[i] = L - c * (L - P);
    }
  // the hollows: a lobed bowl cut into the tableland at the gorge's rim, open to the gorge
  const Hh = BOLD.hollow;
  const rng = stream(seed, "gorge-hollows", variation);
  const area = (W * H) / (256 * 256);
  const want = Math.max(1, Math.round((Hh.fewest + rng.int(0, Hh.most - Hh.fewest + 1)) * area));
  const floorH = floorTop + Hh.over;
  const placed: RingForm[] = [];
  for (let k = 0; k < want; k++) {
    for (let t = 0; t < Hh.tries; t++) {
      const r = (Hh.rMin + (Hh.rMax - Hh.rMin) * rng.float()) * sizeK;
      const x = Math.round(r + 4 + (W - 9 - 2 * r) * rng.float());
      const y = Math.round(r + 4 + (H - 9 - 2 * r) * rng.float());
      const i = y * W + x;
      // its middle on the tableland, a little more than half its radius in from the rim
      if (!(dist[i] >= 0.5 * r && dist[i] <= 0.8 * r)) continue;
      if (placed.some((q) => (q.x - x) * (q.x - x) + (q.y - y) * (q.y - y) < (q.r + r + 12 * sizeK) * (q.r + r + 12 * sizeK))) continue;
      // the tableland round it stands 3 or more over its floor
      const rim: number[] = [];
      for (let a = 0; a < 16; a++) {
        const th = (TWO_PI * a) / 16;
        const xx = Math.round(clamp(x + 1.1 * r * sinDet(th + TWO_PI / 4), 0, W - 1));
        const yy = Math.round(clamp(y + 1.1 * r * sinDet(th), 0, H - 1));
        if (!low[yy * W + xx]) rim.push(level[yy * W + xx]);
      }
      if (rim.length < 8 || median(rim) < floorH + 3) continue;
      const f = outline(hash32(seed, "gorge-hollow", variation, k, t), x, y, r);
      placed.push(f);
      const R = 1.45 * f.r + 2;
      for (let yy = Math.max(0, Math.floor(y - R)); yy <= Math.min(H - 1, Math.ceil(y + R)); yy++)
        for (let xx = Math.max(0, Math.floor(x - R)); xx <= Math.min(W - 1, Math.ceil(x + R)); xx++) {
          const j = yy * W + xx;
          const tin = (1 - formDist(f, xx, yy, x, y, r)) * r;
          const w = smoothstep((tin + 0.6) / 1.2);
          const v = level[j] + w * (floorH - level[j]);
          if (v < level[j]) level[j] = v;
        }
      break;
    }
  }
}
