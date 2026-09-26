// What makes maps cluster (design version 2, task b) and what makes a generated map land close to a
// workshop map (task c). For each set and theme it clusters the maps on the variety distance V
// (UPGMA cut at the workshop's p10 nearest-peer V, as measures.ts), then decomposes the distance
// between members of the largest cluster: the layout half (the 16×16 height-rank and water picture
// under the 8 symmetries) against the feature half, and each of the 14 features' mean difference in
// units of its workshop spread, beside the same numbers over pairs of workshop maps (the typical
// pair). A feature on which the cluster's maps agree far more than workshop maps do is a driver.
// The layout half gets one more reading: how planar the height picture is (the share of its
// variance a tilted plane explains), since a map that is mostly one regional slope looks like every
// other one under rotation.
//
// For no-approximation it takes every generated map closer to its nearest workshop map than the
// workshop's p10 and decomposes that pair the same way, against all maps' nearest pairs. Only
// aggregates are written: per-map workshop numbers stay local.
//
//   npx tsx investigation/generative/v2/archetypes.ts --sets proto-128,proto2-128 [--out file.json]

/* eslint-disable @typescript-eslint/no-explicit-any */

import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readTable } from "../../workshop/lib/table";
import { distance, featureDistance, featureVector, FEATURE_NAMES, layoutDistance, type Scale, type VarietyInput } from "../../workshop/lib/variety";
import { upgma } from "../lib/cluster";
import { arg, MAPS } from "../lib/paths";

const vs = JSON.parse(readFileSync(join(process.cwd(), "investigation", "workshop", "variety-scale.json"), "utf8"));
export const V_SCALE: Scale = { spread: vs.spread, L0: vs.L0, F0: vs.F0 };
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const mean = (v: number[]) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN);

export const inputOf = (key: string, r: any): VarietyInput => ({ key, layout: r.layout, features: featureVector(r) });

/** Share of the 16×16 height picture's variance a tilted plane explains (least squares). */
export function planarity(h: number[]): number {
  const G = 16;
  let sx = 0, sy = 0, sz = 0, sxx = 0, syy = 0, sxz = 0, syz = 0;
  const n = G * G;
  for (let y = 0; y < G; y++)
    for (let x = 0; x < G; x++) {
      const z = h[y * G + x];
      sx += x; sy += y; sz += z; sxx += x * x; syy += y * y; sxz += x * z; syz += y * z;
    }
  const mx = sx / n, my = sy / n, mz = sz / n;
  const vxx = sxx / n - mx * mx, vyy = syy / n - my * my;
  const bx = (sxz / n - mx * mz) / vxx;
  const by = (syz / n - my * mz) / vyy;
  let tot = 0, res = 0;
  for (let y = 0; y < G; y++)
    for (let x = 0; x < G; x++) {
      const z = h[y * G + x];
      const p = mz + bx * (x - mx) + by * (y - my);
      tot += (z - mz) * (z - mz);
      res += (z - p) * (z - p);
    }
  return tot > 0 ? 1 - res / tot : 0;
}

/** Per-feature |difference| in spread units, and the layout and feature halves of V. */
function decompose(a: VarietyInput, b: VarietyInput, s: Scale) {
  const L = layoutDistance(a.layout, b.layout);
  const F = featureDistance(a.features, b.features, s.spread);
  return { lay: (0.5 * L) / s.L0, feat: (0.5 * F) / s.F0, per: a.features.map((v, k) => Math.abs(v - b.features[k]) / (s.spread[k] || 1)) };
}

export interface Driver {
  maps: number;
  largest: number;
  largestShare: number;
  clusters: number;
  within: { V: number; layoutHalf: number; featureHalf: number; planarity: number };
  rest: { planarity: number };
  workshopPair: { V: number; layoutHalf: number; featureHalf: number; planarity: number };
  /** Features ranked by how much more the cluster agrees than a workshop pair: ratio = within ÷ workshop. */
  features: { name: string; within: number; workshop: number; ratio: number; clusterMedian: number; workshopMedian: number }[];
}

let wsCache: { W: VarietyInput[]; pair: any; perTypical: number[]; planar: number } | null = null;
export function workshopRef() {
  if (wsCache) return wsCache;
  const rows = readTable().filter((r) => r.source === "workshop");
  const W = rows.map((r) => inputOf(r.key, r.raw));
  const lays: number[] = [], feats: number[] = [], Vs: number[] = [];
  const per = FEATURE_NAMES.map(() => [] as number[]);
  for (let i = 0; i < W.length; i++)
    for (let j = i + 1; j < W.length; j++) {
      const d = decompose(W[i], W[j], V_SCALE);
      lays.push(d.lay);
      feats.push(d.feat);
      Vs.push(d.lay + d.feat);
      d.per.forEach((v, k) => per[k].push(v));
    }
  wsCache = { W, pair: { V: mean(Vs), layoutHalf: mean(lays), featureHalf: mean(feats) }, perTypical: per.map(mean), planar: mean(W.map((w) => planarity(w.layout.heights))) };
  return wsCache;
}

const med = (v: number[]) => {
  const s = v.filter(Number.isFinite).sort((a, b) => a - b);
  return s.length ? s[s.length >> 1] : NaN;
};

export function drivers(maps: VarietyInput[], cut: number): Driver {
  const ws = workshopRef();
  const n = maps.length;
  const cl = upgma(n, (i, j) => distance(maps[i], maps[j], V_SCALE), cut);
  const big = cl[0] ?? [];
  const lays: number[] = [], feats: number[] = [], Vs: number[] = [];
  const per = FEATURE_NAMES.map(() => [] as number[]);
  for (let a = 0; a < big.length; a++)
    for (let b = a + 1; b < big.length; b++) {
      const d = decompose(maps[big[a]], maps[big[b]], V_SCALE);
      lays.push(d.lay);
      feats.push(d.feat);
      Vs.push(d.lay + d.feat);
      d.per.forEach((v, k) => per[k].push(v));
    }
  const inBig = new Set(big);
  const features = FEATURE_NAMES.map((name, k) => {
    const within = mean(per[k]);
    return { name, within: r3(within), workshop: r3(ws.perTypical[k]), ratio: r3(within / ws.perTypical[k]), clusterMedian: r3(med(big.map((i) => maps[i].features[k]))), workshopMedian: r3(med(ws.W.map((w) => w.features[k]))) };
  }).sort((p, q) => p.ratio - q.ratio);
  return {
    maps: n,
    largest: big.length,
    largestShare: r3(big.length / Math.max(1, n)),
    clusters: cl.length,
    within: { V: r3(mean(Vs)), layoutHalf: r3(mean(lays)), featureHalf: r3(mean(feats)), planarity: r3(mean(big.map((i) => planarity(maps[i].layout.heights)))) },
    rest: { planarity: r3(mean(maps.filter((_, i) => !inBig.has(i)).map((m) => planarity(m.layout.heights)))) },
    workshopPair: { ...ws.pair, layoutHalf: r3(ws.pair.layoutHalf), featureHalf: r3(ws.pair.featureHalf), V: r3(ws.pair.V), planarity: r3(ws.planar) },
    features,
  };
}

export interface CloseReport {
  maps: number;
  below: number;
  share: number;
  /** The halves of V for the close pairs and for every map's nearest workshop pair. */
  close: { V: number; layoutHalf: number; featureHalf: number };
  all: { V: number; layoutHalf: number; featureHalf: number };
  /** Features ranked by how much closer the close pairs are than all nearest pairs (ratio). */
  features: { name: string; close: number; all: number; ratio: number }[];
}

export function closePairs(maps: VarietyInput[], cut: number): CloseReport {
  const ws = workshopRef();
  const near = maps.map((a) => {
    let best = Infinity;
    let bi = -1;
    ws.W.forEach((b, j) => {
      const d = distance(a, b, V_SCALE);
      if (d < best) {
        best = d;
        bi = j;
      }
    });
    return { d: best, j: bi };
  });
  const dec = maps.map((a, i) => decompose(a, ws.W[near[i].j], V_SCALE));
  const closeIdx = maps.map((_, i) => i).filter((i) => near[i].d < cut);
  const pick = (idx: number[]) => ({ V: r3(mean(idx.map((i) => near[i].d))), layoutHalf: r3(mean(idx.map((i) => dec[i].lay))), featureHalf: r3(mean(idx.map((i) => dec[i].feat))) });
  const all = maps.map((_, i) => i);
  const features = FEATURE_NAMES.map((name, k) => {
    const c = mean(closeIdx.map((i) => dec[i].per[k]));
    const a = mean(all.map((i) => dec[i].per[k]));
    return { name, close: r3(c), all: r3(a), ratio: r3(c / a) };
  }).sort((p, q) => p.ratio - q.ratio);
  return { maps: maps.length, below: closeIdx.length, share: r3(closeIdx.length / Math.max(1, maps.length)), close: pick(closeIdx), all: pick(all), features };
}

export function loadInputs(dir: string, filter: (rec: any) => boolean = () => true): Map<string, { inp: VarietyInput; rec: any }[]> {
  const out = new Map<string, { inp: VarietyInput; rec: any }[]>();
  for (const f of readdirSync(dir).filter((n) => /^[a-zA-Z]+-\d+\.json$/.test(n))) {
    const rec = JSON.parse(readFileSync(join(dir, f), "utf8"));
    if (!rec.passed || !rec.layout || !filter(rec)) continue;
    const l = out.get(rec.theme) ?? out.set(rec.theme, []).get(rec.theme)!;
    l.push({ inp: inputOf(rec.key, rec), rec });
  }
  for (const l of out.values()) l.sort((a, b) => a.rec.seed - b.rec.seed);
  return out;
}

if (process.argv[1] && /archetypes\.ts$/.test(process.argv[1])) {
  const cut = JSON.parse(readFileSync(join(process.cwd(), "investigation", "generative", "measures.json"), "utf8")).workshop.vNearestP10;
  const sets = arg("sets", "proto-128").split(",");
  const res: any = { cut, sets: {} };
  for (const s of sets) {
    const dir = join(MAPS, s);
    if (!existsSync(dir)) continue;
    const by = loadInputs(dir);
    res.sets[s] = {};
    for (const [theme, list] of [...by].sort()) {
      const inps = list.map((x) => x.inp);
      const d = drivers(inps, cut);
      const c = closePairs(inps, cut);
      res.sets[s][theme] = { drivers: d, close: c };
      console.log(`${s} ${theme}: largest ${d.largest}/${d.maps} (${Math.round(d.largestShare * 100)}%), within V ${d.within.V} (layout ${d.within.layoutHalf}, features ${d.within.featureHalf}; workshop pair ${d.workshopPair.layoutHalf}/${d.workshopPair.featureHalf}); planarity ${d.within.planarity} vs rest ${d.rest.planarity}, workshop ${d.workshopPair.planarity}`);
      console.log(`   drivers: ${d.features.slice(0, 6).map((f) => `${f.name} ${f.ratio} (cluster med ${f.clusterMedian}, workshop ${f.workshopMedian})`).join("; ")}`);
      console.log(`   close to workshop: ${c.below}/${c.maps}; close pairs layout ${c.close.layoutHalf} feat ${c.close.featureHalf} vs all ${c.all.layoutHalf}/${c.all.featureHalf}; nearest features ${c.features.slice(0, 5).map((f) => `${f.name} ${f.ratio}`).join(", ")}`);
    }
  }
  const out = arg("out", "");
  if (out) writeFileSync(out, JSON.stringify(res, null, 1));
}
