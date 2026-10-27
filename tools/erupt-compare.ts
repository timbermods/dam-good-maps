// Erupt before and after Kyler's review (PLAN §20 D226), on the demo's own scenarios and seeds
// (investigation/erupt/scenarios.ts), as shaded relief, four columns:
//   1. the demo Kyler approved: the prototype on its study map (open woodland at level 3, ceiling 22);
//   2. the editor now, on the same map: the prototype's, level for level, where it has the room;
//   3. the prototype on the same study raised to level 12 under a ceiling of 16 (four levels of
//      room): what the editor did before (it ran the prototype's engine): the top pressed flat;
//   4. the editor now, on that map: a peak within the room it has, broader rather than taller, new
//      cones on the flanks.
// Rows: a steep vent with a crater (seed 890), a broad shield (890), a huge caldera (77), eruptions on
// older flanks (313, then 314), and Kyler's case: three steep peaked eruptions on one spot.
//
//   npx tsx tools/erupt-compare.ts [--out docs/progress/forces/erupt-headroom.png]

import { writeFileSync } from "node:fs";
import { DEFAULTS, EruptPlan as ProtoPlan, type Intent, type Settings } from "../investigation/erupt/engine";
import { fixture } from "../investigation/erupt/maps";
import { SCENARIOS } from "../investigation/erupt/scenarios";
import { EruptPlan, type EruptSettings } from "../src/core/forces/erupt";
import type { FullForceMap } from "../src/core/forces/force";
import { encodePng } from "./png";

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const OUT = arg("out") ?? "docs/progress/forces/erupt-headroom.png";
const W = 128;
const SCALE = 2;
const GAP = 6;

type ProtoMap = ReturnType<typeof fixture>;
function study(level: number, ceiling: number): ProtoMap {
  const m = fixture("plain", W);
  if (level !== 3) {
    for (let i = 0; i < m.heights.length; i++) m.heights[i] = level;
    for (const e of m.entities) e.z = level;
  }
  m.maxHeight = ceiling;
  return m;
}
const copy = (m: ProtoMap): ProtoMap => ({ ...m, heights: m.heights.slice(), entities: structuredClone(m.entities), fallen: [], lava: m.lava.slice(), water: { depth: m.water.depth.slice(), contamination: m.water.contamination.slice() } });

/** Eruptions one after another, each on the land the last left (the prototype's, or the editor's). */
function erupt(m: ProtoMap, steps: { settings: Settings; intent: Intent }[], editor: boolean): ProtoMap {
  let map = copy(m);
  for (const s of steps) {
    let p: { map: { heights: Uint8Array; lava: Uint32Array } };
    if (editor) p = new EruptPlan(map as unknown as FullForceMap, s.settings as EruptSettings, s.intent);
    else {
      const q = new ProtoPlan(map, s.settings, s.intent);
      while (!q.advance(8)) {
        // a few rows at a time
      }
      p = q;
    }
    map = { ...map, heights: p.map.heights.slice(), lava: p.map.lava.slice() };
  }
  return map;
}

const rows: { steps: { settings: Settings; intent: Intent }[] }[] = [];
for (const id of ["steep-crater", "broad-shield", "huge-caldera", "volcanic-field"]) {
  const s = SCENARIOS.find((x) => x.id === id)!;
  rows.push({ steps: [{ settings: s.settings, intent: s.intent }, ...(s.second ? [s.second] : [])] });
}
// Kyler's case: steep peaked eruptions, again and again on one spot
rows.push({ steps: [0, 1, 2].map((k) => ({ settings: { ...DEFAULTS, power: 62, shape: "steep", summit: "peak", seed: 890 + k } as Settings, intent: { origin: 64 * W + 64 } })) });

/** A tile's colour: the level on a ramp (low green to high rock), lit from the north-west, fresh
 *  volcanic rock darker and warmer. */
function relief(m: ProtoMap, ceiling: number): Uint8Array {
  const out = new Uint8Array(W * W * 3);
  const h = (x: number, y: number) => m.heights[Math.max(0, Math.min(W - 1, y)) * W + Math.max(0, Math.min(W - 1, x))];
  for (let y = 0; y < W; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const t = m.heights[i] / 22;
      const shade = Math.max(0.35, Math.min(1.5, 1 + 0.26 * (h(x - 1, y - 1) - h(x + 1, y + 1))));
      let r = 70 + 160 * t;
      let g = 118 + 100 * t - 50 * t * t;
      let b = 64 + 120 * t;
      if (m.lava[i]) {
        r = r * 0.75 + 38;
        g *= 0.78;
        b *= 0.72;
      }
      // the ceiling itself, where the land stands pressed against it: a pale mark
      if (m.heights[i] >= ceiling) {
        r = 235;
        g = 225;
        b = 200;
      }
      out[i * 3] = Math.min(255, r * shade);
      out[i * 3 + 1] = Math.min(255, g * shade);
      out[i * 3 + 2] = Math.min(255, b * shade);
    }
  return out;
}

const cols = 4;
const panel = W * SCALE;
const width = cols * panel + (cols + 1) * GAP;
const height = rows.length * panel + (rows.length + 1) * GAP;
const image = new Uint8Array(width * height * 3).fill(250);
function blit(px: Uint8Array, col: number, row: number) {
  const ox = GAP + col * (panel + GAP);
  const oy = GAP + row * (panel + GAP);
  for (let y = 0; y < panel; y++)
    for (let x = 0; x < panel; x++) {
      const s = (Math.floor(y / SCALE) * W + Math.floor(x / SCALE)) * 3;
      image.set(px.subarray(s, s + 3), ((oy + y) * width + ox + x) * 3);
    }
}
const room = study(3, 22);
const low = study(12, 16);
const report: string[] = [];
rows.forEach((r, k) => {
  const a = erupt(room, r.steps, false);
  const b = erupt(room, r.steps, true);
  const c = erupt(low, r.steps, false);
  const d = erupt(low, r.steps, true);
  blit(relief(a, 22), 0, k);
  blit(relief(b, 22), 1, k);
  blit(relief(c, 16), 2, k);
  blit(relief(d, 16), 3, k);
  const same = a.heights.every((v, i) => v === b.heights[i]);
  const flat = (m: ProtoMap, ceil: number) => m.heights.reduce((n, v) => n + (v >= ceil ? 1 : 0), 0);
  report.push(`row ${k + 1}: with room ${same ? "identical to the demo" : "fitted (the demo itself reached its ceiling)"}; near the ceiling, tiles pressed to it: prototype ${flat(c, 16)}, editor ${flat(d, 16)}`);
});
writeFileSync(OUT, encodePng(image, width, height));
console.log(`${OUT}: ${width}×${height}`);
console.log(report.join("\n"));
