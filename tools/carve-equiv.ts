// Carve's port against its prototype, step for step (D194, D199): runs investigation/carve's engine
// (PR #47) and src/core/forces/carve side by side on the prototype's own scenarios, a generated map
// and a real place, and checks after every step that both have the same ground, preview water,
// sediment, head, course and metrics, then that the water each keeps is the same (the canonical
// settle, or for a sealed oxbow the prototype's two-stage solve against the port's retained lake).
//
//   npx tsx tools/carve-equiv.ts            every scenario
//   npx tsx tools/carve-equiv.ts oxbow      the scenarios whose name contains "oxbow"
//
// Exit code 1 on the first difference. Tools may import investigation/ (src/ never does).

import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { CarveRun as ProtoRun, DEFAULTS as PROTO_DEFAULTS, plainEntities, type CarveMap, type Settings } from "../investigation/carve/engine";
import { fixture } from "../investigation/carve/maps";
import { carveWaterSettle } from "../investigation/carve/water";
import { CarveRun, modelFor, type CarveSettings } from "../src/core/forces/carve/run";
import { oxbowLake } from "../src/core/forces/carve/water";
import type { ForceMap } from "../src/core/forces/force";
import { generate } from "../src/core/gen/generate";
import { decodeHeights, decodePlaceFile, placeEntities } from "../src/core/places/place";
import { canonicalSettle } from "../src/core/sim/prefill";
import { makeSpec } from "../src/core/spec/mapspec";

interface Scenario {
  name: string;
  map: () => CarveMap;
  settings: Partial<Settings>;
  intent: { origin: number; end?: number };
  /** Steps at most (the prototype's captures run to 1200). */
  steps?: number;
}

function fromBuilt(name: string, W: number, H: number, heights: Uint8Array, entities: ReturnType<typeof plainEntities>, depth: Float64Array, contamination: Float64Array): CarveMap {
  return { name, W, H, heights: heights.slice(), entities: plainEntities(entities), water: { depth: depth.slice(), contamination: contamination.slice() }, maxHeight: 16 };
}

let generated: CarveMap | null = null;
function highlands(): CarveMap {
  if (generated) return generated;
  const b = generate(makeSpec({ seed: 18, theme: "highlands", size: { x: 128, y: 128 } })).built;
  generated = fromBuilt("Highlands 18, 128²", b.W, b.H, b.heights, b.entities.filter((e) => !e.raw), b.water, b.contamination);
  return generated;
}
/** The prototype capture's origin on a generated map: the highest dry ground, near the middle. */
function highOrigin(m: CarveMap): number {
  let origin = 0;
  let best = -Infinity;
  for (let y = 16; y < m.H - 16; y++)
    for (let x = 16; x < m.W - 16; x++) {
      const i = y * m.W + x;
      if (m.water.depth[i] > 0.05) continue;
      const score = m.heights[i] - 0.01 * Math.hypot(x - m.W / 2, y - m.H * 0.62);
      if (score > best) {
        best = score;
        origin = i;
      }
    }
  return origin;
}
function place(): CarveMap {
  const p = decodePlaceFile(gunzipSync(readFileSync("public/real-places/data/near-grand-canyon-colorado.json.gz")));
  const h = decodeHeights(p.heights);
  const N = h.length;
  return fromBuilt(p.name, p.W, p.H, h, placeEntities(p, h), new Float64Array(N), new Float64Array(N));
}

const aim64 = { origin: 54 * 64 + 32, end: 10 * 64 + 32 };
const aim96 = { origin: 80 * 96 + 48, end: 14 * 96 + 48 };
const fixed = { mode: "aim" as const, power: 85, width: 6, seed: 1 };
const oxbow = { mode: "aim" as const, power: 85, width: 6, wander: 100, seed: 1 };
const SCENARIOS: Scenario[] = [
  { name: "unleashed mountain (Power 95)", map: () => fixture("mountain", 64), settings: { power: 95 }, intent: { origin: 54 * 64 + 32 } },
  { name: "creek mountain (Power 15)", map: () => fixture("mountain", 64), settings: { power: 15 }, intent: { origin: 54 * 64 + 32 } },
  { name: "aimed ridge, wide walls", map: () => fixture("ridge", 64), settings: { mode: "aim", power: 95, walls: "wide" }, intent: aim64 },
  { name: "defy gravity uphill", map: () => fixture("uphill", 64), settings: { mode: "aim", power: 95, defyGravity: true }, intent: aim64 },
  { name: "straight (Wander 0)", map: () => fixture("ridge", 96), settings: { ...fixed, wander: 0 }, intent: aim96 },
  { name: "winding (Wander 100, varied bends)", map: () => fixture("ridge", 96), settings: { ...fixed, wander: 100 }, intent: aim96 },
  { name: "slot (Power 95, Width 2)", map: () => fixture("ridge", 96), settings: { ...fixed, power: 95, width: 2, wander: 15 }, intent: aim96 },
  { name: "lazy (Power 15, Width 24)", map: () => fixture("ridge", 96), settings: { ...fixed, power: 15, width: 24, wander: 15 }, intent: aim96 },
  { name: "personality 2", map: () => fixture("ridge", 96), settings: { ...fixed, wander: 65, seed: 2 }, intent: aim96 },
  { name: "split reach", map: () => fixture("uphill", 96), settings: { mode: "aim", defyGravity: true, power: 85, wander: 35, seed: 1 }, intent: aim96 },
  { name: "oxbow lake (Wander 100)", map: () => fixture("oxbow", 96), settings: oxbow, intent: { origin: 80 * 96 + 48, end: 96 + 48 } },
  { name: "oxbow, dry canyon", map: () => fixture("oxbow", 96), settings: { ...oxbow, dry: true }, intent: { origin: 80 * 96 + 48, end: 96 + 48 } },
  { name: "oxbow, stopped early", map: () => fixture("oxbow", 96), settings: oxbow, intent: { origin: 80 * 96 + 48, end: 96 + 48 }, steps: 150 },
  { name: "generated Highlands 18, 128²", map: highlands, settings: { power: 80 }, intent: { origin: -1 } },
  { name: "generated Highlands 18, Wander 100", map: highlands, settings: { power: 90, wander: 100, seed: 3 }, intent: { origin: -1 } },
  { name: "real place, Near Grand Canyon", map: place, settings: {}, intent: { origin: -2 } },
];

const same = (a: ArrayLike<number>, b: ArrayLike<number>) => {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i] && !(Number.isNaN(a[i]) && Number.isNaN(b[i]))) return false;
  return true;
};
const json = (v: unknown) => JSON.stringify(v);
/** The objects standing on the map, without owners or number wrappers: id, template and place. */
const objects = (e: { id: string; template: string; x: number; y: number; z: number }[]) => json(e.map((o) => [o.id, o.template, o.x, o.y, o.z]).sort());

function toForce(m: CarveMap): ForceMap {
  return { W: m.W, H: m.H, heights: m.heights.slice(), entities: plainEntities(m.entities), water: { depth: m.water.depth.slice(), contamination: m.water.contamination.slice() }, maxHeight: m.maxHeight };
}

function check(sc: Scenario): string | null {
  const m = sc.map();
  const intent = { ...sc.intent };
  if (intent.origin === -1) intent.origin = highOrigin(m);
  if (intent.origin === -2) intent.origin = Math.floor(m.H * 0.8) * m.W + Math.floor(m.W * 0.5);
  const settings = { ...PROTO_DEFAULTS, ...sc.settings } as Settings;
  const proto = new ProtoRun(m, settings, intent);
  const port = new CarveRun(toForce(m), settings as CarveSettings, intent);
  const limit = sc.steps ?? 1200;
  for (let k = 0; k < limit && !proto.metrics.stable; k++) {
    proto.step();
    port.step();
    const at = `step ${k + 1}`;
    if (!same(proto.map.heights, port.map.heights)) return `${at}: the ground differs`;
    if (!same(proto.map.water.depth, port.map.water.depth)) return `${at}: the preview water differs`;
    if (!same(proto.map.water.contamination, port.map.water.contamination)) return `${at}: the preview contamination differs`;
    if (!same(proto.sediment, port.sediment)) return `${at}: the sediment differs`;
    if (json(proto.head) !== json(port.head)) return `${at}: the head differs\n  ${json(proto.head)}\n  ${json(port.head)}`;
    if (json(proto.metrics) !== json(port.metrics)) return `${at}: the metrics differ\n  ${json(proto.metrics)}\n  ${json(port.metrics)}`;
    if (proto.path.length !== port.path.length || json(proto.path.at(-1)) !== json(port.path.at(-1))) return `${at}: the course differs`;
    if (objects(proto.map.entities) !== objects(port.map.entities)) return `${at}: the objects differ`;
  }
  if (proto.metrics.stable !== port.done) return "one ended and the other did not";
  if (json(proto.path) !== json(port.path)) return "the whole course differs";
  if (json(proto.oxbows) !== json(port.oxbows)) return "the oxbows differ";
  if (!!proto.closure !== !!port.closure || (proto.closure && !same(proto.closure.heights, port.closure!.heights))) return "the pre-closure ground differs";
  // the water each keeps
  const want = carveWaterSettle(proto.map, proto);
  const lake = oxbowLake(port);
  const got = canonicalSettle({ ...modelFor(port.map), ...(lake ? { retained: [lake] } : {}) });
  if ((want.method === "retained-oxbow") !== !!lake) return `the oxbow lake: the prototype's water is ${want.method ?? "canonical"}, the port ${lake ? "keeps" : "keeps no"} lake`;
  if (!same(want.depth, got.depth) || !same(want.contamination, got.contamination)) return "the kept water differs";
  if (want.settled !== got.settled) return `settled: ${want.settled} against ${got.settled}`;
  const lakeTiles = lake ? lake.tiles.length : 0;
  const wet = lake ? lake.tiles.filter((i) => got.depth[i] > 1).length : 0;
  console.log(`  ${proto.metrics.steps} steps, ended: ${proto.metrics.reason || "(stopped)"}, cut ${proto.metrics.cut}, deposited ${proto.metrics.deposited}${proto.oxbows.length ? `, oxbow at step ${proto.oxbows[0].step}` : ""}${lake ? `, lake ${lakeTiles} tiles (${wet} over a level deep), water settled ${got.settled} after ${got.ticks} ticks` : ""}`);
  return null;
}

const only = process.argv[2];
let failed = 0;
for (const sc of SCENARIOS) {
  if (only && !sc.name.includes(only)) continue;
  const t0 = performance.now();
  const err = check(sc);
  const ms = Math.round(performance.now() - t0);
  if (err) {
    failed++;
    console.log(`FAIL ${sc.name} (${ms} ms): ${err}`);
  } else console.log(`PASS ${sc.name} (${ms} ms)`);
}
if (failed) {
  console.log(`${failed} scenario(s) differ`);
  process.exit(1);
}
console.log("The port matches the prototype step for step.");
