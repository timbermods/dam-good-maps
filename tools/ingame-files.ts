// The files for the in-game checks (PLAN §18), per milestone. The bytes are deterministic for a
// given generator version.
//
//   npx tsx tools/ingame-files.ts --milestone m1 [--seed 4242] [--size 128] [--out out/m1]
//     A (load, start, walk, editor, Iron Teeth) and F2 (sealed river mouth):
//       River Valley (4242).timber                A1–A5 and the sealed half of F2
//       River Valley (4242).png                   start (white, door red), slopes (orange, high side
//                                                 brown), sources (blue)
//       River Valley (4242) F2 source gap.timber  the same map with the middle river-mouth source removed
//       River Valley (4242) F2 source gap.png     the gap tile marked magenta
//       checks.txt                                sha256, the start, slopes and sources
//
//   npx tsx tools/ingame-files.ts --milestone m2 [--seed 4242] [--size 128] [--out out/m2]
//     B (pre-filled water, tree survival, the empty-water A/B file, badwater downstream):
//       River Valley (4242).timber                B1, B3, B4: water, moisture and contamination pre-filled
//       River Valley (4242) (empty water).timber  B2: the same map with no water in the file
//       River Valley (4242).png                   the settled water (badwater brown), start, berry bushes
//                                                 near the start, living and dead trees, the badwater
//                                                 source and its ditch, the dam site, the depth samples
//       checks.txt                                sha256, and where to look, with the expected values
//
// The later milestones' files (M5's set pieces, M6's dam sites, M7's objects, M8's edited maps) were
// made with the editor's drawing tools and set pieces, which are gone (EDITOR_PLAN §10); their
// results are in docs/archive/ingame-log.md.
//
// Tile coordinates: x runs west to east, y runs south to north, (0, 0) is the south-west corner.

import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { BuildResult } from "../src/core/features/build";
import { generate } from "../src/core/gen/generate";
import { fileName, toTimberFile } from "../src/core/gen/pack";
import { rotate, slopeHighSide, startEntranceTile, type Orientation } from "../src/core/format/footprints";
import { writeTimber } from "../src/core/format/timber";
import { runsToTiles } from "../src/core/math/grid";
import { shadeTiles } from "../src/core/render/shade";
import { makeSpec } from "../src/core/spec/mapspec";
import { validateFile } from "../src/core/validate/checks";
import { rulesFor } from "../src/core/validate/playability";
import { encodePng } from "./png";

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const milestone = arg("milestone", "m2");
const seed = Number(arg("seed", "4242"));
const size = Number(arg("size", "128"));
const outDir = arg("out", `out/${milestone}`);
const SCALE = 5;

type Mark = { x: number; y: number; rgb: [number, number, number]; inset?: number };

function preview(b: BuildResult, marks: Mark[], water: boolean): Uint8Array {
  const { W, H } = b;
  const tiles = shadeTiles(b.heights, W, H, water ? b.water : null);
  if (water) {
    // badwater brown over the blue
    for (let i = 0; i < W * H; i++) {
      if (b.water[i] > 0.001 && b.contamination[i] >= 0.05) {
        tiles[i * 3] = 128;
        tiles[i * 3 + 1] = 84;
        tiles[i * 3 + 2] = 38;
      }
    }
  }
  const w = W * SCALE;
  const h = H * SCALE;
  const img = new Uint8Array(w * h * 3);
  const put = (px: number, py: number, c: ArrayLike<number>) => img.set([c[0], c[1], c[2]], (py * w + px) * 3);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const c = tiles.subarray((y * W + x) * 3, (y * W + x) * 3 + 3);
      const row = H - 1 - y; // north up
      for (let dy = 0; dy < SCALE; dy++) for (let dx = 0; dx < SCALE; dx++) put(x * SCALE + dx, row * SCALE + dy, c);
    }
  for (const m of marks) {
    if (m.x < 0 || m.y < 0 || m.x >= W || m.y >= H) continue;
    const row = H - 1 - m.y;
    const k = m.inset ?? 0;
    for (let dy = k; dy < SCALE - k; dy++) for (let dx = k; dx < SCALE - k; dx++) put(m.x * SCALE + dx, row * SCALE + dy, m.rgb);
  }
  // a dotted grid every 16 tiles, so coordinates can be read off the image (x east, y north)
  for (let y = 0; y < H; y += 16) for (let px = 0; px < w; px += 2) put(px, (H - 1 - y) * SCALE + SCALE - 1, [255, 255, 255]);
  for (let x = 0; x < W; x += 16) for (let py = 0; py < h; py += 2) put(x * SCALE, py, [255, 255, 255]);
  return encodePng(img, w, h);
}

function startMarks(b: BuildResult): Mark[] {
  const marks: Mark[] = [];
  const start = b.entities.find((e) => e.template === "StartingLocation")!;
  const o = start.orientation as Orientation;
  for (let lx = 0; lx < 3; lx++)
    for (let ly = 0; ly < 3; ly++) {
      const [dx, dy] = rotate(o, lx, ly);
      marks.push({ x: start.x + dx, y: start.y + dy, rgb: [255, 255, 255] });
    }
  const [ex, ey] = startEntranceTile(start.x, start.y, o);
  marks.push({ x: ex, y: ey, rgb: [220, 30, 30] });
  return marks;
}

const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
mkdirSync(outDir, { recursive: true });
const spec = makeSpec({ seed, size: { x: size, y: size } });
const r = generate(spec);
if (!r.report.passed) throw new Error("generation failed");
const base = fileName(r.spec).replace(/\.timber$/, "");
const b = r.built;
const W = b.W;
const start = b.entities.find((e) => e.template === "StartingLocation")!;
const door = startEntranceTile(start.x, start.y, start.orientation as Orientation);
const lines: string[] = [];

if (milestone === "m1") {
  writeFileSync(join(outDir, `${base}.timber`), r.bytes);
  const m1marks = (bb: BuildResult, gap?: { x: number; y: number }): Mark[] => {
    const marks = startMarks(bb);
    for (const s of bb.entities.filter((e) => e.template === "Slope")) {
      marks.push({ x: s.x, y: s.y, rgb: [245, 150, 20] });
      const [hx, hy] = slopeHighSide(s.orientation as Orientation);
      marks.push({ x: s.x + hx, y: s.y + hy, rgb: [150, 80, 0], inset: 1 });
    }
    for (const s of bb.entities.filter((e) => e.template === "WaterSource")) marks.push({ x: s.x, y: s.y, rgb: [30, 60, 230], inset: 1 });
    if (gap) marks.push({ x: gap.x, y: gap.y, rgb: [230, 0, 200] });
    return marks;
  };
  writeFileSync(join(outDir, `${base}.png`), preview(b, m1marks(b), false));
  // F2: drop the middle source of the river mouth. The other sources keep their strengths, so the
  // river is the same except for the gap.
  const sources = b.entities.filter((e) => e.template === "WaterSource");
  const mid = sources[sources.length >> 1];
  const gapBuilt: BuildResult = { ...b, entities: b.entities.filter((e) => e !== mid) };
  const gapFile = toTimberFile(r.spec, gapBuilt);
  const gapBytes = writeTimber(gapFile);
  const gapReport = validateFile(gapFile, { profile: "generate", loadOnly: true });
  if (!gapReport.passed) throw new Error(`the F2 gap file fails: ${gapReport.checks.filter((c) => !c.ok).map((c) => c.id).join(", ")}`);
  writeFileSync(join(outDir, `${base} F2 source gap.timber`), gapBytes);
  writeFileSync(join(outDir, `${base} F2 source gap.png`), preview(gapBuilt, m1marks(gapBuilt, mid), false));
  const slopes = b.entities.filter((e) => e.template === "Slope");
  lines.push(
    `${base}: ${size}×${size}, seed ${seed}, generator ${r.spec.generatorVersion}`,
    `sha256 ${sha(r.bytes)}  ${base}.timber`,
    `sha256 ${sha(gapBytes)}  ${base} F2 source gap.timber`,
    "",
    "Tile coordinates: x runs west to east, y runs south to north, (0, 0) is the south-west corner.",
    `Start: StartingLocation at (${start.x}, ${start.y}), z ${start.z}, ${start.orientation}; door tile (${door.join(", ")}).`,
    `Slopes (${slopes.length}): ${slopes.map((e) => `(${e.x}, ${e.y}) z${e.z} ${e.orientation}`).join("; ")}`,
    `River-mouth sources (${sources.length}): ${sources.map((e) => `(${e.x}, ${e.y})`).join(" ")}; strength ${b.sources[0]?.strength} each`,
    `F2 gap: the source at (${mid.x}, ${mid.y}) is removed in the gap file.`,
  );
} else {
  // ---- B: pre-filled water, tree survival, the empty-water A/B file, badwater downstream
  const emptyBytes = writeTimber(toTimberFile(r.spec, b, { emptyWater: true }));
  writeFileSync(join(outDir, `${base}.timber`), r.bytes);
  writeFileSync(join(outDir, `${base} (empty water).timber`), emptyBytes);
  const a = r.analysis!;
  const sd = a.startDistance!;
  const marks = startMarks(b);
  const living = (e: (typeof b.entities)[number]) => !("LivingNaturalResource" in e.components);
  const bushesNear = b.entities.filter((e) => e.template === "BlueberryBush" && living(e) && sd[e.y * W + e.x] <= 20);
  for (const e of b.entities) {
    if (["Pine", "Birch", "Oak"].includes(e.template)) marks.push({ x: e.x, y: e.y, rgb: living(e) ? [40, 200, 60] : [120, 105, 85], inset: 1 });
  }
  for (const e of bushesNear) marks.push({ x: e.x, y: e.y, rgb: [170, 60, 210], inset: 1 });
  const bad = b.entities.find((e) => e.template === "BadwaterSource");
  const marsh = r.features.find((f) => f.kind === "setPiece" && f.params.kind === "badwaterBasin");
  const ditch = marsh ? ((marsh.params as unknown as { plan: { ditch?: number[] } }).plan.ditch ?? []) : [];
  for (let k = 0; k + 1 < ditch.length; k += 2) marks.push({ x: ditch[k], y: ditch[k + 1], rgb: [230, 0, 200], inset: 1 });
  if (bad) for (let dx = 0; dx < 3; dx++) for (let dy = 0; dy < 3; dy++) marks.push({ x: bad.x + dx, y: bad.y + dy, rgb: [230, 0, 200] });
  const dam = a.bestDam;
  if (dam) {
    const half = Math.floor((dam.length - 1) / 2);
    for (let k = -half; k <= dam.length - 1 - half; k++) marks.push({ x: dam.x + k * dam.dir[1], y: dam.y + k * dam.dir[0], rgb: [255, 140, 20] });
  }
  // depth samples along the river: the channel tile on each sampled column with the most water
  const river = r.features.find((f) => f.kind === "river")!;
  const samples: string[] = [];
  const cols = [2, Math.round(W * 0.25), Math.round(W * 0.45), Math.round(W * 0.65), Math.round(W * 0.85), W - 3];
  for (const x of cols) {
    let best = -1;
    for (let y = 0; y < b.H; y++) if (b.channel[y * W + x] && (best < 0 || b.water[y * W + x] > b.water[best])) best = y * W + x;
    if (best < 0) continue;
    const y = Math.floor(best / W);
    marks.push({ x, y, rgb: [0, 230, 255], inset: 1 });
    const bw = b.contamination[best] >= 0.05 ? `, badwater ${Math.round(b.contamination[best] * 100)}%` : "";
    samples.push(`(${x}, ${y}) ${b.water[best].toFixed(2)} deep, surface ${(b.heights[best] + b.water[best]).toFixed(2)}${bw}`);
  }
  // nearest pumpable clean water to the start
  let pump = -1;
  for (let i = 0; i < W * b.H; i++) {
    const s = b.heights[i] + b.water[i];
    if (b.water[i] >= 0.3 && b.contamination[i] < 0.05 && s >= start.z - 2 && s <= start.z + 0.01 && (pump < 0 || sd[i] < sd[pump])) pump = i;
  }
  if (pump >= 0) marks.push({ x: pump % W, y: Math.floor(pump / W), rgb: [0, 230, 255] });
  writeFileSync(join(outDir, `${base}.png`), preview(b, marks, true));

  // groves: the largest living groves near the river and the largest dead stands
  const groves = r.features
    .filter((f) => f.kind === "forest")
    .map((f) => {
      const trees = b.entities.filter((e) => e.owner === f.id);
      const alive = trees.filter(living).length;
      const tiles = runsToTiles((f.params as { area: [number, number, number][] }).area, W);
      const cx = Math.round(tiles.reduce((s, i) => s + (i % W), 0) / tiles.length);
      const cy = Math.round(tiles.reduce((s, i) => s + Math.floor(i / W), 0) / tiles.length);
      return { id: f.id, species: Object.keys((f.params as { speciesMix: object }).speciesMix)[0], n: trees.length, alive, cx, cy };
    });
  const livingGroves = groves.filter((g) => g.species !== "Succulent" && g.alive > 0 && g.alive === g.n).sort((p, q) => q.n - p.n || p.cx - q.cx).slice(0, 4);
  const deadStands = groves.filter((g) => g.n > 0 && g.alive === 0).sort((p, q) => q.n - p.n || p.cx - q.cx).slice(0, 4);
  let nearestBad = Infinity;
  for (let i = 0; i < W * b.H; i++) if ((b.soilContamination[i] > 0 || (b.water[i] > 0.05 && b.contamination[i] >= 0.05)) && sd[i] < nearestBad) nearestBad = sd[i];
  let wet = 0;
  for (let i = 0; i < W * b.H; i++) if (b.water[i] > 0.001) wet++;
  const tr = b.entities.filter((e) => ["Pine", "Birch", "Oak", "Succulent"].includes(e.template));
  lines.push(
    `${base}: ${size}×${size}, seed ${seed}, generator ${r.spec.generatorVersion}`,
    `sha256 ${sha(r.bytes)}  ${base}.timber`,
    `sha256 ${sha(emptyBytes)}  ${base} (empty water).timber`,
    "",
    "Tile coordinates: x runs west to east, y runs south to north, (0, 0) is the south-west corner.",
    "PNG: north up, 5 px per tile, dotted grid every 16 tiles; water blue, badwater brown; start white (door red);",
    "living trees green, dead trees grey-brown; living berry bushes within 20 tiles of the start purple; the badwater",
    "source and its ditch magenta; the best dam site orange; depth samples and the nearest pumpable water cyan.",
    "",
    `Start: StartingLocation at (${start.x}, ${start.y}), z ${start.z}, ${start.orientation}; door tile (${door.join(", ")}).`,
    `Settled water: ${wet} wet tiles after the canonical settle (${b.settle.ticks} ticks from the pre-fill).`,
    `River: ${b.sources.filter((s) => s.template === "WaterSource").length} sources on the west edge, ${(river.params as { flow: number }).flow} water/s in all.`,
    `River depth samples, west to east (B1: the same on day 1, no surge or drain): ${samples.join("; ")}.`,
    pump >= 0
      ? `Nearest pumpable clean water to the start: (${pump % W}, ${Math.floor(pump / W)}), ${b.water[pump].toFixed(2)} deep, ${sd[pump].toFixed(1)} tiles from the start.`
      : "No pumpable water near the start.",
    `Living berry bushes within 20 tiles of the start (B1: none flagged dry): ${bushesNear.length}; for example ${bushesNear.slice(0, 5).map((e) => `(${e.x}, ${e.y})`).join(" ")}.`,
    `Trees: ${tr.length}, ${tr.filter(living).length} alive. Living groves (B3: still alive after 15 days): ${livingGroves.map((g) => `${g.n} ${g.species} around (${g.cx}, ${g.cy})`).join("; ")}.`,
    `Dead stands (B3: still dead, with logs): ${deadStands.map((g) => `${g.n} ${g.species} around (${g.cx}, ${g.cy})`).join("; ")}.`,
    bad
      ? `Badwater (B4): BadwaterSource at (${bad.x}, ${bad.y})–(${bad.x + 2}, ${bad.y + 2}), strength ${b.sources.find((s) => s.template === "BadwaterSource")?.strength}, in a pit with a ditch of ${ditch.length / 2} tiles to the river; the nearest badwater or contaminated soil is ${nearestBad.toFixed(0)} tiles from the start.`
      : "No badwater on this map.",
    dam
      ? `Best dam site: a ${dam.length}-tile dam at (${dam.x}, ${dam.y}), ${dam.height} level(s) high, holds ${dam.volume} water (the colony needs ${Math.round(rulesFor(r.spec).reservoirNeed)} stored through the worst drought).`
      : "No dam site near the start.",
    `Advisory: ${r.report.checks.filter((c) => c.advisory && !c.ok).map((c) => `${c.id}: ${c.message}`).join(" ") || "none"}`,
  );
}
writeFileSync(join(outDir, "checks.txt"), lines.join("\n") + "\n");
console.log(lines.join("\n"));
