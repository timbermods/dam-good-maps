// The pixel judge for the water's colour (Q9 P4, P5, P9; D496, D497): our water against the game's own on the same maps
// and from the same cameras, by the colour statistics of clean water, badwater and the front between them, band by
// contamination and depth. The game's side is the probe's
// in-game water shots (C:\dgm-probe\shots\<batch>\*-water.jpg) and the water the game had at that moment (its
// snapshot, C:\dgm-probe\results\<batch>\*.snapshot.json.gz); our side is that snapshot drawn by the editor's renderer
// (`setMap`: the terrain, the game's water and soil; no plants or buildings), on the GPU, from the shot's camera.
//
//   git archive --output=.scratch/judge-dev.tar origin/dev index.html real-places src public vite.config.ts tsconfig.json package.json tools/rust/vite-plugin.mjs
//   mkdir -p .scratch/judge-dev && tar -xf .scratch/judge-dev.tar -C .scratch/judge-dev
//   (and the same for a second tree to compare, --base, as .scratch/judge-826 from the commit that merged before)
//   npx tsx tools/water-pixel-judge.ts [--dev .scratch/judge-dev|none] [--base .scratch/judge-826] [--batch 20261002-1610-batch]
//     [--look standard|high|both] [--water clean|bad|mixed|all|pit|falls] [--define WATER_FORMULA|BADWATER_FORMULA|WATER_GAME_LIGHT,...]
//     [--set WATER_GAME_LIGHT=1,...] [--shots <id>,<id>]
//     [--light shot|day] [--reflection <strength>] [--samples] [--ours <dir>]
//     [--prefix m9b-|none] [--bands thin] [--tag <name>] [--sources [--only-sources] | --no-sources]
//     [--objects [--pose start|water]]
//
// `--water pit` samples the mine sites' pits (D496 as amended 2026-11-07: by day the game's pit the lighter) beside pure badwater, on the same
// shots: the pit's floor at the middle of each mine site's 5 × 5 (the 3 × 3 round its centre, at its depth,
// `MINE_PIT`), ours drawn with the map's mine sites (and nothing else of its objects); its shots default to the day-lit
// starts with badwater and mine sites in view.
//
// The light (`--light shot`, the default since 2026-11-07): the game's light changes through the day, and the probe's
// shots fall at their moments' hours: a game's start at hour 4 (the day's light), a hazard's end at midnight (the
// sunrise's), a game's end a little after hour 15.5 (islands-128-2-end at 15.53: 55 % toward the sunset's light, 50 %
// at 15.5). So ours is drawn in the game's light at the shot's hour and weather (tools/game-day-light.ts, from
// Sun.blueprint and the decompiled SkySystem): the sun's colour, intensity and height, the ambient's SH and the fog's
// colour, swapped into the shaders' constants and uniforms. `--light day` draws every shot in the day's light, as the
// editor does and the judge did before; the sunrise and sunset shots then read grey-blue, land included.
//
// The judge validates itself on the land, whose light, fog and finish the water shares: dry tops of grass, dry ground
// and contaminated ground, and cliff faces, away from water, from anything ours doesn't draw (plants, buildings,
// ruins, slopes) and from what a higher tile could shade, by the camera's distance; ours' distance to the game's pixel,
// its mean's (bias) and the floor, two game samples' distance at the game's own spread (√2 × it). On land within that
// floor, the judge's colour rulings on the water stand.
//
// The land's samples cluster: on the six start shots grass is 160 tiles, 108 of them on riverValley-128-1, so the
// patterns of both sides (ours, and the game's own textures, world-anchored) move a kind's mean by a few luma at a
// cluster. `--define GROUND_MEANS` draws this branch's second case with every top at the game's texture means
// (materials.ts `GROUND_MEANS`, palette.ts GAME_GROUND_MEAN): its land is our light alone, to set against the game's
// pixels with its texture's own variation at each sample taken out (docs/progress/3d-view.md, "Grass in the game's
// light"; the game's textures read locally, never kept).
//
// The camera: the probe's water pose (investigation/probe/runner/catalog.ts `standardPoses`) is where the game's camera
// was asked to look, but its field of view and distance do not carry over exactly (Q8 found 31-37° and 1.0-1.35× the
// distance). So the judge fits ours to the shot first: yaw, pitch, distance, field of view and the target's place,
// by Nelder-Mead, scoring how well the snapshot's wet and dry tiles, projected, land on water and on land in the shot
// (a coarse colour test of the shot's pixels, blurred; only tiles whose 3×3 round them are all wet or all dry). The
// probe places its camera by the map alone, the same at every moment, so every shot of a map takes the fit of its start
// shot, in the day's light, where the test holds (`--fits` prints each shot's own fit beside it and stops).
//
// The samples, by the tile's badwater share (`--water`): clean water (under 0.02, every neighbour wet and clean), pure
// badwater (0.95 or more, its neighbours too) and the front between (0.05 to 0.95, its neighbours wet), each with its
// surface level with its neighbours'; each tile's centre projected, the mean of a 5×5 patch of pixels there in the shot
// and in each of ours. Per band (the share's kind and the game's depth) it prints each side's mean and spread in
// display RGB with its L*, and each of ours' mean distance to the game's pixel by pixel (the root of the mean squared
// difference over the three channels, 0-255). Ours: dev, the tree given by --base (if any), and this branch with our
// colour and with the game's formula (the same build, its shaders compiled with `--define` 0 or 1: WATER_FORMULA for
// clean water, waterPalette.ts GAME_WATER.use; BADWATER_FORMULA and BADWATER_FORMULA_HIGH for badwater, GAME_BADWATER.use
// by look; a define already at the case's value is left). Writes
// .scratch/water-judge/<shot>-<look>-<case>.jpg (the shot beside ours, for the eye, labelled with the shot its camera was
// fitted on; a run clears the pairs of the runs before it) and
// .scratch/water-judge/judge-<water>-<light>.json.

import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { gunzipSync } from "node:zlib";
import { chromium, type Browser, type Page } from "@playwright/test";
import { build, preview, type PreviewServer } from "vite";
import { readMapBytes, wetAreas } from "../investigation/probe/runner/mapfile";
import { GAME_AMBIENT_SH, GAME_FINISH, GAME_LIGHT, gameAmbient } from "../src/render3d/palette";
import { WATER_LIGHT, WATER_SURFACE, type Rgb } from "../src/render3d/waterPalette";
import { dayLight, type DayLight, type Hazard } from "./game-day-light";
import { rotate, type Orientation } from "../src/core/format/footprints";
import { MINE_PIT } from "../src/render3d/entities3d";
import { sunOfYaw } from "../src/render3d/light";
import { waitForEditor } from "./wait-editor";

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
/** The tree ours is compared with (`--dev none`: none, this branch alone). */
const DEV = arg("dev") === "none" ? null : resolve(arg("dev") ?? ".scratch/judge-dev");
const BASE = arg("base") ? resolve(arg("base") as string) : null;
const BATCH = arg("batch") ?? "20261002-1610-batch";
/** The batch's file names' prefix (`--prefix none` for a set without one, as `ceiling-20260927`). */
const PREFIX = arg("prefix") === "none" ? "" : arg("prefix") ?? "m9b-";
const LOOKS = (arg("look") ?? "both") === "both" ? (["standard", "high"] as const) : ([arg("look")] as ("standard" | "high")[]);
const OUT = resolve(".scratch/water-judge");
/** Which water it samples: clean (the colour's judge), bad (pure badwater), mixed (the front) or all three; the mine
 *  sites' pits beside pure badwater (`pit`); or clean water and the clean water at a fall's foot beside it (`falls`:
 *  a tile a neighbour's surface stands 0.6 or more over, where the game's waterfall mask is whole, Q9 P1). */
const WATER = (["bad", "mixed", "all", "pit", "falls"] as const).find((w) => w === arg("water")) ?? "clean";
type Kind = "clean" | "mixed" | "bad" | "pit" | "falls";
const KINDS: readonly Kind[] = WATER === "all" ? ["clean", "mixed", "bad"] : WATER === "pit" ? ["bad", "pit"] : WATER === "falls" ? ["clean", "falls"] : [WATER];
/** The define the two builds of this branch differ by, with its High look's own where it has one (badwater's is split
 *  by look: `BADWATER_FORMULA_HIGH`, waterPalette.ts `GAME_BADWATER.use.high`). */
const DEFINE = arg("define") ?? (WATER === "clean" || WATER === "falls" ? "WATER_FORMULA" : "BADWATER_FORMULA");
/** (`--define A,B`: several at once, each with its High look's own) */
const DEFINES = DEFINE.split(",").flatMap((d) => [d, `${d}_HIGH`]);
/** `--set A=1,B=0`: defines this branch's both cases are built with, whatever the branch ships (each with its High
 *  look's own), so a choice is judged on top of another not shipped yet (the water's light, Q9 P15, waterPalette.ts
 *  WATER_LIGHT, under badwater's colour choice). */
const SETS: [string, string][] = (arg("set") ?? "")
  .split(",")
  .filter(Boolean)
  .flatMap((kv) => {
    const [d, v] = kv.split("=");
    return [d, `${d}_HIGH`].flatMap((n): [string, string][] => [
      [`#define ${n} 0`, `#define ${n} ${v}`],
      [`#define ${n} 1`, `#define ${n} ${v}`],
    ]);
  })
  .filter(([a, b]) => a !== b);
const PORT = Number(arg("port") ?? 4971);
/** The light ours is drawn in: the game's at the shot's own hour and weather (`shot`, tools/game-day-light.ts), or the
 *  day's alone, as the editor draws it (`day`: the judge before 2026-11-07, which drew every shot in the day's light). */
const LIGHT_MODE = arg("light") === "day" ? "day" : "shot";
/** `--fit own`: each shot fits its own camera (the judge before 2026-11-07), not its map's start shot's. */
/** `--objects`: the map's objects against the game's (D135 as amended 2026-11-09, the objects in the game's light): ours
 *  drawn with every object the map has, sampled by part on the trees', bushes', ruins' and water sources' own places
 *  (`objectPoints`), on the probe's start shots by default (`--pose start`, its camera 45 away: a crown 20 pixels or so
 *  across). Each part's mean colour and luma, the game's and each case's, pooled over the shots. */
const OBJECTS = process.argv.includes("--objects");
/** `--pose <id>`: the probe's pose whose shots are judged (catalog.ts `standardPoses`): `water` (the default), or
 *  `start` (the default with `--objects`), whose camera each shot fits on itself. */
const POSE = arg("pose") ?? (OBJECTS ? "start" : "water");
const FIT_OWN = arg("fit") === "own" || POSE !== "water";
/** The environment reflection's strength to draw with in place of the shipped one (`GAME_FINISH.reflectionIntensity`,
 *  `WATER_SURFACE.reflection`: 1, what the game's `Sun.UpdateColors` sets every frame), on the terrain and the water:
 *  `--reflection 0.65` draws the scene's saved `m_ReflectionIntensity`, which the editor drew before 2026-11-07. */
const REFLECTION = arg("reflection") ? Number(arg("reflection")) : null;
/** `--ambient <k>`: the ambient probe's SH × k (linear values, before the shader turns them to display values), a
 *  question for the look: the scene's `m_AmbientIntensity` 1.2, if the engine applies it to a Trilight. */
const AMBIENT = arg("ambient") ? Number(arg("ambient")) : null;
/** `--samples`: the land's samples one by one in the JSON (`landSamples`: each its kind, point, moisture, the camera's
 *  distance and view depth, the game's pixel and each case's), to model the game's terms on them offline; with them a
 *  fifth kind, `edge` (moisture 1 to 5: the game's desert over part of the grass), for how dryness shows. */
const SAMPLES = process.argv.includes("--samples");
/** `--ours <dir>`: each of our renders kept there as it was drawn (`<shot>-<look>-<case>.png`), for a sheet of ours alone. */
const OURS = arg("ours") ? resolve(arg("ours") as string) : null;
const W_PX = 1280;
const H_PX = 800;
const CLOCK = 12.5;
// (the start of each game: its end shots of River Valley fall in a badtide, its fog over the whole picture; for
// badwater, the Badtide's end on the five maps Q8 fitted, and Islands 2's end, where both waters show)
const SHOTS = (
  arg("shots") ??
  (OBJECTS
    ? "riverValley-128-1-start,riverValley-128-2-start,lakeBasin-128-1-start,lakeBasin-128-2-start,highlands-128-1-start,highlands-128-2-start,canyon-128-1-start,canyon-128-2-start,any-128-1-start,any-128-2-start,delta-128-1-start,delta-128-2-start,islands-128-1-start,islands-128-2-start,chaos-256-1-start,chaos-256-2-start"
    : WATER === "pit"
    ? "any-128-1-start,any-128-2-start,canyon-128-1-start,canyon-128-2-start,chaos-256-1-start,chaos-256-2-start,delta-128-1-start,delta-128-2-start,highlands-128-1-start,highlands-128-2-start,islands-128-1-start,islands-128-2-start,lakeBasin-128-1-start,lakeBasin-128-2-start,riverValley-128-1-start,riverValley-128-2-start"
    : WATER === "clean" || WATER === "falls"
    ? "riverValley-128-1-start,riverValley-128-2-start,lakeBasin-128-1-start,lakeBasin-128-2-start,highlands-128-1-start,highlands-128-2-start"
    : "islands-128-2-end,islands-128-1-badtide2-end,islands-128-2-badtide2-end,highlands-128-1-badtide2-end,lakeBasin-128-1-badtide2-end,chaos-256-2-badtide2-end")
).split(",");
/** `--bands thin`: badwater's own colour by depth as #905 left it bare (thin under 0.1, where the bed mattered, medium
 *  to a level, deep), sampled from water 0.001 deep (`MIN_DEPTH`, the editor's wet); else from 0.05 deep, by the
 *  bands below. */
const THIN = arg("bands") === "thin";
const MIN_DEPTH = THIN ? 0.001 : 0.05;
const BANDS: [number, number][] = THIN
  ? [
      [0.001, 0.1],
      [0.1, 1],
      [1, 9],
    ]
  : [
      [0.05, 0.5],
      [0.5, 1],
      [1, 2],
      [2, 3],
      [3, 9],
    ];
/** `--no-sources`: leave out the water over a badwater source's 3 × 3, where the game draws its source's pattern
 *  (Q9 P7) and ours, drawn here without the map's objects, does not. */
const NO_SOURCES = process.argv.includes("--no-sources");
/** `--sources`: draw the map's badwater sources (their crater and the water's source pattern over their 3 × 3), as the
 *  game's shot shows them; without it the judge draws no objects but a pit's mines. */
const SOURCES = process.argv.includes("--sources");
/** `--only-sources`: judge only the water over the badwater sources' 3 × 3 (with `--sources`). */
const ONLY_SOURCES = process.argv.includes("--only-sources");

interface Snapshot {
  day: number;
  weather: string;
  plants: { x: number; y: number }[];
  width: number;
  height: number;
  depth: number[];
  contamination: number[];
  moisture: number[];
  soilContamination: number[];
  terrain: number[];
}

interface Cam {
  yaw: number;
  pitch: number;
  distance: number;
  fov: number;
  target: [number, number, number];
}

// ---------------------------------------------------------------------------------------- the camera, as ours places it

type V3 = [number, number, number];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: V3): V3 => {
  const l = Math.hypot(...a);
  return [a[0] / l, a[1] / l, a[2] / l];
};

/** A projector for a camera placed as renderer.ts places its orbit camera (cameraClamp.ts orbitEye, lookAt with y up):
 *  world point to pixel (x right, y down), or null behind it. */
function projector(c: Cam): (p: V3) => [number, number] | null {
  const cp = Math.cos(c.pitch);
  const eye: V3 = [c.target[0] + Math.sin(c.yaw) * cp * c.distance, c.target[1] + Math.sin(c.pitch) * c.distance, c.target[2] + Math.cos(c.yaw) * cp * c.distance];
  const zc = norm(sub(eye, c.target));
  const xc = norm(cross([0, 1, 0], zc));
  const yc = cross(zc, xc);
  const f = 1 / Math.tan((c.fov * Math.PI) / 360);
  const aspect = W_PX / H_PX;
  return (p) => {
    const d = sub(p, eye);
    const z = -dot(d, zc);
    if (z <= 0.5) return null;
    const x = (dot(d, xc) * f) / aspect / z;
    const y = (dot(d, yc) * f) / z;
    return [((x + 1) / 2) * W_PX, ((1 - y) / 2) * H_PX];
  };
}

/** Nelder-Mead, minimising f from x0 with the given steps. */
function nelderMead(f: (x: number[]) => number, x0: number[], steps: number[], iterations = 400): number[] {
  const n = x0.length;
  let pts = [x0, ...steps.map((s, i) => x0.map((v, j) => (j === i ? v + s : v)))].map((x) => ({ x, v: f(x) }));
  for (let it = 0; it < iterations; it++) {
    pts.sort((a, b) => a.v - b.v);
    const c = new Array(n).fill(0);
    for (let k = 0; k < n; k++) for (let j = 0; j < n; j++) c[j] += pts[k].x[j] / n;
    const worst = pts[n];
    const at = (t: number) => c.map((v, j) => v + t * (worst.x[j] - v));
    const r = { x: at(-1), v: 0 };
    r.v = f(r.x);
    if (r.v < pts[0].v) {
      const e = { x: at(-2), v: 0 };
      e.v = f(e.x);
      pts[n] = e.v < r.v ? e : r;
    } else if (r.v < pts[n - 1].v) pts[n] = r;
    else {
      const k = { x: at(0.5), v: 0 };
      k.v = f(k.x);
      if (k.v < worst.v) pts[n] = k;
      else pts = pts.map((p, i) => (i === 0 ? p : { x: p.x.map((v, j) => pts[0].x[j] + 0.5 * (v - pts[0].x[j])), v: f(p.x.map((v, j) => pts[0].x[j] + 0.5 * (v - pts[0].x[j]))) }));
    }
  }
  pts.sort((a, b) => a.v - b.v);
  return pts[0].x;
}

// -------------------------------------------------------------------------------------------------------- the pixels

/** Page side: an image (base64, any type) as RGBA bytes (base64). */
const DECODE_JS = `async ({ b64, type }) => {
  const i = new Image(); i.src = "data:" + type + ";base64," + b64; await i.decode();
  const c = document.createElement("canvas"); c.width = i.width; c.height = i.height;
  const g = c.getContext("2d"); g.drawImage(i, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height).data;
  let s = ""; for (let k = 0; k < d.length; k += 0x8000) s += String.fromCharCode.apply(null, d.subarray(k, k + 0x8000));
  return btoa(s);
}`;

/** Page side: two images side by side, labelled, as a JPEG (base64). */
const PAIR_JS = `async ({ a, b, la, lb }) => {
  const load = async (s) => { const i = new Image(); i.src = "data:image/" + s.t + ";base64," + s.b; await i.decode(); return i; };
  const [ia, ib] = [await load(a), await load(b)];
  const w = 640, h = 400, band = 24;
  const c = document.createElement("canvas"); c.width = w * 2 + 6; c.height = h + band;
  const g = c.getContext("2d"); g.fillStyle = "#1b1b1b"; g.fillRect(0, 0, c.width, c.height);
  g.drawImage(ia, 0, band, w, h); g.drawImage(ib, w + 6, band, w, h);
  g.fillStyle = "#f2f2f2"; g.font = "15px system-ui, sans-serif"; g.fillText(la, 8, 17); g.fillText(lb, w + 14, 17);
  return c.toDataURL("image/jpeg", 0.85).split(",")[1];
}`;

async function decode(tool: Page, buf: Buffer, type: string): Promise<Uint8Array> {
  const b64 = (await tool.evaluate(`(${DECODE_JS})(${JSON.stringify({ b64: buf.toString("base64"), type })})`)) as string;
  return new Uint8Array(Buffer.from(b64, "base64"));
}

/** The shot's land-or-water test, coarse (the game's clean water is a dark teal to navy; land is green, grey or
 *  brown, and the void round the map a bright blue), blurred over 7×7 pixels: 0 land, 1 water. */
function waterMask(px: Uint8Array): Float32Array {
  const raw = new Float32Array(W_PX * H_PX);
  for (let i = 0; i < W_PX * H_PX; i++) {
    const r = px[i * 4];
    const g = px[i * 4 + 1];
    const b = px[i * 4 + 2];
    raw[i] = b > r + 14 && b > g - 6 && b - g < 45 && Math.max(r, g, b) < 150 ? 1 : 0;
  }
  const out = new Float32Array(W_PX * H_PX);
  const R = 3;
  const tmp = new Float32Array(W_PX * H_PX);
  for (let y = 0; y < H_PX; y++)
    for (let x = 0; x < W_PX; x++) {
      let s = 0;
      let n = 0;
      for (let d = -R; d <= R; d++) if (x + d >= 0 && x + d < W_PX) (s += raw[y * W_PX + x + d]), n++;
      tmp[y * W_PX + x] = s / n;
    }
  for (let y = 0; y < H_PX; y++)
    for (let x = 0; x < W_PX; x++) {
      let s = 0;
      let n = 0;
      for (let d = -R; d <= R; d++) if (y + d >= 0 && y + d < H_PX) (s += tmp[(y + d) * W_PX + x]), n++;
      out[y * W_PX + x] = s / n;
    }
  return out;
}

/** The mean colour of a 5×5 patch at a pixel. */
function patch(px: Uint8Array, x: number, y: number, r = 2): V3 {
  const c: V3 = [0, 0, 0];
  let n = 0;
  for (let dy = -r; dy <= r; dy++)
    for (let dx = -r; dx <= r; dx++) {
      const xx = Math.round(x) + dx;
      const yy = Math.round(y) + dy;
      if (xx < 0 || yy < 0 || xx >= W_PX || yy >= H_PX) continue;
      const i = (yy * W_PX + xx) * 4;
      c[0] += px[i];
      c[1] += px[i + 1];
      c[2] += px[i + 2];
      n++;
    }
  return [c[0] / n, c[1] / n, c[2] / n];
}

/** Contaminated ground's veins round a pixel (D154 as amended 2026-11-07): of a `2 × VEIN_PATCH + 1` square's pixels,
 *  how many read as the veins' rust (red well over green, blue under `VEIN_TEST.blue` of red: the dry earth and the
 *  grass under them are neither), and the sum of their colours and of all the pixels'. */
const VEIN_PATCH = 6;
const VEIN_TEST = { redOverGreen: 18, blue: 0.5 };
interface VeinCount {
  px: number;
  vein: number;
  veinSum: V3;
  allSum: V3;
}
const veinCount = (): VeinCount => ({ px: 0, vein: 0, veinSum: [0, 0, 0], allSum: [0, 0, 0] });
function veinsAt(px: Uint8Array, x: number, y: number, into: VeinCount): void {
  for (let dy = -VEIN_PATCH; dy <= VEIN_PATCH; dy++)
    for (let dx = -VEIN_PATCH; dx <= VEIN_PATCH; dx++) {
      const xx = Math.round(x) + dx;
      const yy = Math.round(y) + dy;
      if (xx < 0 || yy < 0 || xx >= W_PX || yy >= H_PX) continue;
      const i = (yy * W_PX + xx) * 4;
      const c: V3 = [px[i], px[i + 1], px[i + 2]];
      into.px++;
      for (let k = 0; k < 3; k++) into.allSum[k] += c[k];
      if (c[0] - c[1] > VEIN_TEST.redOverGreen && c[2] < VEIN_TEST.blue * c[0]) {
        into.vein++;
        for (let k = 0; k < 3; k++) into.veinSum[k] += c[k];
      }
    }
}

// -------------------------------------------------------------------------------------------------------- the maps

interface Shot {
  id: string;
  snap: Snapshot;
  heights: number[];
  pose: Cam;
  png: Buffer;
  /** The game's light when the shot was taken (its hour and weather). */
  light: DayLight;
  /** Tiles near anything ours doesn't draw (plants, buildings, ruins, slopes, mine sites): the land judge leaves them out. */
  covered: Uint8Array;
  /** The tiles of the map's badwater sources' 3 × 3 footprints (`--no-sources`). */
  sources: Uint8Array;
  /** The map's mine sites (`--water pit`): their origin, level and turn, and the tile at their footprint's centre. */
  mines: { x: number; y: number; z: number; orientation: Orientation; cx: number; cy: number }[];
  /** Every object of the map (`--objects`), and its start's tile. */
  objects: { template: string; x: number; y: number; z: number; orientation: string }[];
  start: [number, number] | null;
  /** The map's badwater sources (`--sources`). */
  badSources: { x: number; y: number; z: number; orientation: Orientation; strength: number }[];
}

/** The probe's record of a map (its result's JSON): its shots' hours and its objects. */
interface ProbeResult {
  shots: { momentId: string; pose: string; day: number }[];
  entitiesAtStart: { template: string; x: number; y: number }[];
  entitiesAtEnd: { template: string; x: number; y: number }[];
}

function loadShot(id: string): Shot {
  const snap = JSON.parse(gunzipSync(readFileSync(`C:/dgm-probe/results/${BATCH}/${PREFIX}${id}.snapshot.json.gz`)).toString("utf8")) as Snapshot;
  const mapId = id.replace(/(-badtide\d+|-drought\d+)?-(start|end|day1)$/, "");
  const m = readMapBytes(new Uint8Array(readFileSync(`C:/dgm-probe/maps/${BATCH}/${PREFIX}${mapId}.timber`)));
  // the probe's water pose (catalog.ts standardPoses, which this follows: that module is not loadable here): the wet
  // tile nearest the largest water's centre, 30° east of north, 55° down, at 2.2 × the root of its tiles (35 to 110)
  const water = wetAreas(m)[0];
  if (!water) throw new Error(`${id}: no water`);
  let best = water.tiles[0];
  let bd = Infinity;
  for (const t of water.tiles) {
    const d = ((t % m.W) - water.cx) ** 2 + (((t / m.W) | 0) - water.cy) ** 2;
    if (d < bd) (bd = d), (best = t);
  }
  const x = best % m.W;
  const y = (best / m.W) | 0;
  const target: [number, number, number] = [x + 0.5, m.floor[best] >= 0 ? m.floor[best] + m.depth[best] : m.heights[best], -(y + 0.5)];
  // the shot's hour (its moment's water shot) and weather then, and what stands on the map then
  const result = JSON.parse(readFileSync(`C:/dgm-probe/results/${BATCH}/${PREFIX}${mapId}.json`, "utf8")) as ProbeResult;
  const moment = id.slice(mapId.length + 1);
  const taken = result.shots.find((t) => t.momentId === moment && t.pose === POSE);
  if (!taken) throw new Error(`${id}: no ${POSE} shot in the probe's record`);
  const hazard: Hazard = snap.weather === "drought" || snap.weather === "badtide" ? snap.weather : null;
  const covered = new Uint8Array(snap.width * snap.height);
  const cover = (cx: number, cy: number, r: number) => {
    for (let yy = Math.max(0, cy - r); yy <= Math.min(snap.height - 1, cy + r); yy++)
      for (let xx = Math.max(0, cx - r); xx <= Math.min(snap.width - 1, cx + r); xx++) covered[yy * snap.width + xx] = 1;
  };
  for (const p of snap.plants) cover(p.x, p.y, 2);
  const sources = new Uint8Array(snap.width * snap.height);
  for (const e of m.entities.filter((e) => e.template === "BadwaterSource")) {
    const o = (["Cw0", "Cw90", "Cw180", "Cw270"].includes(e.orientation) ? e.orientation : "Cw0") as Orientation;
    const [cx, cy] = rotate(o, 1, 1).map((v, k) => v + (k ? e.y : e.x));
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (cx + dx >= 0 && cy + dy >= 0 && cx + dx < snap.width && cy + dy < snap.height) sources[(cy + dy) * snap.width + cx + dx] = 1;
  }
  for (const e of [...result.entitiesAtStart, ...result.entitiesAtEnd]) cover(e.x, e.y, 3);
  return {
    id,
    snap,
    heights: snap.terrain,
    // (the start pose: the start's tile, 45 away)
    pose:
      POSE === "start" && m.start
        ? { yaw: -Math.PI / 6, pitch: (55 * Math.PI) / 180, distance: 45, fov: 40, target: [m.start.x + 0.5, m.heights[m.start.y * m.W + m.start.x], -(m.start.y + 0.5)] }
        : { yaw: -Math.PI / 6, pitch: (55 * Math.PI) / 180, distance: Math.min(110, Math.max(35, Math.sqrt(water.tiles.length) * 2.2)), fov: 40, target },
    png: readFileSync(`C:/dgm-probe/shots/${BATCH}/${PREFIX}${id}-${POSE}.jpg`),
    objects: m.entities.map((e) => ({ template: e.template, x: e.x, y: e.y, z: e.z, orientation: e.orientation })),
    start: m.start ? [m.start.x, m.start.y] : null,
    light: LIGHT_MODE === "day" ? dayLight(0.5, null) : dayLight(taken.day, hazard),
    covered,
    sources,
    badSources: m.entities
      .filter((e) => e.template === "BadwaterSource")
      .map((e) => {
        // (the save's numbers are { value, raw })
        const ws = (e.components as Record<string, { CurrentStrength?: { value?: number } | number }>).WaterSource;
        const v = ws?.CurrentStrength;
        return { x: e.x, y: e.y, z: e.z, orientation: (["Cw0", "Cw90", "Cw180", "Cw270"].includes(e.orientation) ? e.orientation : "Cw0") as Orientation, strength: Number(typeof v === "object" ? v.value : (v ?? 1)) };
      }),
    mines: m.entities
      .filter((e) => e.template === "UndergroundRuins")
      .map((e) => {
        const o = (["Cw0", "Cw90", "Cw180", "Cw270"].includes(e.orientation) ? e.orientation : "Cw0") as Orientation;
        const [dx, dy] = rotate(o, 2, 2);
        return { x: e.x, y: e.y, z: e.z, orientation: o, cx: e.x + dx, cy: e.y + dy };
      }),
  };
}

/** The points the camera fit scores: tiles whose 3×3 is all wet (1) or all dry (0), at their surface. */
function fitPoints(s: Shot): { p: V3; wet: number }[] {
  const { width: W, height: H, depth } = s.snap;
  const out: { p: V3; wet: number }[] = [];
  for (let y = 1; y < H - 1; y++)
    for (let x = 1; x < W - 1; x++) {
      let wet = 0;
      let bad = false;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const j = (y + dy) * W + x + dx;
          if (depth[j] > 0.05) wet++;
          if (depth[j] > 0.05 && s.snap.contamination[j] > 0.05) bad = true;
        }
      if (wet !== 0 && wet !== 9) continue;
      const i = y * W + x;
      // (badwater is no dark teal: the shot's test calls it land, so its tiles count as land, at their surface; the
      // front between, neither, is left out)
      if (bad && !(Math.min(...[-1, 0, 1].flatMap((dy) => [-1, 0, 1].map((dx) => s.snap.contamination[(y + dy) * W + x + dx]))) > 0.5)) continue;
      out.push({ p: [x + 0.5, s.heights[i] + (wet ? depth[i] : 0), -(y + 0.5)], wet: wet && !bad ? 1 : 0 });
    }
  return out;
}

/** The field of view a camera fit may take (degrees): round Q8's 31-37°. */
const FIT_FOV = [28, 46] as const;

function fitCamera(s: Shot, mask: Float32Array): { cam: Cam; score: number } {
  const pts = fitPoints(s);
  const camOf = (x: number[]): Cam => ({ yaw: x[0], pitch: x[1], distance: Math.exp(x[2]), fov: x[3], target: [s.pose.target[0] + x[4], s.pose.target[1], s.pose.target[2] + x[5]] });
  const score = (x: number[]) => {
    // (the game's field of view is 31-37° (Q8): a fit outside FIT_FOV is the score trading the field of view against
    // the distance, as islands-128-1-badtide2-start's own fit did, 12° from 120 away, framed on the island alone)
    if (x[3] < FIT_FOV[0] || x[3] > FIT_FOV[1]) return 2;
    const pr = projector(camOf(x));
    let wetHit = 0;
    let wetN = 0;
    let dryHit = 0;
    let dryN = 0;
    for (const q of pts) {
      const at = pr(q.p);
      if (!at || at[0] < 0 || at[1] < 0 || at[0] >= W_PX || at[1] >= H_PX) continue;
      const m = mask[Math.floor(at[1]) * W_PX + Math.floor(at[0])];
      if (q.wet) (wetHit += m), wetN++;
      else (dryHit += 1 - m), dryN++;
    }
    if (wetN < 50 || dryN < 50) return 2;
    return -(wetHit / wetN + dryHit / dryN) / 2;
  };
  let best = { x: [s.pose.yaw, s.pose.pitch, Math.log(s.pose.distance), s.pose.fov, 0, 0], v: Infinity };
  // (from a few starting zooms: the field of view and the distance trade off, and the score is flat far from the answer)
  for (const fov of [32, 36, 40])
    for (const k of [1, 1.2]) {
      const x0 = [s.pose.yaw, s.pose.pitch, Math.log(s.pose.distance * k), fov, 0, 0];
      const x = nelderMead(score, x0, [0.05, 0.05, 0.1, 3, 3, 3]);
      const v = score(x);
      if (v < best.v) best = { x, v };
    }
  const x = nelderMead(score, best.x, [0.01, 0.01, 0.02, 0.5, 0.5, 0.5]);
  return { cam: camOf(x), score: -score(x) };
}

/** The kind of water a badwater share is, or null between kinds. */
const kindOf = (c: number): Kind | null => (c <= 0.02 ? "clean" : c >= 0.95 ? "bad" : c >= 0.05 ? "mixed" : null);

/** The interior water tiles to sample, of the kinds asked: every neighbour wet, of the same kind (any share for the
 *  front) and within 0.1 of its level (no step), with their depth and kind. */
function samplePoints(s: Shot): { p: V3; depth: number; kind: Kind }[] {
  const { width: W, height: H, depth, contamination } = s.snap;
  const out: { p: V3; depth: number; kind: Kind }[] = [];
  for (let y = 1; y < H - 1; y++)
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      const kind = kindOf(contamination[i]);
      if (!(depth[i] > MIN_DEPTH) || !kind || !KINDS.includes(kind) || (NO_SOURCES && s.sources[i]) || (ONLY_SOURCES && !s.sources[i])) continue;
      const level = s.heights[i] + depth[i];
      let ok = true;
      for (let dy = -1; dy <= 1 && ok; dy++)
        for (let dx = -1; dx <= 1 && ok; dx++) {
          const j = (y + dy) * W + x + dx;
          if (!(depth[j] > MIN_DEPTH) || (kind !== "mixed" && kindOf(contamination[j]) !== kind) || Math.abs(s.heights[j] + depth[j] - level) > 0.1) ok = false;
        }
      if (ok) out.push({ p: [x + 0.5, level, -(y + 0.5)], depth: depth[i], kind });
      // (a fall's foot: clean, its four neighbours wet and clean, one of them 0.6 or more higher)
      else if (KINDS.includes("falls") && kind === "clean") {
        let rise = -Infinity;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const j = (y + dy) * W + x + dx;
          rise = depth[j] > 0.05 && kindOf(contamination[j]) === "clean" ? Math.max(rise, s.heights[j] + depth[j] - level) : NaN;
          if (Number.isNaN(rise)) break;
        }
        if (rise >= 0.6) out.push({ p: [x + 0.5, level, -(y + 0.5)], depth: depth[i], kind: "falls" });
      }
    }
  // the mine sites' pits: their floor at the 3 × 3 round the footprint's centre, at the pit's depth (counted as a level
  // deep, so they fall in the bands' whole range)
  if (KINDS.includes("pit"))
    for (const mine of s.mines)
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) out.push({ p: [mine.cx + dx + 0.5, mine.z - MINE_PIT.depth + 0.02, -(mine.cy + dy + 0.5)], depth: 1, kind: "pit" });
  return out;
}

// -------------------------------------------------------------------------------------------------------- the land

/** The land's kinds the judge validates itself on (the water's light, fog and finish are the land's): level tops of grass
 *  (moisture 6 or more, the game's full green), dry ground (no moisture) and contaminated ground (a share over 0.2),
 *  each with its 3×3 all of its kind, and cliff faces two levels or more high. On contaminated ground the judge also
 *  counts its veins (`veinsAt`): their share of the pixels and their colour, the game's and ours. */
type LandKind = "grass" | "dry" | "contaminated" | "cliff" | "edge" | "shade-grass" | "shade-dry" | "shade-cliff";
/** `--shade`: the land in shade too, lit by the ambient alone (the game's ambient probe; docs/progress/3d-view.md, "The
 *  game's ambient probe, captured"): grass and dry tops level with their 3 × 3 whose middle (±0.4 of a tile) lies in a
 *  higher tile's shadow, by the shot's sun and our baked shadows' 45° alike (`shade-grass`, `shade-dry`), and cliff faces
 *  toward the camera turned from the sun (`shade-cliff`; the game's sun stands behind the camera's left shoulder, so these
 *  are seen edge-on at the view's side, if at all). */
const SHADE = process.argv.includes("--shade");
const LAND_KINDS: readonly LandKind[] = [...(SAMPLES ? ["grass", "dry", "contaminated", "cliff", "edge"] : ["grass", "dry", "contaminated", "cliff"]), ...(SHADE ? ["shade-grass", "shade-dry", "shade-cliff"] : [])] as LandKind[];
/** The camera's distance bands the land is judged by (the fog's share grows with the distance). */
const LAND_BANDS: [number, number][] = [
  [0, 70],
  [70, 110],
  [110, 999],
];

/** The land to sample: dry tops level with their 3×3 and five tiles from any water (contaminated ground two), where no higher tile within four
 *  could shade them (any sun over 31°: the game's sun is 30–45° up and turns with the camera), and cliff faces turned
 *  toward the camera (the sun shines from behind its left shoulder); none near anything ours doesn't draw (`covered`),
 *  none hidden from the camera by the land; at a top's centre or a face's middle. */
function landPoints(s: Shot, cam: Cam): { p: V3; kind: LandKind; distance: number }[] {
  const { width: W, height: H, depth, moisture, soilContamination: soil } = s.snap;
  const hs = s.heights;
  const cp = Math.cos(cam.pitch);
  const eye: V3 = [cam.target[0] + Math.sin(cam.yaw) * cp * cam.distance, cam.target[1] + Math.sin(cam.pitch) * cam.distance, cam.target[2] + Math.cos(cam.yaw) * cp * cam.distance];
  const heightAt = (x: number, z: number) => {
    const tx = Math.floor(x);
    const ty = Math.floor(-z);
    return tx < 0 || ty < 0 || tx >= W || ty >= H ? -1 : hs[ty * W + tx] + (depth[ty * W + tx] > 0 ? depth[ty * W + tx] : 0);
  };
  const seen = (p: V3) => {
    const d = sub(eye, p);
    const len = Math.hypot(...d);
    for (let t = 0.6; t < Math.min(len, 60); t += 0.4) if (heightAt(p[0] + (d[0] * t) / len, p[2] + (d[2] * t) / len) > p[1] + (d[1] * t) / len + 0.02) return false;
    return true;
  };
  const near = (x: number, y: number, r: number, f: (j: number) => boolean) => {
    for (let yy = Math.max(0, y - r); yy <= Math.min(H - 1, y + r); yy++) for (let xx = Math.max(0, x - r); xx <= Math.min(W - 1, x + r); xx++) if (f(yy * W + xx)) return true;
    return false;
  };
  const shaded = (x: number, y: number, top: number) => {
    for (let dy = -4; dy <= 4; dy++)
      for (let dx = -4; dx <= 4; dx++) {
        const xx = x + dx;
        const yy = y + dy;
        if ((dx || dy) && xx >= 0 && yy >= 0 && xx < W && yy < H && hs[yy * W + xx] - top > 0.6 * Math.hypot(dx, dy)) return true;
      }
    return false;
  };
  // (the sun turns with the camera, as the game's, renderer.ts sunOfYaw: its way over the map, x east and y north)
  const sun = sunOfYaw(cam.yaw);
  const inShadow = (px: number, py: number, top: number) =>
    [s.light.angle, 45].every((deg) => {
      const rise = Math.tan((deg * Math.PI) / 180);
      for (let t = 0.25; t < 24; t += 0.25) {
        const tx = Math.floor(px + sun.x * t);
        const ty = Math.floor(py + sun.y * t);
        if (tx < 0 || ty < 0 || tx >= W || ty >= H) return false;
        if (hs[ty * W + tx] > top + rise * t + 0.1) return true;
      }
      return false;
    });
  const deepShade = (x: number, y: number, top: number) => {
    for (const oy of [-0.4, 0, 0.4]) for (const ox of [-0.4, 0, 0.4]) if (!inShadow(x + 0.5 + ox, y + 0.5 + oy, top)) return false;
    return true;
  };
  const kindOfTop = (j: number): LandKind | null => (soil[j] > 0.2 ? "contaminated" : soil[j] > 0 ? null : moisture[j] >= 6 ? "grass" : moisture[j] <= 0 ? "dry" : SAMPLES ? "edge" : null);
  const out: { p: V3; kind: LandKind; distance: number }[] = [];
  const push = (p: V3, kind: LandKind) => {
    if (seen(p)) out.push({ p, kind, distance: Math.hypot(...sub(eye, p)) });
  };
  for (let y = 2; y < H - 2; y++)
    for (let x = 2; x < W - 2; x++) {
      const i = y * W + x;
      if (s.covered[i]) continue;
      const kind = kindOfTop(i);
      // (contaminated ground lies mostly by the badwater that poisoned it: two tiles from any water is enough for it)
      const dry = !near(x, y, 5, (j) => depth[j] > 0);
      if (!dry && !(kind === "contaminated" && !near(x, y, 2, (j) => depth[j] > 0))) continue;
      if (kind && !near(x, y, 1, (j) => hs[j] !== hs[i] || kindOfTop(j) !== kind) && !shaded(x, y, hs[i])) push([x + 0.5, hs[i], -(y + 0.5)], kind);
      if (SHADE && dry && (kind === "grass" || kind === "dry") && !near(x, y, 1, (j) => hs[j] !== hs[i] || kindOfTop(j) !== kind || s.covered[j] > 0) && deepShade(x, y, hs[i]))
        push([x + 0.5, hs[i], -(y + 0.5)], kind === "grass" ? "shade-grass" : "shade-dry");
      if (!dry) continue;
      // a cliff face: this top over a neighbour two or more lower, facing the camera
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const j = (y + dy) * W + x + dx;
        if (hs[i] - hs[j] < 2 || s.covered[j]) continue;
        const p: V3 = [x + 0.5 + dx * 0.5, (hs[i] + hs[j]) / 2, -(y + 0.5 + dy * 0.5)];
        const n: V3 = [dx, 0, -dy];
        if (dot(n, sub(eye, p)) > 0) push([p[0] + n[0] * 0.01, p[1], p[2] + n[2] * 0.01], "cliff");
        if (SHADE && dot(n, sub(eye, p)) > 0 && dx * sun.x + dy * sun.y < -0.2) push([p[0] + n[0] * 0.01, p[1], p[2] + n[2] * 0.01], "shade-cliff");
      }
    }
  return out;
}

// -------------------------------------------------------------------------------------------------------- the objects

/** A shot's camera must fit this well for its objects to be sampled (`--objects`). */
const OBJECT_FIT = 0.8;
/** An object's sample: the mean of the (2r + 1)² pixels round its point (a crown at the start camera is 15 to 25 pixels
 *  across, the probe's frames JPEG). */
const OBJECT_PATCH = 1;
const luma709 = (c: V3) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
interface ObjectPoint {
  p: V3;
  part: string;
}
/** The grown trees' and bush's crowns: their middles at the randomizer's mean height (plantSize.ts) and how far they
 *  reach (D135 as amended 2026-10-29: the game's grown models' sizes). */
const CROWNS: Record<string, { y: number; r: number }> = {
  Pine: { y: 1.95, r: 0.55 },
  Birch: { y: 1.22, r: 0.48 },
  Oak: { y: 1.62, r: 0.8 },
  BlueberryBush: { y: 0.2, r: 0.5 },
};

/** Where the map's objects are sampled (`--objects`): each grown tree's and bush's crown, its middle as the camera sees
 *  it (`<species>`, lit by the sun behind the camera's left shoulder) and its side turned across the sun (`<species>
 *  side`: a point toward the camera's side away from the sun, where the crown's normal stands square to the sun's way,
 *  0.6 of its reach out); a birch's trunk under its crown (`birch bark`); a ruin's column (`ruin`: its face toward the
 *  camera at half its height); a water source's rock (`water source`). None within seven tiles of the start (the game
 *  has put its district centre there by the start shot) nor hidden from the camera by the land. Objects stand at their
 *  tiles' middles (the game's offset them up to 0.15, ours too: `plantPlacement`). */
function objectPoints(s: Shot, cam: Cam): ObjectPoint[] {
  const { width: W, height: H, depth } = s.snap;
  const hs = s.heights;
  const cp = Math.cos(cam.pitch);
  const eye: V3 = [cam.target[0] + Math.sin(cam.yaw) * cp * cam.distance, cam.target[1] + Math.sin(cam.pitch) * cam.distance, cam.target[2] + Math.cos(cam.yaw) * cp * cam.distance];
  const heightAt = (x: number, z: number) => {
    const tx = Math.floor(x);
    const ty = Math.floor(-z);
    return tx < 0 || ty < 0 || tx >= W || ty >= H ? -1 : hs[ty * W + tx] + (depth[ty * W + tx] > 0 ? depth[ty * W + tx] : 0);
  };
  const seen = (p: V3) => {
    const d = sub(eye, p);
    const len = Math.hypot(...d);
    for (let t = 0.6; t < Math.min(len, 60); t += 0.4) if (heightAt(p[0] + (d[0] * t) / len, p[2] + (d[2] * t) / len) > p[1] + (d[1] * t) / len + 0.02) return false;
    return true;
  };
  // the sun's way over the map (x east, y north) and the camera's, in the world (x east, z south)
  const sun = sunOfYaw(cam.yaw);
  const toEye = norm([eye[0] - cam.target[0], 0, eye[2] - cam.target[2]]);
  // square to the sun's way, on the camera's side
  let across: V3 = [sun.y, 0, sun.x];
  if (dot(across, toEye) < 0) across = [-across[0], 0, -across[2]];
  const out: ObjectPoint[] = [];
  const push = (p: V3, part: string) => {
    if (seen(p)) out.push({ p, part });
  };
  for (const o of s.objects) {
    if (s.start && Math.hypot(o.x - s.start[0], o.y - s.start[1]) < 7) continue;
    const x = o.x + 0.5;
    const z = -(o.y + 0.5);
    const crown = CROWNS[o.template];
    if (crown) {
      const name = o.template === "BlueberryBush" ? "bush" : o.template.toLowerCase();
      push([x, o.z + crown.y, z], name);
      push([x + across[0] * crown.r * 0.6, o.z + crown.y, z + across[2] * crown.r * 0.6], `${name} side`);
      if (o.template === "Birch") push([x + toEye[0] * 0.05, o.z + 0.4, z + toEye[2] * 0.05], "birch bark");
    } else if (/^RuinColumnH\d$/.test(o.template)) {
      const h = Number(o.template.slice(-1));
      push([x + toEye[0] * 0.45, o.z + h / 2, z + toEye[2] * 0.45], "ruin");
    } else if (o.template === "WaterSource") push([x, o.z + 0.75, z], "water source");
  }
  return out;
}

// -------------------------------------------------------------------------------------------------------- our side

async function site(root: string, label: string, port: number): Promise<PreviewServer> {
  const outDir = resolve(`.scratch/water-judge-${label}-${port}`);
  console.log(`building the ${label} site…`);
  process.env.DGM_BASE = "/";
  // (its own cache: a worktree's node_modules may be another's, joined)
  const cacheDir = resolve(`.scratch/water-judge-${label}-${port}-vite`);
  await build({ root, configFile: join(root, "vite.config.ts"), base: "/", cacheDir, logLevel: "warn", build: { outDir, emptyOutDir: true } });
  return preview({ root, configFile: join(root, "vite.config.ts"), base: "/", cacheDir, build: { outDir }, preview: { port, strictPort: true }, logLevel: "warn" });
}

/** Page side: the snapshot as the renderer's map (no plants or buildings: the water and the land). */
const SET_MAP_JS = `(g) => {
  const r = window.dgm3d.renderer;
  const N = g.W * g.H;
  const tile = [], floor = [], depth = [], cont = [];
  for (let i = 0; i < N; i++) if (g.depth[i] > 0.001) { tile.push(i); floor.push(g.heights[i]); depth.push(g.depth[i]); cont.push(g.contamination[i]); }
  const mb = (v) => v <= 0 ? 0 : Math.max(1, Math.min(255, Math.round(v * 15)));
  const templates = g.objects ? [...new Set(g.objects.map((o) => o.template))] : ["UndergroundRuins", "BadwaterSource"];
  const ms = g.objects ? g.objects.map((o) => ({ ...o, t: templates.indexOf(o.template), strength: 1 })) : [...(g.mines ?? []).map((m) => ({ ...m, t: 0, strength: 0 })), ...(g.sources ?? []).map((m) => ({ ...m, t: 1 }))];
  const n = ms.length;
  const e = { count: n, templates, owners: n ? ["import"] : [], template: Uint16Array.from(ms.map((m) => m.t)), x: Int16Array.from(ms.map((m) => m.x)), y: Int16Array.from(ms.map((m) => m.y)), z: Int16Array.from(ms.map((m) => m.z)), orientation: Uint8Array.from(ms.map((m) => ["Cw0", "Cw90", "Cw180", "Cw270"].indexOf(m.orientation))), flags: new Uint8Array(n), owner: new Uint16Array(n), variant: new Uint8Array(n).fill(255), strength: Float32Array.from(ms.map((m) => m.strength)), ids: ms.map(() => "") };
  r.setMap({ W: g.W, H: g.H, heights: Uint8Array.from(g.heights), columns: { tiles: new Int32Array(0), voxels: new Uint8Array(0) }, entities: e,
    soil: { moisture: Uint8Array.from(g.moisture.map(mb)), contamination: Uint8Array.from(g.soil.map((v) => v <= 0 ? 0 : Math.max(1, Math.min(255, Math.round(v * 255))))) },
    water: { count: tile.length, tile: Int32Array.from(tile), floor: Float32Array.from(floor), depth: Float32Array.from(depth), contamination: Float32Array.from(cont) } }, true);
  r.setClock(${CLOCK});
  return true;
}`;

// (materials.ts's own GLSL number formats, which its light's constants are written in)
const glNum = (v: number) => (Number.isInteger(v) ? `${v}.0` : String(v));
const glColor = (c: readonly number[]) => `vec3(${c.map((v) => glNum(Math.round(v * 1000) / 1000)).join(", ")})`;
const glColor3 = (c: readonly number[]) => `vec3(${c.map((v) => glNum(Math.round(v * 1e6) / 1e6)).join(", ")})`;

/** The game's light at another hour, in place of the day's the shaders are built with (materials.ts `gameLight`,
 *  `gameWaterLight`, the sky's clouds: the sun's colour × intensity, the ambient's SH and its values straight up, down and
 *  sideways), as text swaps of their constants. The sun's height and the fog's colour are uniforms (`render`). */
function lightSwaps(light: DayLight): [string, string][] {
  const day = dayLight(0.5, null);
  const reflection: [string, string][] =
    REFLECTION === null
      ? []
      : [
          [`env * ${glNum(GAME_FINISH.reflectionIntensity)} / (r2 + 1.0)`, `env * ${glNum(REFLECTION)} / (r2 + 1.0)`],
          [`return ${glNum(WATER_SURFACE.reflection)} * (clamp(smoothness + `, `return ${glNum(REFLECTION)} * (clamp(smoothness + `],
        ];
  if (light.label === day.label && light.fog.every((v, k) => v === day.fog[k]) && AMBIENT === null) return reflection;
  const times = (c: Rgb): Rgb => c.map((v) => v * (AMBIENT ?? 1)) as unknown as Rgb;
  const sh = { c0: times(light.sh.c0), c1: times(light.sh.c1), c2: times(light.sh.c2) };
  return [
    ...reflection,
    [glColor(GAME_LIGHT.sun), glColor(light.sun)],
    ...(["c0", "c1", "c2"] as const).map((k): [string, string] => [glColor3(GAME_AMBIENT_SH[k]), glColor3(sh[k])]),
    ...[1, -1, 0].map((y): [string, string] => [glColor3(gameAmbient(y)), glColor3(gameAmbient(y, sh))]),
  ];
}

/** The shader patch: the branch's colour whichever one it ships (its shaders compiled with `DEFINES` 0, our colour, or 1,
 *  the game's formula, the same build; `formula` null leaves it), and the shot's light (`lightSwaps`), in one pass so a
 *  swap's result is never swapped again. Counts what it swapped in `window.__judgeSwaps`. */
const shaderInit = (formula: boolean | null, swaps: [string, string][]) => `(() => {
  const swaps = new Map(${JSON.stringify([...(formula === null ? [] : DEFINES.map((d) => [`#define ${d} ${formula ? 0 : 1}`, `#define ${d} ${formula ? 1 : 0}`])), ...swaps])});
  const keys = [...swaps.keys()];
  window.__judgeSwaps = {};
  for (const C of [WebGLRenderingContext, WebGL2RenderingContext]) {
    const src = C.prototype.shaderSource;
    C.prototype.shaderSource = function (s, text) {
      // (each key to a mark first, then each mark to its value: one pass)
      keys.forEach((k, n) => { const parts = text.split(k); if (parts.length > 1) window.__judgeSwaps[k] = (window.__judgeSwaps[k] ?? 0) + parts.length - 1; text = parts.join("\\u0000" + n + "\\u0000"); });
      keys.forEach((k, n) => { text = text.split("\\u0000" + n + "\\u0000").join(swaps.get(k)); });
      return src.call(this, s, text);
    };
  }
})();`;

async function openSite(browser: Browser, port: number, formula: boolean | null, light: DayLight): Promise<Page> {
  const context = await browser.newContext({ viewport: { width: W_PX, height: H_PX }, deviceScaleFactor: 1, colorScheme: "light" });
  const page = await context.newPage();
  const swaps = [...lightSwaps(light), ...(formula === null ? [] : SETS)];
  if (formula !== null || swaps.length) await page.addInitScript(shaderInit(formula, swaps));
  await page.goto(`http://localhost:${port}/#s=1&z=128&d=n&t=lakeBasin`);
  await waitForEditor(page, 600_000);
  await page.mouse.move(2, 2);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(2500);
  await page.evaluate("window.dgmEditor.idle()");
  // the canvas the shot's size, alone
  await page.addStyleTag({ content: `.view3d { position: fixed !important; left: 0 !important; top: 0 !important; width: ${W_PX}px !important; height: ${H_PX}px !important; z-index: 2147483647 !important; } .view3d > :not(canvas) { visibility: hidden !important; } .view3d > canvas { width: ${W_PX}px !important; height: ${H_PX}px !important; }` });
  await page.evaluate("window.dispatchEvent(new Event('resize'))");
  await page.waitForTimeout(500);
  return page;
}

async function render(page: Page, s: Shot, cam: Cam, look: "standard" | "high"): Promise<Buffer> {
  await page.evaluate(`(${SET_MAP_JS})(${JSON.stringify({ W: s.snap.width, H: s.snap.height, heights: s.heights, depth: s.snap.depth, contamination: s.snap.contamination, moisture: s.snap.moisture, soil: s.snap.soilContamination, mines: WATER === "pit" ? s.mines : [], sources: SOURCES ? s.badSources : [], objects: OBJECTS ? s.objects : undefined })})`);
  await page.evaluate(`(() => { const r = window.dgm3d.renderer; if (typeof r.setLookChoice === "function") { for (const k of Object.keys(r.highEffects ?? {})) r.setHighEffect(k, true); r.setLookChoice(${JSON.stringify(look)}, false); } })()`);
  if (look === "high") await page.waitForFunction("window.dgm3d.renderer.highSettled", null, { timeout: 180_000 });
  await page.waitForTimeout(1500);
  await page.evaluate(`(() => { const r = window.dgm3d.renderer; r.persp.fov = ${cam.fov}; r.setView(${JSON.stringify({ mode: "orbit", yaw: cam.yaw, pitch: cam.pitch, distance: cam.distance, target: cam.target })}); r.setClock(${CLOCK}); })()`);
  await page.evaluate("new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null))))");
  await page.waitForTimeout(800);
  // the shot's sun's height (its turn stays the camera's, as the game's) and fog colour; the baked shadows stay the
  // day's 45° (the land judge leaves out what a higher tile could shade)
  const e = (s.light.angle * Math.PI) / 180;
  await page.evaluate(`(() => { const r = window.dgm3d.renderer; const d = r.uniforms.sunDir.value; const k = Math.hypot(d.x, d.z) || 1;
    d.set((d.x / k) * ${Math.cos(e)}, ${Math.sin(e)}, (d.z / k) * ${Math.cos(e)}); r.high?.setSunWay(d);
    r.uniforms.hazeColor.value.setRGB(${s.light.fog.join(", ")}); })()`);
  await page.evaluate("window.dgm3d.renderer.renderNow()");
  const up = (await page.evaluate("window.dgm3d.renderer.uniforms.sunDir.value.y")) as number;
  if (Math.abs(up - Math.sin(e)) > 1e-3) throw new Error(`the sun is ${((Math.asin(up) * 180) / Math.PI).toFixed(1)}° up, not the shot's ${s.light.angle.toFixed(1)}°`);
  const size = (await page.evaluate("(() => { const c = document.querySelector('.view3d > canvas'); return [c.clientWidth, c.clientHeight, c.width, c.height]; })()")) as number[];
  if (size[0] !== W_PX || size[1] !== H_PX) throw new Error(`the canvas is ${size.join("×")}, not the shot's ${W_PX}×${H_PX}`);
  return page.locator(".view3d > canvas").screenshot({ type: "png" });
}

// -------------------------------------------------------------------------------------------------------- the judge

interface BandStats {
  n: number;
  game: { mean: V3; spread: V3 };
  ours: Record<string, { mean: V3; spread: V3; distance: number }>;
}

function meanSpread(cs: V3[]): { mean: V3; spread: V3 } {
  const mean: V3 = [0, 1, 2].map((k) => cs.reduce((a, c) => a + c[k], 0) / cs.length) as V3;
  const spread: V3 = [0, 1, 2].map((k) => Math.sqrt(cs.reduce((a, c) => a + (c[k] - mean[k]) ** 2, 0) / cs.length)) as V3;
  return { mean, spread };
}

/** CIE L* of a display sRGB colour (0-255). */
function lstar(c: V3): number {
  const lin = c.map((v) => {
    const t = v / 255;
    return t <= 0.04045 ? t / 12.92 : ((t + 0.055) / 1.055) ** 2.4;
  });
  const y = 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
  return y > 216 / 24389 ? 116 * Math.cbrt(y) - 16 : (24389 / 27) * y;
}
const meanL = (cs: V3[]) => cs.reduce((a, c) => a + lstar(c), 0) / cs.length;

const fmt = (v: V3) => v.map((x) => x.toFixed(0).padStart(3)).join(" ");

async function main() {
  mkdirSync(OUT, { recursive: true });
  if (process.argv.includes("--fits")) {
    const browser = await chromium.launch({ channel: "chrome", headless: true });
    const tool = await (await browser.newContext()).newPage();
    const show = (c: { cam: Cam; score: number }) => `${(c.score * 100).toFixed(1)}% yaw ${((c.cam.yaw * 180) / Math.PI).toFixed(1)} pitch ${((c.cam.pitch * 180) / Math.PI).toFixed(1)} distance ${c.cam.distance.toFixed(1)} fov ${c.cam.fov.toFixed(1)} target ${c.cam.target.map((v) => v.toFixed(1)).join(",")}`;
    for (const id of SHOTS) {
      const s = loadShot(id);
      const start = loadShot(id.replace(/(-badtide\d+|-drought\d+)?-(start|end|day1)$/, "") + "-start");
      console.log(`${id}: own ${show(fitCamera(s, waterMask(await decode(tool, s.png, "image/jpeg"))))}; start's ${show(fitCamera(start, waterMask(await decode(tool, start.png, "image/jpeg"))))}`);
    }
    await browser.close();
    return;
  }
  // (a run's pairs only: a pair left from an earlier run, of a case or a shot this one does not draw, would read as
  // this run's)
  for (const f of readdirSync(OUT)) if (f.endsWith(".jpg")) rmSync(join(OUT, f));
  const servers = [...(DEV ? [await site(DEV, "dev", PORT)] : []), await site(resolve("."), "branch", PORT + 1), ...(BASE ? [await site(BASE, "base", PORT + 2)] : [])];
  const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--enable-gpu", "--use-angle=d3d11", "--ignore-gpu-blocklist"] });
  const results: Record<string, unknown> = {};
  try {
    const tool = await (await browser.newContext()).newPage();
    // (the objects: each tree as it ships)
    const cases: { key: string; port: number; formula: boolean | null; page?: Page; light?: string }[] = [
      ...(DEV ? [{ key: "dev", port: PORT, formula: null }] : []),
      ...(BASE ? [{ key: "826", port: PORT + 2, formula: null }] : []),
      ...(OBJECTS
        ? [{ key: "ours", port: PORT + 1, formula: null }]
        : [
            { key: "ours", port: PORT + 1, formula: false },
            { key: "formula", port: PORT + 1, formula: true },
          ]),
    ];
    const objectTotal: Record<string, Record<string, { n: number; rgb: V3; luma: number }>> = {};
    const total: Record<string, Record<string, { sum: number; n: number }>> = {};
    // (every shot's samples pooled by band, however few a shot has: the game's and each case's mean colour and L*, and
    // each case's distance to the game's pixel)
    const pooled: Record<string, Record<string, { sum: number; n: number; rgb: V3; l: number }>> = {};
    // the gap by day (D496): per look, clean water and pure badwater a level or two deep (each tile's L*, summed), on
    // the shots with badwater in view
    const gapTotal: Record<string, Record<string, { clean: number; nc: number; bad: number; nb: number }>> = {};
    const landTotal: Record<string, Record<string, { sum: number; bias: number; floor: number; n: number }>> = {};
    // (contaminated ground's veins: by look, the game's and each case's; beyond about 70 from the camera a vein is under
    // a pixel, so the share there counts the pixels its rust tints past the test, not the veins themselves)
    const veinTotal: Record<string, Record<string, VeinCount>> = {};
    // (the shots grouped by their light, so each page opens once a light: its shaders are built with it)
    const shots = SHOTS.map(loadShot);
    const fits = new Map<string, { cam: Cam; score: number }>();
    const lightKey = (s: Shot) => `${s.light.label} ${s.light.fog.map((v) => v.toFixed(3)).join("/")}`;
    shots.sort((a, b) => (lightKey(a) < lightKey(b) ? -1 : lightKey(a) > lightKey(b) ? 1 : 0));
    for (const s of shots) {
      const id = s.id;
      for (const c of cases)
        if (c.light !== lightKey(s)) {
          await c.page?.context().close();
          c.page = await openSite(browser, c.port, c.formula, s.light);
          c.light = lightKey(s);
          const swapped = (await c.page.evaluate("window.__judgeSwaps ?? {}")) as Record<string, number>;
          console.log(`${c.key} (${s.light.label}): ${await c.page.evaluate("window.dgm3d.renderer.gpu().renderer")}; swapped ${Object.keys(swapped).length} of ${lightSwaps(s.light).length + (c.formula === null ? 0 : DEFINES.length)} constants (a define the build already has is not swapped)`);
        }
      const game = await decode(tool, s.png, "image/jpeg");
      // the camera: the probe places it by the map alone (its largest water), the same at every moment, so it is fitted
      // on the map's start shot, in the day's light, where its water mask holds (at a sunrise or a sunset, or with the
      // water all badwater, the mask's dark teal test finds no water)
      const mapId = id.replace(/(-badtide\d+|-drought\d+)?-(start|end|day1)$/, "");
      if (FIT_OWN) fits.delete(mapId);
      if (!fits.has(mapId)) {
        const start = id === `${mapId}-start` || FIT_OWN ? s : loadShot(`${mapId}-start`);
        fits.set(mapId, fitCamera(start, waterMask(start === s ? game : await decode(tool, start.png, "image/jpeg"))));
      }
      const { cam, score } = fits.get(mapId) as { cam: Cam; score: number };
      // (an object's sample needs its place to the pixel: a shot whose camera fits poorly is left out)
      if (OBJECTS && score < OBJECT_FIT) {
        console.log(`\n${id}: left out, its camera fits ${(score * 100).toFixed(1)}% (under ${OBJECT_FIT * 100}%)`);
        continue;
      }
      console.log(`\n${id}: the game's light ${s.light.label} (sun ${s.light.angle.toFixed(1)}° up, fog ${s.light.fog.map((v) => v.toFixed(2)).join("/")}); camera fit on ${FIT_OWN ? id : `${mapId}-start`} ${(score * 100).toFixed(1)}% (yaw ${((cam.yaw * 180) / Math.PI).toFixed(1)}°, pitch ${((cam.pitch * 180) / Math.PI).toFixed(1)}°, distance ${cam.distance.toFixed(1)} (the pose's ${s.pose.distance.toFixed(1)}), fov ${cam.fov.toFixed(1)}°)`);
      const pts = samplePoints(s);
      const pr = projector(cam);
      const inFrame = (xy: [number, number] | null): xy is [number, number] => !!xy && xy[0] >= 3 && xy[1] >= 3 && xy[0] < W_PX - 3 && xy[1] < H_PX - 3;
      const at = pts.map((q) => ({ q, xy: pr(q.p) })).filter((a) => inFrame(a.xy)) as { q: { p: V3; depth: number; kind: Kind }; xy: [number, number] }[];
      const gameAt = at.map((a) => patch(game, a.xy[0], a.xy[1]));
      // (where each mine site's pit falls in the frame, to look at: its centre's pixel)
      for (const mine of WATER === "pit" ? s.mines : []) {
        const xy = pr([mine.cx + 0.5, mine.z - MINE_PIT.depth, -(mine.cy + 0.5)]);
        if (inFrame(xy)) console.log(`  the mine site at ${mine.cx},${mine.cy}: its pit's middle at pixel ${xy.map((v) => v.toFixed(0)).join(",")}`);
      }
      const land = landPoints(s, cam).map((q) => ({ q, xy: pr(q.p) })).filter((a) => inFrame(a.xy)) as { q: { p: V3; kind: LandKind; distance: number }; xy: [number, number] }[];
      const gameLand = land.map((a) => patch(game, a.xy[0], a.xy[1]));
      const veinLand = land.filter((a) => a.q.kind === "contaminated");
      const objs = OBJECTS ? (objectPoints(s, cam).map((q) => ({ q, xy: pr(q.p) })).filter((a) => inFrame(a.xy)) as { q: ObjectPoint; xy: [number, number] }[]) : [];
      const gameObjs = objs.map((a) => patch(game, a.xy[0], a.xy[1], OBJECT_PATCH));
      for (const look of LOOKS) {
        const ours: Record<string, V3[]> = {};
        const oursLand: Record<string, V3[]> = {};
        for (const c of cases) {
          const png = await render(c.page as Page, s, cam, look);
          const px = await decode(tool, png, "image/png");
          if (OURS) mkdirSync(OURS, { recursive: true }), writeFileSync(join(OURS, `${id}-${look}-${c.key}.png`), png);
          ours[c.key] = at.map((a) => patch(px, a.xy[0], a.xy[1]));
          oursLand[c.key] = land.map((a) => patch(px, a.xy[0], a.xy[1]));
          if (OBJECTS) {
            const oursObjs = objs.map((a) => patch(px, a.xy[0], a.xy[1], OBJECT_PATCH));
            for (const [key, cs] of [["game", gameObjs], [c.key, oursObjs]] as [string, V3[]][]) {
              if (key === "game" && c !== cases[0]) continue;
              objs.forEach((a, k) => {
                const t = ((objectTotal[`${look} ${a.q.part}`] ??= {})[key] ??= { n: 0, rgb: [0, 0, 0], luma: 0 });
                t.n++;
                t.luma += luma709(cs[k]);
                for (let j = 0; j < 3; j++) t.rgb[j] += cs[k][j];
              });
            }
          }
          const vt = (veinTotal[look] ??= {});
          for (const a of veinLand) veinsAt(px, a.xy[0], a.xy[1], (vt[c.key] ??= veinCount()));
          if (c === cases[0]) for (const a of veinLand) veinsAt(game, a.xy[0], a.xy[1], (vt.game ??= veinCount()));
          if (c.key !== "dev") {
            const pair = (await tool.evaluate(`(${PAIR_JS})(${JSON.stringify({ a: { t: "jpeg", b: s.png.toString("base64") }, b: { t: "png", b: png.toString("base64") }, la: `the game: ${id}`, lb: `ours (${c.key}, ${look}; the camera fitted on ${FIT_OWN ? id : `${mapId}-start`}, ${(score * 100).toFixed(0)}%)` })})`)) as string;
            writeFileSync(join(OUT, `${id}-${look}-${c.key}.jpg`), Buffer.from(pair, "base64"));
          }
        }
        const bands: Record<string, BandStats> = {};
        console.log(`  ${look}: band      n   game mean/spread          ` + cases.map((c) => `${c.key} mean/spread (distance)`.padEnd(34)).join(""));
        for (const kind of KINDS)
        for (const [lo, hi] of [...BANDS, [MIN_DEPTH, 9.5] as [number, number]]) {
          const idx = at.map((a, k) => (a.q.kind === kind && a.q.depth >= lo && a.q.depth < hi ? k : -1)).filter((k) => k >= 0);
          if (idx.length < (kind === "pit" || kind === "falls" ? 5 : 20)) continue;
          const g = meanSpread(idx.map((k) => gameAt[k]));
          const b: BandStats = { n: idx.length, game: g, ours: {} };
          let line = `  ${look}: ${`${kind} ${lo}-${hi >= 9 ? "" : hi}`.padEnd(15)} ${String(idx.length).padStart(5)}   ${fmt(g.mean)} / ${fmt(g.spread)} L* ${meanL(idx.map((k) => gameAt[k])).toFixed(1)}   `;
          for (const c of cases) {
            const o = meanSpread(idx.map((k) => ours[c.key][k]));
            const distance = Math.sqrt(idx.reduce((a, k) => a + [0, 1, 2].reduce((s2, j) => s2 + (ours[c.key][k][j] - gameAt[k][j]) ** 2, 0) / 3, 0) / idx.length);
            b.ours[c.key] = { ...o, distance };
            line += `${fmt(o.mean)} / ${fmt(o.spread)} L* ${meanL(idx.map((k) => ours[c.key][k])).toFixed(1)} (${distance.toFixed(1)})`.padEnd(42);
            if (hi === 9.5) {
              const t = ((total[`${look} ${kind}`] ??= {})[c.key] ??= { sum: 0, n: 0 });
              t.sum += distance * distance * idx.length;
              t.n += idx.length;
            }
          }
          console.log(line);
          bands[`${kind} ${lo}-${hi}`] = b;
          if (lo === 1 && hi === 2 && (kind === "clean" || kind === "bad") && at.filter((a) => a.q.kind === "bad" && a.q.depth >= 0.05).length >= 20)
            for (const [key, cs] of [["game", gameAt], ...cases.map((c) => [c.key, ours[c.key]])] as [string, V3[]][]) {
              const t = ((gapTotal[look] ??= {})[key] ??= { clean: 0, nc: 0, bad: 0, nb: 0 });
              const sum = idx.reduce((a, k) => a + lstar(cs[k]), 0);
              if (kind === "clean") (t.clean += sum), (t.nc += idx.length);
              else (t.bad += sum), (t.nb += idx.length);
            }
        }
        // the land: by kind and the camera's distance, each side's mean and spread, ours' distance to the game's pixel
        // (RMS) and its mean's (bias); the floor is two game samples' distance at the same spread, √2 × its spread
        for (const kind of KINDS)
          for (const [lo, hi] of [...BANDS, [MIN_DEPTH, 9.5] as [number, number]]) {
            const idx = at.map((a, k) => (a.q.kind === kind && a.q.depth >= lo && a.q.depth < hi ? k : -1)).filter((k) => k >= 0);
            const into = (pooled[`${look} ${kind} ${s.light.label} ${lo}-${hi >= 9 ? "" : hi}`] ??= {});
            for (const [key, cs] of [["game", gameAt], ...cases.map((c) => [c.key, ours[c.key]])] as [string, V3[]][]) {
              const t = (into[key] ??= { sum: 0, n: 0, rgb: [0, 0, 0], l: 0 });
              for (const k of idx) {
                t.n++;
                t.l += lstar(cs[k]);
                for (let j = 0; j < 3; j++) (t.rgb[j] += cs[k][j]), (t.sum += (cs[k][j] - gameAt[k][j]) ** 2 / 3);
              }
            }
          }
        const landBands: Record<string, unknown> = {};
        console.log(`  ${look}: land            n   game mean/spread (floor)          ` + cases.map((c) => `${c.key} mean (distance, bias)`.padEnd(30)).join(""));
        for (const kind of LAND_KINDS)
          for (const [lo, hi] of LAND_BANDS) {
            const idx = land.map((a, k) => (a.q.kind === kind && a.q.distance >= lo && a.q.distance < hi ? k : -1)).filter((k) => k >= 0);
            if (idx.length < 12) continue;
            const g = meanSpread(idx.map((k) => gameLand[k]));
            const floor = Math.sqrt((2 * (g.spread[0] ** 2 + g.spread[1] ** 2 + g.spread[2] ** 2)) / 3);
            let line = `  ${look}: ${`${kind} ${lo}-${hi === 999 ? "" : hi}`.padEnd(15)} ${String(idx.length).padStart(5)}   ${fmt(g.mean)} / ${fmt(g.spread)} (${floor.toFixed(1)})   `;
            const per: Record<string, unknown> = {};
            for (const c of cases) {
              const o = meanSpread(idx.map((k) => oursLand[c.key][k]));
              const distance = Math.sqrt(idx.reduce((a, k) => a + [0, 1, 2].reduce((s2, j) => s2 + (oursLand[c.key][k][j] - gameLand[k][j]) ** 2, 0) / 3, 0) / idx.length);
              const bias = Math.sqrt([0, 1, 2].reduce((a, j) => a + (o.mean[j] - g.mean[j]) ** 2, 0) / 3);
              per[c.key] = { ...o, distance, bias };
              line += `${fmt(o.mean)} (${distance.toFixed(1)}, ${bias.toFixed(1)})`.padEnd(30);
              for (const key of [`${look} ${kind}`, `${look} all`]) {
                const t = ((landTotal[key] ??= {})[c.key] ??= { sum: 0, bias: 0, floor: 0, n: 0 });
                t.sum += distance * distance * idx.length;
                t.bias += bias * bias * idx.length;
                t.floor += floor * floor * idx.length;
                t.n += idx.length;
              }
            }
            console.log(line);
            landBands[`${kind} ${lo}-${hi}`] = { n: idx.length, game: g, floor, ours: per };
          }
        const cp = Math.cos(cam.pitch);
        const eye: V3 = [cam.target[0] + Math.sin(cam.yaw) * cp * cam.distance, cam.target[1] + Math.sin(cam.pitch) * cam.distance, cam.target[2] + Math.cos(cam.yaw) * cp * cam.distance];
        const forward = norm(sub(cam.target, eye));
        const landSamples = SAMPLES ? land.map((a, k) => ({ kind: a.q.kind, p: a.q.p, moisture: s.snap.moisture[Math.floor(-a.q.p[2]) * s.snap.width + Math.floor(a.q.p[0])], distance: a.q.distance, viewDepth: dot(sub(a.q.p, eye), forward), game: gameLand[k], ours: Object.fromEntries(cases.map((c) => [c.key, oursLand[c.key][k]])) })) : undefined;
        // (`--samples`: the water's samples one by one too, each its point, depth, kind, the game's pixel and each case's)
        const waterSamples = SAMPLES ? at.map((a, k) => ({ kind: a.q.kind, p: a.q.p, depth: a.q.depth, game: gameAt[k], ours: Object.fromEntries(cases.map((c) => [c.key, ours[c.key][k]])) })) : undefined;
        results[`${id}-${look}-${WATER}`] = { camera: cam, fit: score, light: s.light, bands, land: landBands, landSamples, waterSamples };
      }
    }
    console.log(`\nall shots pooled, by band: mean colour, L* and (ours) the distance to the game's pixel (RMS, 0-255)`);
    for (const [band, per] of Object.entries(pooled)) {
      if (!per.game?.n) continue;
      const n = per.game.n;
      console.log(`  ${band.padEnd(26)} ${String(n).padStart(5)}  ` + Object.entries(per).map(([key, t]) => `${key} ${fmt(t.rgb.map((v) => v / n) as V3)} L* ${(t.l / n).toFixed(1)}${key === "game" ? "" : ` (${Math.sqrt(t.sum / n).toFixed(1)})`}`).join("   "));
    }
    results.pooled = pooled;
    if (OBJECTS) {
      console.log(`\nall shots, the objects by part: n, the mean colour (display, 0-255) and its Rec. 709 luma, the game's and each case's (its luma over the game's)`);
      for (const [part, per] of Object.entries(objectTotal)) {
        const g = per.game;
        if (!g?.n) continue;
        console.log(`  ${part.padEnd(26)} ${String(g.n).padStart(5)}  ` + Object.entries(per).map(([key, t]) => `${key} ${fmt(t.rgb.map((v) => v / t.n) as V3)} luma ${(t.luma / t.n).toFixed(1)}${key === "game" ? "" : ` (${(t.luma / t.n / (g.luma / g.n)).toFixed(3)})`}`).join("   "));
      }
      results.objects = objectTotal;
    }
    console.log(`\nall shots, by kind: the distance to the game's pixel (RMS, 0-255)`);
    for (const look of LOOKS) for (const kind of KINDS) console.log(`  ${look} ${kind}: ` + Object.entries(total[`${look} ${kind}`] ?? {}).map(([k, t]) => `${k} ${Math.sqrt(t.sum / t.n).toFixed(1)} (${t.n})`).join(", "));
    const G = WATER_LIGHT.gap.game;
    const [low, high] = [G.cleanShots[0] - G.badShots[1], G.cleanShots[1] - G.badShots[0]];
    console.log(`
all shots with badwater in view, the gap by day (D496): clean water against pure badwater a level or two deep, L*; the game's frames allow ${low.toFixed(1)} to ${high.toFixed(1)}`);
    for (const look of LOOKS)
      for (const [key, t] of Object.entries(gapTotal[look] ?? {})) {
        if (!t.nc || !t.nb) continue;
        const gap = t.clean / t.nc - t.bad / t.nb;
        console.log(`  ${look} ${key}: ${(t.clean / t.nc).toFixed(1)} against ${(t.bad / t.nb).toFixed(1)}, ${gap.toFixed(1)}${key === "game" ? "" : gap < low || gap > high ? " (outside)" : " (within)"} (${t.nc}, ${t.nb} tiles)`);
      }
    results.gap = gapTotal;
    console.log(`\nall shots, the land: the distance to the game's pixel (RMS, 0-255), its mean's (bias), and the floor (two game samples)`);
    for (const look of LOOKS)
      for (const kind of [...LAND_KINDS, "all"]) {
        const t = landTotal[`${look} ${kind}`];
        if (!t) continue;
        const first = Object.values(t)[0];
        console.log(`  ${look} ${kind}: ` + Object.entries(t).map(([k, v]) => `${k} ${Math.sqrt(v.sum / v.n).toFixed(1)} (bias ${Math.sqrt(v.bias / v.n).toFixed(1)})`).join(", ") + `; floor ${Math.sqrt(first.floor / first.n).toFixed(1)} (${first.n})`);
      }
    console.log(`\nall shots, contaminated ground: the share of its pixels its veins' rust tints past the test, their mean colour, and the ground's mean`);
    const veinLine = (v: VeinCount) => `${((100 * v.vein) / Math.max(1, v.px)).toFixed(1)}% ${fmt(v.veinSum.map((x) => x / Math.max(1, v.vein)) as V3)}, ground ${fmt(v.allSum.map((x) => x / Math.max(1, v.px)) as V3)}`;
    for (const look of LOOKS) {
      const vt = veinTotal[look];
      if (vt?.game) console.log(`  ${look}: game ${veinLine(vt.game)} (${vt.game.px} px); ` + cases.map((c) => `${c.key} ${veinLine(vt[c.key])}`).join("; "));
    }
    results.veins = veinTotal;
    results.total = Object.fromEntries(Object.entries(total).map(([look, t]) => [look, Object.fromEntries(Object.entries(t).map(([k, v]) => [k, { distance: Math.sqrt(v.sum / v.n), n: v.n }]))]));
    results.landTotal = Object.fromEntries(Object.entries(landTotal).map(([key, t]) => [key, Object.fromEntries(Object.entries(t).map(([k, v]) => [k, { distance: Math.sqrt(v.sum / v.n), bias: Math.sqrt(v.bias / v.n), floor: Math.sqrt(v.floor / v.n), n: v.n }]))]));
    writeFileSync(join(OUT, `judge-${WATER}-${LIGHT_MODE}${arg("tag") ? `-${arg("tag")}` : ""}${FIT_OWN ? "-fitown" : ""}${REFLECTION === null ? "" : `-reflection${REFLECTION}`}${AMBIENT === null ? "" : `-ambient${AMBIENT}`}.json`), JSON.stringify(results, null, 1));
  } finally {
    await browser.close();
    for (const s of servers) await new Promise<void>((r) => s.httpServer.close(() => r()));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
