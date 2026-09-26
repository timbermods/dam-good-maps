// Terrain rasterizers (PLAN §19.8 steps 2–7): landforms, lakes, rivers, the start bench, sculpt
// edits and the integrity pass. Each writes only the target's region, tile by tile, and reports the
// rectangle it can touch (`footprint`) so an edit rebuilds only that area (PLAN §19.7).

import { fbm } from "../../math/noise";
import { hash32 } from "../../math/hash";
import type { Runs } from "../../math/grid";
import { bedAt, floorAt, polygonMask, segmentDistance2 } from "../geometry";
import { carveChannel, channelBounds, type ChannelPlan } from "../route";
import type { Edge, Feature, LakeFeature, LandformFeature, RiverFeature, StartFeature } from "../schema";
import { boundsOf, clipRect, type BuildTarget, type Rect } from "../target";
import { carveBounds, isCarve, type CarveParams } from "../../forces/carve/op";
import { applyBrush, brushBounds, brushReadsNeighbours, type BrushParams } from "./brush";

export const MAX_TERRAIN = 16; // PLAN §20, D4

// ------------------------------------------------------------------------------------ landforms

export function rasterizeLandform(f: LandformFeature, t: BuildTarget): void {
  const p = f.params;
  const { heights } = t;
  if (p.along) {
    const river = t.river(p.along.river);
    if (!river) return t.note(`landform ${f.id}: river ${p.along.river} not found`);
    const field = t.pathField(p.along.river);
    const hw = p.along.halfWidth;
    if (p.kind === "valley") {
      // the valley floor: the floodplain level of the nearest river reach, out past any wiggle
      const floorAbove = p.along.floorAboveBed;
      t.forEach((i) => {
        if (field.d[i] < hw + 8 && t.writable(i, f)) heights[i] = floorAt(river.params, field.s[i], floorAbove);
      });
      return;
    }
    if (p.kind === "terraces") {
      const along = p.along;
      const side = along.side ?? 1;
      const bands = along.bands ?? [];
      const wob = along.wobble ?? { amp: 0, cell: 24, amp2: 0, cell2: 8 };
      const base = along.baseLevel ?? 0;
      const maxLevel = Math.min(MAX_TERRAIN, along.maxLevel ?? MAX_TERRAIN);
      const s1 = hash32(t.seed, f.id, "wobble");
      const s2 = hash32(t.seed, f.id, "wobble2");
      t.forEach((i, x, y) => {
        if (field.side[i] !== side || !t.writable(i, f)) return;
        const dn = field.d[i] + wob.amp * fbm(s1, x, y, wob.cell, 3) + wob.amp2 * fbm(s2, x, y, wob.cell2, 3);
        const out = dn - hw;
        if (out <= 0) return;
        let lift = 0;
        for (const b of bands) if (out > b.at) lift += b.rise;
        const floor = floorAt(river.params, field.s[i], along.floorAboveBed);
        heights[i] = Math.min(maxLevel, Math.max(floor, base + lift));
      });
      return;
    }
  }
  if (p.outline && p.height !== undefined) {
    const level = Math.min(MAX_TERRAIN, p.height);
    const step = edgeStep(p);
    // a landform the player drew stands on the ground: it raises it, or lowers it, never both
    const lowers = p.kind === "canyon" || p.kind === "valley";
    const put = (i: number, v: number) => {
      heights[i] = !p.onGround ? v : lowers ? Math.min(heights[i], v) : Math.max(heights[i], v);
    };
    if (!step) {
      const mask = polygonMask(p.outline, t.W, t.H);
      t.forEach((i) => {
        if (mask[i] && t.writable(i, f)) put(i, level);
      });
      return;
    }
    // gentle and terraced edges: 1-level steps from the base toward the height, one every `step`
    // tiles in from the outline (PLAN §19.2)
    const inward = t.inward(p.outline);
    const base = Math.min(MAX_TERRAIN, p.base!);
    t.forEach((i) => {
      const d = inward[i];
      if (d <= 0 || !t.writable(i, f)) return;
      put(i, landformLevel(level, base, step, d));
    });
    return;
  }
  t.note(`landform ${f.id} (${p.kind}) has no shape this version can build`);
}

/** A gentle or terraced landform's level `d` tiles in from its outline (d ≥ 1): one level more
 *  (or less) every `step` tiles from the base, up (or down) to its height. */
export function landformLevel(level: number, base: number, step: number, d: number): number {
  const k = Math.floor((d - 1) / step);
  return level >= base ? Math.min(level, base + 1 + k) : Math.max(level, base - 1 - k);
}


/** Tiles between 1-level steps of a landform's edge: gentle 3, terraced its band depth (6–12);
 *  0 for a cliff (or a landform with no base). */
export function edgeStep(p: LandformFeature["params"]): number {
  if (p.base === undefined || p.edgeStyle === "cliff") return 0;
  return p.edgeStyle === "gentle" ? 3 : (p.bandDepth ?? 8);
}

// ---------------------------------------------------------------------------------- lakes, rivers

/** A lake's outlet channel, when it has one. */
export function lakeOutlet(f: LakeFeature): ChannelPlan | null {
  const o = f.params.outlet;
  if (!o.path || !o.levels || !o.width) return null;
  return { tiles: o.path, levels: o.levels, width: o.width, to: o.target ?? o.to };
}

/** Lakes (step 4). A planned basin follows its river: its floor is the floodplain (PLAN §9.1). A
 *  lake of its own fills to its outlet sill (settled water is flat): its floor lies `floorDepth`
 *  below the sill, a rim two tiles wide round it stands at least one level above the sill, and its
 *  outlet channel cuts the rim at the sill and carries the water away. */
export function rasterizeLake(f: LakeFeature, t: BuildTarget): void {
  const { heights, W, H } = t;
  const mask = polygonMask(f.params.outline, W, H);
  const river = f.params.river ? t.river(f.params.river) : undefined;
  const field = river ? t.pathField(river.id) : undefined;
  if (river && field) {
    t.forEach((i) => {
      if (!mask[i] || t.protectedMask[i] || !t.writable(i, f)) return;
      heights[i] = floorAt(river.params, field.s[i], f.params.floorDepth);
    });
    return;
  }
  const sill = f.params.outlet.sill;
  const floor = Math.max(0, sill - f.params.floorDepth);
  t.forEach((i, x, y) => {
    if (mask[i] || t.protectedMask[i] || !t.writable(i, f) || heights[i] > sill) return;
    for (let dy = -2; dy <= 2; dy++)
      for (let dx = -2; dx <= 2; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < W && ny < H && mask[ny * W + nx]) {
          heights[i] = Math.min(MAX_TERRAIN, sill + 1);
          return;
        }
      }
  });
  const out = lakeOutlet(f);
  if (out) carveChannel(out, t, f, (i) => mask[i] === 1);
  t.forEach((i) => {
    if (mask[i] && !t.protectedMask[i] && t.writable(i, f)) heights[i] = floor;
  });
  // islands rise from the floor, a cliff round each
  for (const isl of f.params.islands ?? []) {
    const m = polygonMask(isl.outline, W, H);
    const level = Math.min(MAX_TERRAIN, isl.height);
    t.forEach((i) => {
      if (m[i] && mask[i] && !t.protectedMask[i] && t.writable(i, f)) heights[i] = level;
    });
  }
}

/** The channel's half-width at arc position s: the river's own, or a gorge's narrows. */
export function halfAt(f: RiverFeature, narrows: readonly { from: number; to: number; half: number }[], s: number): number {
  let half = f.params.width / 2;
  for (const n of narrows) if (s >= n.from && s <= n.to && n.half < half) half = n.half;
  return half;
}

/** Rivers (step 4): the channel carved at the bed profile's level. A river drawn in the editor
 *  (`banks`) also raises the ground beside its channel to its banks, bed + bedDepth, where the
 *  terrain is lower, so its water stays in the channel whatever it crosses. */
export function rasterizeRiver(f: RiverFeature, t: BuildTarget): void {
  const { heights, channel, W, H } = t;
  const field = t.pathField(f.id);
  const narrows = t.narrows(f.id);
  const banks = f.params.banks === true;
  // the lakes it flows from or into keep their own floor
  let lakes: Uint8Array | null = null;
  if (banks) {
    for (const end of [f.params.entry, f.params.exit]) {
      if (!("lake" in end)) continue;
      const lake = t.feature(end.lake);
      if (lake?.kind !== "lake") continue;
      const m = polygonMask(lake.params.outline, W, H);
      if (!lakes) lakes = m;
      else for (let i = 0; i < m.length; i++) if (m[i]) lakes[i] = 1;
    }
  }
  t.forEach((i) => {
    const d = field.d[i];
    const half = narrows.length ? halfAt(f, narrows, field.s[i]) : f.params.width / 2;
    if (d < half) {
      if (!t.writable(i, f)) return;
      heights[i] = bedAt(f.params.bedProfile, field.s[i]);
      channel[i] = 1;
    } else if (banks && d < half + 1 && !channel[i] && !t.protectedMask[i] && !lakes?.[i] && t.writable(i, f)) {
      const bank = Math.min(MAX_TERRAIN, bedAt(f.params.bedProfile, field.s[i]) + f.params.bedDepth);
      if (heights[i] < bank) heights[i] = bank;
    }
  });
}

/** Channel tiles on the map border where the river enters (its sealed mouth, PLAN §7.6). */
export function mouthTiles(f: RiverFeature, t: Pick<BuildTarget, "W" | "H" | "pathField" | "narrows">): number[] {
  const entry = f.params.entry;
  if (!("edge" in entry)) return [];
  const { W, H } = t;
  const field = t.pathField(f.id);
  const narrows = t.narrows(f.id);
  const out: number[] = [];
  const border = (x: number, y: number) => {
    const i = y * W + x;
    if (field.d[i] < (narrows.length ? halfAt(f, narrows, field.s[i]) : f.params.width / 2)) out.push(i);
  };
  const edge: Edge = entry.edge;
  if (edge === "west") for (let y = 0; y < H; y++) border(0, y);
  else if (edge === "east") for (let y = 0; y < H; y++) border(W - 1, y);
  else if (edge === "south") for (let x = 0; x < W; x++) border(x, 0);
  else for (let x = 0; x < W; x++) border(x, H - 1);
  return out;
}

/** The channel tiles a spring-fed river's sources stand on: the ones nearest its spring, enough
 *  that none carries more than 8 blocks per second (the game's cap per tile). */
export function springTiles(f: RiverFeature, t: Pick<BuildTarget, "W" | "H" | "pathField">): number[] {
  const entry = f.params.entry;
  if (!("spring" in entry)) return [];
  const { W, H } = t;
  const field = t.pathField(f.id);
  const half = f.params.width / 2;
  const [sx, sy] = entry.spring;
  const n = Math.max(1, Math.ceil(f.params.flow / 8));
  const near: [number, number][] = [];
  const r = Math.ceil(half) + 3;
  for (let y = Math.max(0, Math.floor(sy) - r); y <= Math.min(H - 1, Math.ceil(sy) + r); y++)
    for (let x = Math.max(0, Math.floor(sx) - r); x <= Math.min(W - 1, Math.ceil(sx) + r); x++) {
      const i = y * W + x;
      if (field.d[i] < half) near.push([(x - sx) * (x - sx) + (y - sy) * (y - sy), i]);
    }
  near.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  return near.slice(0, n).map(([, i]) => i);
}

/** The basin tile a lake's spring stands on: the one nearest the outline's middle. */
export function lakeSpringTile(f: LakeFeature, W: number, H: number): number | null {
  const inflow = f.params.inflow;
  if (!("spring" in inflow) || !(inflow.spring > 0) || f.params.planned) return null;
  const mask = polygonMask(f.params.outline, W, H);
  let sx = 0;
  let sy = 0;
  for (const [x, y] of f.params.outline) {
    sx += x;
    sy += y;
  }
  sx /= f.params.outline.length;
  sy /= f.params.outline.length;
  let best = -1;
  let bd = Infinity;
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i]) continue;
    const x = i % W;
    const y = (i - x) / W;
    const d = (x - sx) * (x - sx) + (y - sy) * (y - sy);
    if (d < bd) {
      bd = d;
      best = i;
    }
  }
  return best >= 0 ? best : null;
}

// ----------------------------------------------------------------------------------------- start

/** Half the width of the strip a bench runs to its bank along (D97): a strip about 3 tiles wide.
 *  Neither the generator nor the editor makes one since the water rule changed (Kyler,
 *  2026-09-25, D153); a start saved with one keeps it. */
export const BANK_HALF_WIDTH = 1.5;

/** Whether tile (x, y) is part of the start's bench: the disc of its radius round the start, and
 *  the strip from the start to its bank (a point on a river's course), when it has one. */
export function inBench(f: StartFeature, x: number, y: number): boolean {
  const [cx, cy] = f.params.position;
  const r = f.params.benchRadius;
  if ((x - cx) * (x - cx) + (y - cy) * (y - cy) <= r * r) return true;
  const bank = f.params.bank;
  return !!bank && segmentDistance2(x, y, f.params.position, bank) <= BANK_HALF_WIDTH * BANK_HALF_WIDTH;
}

/** The start bench (step 5): its disc, and in a project saved before the water rule changed
 *  (D153) the strip that runs it to the bank (D97). It never fills the river channel,
 *  which it would dam. */
export function rasterizeBench(f: StartFeature, t: BuildTarget): void {
  t.forEach((i, x, y) => {
    if (inBench(f, x, y) && !t.channel[i] && t.writable(i, f)) {
      t.heights[i] = f.params.benchLevel;
      t.protect(i);
    }
  });
}

// ---------------------------------------------------------------------------------------- sculpt

/** A sculpt edit (cells with a mode) or a brush stroke (dabs with a brush, raster/brush.ts). */
export interface SculptEdit {
  params: { mode: string; cells: Runs; amount?: number; level?: number; step?: number } | BrushParams | CarveParams;
}

function isBrush(p: SculptEdit["params"]): p is BrushParams {
  return "dabs" in p;
}

/** A sculpt's tiles' bounds; a carve's need the map's width (its tiles are indices). */
export function sculptBounds(s: SculptEdit, W = 0): Rect | null {
  if (isBrush(s.params)) return brushBounds(s.params, Infinity, Infinity);
  if (isCarve(s.params)) return carveBounds(s.params, W);
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const [y, a, b] of s.params.cells) {
    if (a < x0) x0 = a;
    if (b > x1) x1 = b;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  return x0 <= x1 ? { x0, y0, x1, y1 } : null;
}

/** Brushes that read neighbouring cells: a rebuild that touches their cells rebuilds all of them. */
export function sculptReadsNeighbours(s: SculptEdit): boolean {
  if (isCarve(s.params)) return false;
  return isBrush(s.params) ? brushReadsNeighbours(s.params) : s.params.mode === "smooth";
}

/** Apply one sculpt edit or brush stroke (step 6) to the region's cells. Heights stay within
 *  0–16, the in-game editor's range (the brushes are defined that way, like the game's own).
 *  `keep(i)` names tiles every tool leaves alone (an imported map's caves). */
export function applySculpt(s: SculptEdit, t: BuildTarget, keep?: (i: number) => boolean): void {
  const { W, heights } = t;
  if (isCarve(s.params)) {
    // a force's result, literally (D194): its tiles take their levels, and the integrity pass leaves
    // them as they are
    const p = s.params;
    for (let k = 0; k < p.tiles.length; k++) {
      const i = p.tiles[k];
      if (!t.inRegion(i) || keep?.(i)) continue;
      heights[i] = p.heights[k];
      t.protectedMask[i] = 1;
    }
    return;
  }
  if (isBrush(s.params)) {
    const b = brushBounds(s.params, W, t.H);
    if (!b || !t.touchesRegion(b)) return;
    const was = s.params.precise ? heights.slice() : null;
    applyBrush(s.params, heights, W, t.H, keep ? (i) => t.inRegion(i) && !keep(i) : (i) => t.inRegion(i));
    // a precise stroke's tiles stay as it left them: the integrity pass leaves them out (a one-tile
    // pit stays a pit, D193)
    if (was) for (let y = b.y0; y <= b.y1; y++) for (let x = b.x0; x <= b.x1; x++) {
      const i = y * W + x;
      if (heights[i] !== was[i] && t.inRegion(i)) t.protectedMask[i] = 1;
    }
    return;
  }
  const p = s.params;
  if (p.mode === "smooth") {
    // the median of each cell's 3×3 neighbours inside the brush, read before the brush applies
    const inBrush = new Map<number, number>();
    for (const [y, a, b] of p.cells) for (let x = a; x <= b; x++) inBrush.set(y * W + x, heights[y * W + x]);
    const out: [number, number][] = [];
    for (const [y, a, b] of p.cells) {
      for (let x = a; x <= b; x++) {
        const i = y * W + x;
        if (!t.inRegion(i)) continue;
        const vals: number[] = [];
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const v = inBrush.get((y + dy) * W + (x + dx));
            if (v !== undefined && x + dx >= 0 && x + dx < W) vals.push(v);
          }
        vals.sort((m, n) => m - n);
        out.push([i, vals[vals.length >> 1]]);
      }
    }
    for (const [i, v] of out) heights[i] = v;
    return;
  }
  for (const [y, a, b] of p.cells) {
    for (let x = a; x <= b; x++) {
      const i = y * W + x;
      if (!t.inRegion(i)) continue;
      const h = heights[i];
      switch (p.mode) {
        case "raise":
          if (h < MAX_TERRAIN) heights[i] = Math.min(MAX_TERRAIN, h + (p.amount ?? 0));
          break;
        case "lower":
          heights[i] = Math.max(0, h - (p.amount ?? 0));
          break;
        case "flatten":
          heights[i] = p.level ?? h;
          break;
        case "terrace": {
          const step = p.step ?? 2;
          heights[i] = Math.floor(h / step) * step;
          break;
        }
        default:
          break;
      }
    }
  }
}

// ------------------------------------------------------------------------------------- integrity

/** Step 7 for the tiles of `tiles`: clip to the editor limit and remove single-tile pits and
 *  spikes off channels, reading the unclipped `pre` heights of the four neighbours through the same
 *  clip. `candidate(i)` says which tiles the pass may change. */
export function integrityAt(
  pre: Uint8Array,
  out: Uint8Array,
  W: number,
  H: number,
  prot: Uint8Array,
  channel: Uint8Array,
  candidate: (i: number) => boolean,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): void {
  const clip = (i: number) => (candidate(i) && pre[i] > MAX_TERRAIN ? MAX_TERRAIN : pre[i]);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const i = y * W + x;
      const v = clip(i);
      out[i] = v;
      if (x < 1 || y < 1 || x > W - 2 || y > H - 2 || prot[i] || channel[i] || !candidate(i)) continue;
      const a = clip(i - 1);
      const b = clip(i + 1);
      const c = clip(i - W);
      const d = clip(i + W);
      const lo = Math.min(a, b, c, d);
      const hi = Math.max(a, b, c, d);
      if (v < lo) out[i] = lo; // pit
      else if (v > hi) out[i] = hi; // spike
    }
  }
}

// ------------------------------------------------------------------------------------- footprints

/** The rectangle a terrain feature's rasterizer can write, "all", or null (none). */
export function terrainFootprint(f: Feature, t: Pick<BuildTarget, "W" | "H" | "river">): Rect | "all" | null {
  const { W, H } = t;
  switch (f.kind) {
    case "landform": {
      const p = f.params;
      if (p.along) {
        if (p.kind === "terraces") return "all";
        const river = t.river(p.along.river);
        if (!river) return null;
        const b = boundsOf(river.params.path);
        return b && clipRect(b, W, H, Math.ceil(p.along.halfWidth + 8) + 1);
      }
      const b = p.outline ? boundsOf(p.outline) : null;
      return b && clipRect(b, W, H, 1);
    }
    case "lake": {
      const pts: [number, number][] = f.params.outline.map(([x, y]) => [x, y]);
      const out = lakeOutlet(f);
      const c = out ? channelBounds(out) : null;
      if (c) pts.push([c.x0, c.y0], [c.x1, c.y1]);
      const b = boundsOf(pts);
      return b && clipRect(b, W, H, f.params.river ? 1 : 3);
    }
    case "river": {
      const b = boundsOf(f.params.path);
      return b && clipRect(b, W, H, Math.ceil(f.params.width / 2) + (f.params.banks ? 2 : 1));
    }
    case "start": {
      const [x, y] = f.params.position;
      const r = f.params.benchRadius + 1;
      const rect = { x0: x - r, y0: y - r, x1: x + r, y1: y + r };
      const bank = f.params.bank;
      if (bank) {
        const m = BANK_HALF_WIDTH + 1;
        rect.x0 = Math.min(rect.x0, Math.floor(bank[0] - m));
        rect.y0 = Math.min(rect.y0, Math.floor(bank[1] - m));
        rect.x1 = Math.max(rect.x1, Math.ceil(bank[0] + m));
        rect.y1 = Math.max(rect.y1, Math.ceil(bank[1] + m));
      }
      return clipRect(rect, W, H);
    }
    default:
      return null;
  }
}
