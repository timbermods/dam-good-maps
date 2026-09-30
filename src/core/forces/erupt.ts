// Erupt, a force of nature (PLAN §20 D206, D216): it raises a volcano. Vent (a click) or Fissure (a
// painted line of vents); Power; Steep or Broad; a summit (Auto, Peak, Crater or Caldera); Flows
// (Light or Heavy) with or without Ridges; Try another. Low-frequency lobes, terraces, collapse and
// winding lava flows, never per-tile noise. Every level it raises is fresh volcanic rock (rock.ts),
// hard for Carve; flows can dam rivers; objects ride the rising ground (a rigid one on a terrace of
// its own), trees near a vent are knocked down, and what stands in the vent itself is gone;
// overlapping eruptions build volcanic fields. It erupts wherever it is asked, the start's ground
// too (the editor carries the start to level ground, D257), and never adds water. The swell is shown in stages (`stageMap`).
//
// Ported from investigation/forces-core `verbs/erupt/engine.ts` and `flows.ts` (PR #59, from #50 at
// 89c6842), kept to its structure: the pinned parity tests compare it with the prototype byte for
// byte.

import { EMITTERS } from "../sim/model";
import { snapshotMap, type FullForceMap } from "./force";
import { footprint } from "./objects";
import { clamp, hash, smooth } from "./random";
import { strength, tempered } from "./strength";

export interface Point {
  x: number;
  y: number;
}

export interface EruptIntent {
  /** The vent's tile (a fissure's first point). */
  origin: number;
  /** Fissure: the painted line, in tiles (sub-tile points). */
  path?: Point[];
}

export interface EruptSettings {
  mode: "vent" | "fissure";
  /** 0–100. */
  power: number;
  shape: "steep" | "broad";
  summit: "auto" | "peak" | "crater" | "caldera";
  flows: "light" | "heavy";
  ridges: boolean;
  seed: number;
  /** Its breadth across, in tiles (D226): null (or absent: operations from before D226) follows
   *  Power. Power sets how high it throws; Size how broad it spreads. */
  size?: number | null;
  /** The Floor (D321, item 40, floor.ts): nothing it does goes below this level; absent, 1. */
  floor?: number;
}

export const ERUPT_DEFAULTS: EruptSettings = { mode: "vent", power: 62, shape: "steep", summit: "auto", flows: "heavy", ridges: true, seed: 1, size: null };

/** Erupt's Size, in tiles across (D226). */
export const ERUPT_SIZE_MIN = 6;
export const ERUPT_SIZE_MAX = 140;

export function validateErupt(s: EruptSettings, m: { W: number; H: number }, i: EruptIntent): void {
  if (
    !["vent", "fissure"].includes(s.mode) ||
    !["steep", "broad"].includes(s.shape) ||
    !["auto", "peak", "crater", "caldera"].includes(s.summit) ||
    !["light", "heavy"].includes(s.flows) ||
    typeof s.ridges !== "boolean" ||
    !Number.isFinite(s.power) ||
    s.power < 0 ||
    s.power > 100 ||
    !Number.isInteger(s.seed) ||
    s.seed < 0 ||
    s.seed > 0xffffffff ||
    (s.size != null && !(Number.isFinite(s.size) && s.size >= ERUPT_SIZE_MIN && s.size <= ERUPT_SIZE_MAX))
  )
    throw Error("Invalid eruption settings");
  if (!Number.isInteger(i.origin) || i.origin < 0 || i.origin >= m.W * m.H) throw Error("Choose land on the map");
  if (s.mode === "fissure" && (!Array.isArray(i.path) || i.path.length < 2 || i.path.length > 512 || i.path.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y) || p.x < 0 || p.y < 0 || p.x > m.W - 1 || p.y > m.H - 1)))
    throw Error("Draw a fissure on the land");
}

export const naturalSize = (p: number) => 2 * (7 + 36 * (p / 100) ** 1.15);
export const autoSummit = (p: number): EruptSettings["summit"] => (p < 32 ? "peak" : p < 80 ? "crater" : "caldera");

export interface Segment {
  a: Point;
  b: Point;
  length: number;
  along: number;
}

// ------------------------------------------------------------------------------------ lava flows

/** A point of a lava lobe, and its width there. */
export interface LobePoint extends Point {
  width: number;
}

/** A seeded downhill path, rasterized as overlapping rounded deposits, not an angular spoke. */
export interface LavaLobe {
  points: LobePoint[];
  length: number;
  strength: number;
}

const unit = (s: number, k: number) => {
  let x = Math.imul(s ^ Math.imul(k + 1, 0x9e3779b9), 0x85ebca6b);
  x ^= x >>> 13;
  return (Math.imul(x, 0xc2b2ae35) >>> 0) / 4294967296;
};

export function lavaLobes(W: number, H: number, heights: Uint8Array, a: { x: number; y: number; radius: number; height: number; datum: number; summit: string }, seed: number, heavy: boolean): LavaLobe[] {
  const out: LavaLobe[] = [];
  const count = (heavy ? 4 : 3) + Math.floor(unit(seed, 720) * (heavy ? 7 : 4));
  const angles: number[] = [];
  const ground = (x: number, y: number) => heights[Math.max(0, Math.min(H - 1, Math.round(y))) * W + Math.max(0, Math.min(W - 1, Math.round(x)))];
  for (let k = 0; k < count; k++) {
    let angle = unit(seed, 730 + k) * Math.PI * 2;
    // Random gaps and occasional neighboring lobes; never a regular angular fan.
    for (let attempt = 0; attempt < 20 && angles.some((t) => Math.abs(Math.atan2(Math.sin(t - angle), Math.cos(t - angle))) < 0.29); attempt++) angle = unit(seed, 900 + k * 23 + attempt) * Math.PI * 2;
    angles.push(angle);
    const start = a.summit === "caldera" ? 0.64 : a.summit === "crater" ? 0.19 : 0.12;
    const reach = (heavy ? 0.86 : 0.72) + unit(seed, 800 + k) ** 1.4 * (heavy ? 1.5 : 0.7);
    const length = a.radius * (reach - start);
    const steps = Math.max(12, Math.ceil(length / 0.65));
    const width = (0.85 + unit(seed, 820 + k) * 1.35) * Math.max(0.7, a.radius / 22);
    const phase = unit(seed, 840 + k) * Math.PI * 2;
    const points: LobePoint[] = [];
    let x = a.x + Math.cos(angle) * a.radius * start;
    let y = a.y + Math.sin(angle) * a.radius * start;
    for (let j = 0; j <= steps; j++) {
      const u = j / steps;
      const r = a.radius * (start + (reach - start) * u);
      const theta = angle + 0.32 * Math.sin(u * 5.8 + phase) + 0.19 * Math.sin(u * 10.2 - phase);
      if (j) {
        const desired = Math.atan2(a.y + Math.sin(theta) * r - y, a.x + Math.cos(theta) * r - x);
        const step = length / steps;
        let best = Infinity;
        let bx = x;
        let by = y;
        for (const turn of [0, -0.25, 0.25, -0.5, 0.5]) {
          const nx = x + Math.cos(desired + turn) * step;
          const ny = y + Math.sin(desired + turn) * step;
          const nr = Math.hypot(nx - a.x, ny - a.y);
          if (nr < Math.hypot(x - a.x, y - a.y)) continue;
          const score = ground(nx, ny) * 0.7 + Math.abs(turn) * 0.65;
          if (score < best) {
            best = score;
            bx = nx;
            by = ny;
          }
        }
        // Once beyond the cone, a lobe pools at uphill obstacles instead of climbing them.
        if (Math.hypot(x - a.x, y - a.y) > a.radius && ground(bx, by) > ground(x, y)) break;
        x = bx;
        y = by;
      }
      const tongue = 1 + 1.2 * Math.exp(-(((u - 0.89) / 0.18) ** 2));
      points.push({ x, y, width: width * (0.38 + 0.62 * u) * tongue });
    }
    if (points.length > 1) out.push({ points, length, strength: 1.1 + unit(seed, 860 + k) * 1.4 });
  }
  return out;
}

/** The lobes' field (0 off them): compact, with round caps; also the heat's mask for the view. */
export function lobeField(W: number, H: number, lobes: readonly LavaLobe[]): Float32Array {
  const field = new Float32Array(W * H);
  for (const lobe of lobes)
    for (let k = 1; k < lobe.points.length; k++) {
      const a = lobe.points[k - 1];
      const b = lobe.points[k];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const l2 = dx * dx + dy * dy;
      const w = Math.max(a.width, b.width);
      for (let y = Math.max(0, Math.floor(Math.min(a.y, b.y) - w)); y <= Math.min(H - 1, Math.ceil(Math.max(a.y, b.y) + w)); y++)
        for (let x = Math.max(0, Math.floor(Math.min(a.x, b.x) - w)); x <= Math.min(W - 1, Math.ceil(Math.max(a.x, b.x) + w)); x++) {
          const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / (l2 || 1)));
          const width = a.width + (b.width - a.width) * t;
          const d = Math.hypot(x - a.x - dx * t, y - a.y - dy * t) / width;
          if (d < 1) {
            const v = (1 - d * d) ** 0.65 * lobe.strength;
            const i = y * W + x;
            field[i] = Math.max(field[i], v);
          }
        }
    }
  return field;
}

// ------------------------------------------------------------------------------------- the volcano

export interface EruptAnatomy {
  x: number;
  y: number;
  datum: number;
  radius: number;
  height: number;
  summit: EruptSettings["summit"];
  phase: number;
  segments: Segment[];
  vents: Point[];
  length: number;
  lobes: LavaLobe[];
  /** How much of the prototype's rise it keeps under the map's ceiling (D226): 1 where it has the
   *  room (the prototype's volcano exactly); less, and it grows broader rather than taller. A
   *  fissure's share is worked out along its line (it is 1 here). */
  scale: number;
  /** The map's ceiling: it rises to it at most. */
  ceiling: number;
  /** Where it was asked to erupt, when the vent broke out on the flank instead (no room there). */
  asked?: Point;
}

/** Its radius, in tiles: half its Size when set, or the prototype's for its Power. */
export function ventRadius(s: EruptSettings): number {
  if (s.size != null) return s.size / 2;
  const summit = s.summit === "auto" ? autoSummit(s.power) : s.summit;
  return naturalSize(s.power) * 0.5 * (s.shape === "broad" ? 1.6 : s.mode === "vent" && summit !== "caldera" ? 0.74 : 1) * (s.mode === "fissure" ? 0.47 : 1);
}

/** The Size that follows Power (tiles across: what the options row shows until Size is set). */
export const naturalBreadth = (s: EruptSettings) => 2 * ventRadius({ ...s, size: null });

/** A drawn shape's span: the farthest apart two of its points are (tiles). */
export function shapeSpan(path: readonly Point[]): number {
  // (a long line's points, one in every few, are enough to find its farthest two)
  const every = Math.max(1, Math.floor(path.length / 96));
  const pts = path.filter((_, k) => k % every === 0 || k === path.length - 1);
  let far = 0;
  for (let a = 0; a < pts.length; a++)
    for (let b = a + 1; b < pts.length; b++) far = Math.max(far, Math.hypot(pts[a].x - pts[b].x, pts[a].y - pts[b].y));
  return far;
}

/** A fissure's breadth, tiles across (PLAN §20 D344, A6): the drawn shape sets its extent, and Size is
 *  for a vent's click. The breadth Power gives a fissure, never more than the shape's own span, so a
 *  small loop gives a small eruption whatever Size says; within the Size slider's range. The editor's
 *  fissure runs with it as its `size`, which its operation keeps. */
export function fissureBreadth(s: Pick<EruptSettings, "power" | "shape" | "summit">, path: readonly Point[]): number {
  const natural = 2 * ventRadius({ ...(s as EruptSettings), mode: "fissure", size: null });
  const b = Math.min(natural, shapeSpan(path));
  return Math.max(ERUPT_SIZE_MIN, Math.min(ERUPT_SIZE_MAX, Math.round(b / 2) * 2));
}

// ------------------------------------------------------------------------------- headroom (D226)

/** The least rise that still reads as a volcano with a peak: with less room than this at the vent,
 *  the eruption breaks out on the flank, where there is room. */
export const FLANK_ROOM = 4;
/** Why it cannot erupt there: at the map's ceiling, with no lower flank near. */
export const NO_ROOM_REASON = "No room to rise here";
/** How much broader it grows, at most, when it has to be lower (while Size follows Power): a little,
 *  so near the ceiling it stays a cone with a summit (item 14), not a broad mound. */
const BROADEN_MAX = 1.25;
/** A low volcano's summit stays a summit: its top level spans this many tiles at most (a peak's
 *  radius, a crater's rim). */
const SUMMIT_TOP = 3;
/** How much narrower a volcano already broad may grow, at most, to keep its summit (while Size
 *  follows Power). */
const NARROW_MIN = 0.6;

/** A crater's radius, in radii, and how deep it sinks under its rim (a share of the cone's height):
 *  a clear bowl at the summit (D321, item 14; the prototype's was a tenth of the height, often under
 *  two levels, so a crater read as a rounded top). */
const CRATER_R = 0.19;
const CRATER_DEPTH = 0.22;

/** The cone's profile at r (0 at its vent, 1 at its foot), by summit and shape: a vent's cone, its
 *  crater or caldera; a fissure's ridge (its line, not its summit, shapes it). */
export function coneProfile(s: Pick<EruptSettings, "shape">, summit: EruptSettings["summit"], r: number, fissure = false): number {
  const e = s.shape === "steep" ? (fissure ? 0.83 : 1.7) : 1.65;
  if (!fissure && summit === "caldera") return r < 0.43 ? 0.34 : r < 0.6 ? 0.34 + 0.48 * smooth((r - 0.43) / 0.17) : 0.82 * Math.max(0, 1 - (r - 0.6) / 0.65);
  if (!fissure && summit === "crater" && r < CRATER_R) {
    const rim = (1 - CRATER_R) ** e;
    return rim - CRATER_DEPTH * (1 - smooth(r / CRATER_R));
  }
  return Math.max(0, 1 - r) ** e;
}

/** A vent's profile at r (0 at its vent, 1 at its foot), by summit and shape. */
function ventProfile(s: EruptSettings, summit: EruptSettings["summit"], r: number): number {
  return coneProfile(s, summit, r);
}

/** How far a vent's apron of lava reaches, in radii, and how thick it is at most (levels): heavy flows
 *  spread it wider and thicker, but it stays a skirt under the cone (item 14: never a round plateau
 *  that turns the volcano into a mound). */
function apronOf(s: Pick<EruptSettings, "flows" | "power">): { reach: number; thick: number } {
  return s.flows === "heavy" ? { reach: 1.75, thick: 2 + s.power * 0.014 } : { reach: 1.25, thick: 0.8 };
}

/** How wide the top level of a vent `height` levels high is, in radii: the widest run of the profile
 *  within half a level of its highest (a peak's disk; a crater that shallow is all top; a caldera's
 *  rim). */
function topSpan(s: EruptSettings, summit: EruptSettings["summit"], height: number): number {
  let top = 0;
  for (let k = 0; k <= 650; k++) top = Math.max(top, ventProfile(s, summit, k / 500));
  const edge = top - 0.5 / Math.max(0.5, height);
  let widest = 0;
  let from = -1;
  for (let k = 0; k <= 650; k++) {
    const r = k / 500;
    const at = ventProfile(s, summit, r) >= edge;
    if (at && from < 0) from = r;
    if ((!at || k === 650) && from >= 0) {
      // (a peak's or a flat crater's top is a disk round the vent: its radius; a rim is a ring)
      widest = Math.max(widest, from === 0 ? r : r - from);
      from = -1;
    }
  }
  return widest;
}

/** The most the prototype's volcano rises above its datum on level ground (levels), whatever its
 *  flows do: its cone or rim, its apron, its ridges at their strongest. A bound, worked out along
 *  the radius (the prototype's own formula, the lobes' strongest). */
export function riseBound(s: EruptSettings, a: Pick<EruptAnatomy, "height" | "summit" | "lobes">): number {
  const fissure = s.mode === "fissure";
  const strength = a.lobes.reduce((v, l) => Math.max(v, l.strength), 0);
  let top = 0;
  for (let k = 0; k <= 260; k++) {
    const r = k / 100;
    const profile = coneProfile(s, a.summit, r, fissure);
    const { reach, thick } = apronOf(s);
    const apron = thick * Math.max(0, 1 - r / reach) ** 1.4;
    const ridge = s.ridges
      ? fissure
        ? (1 - smooth((r - 1.05) / 0.85)) * smooth((r - 0.34) / 0.32) * (0.8 + s.power * 0.022)
        : strength * (0.7 + s.power * 0.013) * smooth((r - (a.summit === "caldera" ? 0.6 : CRATER_R)) / 0.2)
      : 0;
    const basin = !fissure && r < (a.summit === "caldera" ? 0.6 : a.summit === "crater" ? CRATER_R : 0);
    const rise = basin ? a.height * profile : Math.max(a.height * profile, apron) + ridge;
    if (rise > top) top = rise;
  }
  return top;
}

/** The prototype's volcano on this ground (its anatomy, before the ceiling). */
function protoAnatomy(m: { W: number; H: number; heights: Uint8Array }, s: EruptSettings, intent: EruptIntent): EruptAnatomy {
  const x = intent.origin % m.W;
  const y = Math.floor(intent.origin / m.W);
  const p = s.power / 100;
  const summit = s.summit === "auto" ? autoSummit(s.power) : s.summit;
  const radius = ventRadius(s);
  const legacy = s.mode === "fissure" || summit === "caldera";
  const height = (2 + 18 * p) * (legacy ? (s.shape === "broad" ? 0.7 : 1) * (s.mode === "fissure" ? 0.75 : 1) : s.shape === "broad" ? 0.55 : 1.42);
  const segments: Segment[] = [];
  const vents: Point[] = [];
  let length = 0;
  if (s.mode === "fissure") {
    for (let k = 1; k < intent.path!.length; k++) {
      const a = intent.path![k - 1];
      const b = intent.path![k];
      const l = Math.hypot(b.x - a.x, b.y - a.y);
      if (l > 0.01) {
        segments.push({ a, b, length: l, along: length });
        length += l;
      }
    }
    if (length < 3) throw Error("Draw a longer fissure");
    const spacing = Math.max(7, radius * 0.72);
    const count = Math.max(2, Math.ceil(length / spacing));
    for (let k = 0; k <= count; k++) {
      const d = (length * k) / count;
      const seg = segments.find((v) => d <= v.along + v.length) ?? segments.at(-1)!;
      const t = (d - seg.along) / seg.length;
      vents.push({ x: seg.a.x + (seg.b.x - seg.a.x) * t, y: seg.a.y + (seg.b.y - seg.a.y) * t });
    }
  } else vents.push({ x, y });
  const a: EruptAnatomy = { x, y, radius, height, datum: m.heights[intent.origin], summit, phase: hash(s.seed, 71) * Math.PI * 2, segments, vents, length, lobes: [], scale: 1, ceiling: 22 };
  if (s.mode === "vent") a.lobes = lavaLobes(m.W, m.H, m.heights, a, s.seed, s.flows === "heavy");
  return a;
}

/** The tiles round its cone (r at most 1: the cone's edge wobbles by an eighth at most). */
function coreBox(m: { W: number; H: number }, a: EruptAnatomy): { x0: number; y0: number; x1: number; y1: number } {
  const reach = a.radius * 1.12;
  let x0 = Math.floor(a.x - reach);
  let x1 = Math.ceil(a.x + reach);
  let y0 = Math.floor(a.y - reach);
  let y1 = Math.ceil(a.y + reach);
  for (const seg of a.segments) {
    x0 = Math.min(x0, Math.floor(Math.min(seg.a.x, seg.b.x) - reach));
    x1 = Math.max(x1, Math.ceil(Math.max(seg.a.x, seg.b.x) + reach));
    y0 = Math.min(y0, Math.floor(Math.min(seg.a.y, seg.b.y) - reach));
    y1 = Math.max(y1, Math.ceil(Math.max(seg.a.y, seg.b.y) + reach));
  }
  return { x0: Math.max(0, x0), y0: Math.max(0, y0), x1: Math.min(m.W - 1, x1), y1: Math.min(m.H - 1, y1) };
}

/** Whether the prototype's volcano fits under the ceiling within its cone (r at most 1): no level
 *  of it there would be cut off, so it is the prototype's exactly. Quick answers first (its vent
 *  alone passes the ceiling; the highest ground under it with the most it adds stays below), the
 *  exact one (every tile, rounded as the plan rounds it) only between. */
function fits(m: { W: number; H: number; heights: Uint8Array }, s: EruptSettings, a: EruptAnatomy, keep: Uint8Array | null): boolean {
  const over = (t: number) => Math.round(Math.round(t * 4096) / 4096) > a.ceiling;
  if (s.mode === "vent") {
    const basin = a.summit === "caldera" || a.summit === "crater";
    const peak = a.summit === "caldera" ? 0.34 : a.summit === "crater" ? coneProfile(s, "crater", 0) : 1;
    const apron = basin ? 0 : apronOf(s).thick;
    if (!keep?.[a.y * m.W + a.x] && over(a.datum + Math.max(a.height * peak, apron))) return false;
  }
  const box = coreBox(m, a);
  let ground = s.mode === "vent" ? a.datum : 0;
  for (let y = box.y0; y <= box.y1; y++)
    for (let x = box.x0; x <= box.x1; x++) {
      const h = m.heights[y * m.W + x];
      if (h > ground) ground = h;
    }
  const bound = riseBound(s, a) + 1e-9;
  if (!over(ground + bound)) return true;
  const flows = lobeField(m.W, m.H, a.lobes);
  const floor = s.mode === "vent" ? a.datum : 0;
  for (let y = box.y0; y <= box.y1; y++)
    for (let x = box.x0; x <= box.x1; x++) {
      const i = y * m.W + x;
      // (a tile rises to its ground, or the vent's, and the most the volcano adds, at most)
      if (keep?.[i] || !over(Math.max(m.heights[i], floor) + bound)) continue;
      const f = eruptField(a, s, x, y);
      if (f.r > 1) continue;
      if (over(raiseAt(m, s, a, flows, f, i, m.heights[i], 1))) return false;
    }
  return true;
}

/** A vent on the flank near (x, y) with at least `need` levels of room under the ceiling: the
 *  nearest, the seed choosing among the nearly nearest (Try another breaks out elsewhere); null when
 *  there is none within reach. */
function flankVent(m: { W: number; H: number; heights: Uint8Array }, s: EruptSettings, x: number, y: number, need: number, ceiling: number, reach: number, keep: Uint8Array | null): number | null {
  let best: number | null = null;
  let bestScore = Infinity;
  const r = Math.ceil(reach);
  for (let dy = -r; dy <= r; dy++)
    for (let dx = -r; dx <= r; dx++) {
      const xx = x + dx;
      const yy = y + dy;
      if (xx < 2 || yy < 2 || xx > m.W - 3 || yy > m.H - 3) continue;
      const i = yy * m.W + xx;
      if (ceiling - m.heights[i] < need || keep?.[i]) continue;
      const d = Math.hypot(dx, dy);
      if (d > reach || d * 0.99 > bestScore) continue;
      const bucket = Math.floor(((Math.atan2(dy, dx) + Math.PI) / (Math.PI * 2)) * 12) % 12;
      const score = d * (1 + 0.3 * hash(s.seed, 940 + bucket));
      if (score < bestScore) {
        bestScore = score;
        best = i;
      }
    }
  return best;
}

/** The volcano an eruption raises here (D206, D226): the prototype's, where it has the room under
 *  the map's ceiling (`maxHeight`: the editor's one ceiling, D244). Where it hasn't, it keeps a
 *  peak within the room it has: every level it raises (cone, apron, ridges) scaled together, so
 *  its summit reaches the ceiling at most and is never pressed flat, and, while Size follows Power,
 *  broader rather than taller. With too little room at the vent itself (the top of an earlier
 *  volcano, say), it breaks out on the flank, the nearest place with room: overlapping eruptions
 *  build new cones on the flanks. A fissure keeps its line and rises less where the ground is high.
 *  `keep`: ground it leaves alone (the land above the layer showing, caves). */
export function eruptAnatomy(m: { W: number; H: number; heights: Uint8Array; maxHeight?: number; entities?: FullForceMap["entities"] }, s: EruptSettings, intent: EruptIntent, keep: Uint8Array | null = null): EruptAnatomy {
  validateErupt(s, m, intent);
  const ceiling = Math.min(22, m.maxHeight ?? 22);
  const kept = keep;
  let a = protoAnatomy(m, s, intent);
  a.ceiling = ceiling;
  if (s.mode === "fissure" || fits(m, s, a, kept)) return a;
  let room = ceiling - a.datum;
  const need = Math.min(riseBound(s, a), FLANK_ROOM);
  if (room < need) {
    const at = flankVent(m, s, a.x, a.y, need, ceiling, Math.max(8, a.radius * 1.5), kept);
    if (at === null) throw Error(NO_ROOM_REASON);
    const asked = { x: a.x, y: a.y };
    a = protoAnatomy(m, s, { origin: at });
    a.ceiling = ceiling;
    a.asked = asked;
    if (fits(m, s, a, kept)) return a;
    room = ceiling - a.datum;
  }
  let k = Math.min(1, room / riseBound(s, a));
  if (k >= 1) return a;
  // with much less than its rise, Auto's summit is a peak (a crater or a caldera pressed into a few
  // levels reads as a flat top); a summit picked by hand stays as it is
  if (s.summit === "auto" && a.summit !== "peak" && k < 0.75) {
    a.summit = "peak";
    a.lobes = lavaLobes(m.W, m.H, m.heights, a, s.seed, s.flows === "heavy");
    k = Math.min(1, room / riseBound(s, a));
  }
  a.scale = k;
  a.height *= k;
  if (s.size == null) {
    // broader rather than taller, but never so broad that its low summit spreads into a plateau (a
    // volcano already broad may grow a little narrower instead, to keep its summit)
    const span = topSpan(s, a.summit, a.height);
    const broad = Math.max(NARROW_MIN, Math.min(Math.min(BROADEN_MAX, 1 / Math.sqrt(k)), span > 0 ? SUMMIT_TOP / (a.radius * span) : BROADEN_MAX));
    a.radius *= broad;
    a.lobes = lavaLobes(m.W, m.H, m.heights, a, s.seed, s.flows === "heavy");
  }
  return a;
}

/** A fissure's share of its rise at a tile whose line stands on `local` (D226): all of it where the
 *  line has room under the ceiling, less where the ground is high. */
function fissureScale(a: EruptAnatomy, bound: number, local: number): number {
  return Math.min(1, Math.max(0, a.ceiling - local) / bound);
}

/** The ground the prototype raises at tile `i` (unrounded, before the ceiling), its rise scaled by
 *  `k` (1: the prototype's own, exactly): a vent's apron and ridges (its cone's height is fitted in
 *  its anatomy already), a fissure's whole rise at this point of its line. */
function raiseAt(m: { W: number; heights: Uint8Array }, s: EruptSettings, a: EruptAnatomy, flows: Float32Array, f: ReturnType<typeof eruptField>, i: number, h: number, k: number): number {
  const r = f.r;
  const local = m.heights[Math.round(f.cy) * m.W + Math.round(f.cx)];
  const datum = s.mode === "vent" ? a.datum : local;
  let profile = coneProfile(s, a.summit, r, s.mode === "fissure");
  if (s.mode === "fissure") {
    const bowl = 1 - smooth(f.ventDistance / Math.max(2.4, a.radius * 0.19));
    profile = Math.max(0, profile - bowl * (a.summit === "caldera" ? 0.4 : a.summit === "peak" ? 0.12 : 0.27));
  }
  const shoulder = smooth((r - 0.48) / 0.7);
  const cone = datum + (k === 1 || s.mode === "vent" ? a.height : a.height * k) * profile + (h - datum) * shoulder;
  // a fitted volcano's lava runs downhill from its vent: its apron and ridges never pile onto higher
  // ground (an older cone's upper slopes, pressed against the ceiling, would become a mesa)
  const flowsHere = k === 1 && s.mode === "fissure" ? 1 : s.mode === "vent" && (a.scale < 1 || a.asked) && h > datum ? 0 : 1;
  const { reach, thick } = apronOf(s);
  // (a vent's apron is thickest where its lava lobes run: flows down its sides, never a round skirt)
  const lobed = s.mode === "vent" && a.lobes.length ? 0.7 + 0.3 * Math.min(1, flows[i] / 1.1) : 1;
  const apron = thick * Math.max(0, 1 - r / reach) ** 1.4 * (0.86 + 0.14 * Math.sin(f.theta * 4 + a.phase + r)) * lobed * k * flowsHere;
  const ridge = s.ridges
    ? (s.mode === "fissure"
        ? f.ridge * (1 - smooth((r - 1.05) / 0.85)) * smooth((r - 0.34) / 0.32) * (0.8 + s.power * 0.022)
        : flows[i] * (0.7 + s.power * 0.013) * smooth((r - (a.summit === "caldera" ? 0.6 : CRATER_R)) / 0.2) * (1 - smooth((r - reach * 0.7) / (reach * 0.3)))) *
      k *
      flowsHere
    : 0;
  let target = Math.max(h, cone, h + apron) + ridge;
  // Keep broad summit basins open; flow ridges begin below the rim.
  if (s.mode === "vent" && r < (a.summit === "caldera" ? 0.6 : a.summit === "crater" ? CRATER_R : 0)) target = Math.max(h, cone);
  return target;
}

export function eruptField(a: EruptAnatomy, s: EruptSettings, x: number, y: number) {
  let cx = a.x;
  let cy = a.y;
  let along = 0;
  let distance = Infinity;
  for (const seg of a.segments) {
    const dx = seg.b.x - seg.a.x;
    const dy = seg.b.y - seg.a.y;
    const t = clamp(((x - seg.a.x) * dx + (y - seg.a.y) * dy) / (seg.length * seg.length), 0, 1);
    const xx = seg.a.x + dx * t;
    const yy = seg.a.y + dy * t;
    const d = Math.hypot(x - xx, y - yy);
    if (d < distance) {
      distance = d;
      cx = xx;
      cy = yy;
      along = seg.along + t * seg.length;
    }
  }
  const theta = Math.atan2(y - cy, x - cx);
  const edge = 1 + 0.07 * Math.sin(theta * 3 + a.phase) + 0.045 * Math.sin(theta * 5 - a.phase);
  const r = Math.hypot(x - cx, y - cy) / (a.radius * edge);
  const wave = s.mode === "vent" ? theta * (6 + Math.floor(hash(s.seed, 20) * 4)) + a.phase + r * 0.9 : along / (3 + hash(s.seed, 20) * 2) + a.phase + r * 0.8;
  const ridge = Math.max(0, Math.cos(wave)) ** 8;
  let nearest = Infinity;
  let vent = a.vents[0];
  for (const v of a.vents) {
    const d = Math.hypot(x - v.x, y - v.y);
    if (d < nearest) {
      nearest = d;
      vent = v;
    }
  }
  return { r, theta, ridge, cx, cy, along, vent, ventDistance: nearest };
}

/** An eruption planned a few rows at a time (`advance`), on its own copy of the map. `keep` adds
 *  ground it leaves alone (the land above the layer showing, an imported map's caves). */
export class EruptPlan {
  readonly map: FullForceMap;
  readonly anatomy: EruptAnatomy;
  readonly keep: Uint8Array;
  readonly flows: Float32Array;
  readonly stats = { raised: 0, changed: 0, flattened: 0, erased: 0, hard: 0 };
  private row = 0;
  private done = false;

  /** A fissure's bound on its rise, when its line needs its share of it (D226; 0: all of it). */
  private readonly bound: number;
  /** How strongly it rises (D361 (3): 1 unless its Size outgrows its Power). */
  readonly strength: number;

  constructor(
    readonly before: FullForceMap,
    readonly settings: EruptSettings,
    readonly intent: EruptIntent,
    extraKeep: Uint8Array | null = null,
  ) {
    validateErupt(settings, before, intent);
    this.anatomy = eruptAnatomy(before, settings, intent, extraKeep);
    // (the start's ground is nature's to change: the start is carried off it, D257)
    this.keep = new Uint8Array(before.W * before.H);
    if (extraKeep) for (let i = 0; i < extraKeep.length; i++) if (extraKeep[i]) this.keep[i] = 1;
    this.map = snapshotMap(before);
    this.flows = lobeField(before.W, before.H, this.anatomy.lobes);
    // (a fissure that fits keeps all of its rise everywhere, as the prototype's)
    const a = this.anatomy;
    this.bound = settings.mode === "fissure" && !fits(before, settings, a, this.keep) ? riseBound(settings, a) : 0;
    this.strength = strength(settings.power, settings.size ?? null, naturalBreadth(settings));
  }

  get planned(): boolean {
    return this.done;
  }

  /** Plan `rows` more rows; true once the whole volcano is planned. */
  advance(rows = 4): boolean {
    if (this.done) return true;
    const { W, H } = this.map;
    const a = this.anatomy;
    const s = this.settings;
    const end = Math.min(H, this.row + Math.max(1, Math.floor(rows)));
    for (let y = this.row; y < end; y++)
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        const h = this.before.heights[i];
        if (this.keep[i]) continue;
        const f = eruptField(a, s, x, y);
        if (f.r > 2.6) continue;
        const k = this.bound ? fissureScale(a, this.bound, this.before.heights[Math.round(f.cy) * W + Math.round(f.cx)]) : a.scale;
        let target = raiseAt(this.before, s, a, this.flows, f, i, h, k);
        // Size and Power (D361 (3)): broader than Power's own volcano, it rises in proportion
        target = tempered(h, target, this.strength);
        target = clamp(Math.round(Math.round(target * 4096) / 4096), 0, Math.min(22, this.map.maxHeight));
        this.map.heights[i] = target;
        if (target !== h) {
          this.stats.changed++;
          this.stats.raised += target - h;
          for (let z = h; z < target; z++) this.map.lava[i] |= 1 << z;
          this.stats.hard++;
        }
      }
    this.row = end;
    if (end < H) return false;
    this.despeckle();
    this.finishObjects();
    this.done = true;
    return true;
  }

  /** Its surface reads as rock, never single-tile noise (item 14): a raised tile standing alone above
   *  all four neighbours, or sunk alone below them, takes its neighbours' level (twice over, so a pair
   *  settles too); the crater and the vent's own ground are left as they are. */
  private despeckle(): void {
    const { W, H } = this.map;
    const h = this.map.heights;
    const b = this.before.heights;
    const a = this.anatomy;
    for (let pass = 0; pass < 2; pass++)
      for (let y = 1; y < H - 1; y++)
        for (let x = 1; x < W - 1; x++) {
          const i = y * W + x;
          if (h[i] === b[i] || this.keep[i]) continue;
          // (the summit is its own: a peak's tip stands above everything round it by design)
          if (a.vents.some((v) => Math.hypot(x - v.x, y - v.y) < Math.max(2.5, a.radius * 0.15))) continue;
          const n = [h[i - 1], h[i + 1], h[i - W], h[i + W]];
          const lo = Math.min(...n);
          const hi = Math.max(...n);
          let v = h[i];
          if (v > hi) v = hi;
          else if (v < lo && Math.hypot(x - a.x, y - a.y) > a.radius * CRATER_R * 1.2) v = lo;
          if (v === h[i]) continue;
          v = Math.max(v, b[i]);
          h[i] = v;
          this.map.lava[i] &= v >= 31 ? 0xffffffff : (1 << v) - 1;
          for (let z = b[i]; z < v; z++) this.map.lava[i] |= 1 << z;
        }
  }

  private finishObjects(): void {
    const a = this.anatomy;
    const s = this.settings;
    const m = this.map;
    m.fallen = m.fallen.map((f) => ({ ...f, z: m.heights[clamp(Math.floor(f.y), 0, m.H - 1) * m.W + clamp(Math.floor(f.x), 0, m.W - 1)] }));
    m.entities = m.entities.filter((e) => {
      const tile = e.y * m.W + e.x;
      // (the start is the editor's: carried to level ground when its own breaks, D257)
      if (this.keep[tile] || e.template === "StartingLocation") return true;
      const f = eruptField(a, s, e.x, e.y);
      const plant = /^(Pine|Oak|Birch|Succulent|BlueberryBush)$/.test(e.template);
      if (!EMITTERS[e.template] && f.ventDistance < Math.max(1.5, a.radius * 0.065)) {
        this.stats.erased++;
        m.fallen = m.fallen.filter((v) => v.id !== e.id);
        return false;
      }
      if (plant && f.ventDistance < a.radius * 0.72) {
        if (e.template === "BlueberryBush" || e.template === "Succulent") {
          this.stats.erased++;
          return false;
        }
        const d = Math.hypot(e.x - f.vent.x, e.y - f.vent.y) || 1;
        m.fallen = m.fallen.filter((v) => v.id !== e.id);
        m.fallen.push({ id: e.id, x: e.x + 0.5, y: e.y + 0.5, z: m.heights[tile], dx: (e.x - f.vent.x) / d, dy: (e.y - f.vent.y) / d, length: e.template === "Oak" ? 2.6 : 2 });
        e.components = { ...e.components, LivingNaturalResource: { IsDead: true } };
        delete e.raw;
        this.stats.flattened++;
      }
      // Rigid footprints ride a supporting terrace, instead of leaving one corner hanging.
      const tiles = footprint(m, e);
      const height = Math.max(...tiles.map((i) => m.heights[i]));
      if (tiles.some((i) => this.keep[i] && m.heights[i] !== height)) return true;
      if (!plant)
        for (const i of tiles) {
          const prior = m.heights[i];
          m.heights[i] = height;
          for (let z = prior; z < height; z++) m.lava[i] |= 1 << z;
        }
      const z = plant ? m.heights[tile] : height;
      if (e.z !== z) delete e.raw;
      e.z = z;
      return true;
    });
  }
}

/** A whole eruption at once (tests, Claude's step). */
export function erupt(m: FullForceMap, s: EruptSettings, intent: EruptIntent, keep: Uint8Array | null = null): EruptPlan {
  const p = new EruptPlan(m, s, intent, keep);
  while (!p.advance(8)) {
    // planned a slice at a time
  }
  return p;
}

/** The eruption at `t` (0–1) of its swell: every raised tile a share of the way up (whole levels),
 *  objects on their ground then. */
export function stageMap(before: FullForceMap, after: FullForceMap, t: number): FullForceMap {
  const m = snapshotMap(after);
  for (let i = 0; i < m.heights.length; i++) m.heights[i] = Math.round(before.heights[i] + (after.heights[i] - before.heights[i]) * smooth(t));
  m.entities = m.entities.map((e) => ({ ...e, z: m.heights[e.y * m.W + e.x] }));
  m.fallen = m.fallen.map((f) => ({ ...f, z: m.heights[Math.floor(f.y) * m.W + Math.floor(f.x)] }));
  return m;
}
