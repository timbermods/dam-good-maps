import { MapSession } from "../../src/core/doc/session";
import { writeTimber, type TimberFile } from "../../src/core/format/timber";
import { emptySimulationSingletons, GAME_VERSION, LAYERS, voxelsFromHeights } from "../../src/core/format/world";

const W = 192, H = 192;
const heights = new Uint8Array(W * H).fill(8);
const file: TimberFile = {
  metadata: {},
  thumbnail: null,
  versionTxt: GAME_VERSION + "\r\n",
  world: { gameVersion: GAME_VERSION, timestamp: "2026-11-09 00:00:00", sizeX: W, sizeY: H, layers: LAYERS, voxels: voxelsFromHeights(heights, W, H), singletons: emptySimulationSingletons(W, H), entities: [] },
  extraFiles: [],
};
let t = performance.now();
const s = MapSession.importMap(writeTimber(file), "four-lakes.timber");
console.log("import", Math.round(performance.now() - t), "ms mode", s.mode, s.notices);
t = performance.now();
// a simple valley
const cells: [number, number, number][] = [];
for (let y = 60; y < 130; y++) cells.push([y, 20, 170]);
let r = s.apply({ op: "sculpt", params: { mode: "flatten", cells, level: 4, exact: true } });
console.log("sculpt", r.ok, r.errors, Math.round(performance.now() - t), "ms");
t = performance.now();
r = s.apply({ op: "placeEntity", params: { id: "00000000-0000-4000-8000-000000000001", template: "WaterSource", x: 30, y: 90, orientation: "Cw0", components: { WaterSource: { SpecifiedStrength: 4, CurrentStrength: 4 } } } } as never);
console.log("source", r.ok, r.errors, Math.round(performance.now() - t), "ms");
const b = s.built;
let wet = 0, vol = 0;
for (let i = 0; i < W * H; i++) if (b.water[i] > 0.05) { wet++; vol += b.water[i]; }
console.log("wet", wet, "vol", vol.toFixed(1), "settle", b.settle.ticks, (b.settle as any).settled, "fromFile", b.waterFromFile);
console.log("depth at src", b.water[90 * W + 30], "mid", b.water[90 * W + 100], "end", b.water[90 * W + 169]);
