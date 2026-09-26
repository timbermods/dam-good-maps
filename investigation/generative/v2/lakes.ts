// Lake shapes and island seas (Kyler, 2026-09-25: "many round, blob-shaped lakes across themes, and
// Islands maps that don't clearly read as islands in a sea"). The measures were chosen before any
// result was read:
//
// A lake is a body of level water: 4-connected tiles 0.1+ deep whose surface lies within a quarter
// level of the body's deepest tile, of 60+ tiles at 128² (scaled with the map's area), not touching
// the map edge (a lake cut by the edge has no shape of its own). For each lake:
// - roundness: the isoperimetric quotient 4πA/P², P counted in tile edges (a digital disc scores
//   about 0.62, a long or ragged lake much less);
// - fill: A over the circle about the lake's centroid through its farthest tile;
// - elongation: the ratio of the lake's major to minor axis (second moments);
// - branching: its shoreline (P) over the perimeter of its convex hull (1 for a convex lake; arms
//   and bays raise it).
// Lakes are sorted into craters (inside a caldera's ring or a cone's crater, from the genome),
// ponds (under 150 tiles at 128²) and the rest; Kyler's crater and "waterfall into a round lake"
// intentions are meant to be round-ish, so the maps where they emerged are reported apart.
//
// Island seas, per map: the water share; the largest water body's share of the map; land in
// separate islands (land that is not in the largest land mass, over all land); islands of 30+ tiles
// (count and median size). A map reads as islands in a sea when water covers 35%+ of it, one body
// covers 25%+, 30%+ of the land lies apart from the largest land mass, and 3+ islands have 30+ tiles.
//
// Sources: the prototype's batch maps (their settled water, <ROOT>\maps), version 1's and the
// current generator's; the official and workshop maps (their steady-state water, local; only
// aggregates are written); the landscape survey's library (real terrain, settled as the bench
// does). Writes investigation/generative/lakes-v2.json (aggregates only).
//
//   npx tsx investigation/generative/v2/lakes.ts --sets v2-128,v1-128,cur-128 [--refs] [--survey]

/* eslint-disable @typescript-eslint/no-explicit-any */

import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { readTimber } from "../../../src/core/format/timber";
import { surfaceOf } from "../../../src/core/format/world";
import type { ThemeId } from "../../../src/core/spec/mapspec";
import { measureInput } from "../../landscapes/bench/measure";
import { listMaps } from "../../workshop/lib/paths";
import { loadMap } from "../../workshop/lib/load";
import { readSettled } from "../../workshop/lib/settled";
import { arg, lowPriority, MAPS } from "../lib/paths";
import { drawGenomeV2 } from "./genome";

const D4: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const r3 = (v: number) => Math.round(v * 1000) / 1000;

export interface LakeShape {
  area: number;
  roundness: number;
  fill: number;
  elongation: number;
  branching: number;
  cx: number;
  cy: number;
}

/** Convex hull perimeter of a set of points (monotone chain). */
function hullPerimeter(pts: [number, number][]): number {
  const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: [number, number], a: [number, number], b: [number, number]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: [number, number][] = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
    lower.push(q);
  }
  const upper: [number, number][] = [];
  for (let k = p.length - 1; k >= 0; k--) {
    const q = p[k];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
    upper.push(q);
  }
  const hull = lower.slice(0, -1).concat(upper.slice(0, -1));
  let per = 0;
  for (let k = 0; k < hull.length; k++) {
    const a = hull[k];
    const b = hull[(k + 1) % hull.length];
    per += Math.sqrt((a[0] - b[0]) * (a[0] - b[0]) + (a[1] - b[1]) * (a[1] - b[1]));
  }
  return per;
}

/** The lakes of a map (see the header). */
export function lakesOf(h: ArrayLike<number>, D: ArrayLike<number>, W: number, H: number): LakeShape[] {
  const N = W * H;
  const min = Math.round((60 * N) / 16384);
  const body = new Int32Array(N).fill(-1);
  const out: LakeShape[] = [];
  for (let s = 0; s < N; s++) {
    if (body[s] >= 0 || !(D[s] >= 0.1)) continue;
    // the water body
    const q = [s];
    body[s] = s;
    for (let k = 0; k < q.length; k++) {
      const i = q[k];
      const x = i % W;
      const y = (i - x) / W;
      for (const [dx, dy] of D4) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const j = yy * W + xx;
        if (body[j] >= 0 || !(D[j] >= 0.1)) continue;
        body[j] = s;
        q.push(j);
      }
    }
    if (q.length < min) continue;
    // the level part round its deepest tile
    let deep = q[0];
    for (const i of q) if (D[i] > D[deep] || (D[i] === D[deep] && i < deep)) deep = i;
    const surf = h[deep] + D[deep];
    const inL = new Uint8Array(N);
    const L = [deep];
    inL[deep] = 1;
    let edge = false;
    for (let k = 0; k < L.length; k++) {
      const i = L[k];
      const x = i % W;
      const y = (i - x) / W;
      if (x === 0 || y === 0 || x === W - 1 || y === H - 1) edge = true;
      for (const [dx, dy] of D4) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const j = yy * W + xx;
        if (inL[j] || !(D[j] >= 0.1) || Math.abs(h[j] + D[j] - surf) > 0.25) continue;
        inL[j] = 1;
        L.push(j);
      }
    }
    if (edge || L.length < min) continue;
    let P = 0;
    let cx = 0;
    let cy = 0;
    const corners: [number, number][] = [];
    for (const i of L) {
      const x = i % W;
      const y = (i - x) / W;
      cx += x;
      cy += y;
      let boundary = false;
      for (const [dx, dy] of D4) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H || !inL[yy * W + xx]) {
          P++;
          boundary = true;
        }
      }
      if (boundary) corners.push([x, y], [x + 1, y], [x, y + 1], [x + 1, y + 1]);
    }
    const A = L.length;
    cx /= A;
    cy /= A;
    let sxx = 0;
    let syy = 0;
    let sxy = 0;
    let rmax = 0;
    for (const i of L) {
      const dx = (i % W) - cx;
      const dy = Math.floor(i / W) - cy;
      sxx += dx * dx;
      syy += dy * dy;
      sxy += dx * dy;
      rmax = Math.max(rmax, Math.sqrt(dx * dx + dy * dy));
    }
    const a = sxx / A;
    const d = syy / A;
    const b = sxy / A;
    const tr = (a + d) / 2;
    const disc = Math.sqrt(((a - d) * (a - d)) / 4 + b * b);
    out.push({
      area: A,
      roundness: r3((4 * Math.PI * A) / (P * P)),
      fill: r3(A / (Math.PI * (rmax + 0.5) * (rmax + 0.5))),
      elongation: r3(tr - disc > 0 ? Math.sqrt((tr + disc) / (tr - disc)) : 99),
      branching: r3(P / hullPerimeter(corners)),
      cx,
      cy,
    });
  }
  return out;
}

export interface SeaStats {
  water: number;
  mainWater: number;
  apart: number;
  islands: number;
  islandMedian: number;
  reads: boolean;
}

/** An island sea's numbers (see the header). */
export function seaOf(D: ArrayLike<number>, W: number, H: number): SeaStats {
  const N = W * H;
  const wet = new Uint8Array(N);
  let w = 0;
  for (let i = 0; i < N; i++) if (D[i] >= 0.1) {
    wet[i] = 1;
    w++;
  }
  const comps = (want: number) => {
    const lab = new Int32Array(N).fill(-1);
    const sizes: number[] = [];
    for (let s = 0; s < N; s++) {
      if (lab[s] >= 0 || wet[s] !== want) continue;
      const q = [s];
      lab[s] = sizes.length;
      for (let k = 0; k < q.length; k++) {
        const i = q[k];
        const x = i % W;
        const y = (i - x) / W;
        for (const [dx, dy] of D4) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
          const j = yy * W + xx;
          if (lab[j] >= 0 || wet[j] !== want) continue;
          lab[j] = sizes.length;
          q.push(j);
        }
      }
      sizes.push(q.length);
    }
    return sizes.sort((p, q) => q - p);
  };
  const water = comps(1);
  const land = comps(0);
  const landTotal = N - w;
  const isl = land.slice(1).filter((s) => s >= 30);
  const med = isl.length ? isl.slice().sort((p, q) => p - q)[isl.length >> 1] : 0;
  const s: SeaStats = {
    water: r3(w / N),
    mainWater: r3((water[0] ?? 0) / N),
    apart: r3(landTotal ? (landTotal - (land[0] ?? 0)) / landTotal : 0),
    islands: isl.length,
    islandMedian: med,
    reads: false,
  };
  s.reads = s.water >= 0.35 && s.mainWater >= 0.25 && s.apart >= 0.3 && s.islands >= 3;
  return s;
}

// ------------------------------------------------------------------------------------ the sources

const band = (v: number[]) => {
  const s = v.filter(Number.isFinite).sort((a, b) => a - b);
  const q = (p: number) => (s.length ? s[Math.min(s.length - 1, Math.floor(p * (s.length - 1)))] : NaN);
  return { n: s.length, p10: r3(q(0.1)), median: r3(q(0.5)), p90: r3(q(0.9)) };
};
const shapeBands = (L: LakeShape[]) => ({
  lakes: L.length,
  roundness: band(L.map((l) => l.roundness)),
  fill: band(L.map((l) => l.fill)),
  elongation: band(L.map((l) => l.elongation)),
  branching: band(L.map((l) => l.branching)),
  /** Round lakes: roundness 0.5+ and elongation under 1.5. */
  roundShare: r3(L.filter((l) => l.roundness >= 0.5 && l.elongation < 1.5).length / Math.max(1, L.length)),
});
const seaBands = (S: SeaStats[]) => ({
  maps: S.length,
  water: band(S.map((s) => s.water)),
  mainWater: band(S.map((s) => s.mainWater)),
  apart: band(S.map((s) => s.apart)),
  islands: band(S.map((s) => s.islands)),
  islandMedian: band(S.map((s) => s.islandMedian)),
  reads: r3(S.filter((s) => s.reads).length / Math.max(1, S.length)),
});

/** Craters of a prototype map: its calderas' rings and its cones' craters, from its genome. */
function cratersOf(rec: any, W: number, H: number): { x: number; y: number; r: number }[] {
  const g = drawGenomeV2(rec.theme as ThemeId, rec.seed, W, H, Math.max(0, (rec.info?.genomes ?? 1) - 1), {
    variety: rec.genome?.variety,
    vt: rec.genome?.vtSetting,
    unlocked: rec.genome?.unlocked,
    intentions: rec.set?.includes("-i-") ? rec.genome?.intentions : undefined,
  });
  const out: { x: number; y: number; r: number }[] = [];
  for (const p of g.parts) {
    if (p.kind === "caldera") out.push({ x: p.at[0] * (W - 1), y: p.at[1] * (H - 1), r: p.size * 1.25 });
    if (p.kind === "cone" && p.extra > 0) out.push({ x: p.at[0] * (W - 1), y: p.at[1] * (H - 1), r: p.extra + 3 });
  }
  return out;
}

function generatedSet(set: string) {
  const dir = join(MAPS, set);
  const byClass: Record<string, LakeShape[]> = { lakes: [], craters: [], ponds: [], intentionMaps: [] };
  const byTheme: Record<string, LakeShape[]> = {};
  const seas: Record<string, SeaStats[]> = {};
  if (!existsSync(dir)) return null;
  for (const f of readdirSync(dir).filter((n) => /^[a-zA-Z]+-\d+\.json$/.test(n))) {
    const rec = JSON.parse(readFileSync(join(dir, f), "utf8"));
    const tp = join(dir, f.replace(/\.json$/, ".timber"));
    const fp = join(dir, f.replace(/\.json$/, ".f32"));
    if (!rec.passed || !existsSync(tp) || !existsSync(fp)) continue;
    const w = readTimber(new Uint8Array(readFileSync(tp))).world;
    const W = w.sizeX;
    const H = w.sizeY;
    const buf = readFileSync(fp);
    const D = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4).subarray(0, W * H);
    const h = surfaceOf(w);
    const L = lakesOf(h, D, W, H);
    (seas[rec.theme] ??= []).push(seaOf(D, W, H));
    const round = (rec.intentions ?? []).some((i: any) => i.ok && (i.id === "crater-rivers" || i.id === "cliff-falls-lake"));
    const craters = rec.gen === "proto2" ? cratersOf(rec, W, H) : [];
    const pond = (150 * W * H) / 16384;
    for (const l of L) {
      if (round) byClass.intentionMaps.push(l);
      else if (craters.some((c) => (l.cx - c.x) * (l.cx - c.x) + (l.cy - c.y) * (l.cy - c.y) <= c.r * c.r)) byClass.craters.push(l);
      else if (l.area < pond) byClass.ponds.push(l);
      else {
        byClass.lakes.push(l);
        (byTheme[rec.theme] ??= []).push(l);
      }
    }
  }
  return {
    classes: Object.fromEntries(Object.entries(byClass).map(([k, v]) => [k, shapeBands(v)])),
    byTheme: Object.fromEntries(Object.entries(byTheme).map(([k, v]) => [k, shapeBands(v)])),
    islands: seas.islands ? seaBands(seas.islands) : null,
    seasByTheme: Object.fromEntries(Object.entries(seas).map(([k, v]) => [k, seaBands(v)])),
  };
}

function refMaps() {
  const out: Record<string, { lakes: LakeShape[]; seas: SeaStats[]; named: Record<string, SeaStats> }> = {};
  for (const ref of listMaps()) {
    const l = loadMap(ref);
    if (!l.file) continue;
    const w = l.file.world;
    const s = readSettled(ref.key, w.sizeX * w.sizeY);
    if (!s) continue;
    const o = (out[ref.source] ??= { lakes: [], seas: [], named: {} });
    const pond = (150 * w.sizeX * w.sizeY) / 16384;
    o.lakes.push(...lakesOf(surfaceOf(w), s.depth, w.sizeX, w.sizeY).filter((x) => x.area >= pond));
    const sea = seaOf(s.depth, w.sizeX, w.sizeY);
    o.seas.push(sea);
    // the official Islands-like maps by name (official maps are public; workshop maps stay local)
    if (ref.source === "official" && /island|archipel/i.test(ref.key)) o.named[ref.key] = sea;
  }
  return Object.fromEntries(
    Object.entries(out).map(([src, o]) => [
      src,
      {
        lakes: shapeBands(o.lakes),
        seas: { islandSeas: o.seas.filter((s) => s.reads).length, maps: o.seas.length },
        named: src === "official" ? o.named : undefined,
      },
    ]),
  );
}

function survey() {
  const dir = join("investigation", "landscapes", "library");
  const all: LakeShape[] = [];
  const byFamily: Record<string, LakeShape[]> = {};
  const seas: Record<string, SeaStats[]> = {};
  for (const f of readdirSync(dir).filter((n) => n.endsWith(".json.gz"))) {
    const input = JSON.parse(gunzipSync(readFileSync(join(dir, f))).toString());
    const { water } = measureInput(input);
    const W = input.W;
    const H = input.H;
    const pond = (150 * W * H) / 16384;
    const L = lakesOf(input.heights, water.depth, W, H).filter((x) => x.area >= pond);
    all.push(...L);
    const fam = input.location?.family ?? "unknown";
    (byFamily[fam] ??= []).push(...L);
    (seas[fam] ??= []).push(seaOf(water.depth, W, H));
    console.log(`${f}: ${L.length} lakes`);
  }
  return {
    lakes: shapeBands(all),
    byFamily: Object.fromEntries(Object.entries(byFamily).map(([k, v]) => [k, shapeBands(v)])),
    archipelago: seas.archipelago ? seaBands(seas.archipelago) : null,
    seas: Object.fromEntries(Object.entries(seas).map(([k, v]) => [k, { maps: v.length, reads: v.filter((s) => s.reads).length }])),
  };
}

if (process.argv[1] && /lakes\.ts$/.test(process.argv[1])) {
  lowPriority();
  const path = join("investigation", "generative", "lakes-v2.json");
  const out: any = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : {};
  out.method = "investigation/generative/v2/lakes.ts: lakes (level water, 60+ tiles at 128², off the edge) by roundness 4πA/P², fill, elongation and branching; island seas by water share, the main body, land apart and islands of 30+ tiles. Chosen before any result was read.";
  out.sets ??= {};
  for (const s of arg("sets", "").split(",").filter(Boolean)) {
    const r = generatedSet(s);
    if (r) out.sets[s] = r;
    console.log(`measured ${s}`);
  }
  if (process.argv.includes("--refs")) out.refs = refMaps();
  if (process.argv.includes("--survey")) out.survey = survey();
  writeFileSync(path, JSON.stringify(out, null, 1) + "\n");
  console.log(`wrote ${path}`);
}
