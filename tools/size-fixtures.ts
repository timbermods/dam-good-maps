// Writes the maps the renderer is checked on at every size (D357): generated ones where the generator builds the
// size (512×512, 512×96, 96×512, 256×256) and hand-made ones where it does not (4×4, 7×300: sizes the generator
// refuses until its part 2, valid for the file and the page). Output: .scratch/sizes/<WxH>.timber (gitignored).
//
//   npx tsx tools/size-fixtures.ts [--only 512x512,4x4] [--theme highlands] [--seed 1]
//
// The hand-made maps are rolling ground with a river bed and a lake, a start and a source: enough for the terrain,
// the water, the objects and the light to draw. Not a quality measure; the generated maps are the real test.

import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { generate } from "../src/core/gen/generate";
import { fileName } from "../src/core/gen/pack";
import { entityJson, startingLocation, tree, waterSource, type EntitySpec } from "../src/core/format/entities";
import { mapMetadata, writeTimber } from "../src/core/format/timber";
import { emptySimulationSingletons, GAME_VERSION, LAYERS, voxelsFromHeights } from "../src/core/format/world";
import { thumbnailJpeg } from "../src/core/render/shade";
import { makeSpec, type ThemeId } from "../src/core/spec/mapspec";

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const OUT = ".scratch/sizes";
mkdirSync(OUT, { recursive: true });
const only = arg("only", "").split(",").filter(Boolean);
const theme = arg("theme", "highlands") as ThemeId;
const seed = Number(arg("seed", "1"));
const want = (k: string) => only.length === 0 || only.includes(k);

/** Rolling ground 3–7 levels high with a river bed down the long way, a start beside it and a source at its head. */
function handMade(W: number, H: number): Uint8Array {
  const N = W * H;
  const heights = new Uint8Array(N);
  const long = Math.max(W, H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const u = W >= H ? x : y; // along the long side
      const v = W >= H ? y : x; // across
      const across = W >= H ? H : W;
      const bed = Math.round(across / 2 + Math.sin(u / 9) * Math.min(3, across / 6));
      const rolling = 5 + Math.round(1.6 * Math.sin(u / 13) + 1.4 * Math.cos(v / 5 + u / 31));
      const d = Math.abs(v - bed);
      heights[y * W + x] = Math.max(1, Math.min(8, d <= (across > 8 ? 1 : 0) ? 2 : rolling));
    }
  void long;
  return heights;
}

function writeHandMade(W: number, H: number): void {
  const heights = handMade(W, H);
  const voxels = voxelsFromHeights(heights, W, H);
  const ents: EntitySpec[] = [];
  let n = 0;
  const base = (x: number, y: number) => ({ id: `00000000-0000-4000-8000-${String(n++).padStart(12, "0")}`, owner: "", x, y, z: heights[y * W + x] });
  const across = W >= H ? H : W;
  const bed = (u: number) => Math.round(across / 2 + Math.sin(u / 9) * Math.min(3, across / 6));
  const at = (u: number): [number, number] => (W >= H ? [u, bed(u)] : [bed(u), u]);
  const long = Math.max(W, H);
  const [sx, sy] = at(Math.min(long - 1, 1));
  ents.push(waterSource({ ...base(sx, sy), strength: 1 }));
  const [px, py] = at(Math.min(long - 1, Math.max(2, Math.floor(long / 3))));
  ents.push(startingLocation({ ...base(Math.min(W - 1, px + (W >= H ? 0 : 2)), Math.min(H - 1, py + (W >= H ? 2 : 0))), orientation: "Cw0" }));
  for (let k = 0; k < Math.min(40, Math.floor((W * H) / 40)); k++) {
    const x = (k * 37 + 3) % W;
    const y = (k * 91 + 5) % H;
    if (heights[y * W + x] >= 3) ents.push(tree({ ...base(x, y), species: k % 3 === 0 ? "Oak" : "Pine" }));
  }
  const bytes = writeTimber({
    metadata: mapMetadata(W, H, "A hand-made map"),
    thumbnail: thumbnailJpeg(heights, W, H),
    versionTxt: GAME_VERSION + "\r\n",
    world: { gameVersion: GAME_VERSION, timestamp: "2026-10-14 00:00:00", sizeX: W, sizeY: H, layers: LAYERS, voxels, singletons: emptySimulationSingletons(W, H), entities: ents.map(entityJson) },
    extraFiles: [],
  });
  writeFileSync(`${OUT}/${W}x${H}.timber`, bytes);
  console.log(`wrote ${W}x${H} (hand-made)`);
}

function writeGenerated(W: number, H: number): void {
  const path = `${OUT}/${W}x${H}.timber`;
  if (existsSync(path) && !process.argv.includes("--force")) return console.log(`kept ${path}`);
  const t0 = performance.now();
  const r = generate(makeSpec({ seed, theme, size: { x: W, y: H } }));
  if (!r.report.passed) throw new Error(`${W}x${H} did not pass: ${r.report.checks.filter((c) => !c.ok).map((c) => c.id).join(", ")}`);
  writeFileSync(path, r.bytes);
  console.log(`wrote ${W}x${H} (${fileName(r.spec)}) in ${Math.round((performance.now() - t0) / 1000)} s`);
}

for (const [W, H] of [[4, 4], [7, 300]]) if (want(`${W}x${H}`)) writeHandMade(W, H);
for (const [W, H] of [[256, 256], [512, 96], [96, 512], [512, 512]]) if (want(`${W}x${H}`)) writeGenerated(W, H);
