// The landscape bench (investigation/landscapes, PR #16) on design version 2's prototype, version 1
// and the current generator (task d): river networks, relief and water features against the
// real-terrain targets (`named/128/60/normalised/16/all`, 99 regions). The bench is descriptive,
// not a gate (its README). Each map is measured on its own settled water (the bench's "option B":
// no second settle). The current generator's rows are the landscape study's own (data/generated),
// computed by the same code on the same maps.
//
//   npx tsx investigation/generative/v2/landscapes.ts [--seeds 1-30] [--gens proto2,proto]

/* eslint-disable @typescript-eslint/no-explicit-any */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { AVAILABLE_THEMES, type ThemeId } from "../../../src/core/spec/mapspec";
import { compare, scalarDefinitions } from "../../landscapes/bench/measure";
import { terrainMetrics } from "../../landscapes/lib/metrics";
import { measureFile } from "../../workshop/lib/measures";
import { featureVector } from "../../workshop/lib/variety";
import { arg, lowPriority, parseSeeds } from "../lib/paths";
import { generateProto } from "../proto/generate";
import { generateV2 } from "./generate";
import { V2_ROOT } from "./refs";

const HERE = join(process.cwd(), "investigation", "generative");
const LAND = join(process.cwd(), "investigation", "landscapes");
const STRATUM = "named/128/60/normalised/16/all";
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const pct = (v: number[], p: number) => {
  const s = v.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  return s.length ? s[Math.min(s.length - 1, Math.max(0, Math.floor(p * (s.length - 1))))] : NaN;
};

lowPriority();
const targets = JSON.parse(readFileSync(join(LAND, "data", "targets.json"), "utf8"));
const target = targets.strata[STRATUM];
const seeds = parseSeeds(arg("seeds", "1-30"));
const gens = arg("gens", "proto2,proto").split(",");
mkdirSync(V2_ROOT, { recursive: true });

function rowOf(r: any) {
  const { m, v } = measureFile(r.file, { spec: r.spec, features: r.features, water: { model: r.built.waterModel, settled: r.built.settle } });
  return {
    ...terrainMetrics(r.built.heights, r.built.W, r.built.H, { depth: v.water!.depth, out: r.built.settle.out }, r.built.waterModel.floor),
    natural: m.natural,
    water: m.water,
    dams: m.dams,
    coreMetrics: m.metrics,
    layout: m.layout,
    features: featureVector(m),
    waterReliable: r.built.settle.settled,
  };
}

const perGen: Record<string, { theme: string; cmp: any }[]> = {};
for (const gen of gens) {
  const path = join(V2_ROOT, `landscapes-${gen}.json`);
  const cache: Record<string, any> = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : {};
  for (const theme of AVAILABLE_THEMES as readonly ThemeId[])
    for (const seed of seeds) {
      const key = `${theme}-${seed}`;
      if (cache[key]) continue;
      const r: any = gen === "proto2" ? generateV2(theme, seed, 128) : generateProto(theme, seed, 128);
      if (!r.bytes.length) continue;
      const row = rowOf(r);
      cache[key] = { theme, cmp: compare(row, target), relief: { heightHistogram: row.relief?.heightHistogram, slopeHistogram: row.relief?.slopeHistogram } };
      console.log(gen, key);
    }
  writeFileSync(path, JSON.stringify(cache));
  perGen[gen] = Object.values(cache);
}
// the current generator: the landscape study's own rows for the same seeds
{
  const rows = gunzipSync(readFileSync(join(LAND, "data", "generated.jsonl.gz"))).toString("utf8").split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));
  perGen.current = rows.filter((x: any) => x.size === 128 && seeds.includes(x.seed)).map((x: any) => ({ theme: x.theme, cmp: compare({ ...x, waterReliable: x.waterReliable ?? true }, target) }));
}

const summary: any = { stratum: STRATUM, regions: target.nRegions, gens: {} };
for (const [gen, list] of Object.entries(perGen)) {
  const g: any = { maps: list.length, measures: {}, groups: {}, histograms: {} };
  for (const name of Object.keys(scalarDefinitions)) {
    const vals = list.map((x) => x.cmp.scalars[name]).filter((s: any) => s && typeof s.value === "number" && "inCentral80" in s);
    if (!vals.length) continue;
    const t = vals[0];
    g.measures[name] = {
      group: (scalarDefinitions as any)[name].group,
      real: { p10: r3(t.p10), median: r3(t.median), p90: r3(t.p90) },
      generated: { p10: r3(pct(vals.map((s: any) => s.value), 0.1)), median: r3(pct(vals.map((s: any) => s.value), 0.5)), p90: r3(pct(vals.map((s: any) => s.value), 0.9)) },
      outsideReal80: r3(vals.filter((s: any) => !s.inCentral80).length / vals.length),
    };
  }
  for (const grp of ["network", "water", "relief", "naturalness"]) {
    const v = list.map((x) => x.cmp.groups[grp]?.meanCappedMedianDistance).filter((x: any) => Number.isFinite(x));
    g.groups[grp] = r3(pct(v, 0.5));
  }
  for (const hk of ["heightHistogram", "slopeHistogram"]) g.histograms[hk] = r3(pct(list.map((x) => x.cmp.histograms?.[hk]?.totalVariation ?? NaN), 0.5));
  summary.gens[gen] = g;
}
writeFileSync(join(HERE, "landscapes-v2.json"), JSON.stringify(summary, null, 1) + "\n");
for (const [gen, g] of Object.entries<any>(summary.gens)) console.log(gen, JSON.stringify(g.groups), JSON.stringify(g.histograms));
