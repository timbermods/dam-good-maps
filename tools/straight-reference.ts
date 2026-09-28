// How straight real channels ever run (Kyler, D209: "a channel straighter than they ever are
// blocks"). Measures, with src/core/analysis/straight.ts, the longest straight channel bank and the
// longest canal (two straight banks facing each other, parallel) on:
// - real terrain: the landscape survey's library (investigation/landscapes/library, 88 patches of
//   real elevation, water simulated from their sources; the Real places are built from the same
//   patches, `--places` measures them too);
// - the official maps: their own stored water (read locally from `--official <folder>`, never
//   committed; only aggregates are written);
// - generated maps, for comparison: this checkout's generator, `--seeds N` of every theme at 128².
//
//   npx tsx tools/straight-reference.ts --official ../DamGoodMaps/investigation/raw/builtin --out investigation/m9a/straight-reference.json
//
// The limits (`STRAIGHT_LIMITS` in analysis/straight.ts) are the largest values real terrain and the
// official maps reach, leaving out, as the official baselines did (D168): the maps Kyler called
// exceptional (Nomads and Oasis), and clear outliers, values beyond Tukey's far fence
// (Q3 + 3 × IQR) of their own source.

import { gunzipSync } from "fflate";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { straightness } from "../src/core/analysis/straight";
import { waterSource } from "../src/core/format/entities";
import { readTimber } from "../src/core/format/timber";
import { storedWater } from "../src/core/format/world";
import { toMapObject } from "../src/core/features/build";
import { generate } from "../src/core/gen/generate";
import { buildPlace, decodePlaceFile } from "../src/core/places/place";
import { canonicalSettle } from "../src/core/sim/prefill";
import { waterModel } from "../src/core/sim/model";
import { AVAILABLE_THEMES, makeSpec } from "../src/core/spec/mapspec";

interface Row {
  id: string;
  run: number;
  canal: number;
}

/** Official maps Kyler called exceptional (the resource baselines leave them out, D168). */
const EXCEPTIONAL = new Set(["Nomads", "Oasis"]);

function arg(name: string): string | undefined {
  const k = process.argv.indexOf(name);
  return k >= 0 ? process.argv[k + 1] : undefined;
}
const has = (name: string) => process.argv.includes(name);

function measure(id: string, W: number, H: number, depth: ArrayLike<number>): Row {
  const s = straightness(W, H, depth);
  return { id, run: s.longest?.length ?? 0, canal: Math.round((s.canal?.length ?? 0) * 100) / 100 };
}

function library(): Row[] {
  const dir = "investigation/landscapes/library";
  const out: Row[] = [];
  for (const f of readdirSync(dir).filter((n) => n.endsWith(".json.gz")).sort()) {
    const j = JSON.parse(new TextDecoder().decode(gunzipSync(readFileSync(join(dir, f))))) as { W: number; H: number; heights: number[]; waterSources: { x: number; y: number; strength: number }[] };
    const h = Uint8Array.from(j.heights);
    const objects = j.waterSources.map((s, k) => toMapObject(waterSource({ id: `s${k}`, owner: "library", x: s.x, y: s.y, z: h[s.y * j.W + s.x], strength: s.strength })));
    const settle = canonicalSettle(waterModel(j.W, j.H, h, objects));
    out.push(measure(f.replace(/\.json\.gz$/, ""), j.W, j.H, settle.depth));
  }
  return out;
}

function places(): Row[] {
  const dir = "public/real-places/data";
  const out: Row[] = [];
  for (const f of readdirSync(dir).filter((n) => n.endsWith(".json.gz")).sort()) {
    const p = decodePlaceFile(readFileSync(join(dir, f)));
    out.push(measure(p.id, p.W, p.H, buildPlace(p).settle.depth));
  }
  return out;
}

function official(dir: string): Row[] {
  const out: Row[] = [];
  for (const f of readdirSync(dir).filter((n) => n.endsWith(".timber") && !n.startsWith("_")).sort()) {
    const w = readTimber(readFileSync(join(dir, f))).world;
    const sw = storedWater(w.singletons, w.sizeX, w.sizeY);
    const depth = new Float64Array(w.sizeX * w.sizeY);
    for (let k = 0; k < sw.tile.length; k++) depth[sw.tile[k]] = Math.max(depth[sw.tile[k]], sw.depth[k]);
    out.push(measure(f.replace(/\.timber$/, ""), w.sizeX, w.sizeY, depth));
  }
  return out;
}

function generated(seeds: number, size: number): Row[] {
  const out: Row[] = [];
  for (const theme of AVAILABLE_THEMES)
    for (let seed = 1; seed <= seeds; seed++) {
      const r = generate(makeSpec({ seed, theme, size: { x: size, y: size } }));
      out.push(measure(`${theme}-${seed}`, size, size, r.built.water));
    }
  return out;
}

function quantile(v: number[], p: number): number {
  const s = v.slice().sort((a, b) => a - b);
  if (!s.length) return 0;
  const k = p * (s.length - 1);
  const lo = Math.floor(k);
  return s[lo] + (k - lo) * ((s[Math.min(s.length - 1, lo + 1)] ?? s[lo]) - s[lo]);
}

/** The largest value once clear outliers (beyond Q3 + 3 × IQR) are left out, and which were. */
function limitOf(rows: Row[], key: "run" | "canal"): { limit: number; outliers: number } {
  const v = rows.map((r) => r[key]);
  const q1 = quantile(v, 0.25);
  const q3 = quantile(v, 0.75);
  const fence = q3 + 3 * (q3 - q1);
  const kept = v.filter((x) => x <= fence);
  return { limit: Math.max(0, ...kept), outliers: v.length - kept.length };
}

function stats(rows: Row[]) {
  const run = rows.map((r) => r.run);
  const canal = rows.map((r) => r.canal);
  const r2 = (x: number) => Math.round(x * 100) / 100;
  return {
    maps: rows.length,
    run: { median: r2(quantile(run, 0.5)), p90: r2(quantile(run, 0.9)), max: Math.max(0, ...run), ...limitOf(rows, "run") },
    canal: { median: r2(quantile(canal, 0.5)), p90: r2(quantile(canal, 0.9)), max: Math.max(0, ...canal), ...limitOf(rows, "canal") },
  };
}

const result: Record<string, unknown> = {
  measured:
    "analysis/straight.ts: on water 0.1 deep or more in channels under 9 tiles wide, 3 tiles or more from the map's border: the longest straight bank (unit edges within 0.75 tiles of one line, any angle) and the longest canal (two straight banks facing each other across the water, parallel, overlapping)",
  limitRule: "the largest value of real terrain and the official maps, leaving out the maps Kyler called exceptional (Nomads, Oasis; D168) and values beyond Q3 + 3 × IQR of their own source",
};
const t0 = performance.now();
const lib = library();
console.log(`library: ${lib.length} maps, ${Math.round(performance.now() - t0)} ms`);
result.real = { ...stats(lib), rows: lib };
if (has("--places")) {
  const pl = places();
  result.places = { ...stats(pl), rows: pl };
}
const od = arg("--official");
let off: Row[] = [];
if (od) {
  // per-map numbers of the official maps stay local: the aggregates only
  off = official(od).filter((r) => !EXCEPTIONAL.has(r.id));
  result.official = { ...stats(off), leftOut: [...EXCEPTIONAL] };
}
const real = stats(lib);
const offS = off.length ? stats(off) : null;
result.limits = {
  run: Math.max(real.run.limit, offS?.run.limit ?? 0),
  canal: Math.max(real.canal.limit, offS?.canal.limit ?? 0),
};
const seeds = Number(arg("--seeds") ?? 0);
if (seeds > 0) {
  const g = generated(seeds, Number(arg("--size") ?? 128));
  result.generated = { ...stats(g), rows: g };
}
const out = arg("--out");
if (out) {
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(result, null, 1) + "\n");
}
for (const k of ["real", "places", "official", "generated"]) {
  const v = result[k] as ReturnType<typeof stats> | undefined;
  if (v) console.log(`${k.padEnd(10)} ${String(v.maps).padStart(4)} maps  run median ${v.run.median} p90 ${v.run.p90} max ${v.run.max} limit ${v.run.limit}   canal median ${v.canal.median} p90 ${v.canal.p90} max ${v.canal.max} limit ${v.canal.limit}`);
}
console.log(`limits: ${JSON.stringify(result.limits)}`);
