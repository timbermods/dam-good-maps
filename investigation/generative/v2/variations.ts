// "Variations of this map" (D143; M9c), tried on the prototype: a sibling keeps the map's theme,
// settings and intentions, draws its genome from the same stream with each continuous value nudged
// (±12% of its range), and grows its land from noise of its own (field.ts `landSeed`). The no-clone
// check applies between siblings: every pair at least 0.25 apart on the variety scale. Beside it:
// how close siblings sit compared with the theme's maps in general (the batch's nearest-seed
// median), which is what makes them "variations" rather than new maps.
//
//   npx tsx investigation/generative/v2/variations.ts [--seeds 1-5] [--siblings 4]

/* eslint-disable @typescript-eslint/no-explicit-any */

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { AVAILABLE_THEMES, type ThemeId } from "../../../src/core/spec/mapspec";
import { measureFile } from "../../workshop/lib/measures";
import { distance, featureVector } from "../../workshop/lib/variety";
import { arg, lowPriority, parseSeeds } from "../lib/paths";
import { V_SCALE } from "./archetypes";
import { generateV2 } from "./generate";

lowPriority();
const seeds = parseSeeds(arg("seeds", "1-5"));
const siblings = Number(arg("siblings", "4"));
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const rows: any[] = [];
const all: number[] = [];
const toOriginal: number[] = [];
let clones = 0;
let pairs = 0;
let sameIntentions = 0;
let total = 0;
for (const theme of AVAILABLE_THEMES as readonly ThemeId[])
  for (const seed of seeds) {
    const fam: { k: number; inp: any; intentions: string[] }[] = [];
    let intentions: any = undefined;
    for (let k = 0; k <= siblings; k++) {
      // siblings keep the map's intentions (D143: the same theme, settings and intentions)
      const r = generateV2(theme, seed, 128, "normal", { variation: k, ...(k ? { intentions } : {}) });
      if (k === 0) intentions = r.genome.intentions.slice();
      if (!r.bytes.length) continue;
      const { m } = measureFile(r.file, { spec: r.spec, features: r.features, water: { model: r.built.waterModel, settled: r.built.settle } });
      fam.push({ k, inp: { key: `${theme}-${seed}-${k}`, layout: m.layout, features: featureVector(m) }, intentions: r.genome.intentions.slice().sort() });
    }
    const d: number[] = [];
    for (let a = 0; a < fam.length; a++)
      for (let b = a + 1; b < fam.length; b++) {
        const x = distance(fam[a].inp, fam[b].inp, V_SCALE);
        d.push(x);
        all.push(x);
        pairs++;
        if (x < 0.25) clones++;
        if (fam[a].k === 0) toOriginal.push(x);
      }
    for (const f of fam.slice(1)) {
      total++;
      if (JSON.stringify(f.intentions) === JSON.stringify(fam[0].intentions)) sameIntentions++;
    }
    rows.push({ theme, seed, maps: fam.length, minPair: r3(Math.min(...d)), medianPair: r3(d.sort((p, q) => p - q)[d.length >> 1]) });
    console.log(theme, seed, fam.length, "maps", "min pair", r3(Math.min(...d)));
  }
const med = (v: number[]) => v.slice().sort((a, b) => a - b)[v.length >> 1];
const res = { families: rows.length, siblingsEach: siblings, pairs, clonePairs: clones, minPair: r3(Math.min(...all)), medianPair: r3(med(all)), medianToOriginal: r3(med(toOriginal)), sameIntentions: `${sameIntentions}/${total}`, rows };
writeFileSync(join(process.cwd(), "investigation", "generative", "variations-v2.json"), JSON.stringify(res, null, 1) + "\n");
console.log(JSON.stringify({ ...res, rows: undefined }));
