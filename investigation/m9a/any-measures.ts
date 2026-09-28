// "Any" measured like each theme (ROADMAP M9a; PLAN §20 D209: coherent, playable, no clones, no
// archetypes), on the product generator's maps. Information, never a gate (D115).
//
// 1. Make the maps with design version 2's batch in its product mode (records as the workshop study
//    measures every map; bulk results stay out of git, D195):
//      DGM_GENERATIVE=investigation/m9a/local/generative npx tsx investigation/generative/v2/batch.ts \
//        --gen current --set m9a-128 --themes any,riverValley,canyon,highlands,lakeBasin,delta,islands \
//        --seeds 1-60 --size 128 --no-files --jobs 6
//    (Any on seeds 61-200 as well: --themes any --seeds 61-200)
// 2. Measure them:
//      DGM_GENERATIVE=investigation/m9a/local/generative npx tsx investigation/m9a/any-measures.ts [--set m9a-128]
//
// Measures (docs/m9-design.md §10, as investigation/generative/v2/measures.ts computes them):
// - coherent and playable: the share of seeds whose map passes every blocking check (the batch's
//   final rate, and first attempts);
// - M1, no clones: every map's nearest other map of its theme on the variety scale
//   (investigation/workshop/variety-scale.json), target at least 0.25 each and a median of 0.40;
// - M2a, no archetypes: whole maps clustered (UPGMA) at the workshop's p10 nearest-peer distance,
//   the largest cluster at most 15% of the theme's maps;
// - M2b and M2c: the river networks and the relief structures clustered on the workshop's scales
//   (investigation/generative/measures.json), with the count of distinct shapes.
// Openings (M3) and no approximation (M4) need the workshop maps, which live on Kyler's main PC.
// Writes <set>/any-measures.json beside the records and prints a table.

/* eslint-disable @typescript-eslint/no-explicit-any */

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { distance, featureVector, type VarietyInput } from "../workshop/lib/variety";
import { scaledDistance, upgma, type VecScale } from "../generative/lib/cluster";
import { arg, MAPS } from "../generative/lib/paths";
import { reliefCode, reliefVector, riverCode, riverVector } from "../generative/lib/structure";
import { V_SCALE } from "../generative/v2/archetypes";

const set = arg("set", "m9a-128");
const dir = join(MAPS, set);
const ref = JSON.parse(readFileSync(join(process.cwd(), "investigation", "generative", "measures.json"), "utf8")).workshop;
const vCut: number = ref.vNearestP10;
const scale = (s: { d0: number; cut: number; spread: number[] }): VecScale => ({ spread: s.spread, d0: s.d0, nnP10: s.cut, nnMedian: NaN });
const riverScale = scale(ref.river);
const reliefScale = scale(ref.relief);
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const pct = (v: number[], p: number) => {
  const s = v.filter(Number.isFinite).sort((a, b) => a - b);
  return s.length ? s[Math.min(s.length - 1, Math.max(0, Math.floor(p * (s.length - 1))))] : NaN;
};

interface Rec {
  key: string;
  theme: string;
  seed: number;
  passed: boolean;
  attempts: number;
  layout?: unknown;
  [k: string]: any;
}

const recs: Rec[] = readdirSync(dir)
  .filter((n) => /^[a-zA-Z]+-\d+\.json$/.test(n))
  .map((n) => JSON.parse(readFileSync(join(dir, n), "utf8")) as Rec);
const themes = [...new Set(recs.map((r) => r.theme))].sort((a, b) => (a === "any" ? -1 : b === "any" ? 1 : a.localeCompare(b)));

function clusters(n: number, d: (i: number, j: number) => number, cut: number) {
  const cl = upgma(n, d, cut);
  return { clusters: cl.length, largest: cl[0]?.length ?? 0, largestShare: r3((cl[0]?.length ?? 0) / Math.max(1, n)) };
}

const out: Record<string, unknown> = { set, vCut, riverCut: riverScale.nnP10, reliefCut: reliefScale.nnP10, themes: {} };
const lines = [
  `Set ${set}: the product generator's maps at 128², measured as design version 2's measures are (information, D115).`,
  "",
  "| Theme | Maps | Final | First attempt | M1 nearest: min / p10 / median (target ≥ 0.25 each, median ≥ 0.40) | Under 0.25 | M2a largest whole-map cluster (≤ 15%) | M2b river networks: largest / shapes | M2c relief: largest / shapes |",
  "|---|---|---|---|---|---|---|---|---|",
];
for (const theme of themes) {
  const all = recs.filter((r) => r.theme === theme).sort((a, b) => a.seed - b.seed);
  const ok = all.filter((r) => r.passed && r.layout);
  const n = ok.length;
  const V: VarietyInput[] = ok.map((r) => ({ key: r.key, layout: r.layout as VarietyInput["layout"], features: featureVector(r) }));
  const nn = V.map((a, i) => V.reduce((m, b, j) => (i === j ? m : Math.min(m, distance(a, b, V_SCALE))), Infinity));
  const rv = ok.map((r) => riverVector(r));
  const lv = ok.map((r) => reliefVector(r));
  const res = {
    maps: all.length,
    final: r3(all.filter((r) => r.passed).length / Math.max(1, all.length)),
    first: r3(all.filter((r) => r.passed && r.attempts === 1).length / Math.max(1, all.length)),
    M1: { min: r3(Math.min(...nn)), p10: r3(pct(nn, 0.1)), median: r3(pct(nn, 0.5)), under025: nn.filter((x) => x < 0.25).length },
    M2a: clusters(n, (i, j) => distance(V[i], V[j], V_SCALE), vCut),
    M2b: { ...clusters(n, (i, j) => scaledDistance(rv[i], rv[j], riverScale), riverScale.nnP10), shapes: new Set(ok.map((r) => riverCode(r))).size },
    M2c: { ...clusters(n, (i, j) => scaledDistance(lv[i], lv[j], reliefScale), reliefScale.nnP10), shapes: new Set(ok.map((r) => reliefCode(r))).size },
  };
  (out.themes as Record<string, unknown>)[theme] = res;
  const p = (v: number) => `${Math.round(v * 1000) / 10}%`;
  lines.push(
    `| ${theme} | ${res.maps} | ${p(res.final)} | ${p(res.first)} | ${res.M1.min} / ${res.M1.p10} / ${res.M1.median} | ${res.M1.under025} | ${res.M2a.largest} of ${n} (${p(res.M2a.largestShare)}) | ${p(res.M2b.largestShare)} / ${res.M2b.shapes} | ${p(res.M2c.largestShare)} / ${res.M2c.shapes} |`,
  );
}
writeFileSync(join(dir, "any-measures.json"), JSON.stringify(out, null, 1));
console.log(lines.join("\n"));
