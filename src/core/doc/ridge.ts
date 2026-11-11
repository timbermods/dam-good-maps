// The ridge: high ground drawn along a line (Raise's Brush choice Ridge). The player drags a line and a ridge rises
// along it, `height` levels above the land it stands on and `width` tiles across: its crest wanders off the line and
// rises and falls along it, one side falls steeply (a cliff with ledges) and the other in broad, uneven benches, and a
// few crags stand on the crest. Which side is steep: the side the drag curves away from (`auto`; left on a straight
// drag), or left or right of the drag's way. The surface is worked out here, in levels and fractions of a level, and
// turned into land by the forces' one last step (rust/forces/src/levels.rs `whole`, through their Wasm,
// forces/rust/bridge.ts `levelsInRust`): slopes become plates of their own size and shape, no band is narrower than two
// tiles, no one-tile pillar or pit is left, and a jump in the surface stays a cliff. So the gentle side reads as benches,
// never contour rings or an even stair. The `ridge` operation stores its tiles and each one's level literally (as a
// lake's sill does) and is applied as exact Flattens; the engine's check plans it again on the map now and it must be
// the one stored (D342). Arithmetic is +, −, ×, ÷ and √ only, so every engine plans the same tiles.

import { CEILING } from "../format/world";
import { levelsInRust } from "../forces/rust/bridge";
import { runsToTiles, tilesToRuns } from "../math/grid";
import { sqrt } from "../math/portable";
import { RIDGE_MAX_HEIGHT, RIDGE_MAX_LENGTH, RIDGE_MAX_WIDTH, RIDGE_MIN_HEIGHT, RIDGE_MIN_LENGTH, RIDGE_MIN_WIDTH, type RidgeSteep } from "./ridgeLimits";
import type { OpOf, RidgeParams } from "./ops";
import type { ApplyResult, MapSession } from "./session";
import { applySelection, selectionHeld } from "./start";

export * from "./ridgeLimits";

export interface RidgePlan {
  /** The plain one-line reason it is refused, or null. */
  reason: string | null;
  /** The operation that makes it (null when refused). */
  op: OpOf<"ridge"> | null;
  /** The tiles it changes, ascending (y·W + x). */
  tiles: number[];
  /** The level each of `tiles` is set to, in their order. */
  levels: number[];
  /** Its highest level. */
  top: number;
  /** The side that falls steeply, seen along the drag. */
  steep: "left" | "right";
}

/** A number from 0 to 1 for (seed, salt, k): integer mixing only, the same on every engine. */
function rand(seed: number, salt: number, k: number): number {
  let h = Math.imul((seed | 0) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul((salt + 0x632be5ab) | 0, 0xc2b2ae35) ^ Math.imul((k + 0x27d4eb2f) | 0, 0x165667b1);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  h = Math.imul(h, 0x297a2d39);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

const smooth = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

/** Value noise along the line, 0 to 1, `scale` tiles a cell. */
function wander(seed: number, salt: number, s: number, scale: number): number {
  const f = s / scale;
  const k = Math.floor(f);
  const a = rand(seed, salt, k);
  return a + (rand(seed, salt, k + 1) - a) * smooth(f - k);
}

/** Plan a ridge along `path` (tiles [x, y], the drag's way): what it would change, or the one line why not. Reads the
 *  map only. */
export function planRidge(s: MapSession, path: readonly (readonly [number, number])[], height: number, width: number, steep: RidgeSteep, seed: number): RidgePlan {
  const none = (reason: string): RidgePlan => ({ reason, op: null, tiles: [], levels: [], top: NaN, steep: "left" });
  const { x: W, y: H } = s.size;
  const before = s.built.heights;
  const where = (i: number) => `X ${i % W} · Y ${Math.floor(i / W)}`;
  if (!Number.isInteger(height) || height < RIDGE_MIN_HEIGHT || height > RIDGE_MAX_HEIGHT) return none(`a ridge's height must be a whole number from ${RIDGE_MIN_HEIGHT} to ${RIDGE_MAX_HEIGHT}`);
  if (!Number.isInteger(width) || width < RIDGE_MIN_WIDTH || width > RIDGE_MAX_WIDTH) return none(`a ridge's width must be a whole number from ${RIDGE_MIN_WIDTH} to ${RIDGE_MAX_WIDTH}`);
  if (steep !== "auto" && steep !== "left" && steep !== "right") return none("a ridge's steep side is auto, left or right");
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) return none("a ridge's seed must be a whole number from 0 to 4294967295");
  for (const [x, y] of path) if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= W || y >= H) return none(`X ${x} · Y ${y} is off the map`);
  // the line, through the middles of the tiles, without a point twice in a row
  const px: number[] = [];
  const py: number[] = [];
  for (const [x, y] of path) {
    const n = px.length;
    if (n && px[n - 1] === x + 0.5 && py[n - 1] === y + 0.5) continue;
    px.push(x + 0.5);
    py.push(y + 0.5);
  }
  const segs = px.length - 1;
  const cum = [0];
  for (let k = 0; k < segs; k++) {
    const dx = px[k + 1] - px[k];
    const dy = py[k + 1] - py[k];
    cum.push(cum[k] + sqrt(dx * dx + dy * dy));
  }
  const L = cum[segs];
  if (segs < 1 || L < RIDGE_MIN_LENGTH) return none(`a ridge needs a line: drag one at least ${RIDGE_MIN_LENGTH} tiles long`);
  if (L > RIDGE_MAX_LENGTH) return none(`a ridge follows at most ${RIDGE_MAX_LENGTH} tiles: this line has ${Math.round(L)}`);
  // the steep side: + is the side where (the way) × (to the tile) > 0: the drag's left as the map is seen (y runs north)
  let side: 1 | -1;
  if (steep === "auto") {
    // (the way the drag turns, summed: it curves away from the other side; a straight drag is steep on its left)
    let turn = 0;
    for (let k = 1; k < segs; k++) {
      const ax = px[k] - px[k - 1];
      const ay = py[k] - py[k - 1];
      const bx = px[k + 1] - px[k];
      const by = py[k + 1] - py[k];
      turn += (ax * by - ay * bx) / ((cum[k] - cum[k - 1]) * (cum[k + 1] - cum[k]));
    }
    side = turn > 0.15 ? -1 : turn < -0.15 ? 1 : 1;
  } else side = steep === "left" ? 1 : -1;

  // the shape across: a crest a little broad, a steep side about a fifth of the width, the rest the benches
  const reach = width * 1.25 + 3;
  const x0 = Math.max(0, Math.floor(Math.min(...px) - reach - 1));
  const y0 = Math.max(0, Math.floor(Math.min(...py) - reach - 1));
  const x1 = Math.min(W - 1, Math.ceil(Math.max(...px) + reach + 1));
  const y1 = Math.min(H - 1, Math.ceil(Math.max(...py) + reach + 1));
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  // each tile's nearest place on the line: how far (signed by side) and how far along
  const dist = new Float64Array(w * h).fill(Infinity);
  const sgn = new Int8Array(w * h);
  const along = new Float64Array(w * h);
  for (let k = 0; k < segs; k++) {
    const ax = px[k];
    const ay = py[k];
    const dx = px[k + 1] - ax;
    const dy = py[k + 1] - ay;
    const len = cum[k + 1] - cum[k];
    const bx0 = Math.max(x0, Math.floor(Math.min(ax, ax + dx) - reach));
    const bx1 = Math.min(x1, Math.ceil(Math.max(ax, ax + dx) + reach));
    const by0 = Math.max(y0, Math.floor(Math.min(ay, ay + dy) - reach));
    const by1 = Math.min(y1, Math.ceil(Math.max(ay, ay + dy) + reach));
    for (let y = by0; y <= by1; y++)
      for (let x = bx0; x <= bx1; x++) {
        const qx = x + 0.5 - ax;
        const qy = y + 0.5 - ay;
        let t = (qx * dx + qy * dy) / (len * len);
        // (past the line's two ends the distance runs on, so the ends come down round)
        const tc = t < 0 ? (k === 0 ? t : 0) : t > 1 ? (k === segs - 1 ? t : 1) : t;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const ex = qx - t * dx;
        const ey = qy - t * dy;
        const d = sqrt(ex * ex + ey * ey);
        const j = (y - y0) * w + (x - x0);
        if (d < dist[j]) {
          dist[j] = d;
          sgn[j] = dx * qy - dy * qx >= 0 ? 1 : -1;
          along[j] = cum[k] + tc * len;
        }
      }
  }
  // the benches on the gentle side: two or three of uneven breadth (one on a low ridge), their edges wandering
  const benches = height <= 3 ? 1 : height <= 6 ? 2 : 3;
  const gaps: number[] = [];
  for (let b = 0; b <= benches; b++) gaps.push(0.55 + 0.9 * rand(seed, 11, b));
  const total = gaps.reduce((a, b) => a + b, 0);
  const edges: number[] = [];
  for (let b = 0, at = 0; b < benches; b++) {
    at += gaps[b];
    edges.push(0.08 + (0.8 * at) / total);
  }
  const cap = Math.min(width * 0.8, L / 2);
  const lift = (j: number): number => {
    const d = dist[j];
    if (d === Infinity) return 0;
    const s = along[j];
    // (the crest wanders off the line, and rises and falls along it; the ends come down)
    const off = (wander(seed, 1, s, 2 * width + 8) - 0.5) * width * 0.35;
    const v = sgn[j] * d - off;
    const e = Math.min(s, L - s);
    const crest = height * (0.74 + 0.26 * wander(seed, 2, s, 9)) * (0.4 + 0.6 * smooth(e / cap));
    const a = v * side > 0 ? v * side : -v * side;
    if (v * side > 0) {
      // the steep side: a brink, then a fall of more than a level a tile (a cliff, its ledges where it slows)
      const ws = Math.max(1.5, width * 0.2 * (0.75 + 0.5 * wander(seed, 3, s, 11)));
      const brink = ws * 0.3;
      return a <= brink ? crest : a >= ws ? 0 : crest * (1 - (a - brink) / (ws - brink));
    }
    // the gentle side: the crest's top, then benches, each nearly level and ending in a drop, the last a slope to the land
    const top = Math.max(1, width * 0.12);
    const wg = (width * 0.8 - top) * (0.85 + 0.3 * wander(seed, 4, s, 13));
    if (a <= top) return crest;
    const t = (a - top) / wg;
    if (t >= 1) return 0;
    let edge = 0;
    let next = 1;
    for (let b = 0; b < benches; b++) {
      const at = edges[b] + (wander(seed, 20 + b, s, 9) - 0.5) * 0.14;
      if (t >= at) edge = at;
      else {
        next = at;
        break;
      }
    }
    // (a tread falls a little across, never a level a tile, so the forces' last step keeps it one broad bench; the
    // outermost one halves before its foot)
    const stepped = next === 1 && edge > 0 ? (1 - edge) * (1 - (0.5 * (t - edge)) / (1 - edge)) : 1 - edge - 0.05 * (t - edge);
    return crest * (0.06 * (1 - t) + 0.94 * Math.max(0, stepped));
  };
  const raised = new Float64Array(w * h);
  const surface = new Float64Array(w * h).fill(NaN);
  const ground = new Float64Array(w * h).fill(NaN);
  const old = new Uint8Array(w * h);
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const j = (y - y0) * w + (x - x0);
      const i = y * W + x;
      old[j] = before[i];
      if (dist[j] > reach) continue;
      ground[j] = before[i];
      raised[j] = lift(j);
      surface[j] = before[i] + raised[j];
    }
  // a few crags on the crest, standing over it, each two tiles across or more (only on the ridge's upper part: never a
  // knob of its own beside it)
  const crags = Math.min(4, 1 + Math.floor(L / 24 + rand(seed, 30, 0) * 1.5));
  for (let c = 0; c < crags; c++) {
    const s = L * (0.12 + 0.76 * ((c + rand(seed, 31, c)) / crags));
    let k = 0;
    while (k < segs - 1 && cum[k + 1] < s) k++;
    const len = cum[k + 1] - cum[k];
    const ux = (px[k + 1] - px[k]) / len;
    const uy = (py[k + 1] - py[k]) / len;
    // (the + side's normal: (−uy, ux) has (u × n) = 1 > 0)
    const off = (wander(seed, 1, s, 2 * width + 8) - 0.5) * width * 0.35 + side * (0.3 + 0.5 * rand(seed, 32, c));
    const cx = px[k] + ux * (s - cum[k]) - uy * off;
    const cy = py[k] + uy * (s - cum[k]) + ux * off;
    const r = 1.6 + rand(seed, 33, c) * (0.6 + width * 0.06);
    const up = 1.2 + rand(seed, 34, c) * (0.8 + height * 0.15);
    for (let y = Math.max(y0, Math.floor(cy - r)); y <= Math.min(y1, Math.ceil(cy + r)); y++)
      for (let x = Math.max(x0, Math.floor(cx - r)); x <= Math.min(x1, Math.ceil(cx + r)); x++) {
        const j = (y - y0) * w + (x - x0);
        if (Number.isNaN(surface[j])) continue;
        const qx = x + 0.5 - cx;
        const qy = y + 0.5 - cy;
        const q = (qx * qx + qy * qy) / (r * r);
        if (q < 1) surface[j] += up * (q < 0.35 ? 1 : (1 - q) / 0.65) * smooth(raised[j] / (0.6 * height));
      }
  }
  const land = levelsInRust(surface, ground, old, w, h, 255, seed, Math.max(6, width * 0.5));
  // what it may not change: ground a source or another object's water stands on, a cave's or an overhang's
  const fixed = new Set<number>();
  for (const e of s.waterNow().model.emitters) for (const i of e.cells) fixed.add(i);
  const held = s.columns.size ? selectionHeld(s) : null;
  const tiles: number[] = [];
  const levels: number[] = [];
  let top = 0;
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const j = (y - y0) * w + (x - x0);
      if (land[j] === old[j]) continue;
      const i = y * W + x;
      if (fixed.has(i)) return none(`a source stands in the ridge's way at ${where(i)}`);
      if (held?.has(i)) return none(`${where(i)} has a cave or overhang: a ridge leaves those as they are`);
      if (land[j] > CEILING) return none(`the ridge would rise above the ceiling (level ${CEILING}) at ${where(i)}: make it lower`);
      tiles.push(i);
      levels.push(land[j]);
      if (land[j] > top) top = land[j];
    }
  if (!tiles.length) return none("the ridge would change nothing here");
  const params: RidgeParams = { path: path.map(([x, y]) => [x, y]), height, width, steep, seed, cells: tilesToRuns(tiles, W), levels };
  return { reason: null, op: { op: "ridge", params }, tiles, levels, top, steep: side > 0 ? "left" : "right" };
}

/** Raise the ridge (`planRidge`), applied as a Select action: one undo step, exact, the objects on its ground riding it
 *  and the start carried to level ground if its own broke (doc/start.ts `applySelection`). */
export function applyRidge(s: MapSession, path: readonly (readonly [number, number])[], height: number, width: number, steep: RidgeSteep, seed: number): ApplyResult & { plan: RidgePlan } {
  const plan = planRidge(s, path, height, width, steep, seed);
  if (!plan.op) return { ok: false, errors: [plan.reason ?? "the ridge can't be raised"], applied: [], dirty: null, plan };
  return { ...applySelection(s, [plan.op], ridgeLabel(plan.op.params), plan.tiles), plan };
}

/** The history's words for a `ridge` operation. */
export function ridgeLabel(p: RidgeParams): string {
  return `Raise a ridge ${p.height} high and ${p.width} wide`;
}

/** Why a `ridge` operation doesn't fit the map now (null when it does): planned again on the map as it stands, it must
 *  be the one it stores (the engine's check). */
export function ridgeProblem(s: MapSession, p: RidgeParams): string | null {
  const r = planRidge(s, p.path, p.height, p.width, p.steep, p.seed);
  if (r.reason) return r.reason;
  const stored = runsToTiles(p.cells, s.size.x).sort((a, b) => a - b);
  const same = stored.length === r.tiles.length && stored.every((i, k) => i === r.tiles[k] && p.levels[k] === r.levels[k]);
  return same ? null : "the ridge is no longer the one planned: draw it again";
}
