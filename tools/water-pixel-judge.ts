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
//   npx tsx tools/water-pixel-judge.ts [--dev .scratch/judge-dev] [--base .scratch/judge-826] [--batch 20261002-1610-batch]
//     [--look standard|high|both] [--water clean|bad|mixed|all] [--define WATER_FORMULA|BADWATER_FORMULA] [--shots <id>,<id>]
//
// The camera: the probe's water pose (investigation/probe/runner/catalog.ts `standardPoses`) is where the game's camera
// was asked to look, but its field of view and distance do not carry over exactly (Q8 found 31-37° and 1.0-1.35× the
// distance). So the judge fits ours to the shot first: yaw, pitch, distance, field of view and the target's place,
// by Nelder-Mead, scoring how well the snapshot's wet and dry tiles, projected, land on water and on land in the shot
// (a coarse colour test of the shot's pixels, blurred; only tiles whose 3×3 round them are all wet or all dry).
//
// The samples, by the tile's badwater share (`--water`): clean water (under 0.02, every neighbour wet and clean), pure
// badwater (0.95 or more, its neighbours too) and the front between (0.05 to 0.95, its neighbours wet), each with its
// surface level with its neighbours'; each tile's centre projected, the mean of a 5×5 patch of pixels there in the shot
// and in each of ours. Per band (the share's kind and the game's depth) it prints each side's mean and spread in
// display RGB with its L*, and each of ours' mean distance to the game's pixel by pixel (the root of the mean squared
// difference over the three channels, 0-255). Ours: dev, the tree given by --base (if any), and this branch with our
// colour and with the game's formula (the same build, its shaders compiled with `--define` 0 or 1: WATER_FORMULA for
// clean water, waterPalette.ts GAME_WATER.use; BADWATER_FORMULA for badwater, GAME_BADWATER.use). Writes
// .scratch/water-judge/<shot>-<look>-<case>.jpg (the shot beside ours, for the eye) and
// .scratch/water-judge/judge-<water>.json.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { gunzipSync } from "node:zlib";
import { chromium, type Browser, type Page } from "@playwright/test";
import { build, preview, type PreviewServer } from "vite";
import { readMapBytes, wetAreas } from "../investigation/probe/runner/mapfile";
import { waitForEditor } from "./wait-editor";

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const DEV = resolve(arg("dev") ?? ".scratch/judge-dev");
const BASE = arg("base") ? resolve(arg("base") as string) : null;
const BATCH = arg("batch") ?? "20261002-1610-batch";
const LOOKS = (arg("look") ?? "both") === "both" ? (["standard", "high"] as const) : ([arg("look")] as ("standard" | "high")[]);
const OUT = resolve(".scratch/water-judge");
/** Which water it samples: clean (the colour's judge), bad (pure badwater), mixed (the front) or all three. */
const WATER = (["bad", "mixed", "all"] as const).find((w) => w === arg("water")) ?? "clean";
type Kind = "clean" | "mixed" | "bad";
const KINDS: readonly Kind[] = WATER === "all" ? ["clean", "mixed", "bad"] : [WATER];
/** The define the two builds of this branch differ by. */
const DEFINE = arg("define") ?? (WATER === "clean" ? "WATER_FORMULA" : "BADWATER_FORMULA");
const PORT = Number(arg("port") ?? 4971);
const W_PX = 1280;
const H_PX = 800;
const CLOCK = 12.5;
// (the start of each game: its end shots of River Valley fall in a badtide, its fog over the whole picture; for
// badwater, the Badtide's end on the five maps Q8 fitted, and Islands 2's end, where both waters show)
const SHOTS = (
  arg("shots") ??
  (WATER === "clean"
    ? "riverValley-128-1-start,riverValley-128-2-start,lakeBasin-128-1-start,lakeBasin-128-2-start,highlands-128-1-start,highlands-128-2-start"
    : "islands-128-2-end,islands-128-1-badtide2-end,islands-128-2-badtide2-end,highlands-128-1-badtide2-end,lakeBasin-128-1-badtide2-end,chaos-256-2-badtide2-end")
).split(",");
const BANDS: [number, number][] = [
  [0.05, 0.5],
  [0.5, 1],
  [1, 2],
  [2, 3],
  [3, 9],
];

interface Snapshot {
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
function patch(px: Uint8Array, x: number, y: number): V3 {
  const c: V3 = [0, 0, 0];
  let n = 0;
  for (let dy = -2; dy <= 2; dy++)
    for (let dx = -2; dx <= 2; dx++) {
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

// -------------------------------------------------------------------------------------------------------- the maps

interface Shot {
  id: string;
  snap: Snapshot;
  heights: number[];
  pose: Cam;
  png: Buffer;
}

function loadShot(id: string): Shot {
  const snap = JSON.parse(gunzipSync(readFileSync(`C:/dgm-probe/results/${BATCH}/m9b-${id}.snapshot.json.gz`)).toString("utf8")) as Snapshot;
  const mapId = id.replace(/(-badtide\d+)?-(start|end|day1)$/, "");
  const m = readMapBytes(new Uint8Array(readFileSync(`C:/dgm-probe/maps/${BATCH}/m9b-${mapId}.timber`)));
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
  return {
    id,
    snap,
    heights: snap.terrain,
    pose: { yaw: -Math.PI / 6, pitch: (55 * Math.PI) / 180, distance: Math.min(110, Math.max(35, Math.sqrt(water.tiles.length) * 2.2)), fov: 40, target },
    png: readFileSync(`C:/dgm-probe/shots/${BATCH}/m9b-${id}-water.jpg`),
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

function fitCamera(s: Shot, mask: Float32Array): { cam: Cam; score: number } {
  const pts = fitPoints(s);
  const camOf = (x: number[]): Cam => ({ yaw: x[0], pitch: x[1], distance: Math.exp(x[2]), fov: x[3], target: [s.pose.target[0] + x[4], s.pose.target[1], s.pose.target[2] + x[5]] });
  const score = (x: number[]) => {
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
      if (!(depth[i] > 0.05) || !kind || !KINDS.includes(kind)) continue;
      const level = s.heights[i] + depth[i];
      let ok = true;
      for (let dy = -1; dy <= 1 && ok; dy++)
        for (let dx = -1; dx <= 1 && ok; dx++) {
          const j = (y + dy) * W + x + dx;
          if (!(depth[j] > 0.05) || (kind !== "mixed" && kindOf(contamination[j]) !== kind) || Math.abs(s.heights[j] + depth[j] - level) > 0.1) ok = false;
        }
      if (ok) out.push({ p: [x + 0.5, level, -(y + 0.5)], depth: depth[i], kind });
    }
  return out;
}

// -------------------------------------------------------------------------------------------------------- our side

async function site(root: string, label: string, port: number): Promise<PreviewServer> {
  const outDir = resolve(`.scratch/water-judge-${label}`);
  console.log(`building the ${label} site…`);
  process.env.DGM_BASE = "/";
  await build({ root, configFile: join(root, "vite.config.ts"), base: "/", logLevel: "warn", build: { outDir, emptyOutDir: true } });
  return preview({ root, configFile: join(root, "vite.config.ts"), base: "/", build: { outDir }, preview: { port, strictPort: true }, logLevel: "warn" });
}

/** Page side: the snapshot as the renderer's map (no plants or buildings: the water and the land). */
const SET_MAP_JS = `(g) => {
  const r = window.dgm3d.renderer;
  const N = g.W * g.H;
  const tile = [], floor = [], depth = [], cont = [];
  for (let i = 0; i < N; i++) if (g.depth[i] > 0.001) { tile.push(i); floor.push(g.heights[i]); depth.push(g.depth[i]); cont.push(g.contamination[i]); }
  const mb = (v) => v <= 0 ? 0 : Math.max(1, Math.min(255, Math.round(v * 16)));
  const e = { count: 0, templates: [], owners: [], template: new Uint16Array(0), x: new Int16Array(0), y: new Int16Array(0), z: new Int16Array(0), orientation: new Uint8Array(0), flags: new Uint8Array(0), owner: new Uint16Array(0), variant: new Uint8Array(0) };
  r.setMap({ W: g.W, H: g.H, heights: Uint8Array.from(g.heights), columns: { tiles: new Int32Array(0), voxels: new Uint8Array(0) }, entities: e,
    soil: { moisture: Uint8Array.from(g.moisture.map(mb)), contamination: Uint8Array.from(g.soil.map((v) => v <= 0 ? 0 : Math.max(1, Math.min(255, Math.round(v * 255))))) },
    water: { count: tile.length, tile: Int32Array.from(tile), floor: Float32Array.from(floor), depth: Float32Array.from(depth), contamination: Float32Array.from(cont) } }, true);
  r.setClock(${CLOCK});
  return true;
}`;

/** The shader patch that picks the branch's colour whichever one it ships: its shaders compiled with `DEFINE` 0 (our
 *  colour) or 1 (the game's formula), the same build. */
const formulaInit = (on: boolean) => `(() => {
  for (const C of [WebGLRenderingContext, WebGL2RenderingContext]) {
    const src = C.prototype.shaderSource;
    C.prototype.shaderSource = function (s, text) { return src.call(this, s, text.replace(/#define ${DEFINE} [01]/, "#define ${DEFINE} ${on ? 1 : 0}")); };
  }
})();`;

async function openSite(browser: Browser, port: number, formula: boolean | null): Promise<Page> {
  const context = await browser.newContext({ viewport: { width: W_PX, height: H_PX }, deviceScaleFactor: 1, colorScheme: "light" });
  const page = await context.newPage();
  if (formula !== null) await page.addInitScript(formulaInit(formula));
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
  await page.evaluate(`(${SET_MAP_JS})(${JSON.stringify({ W: s.snap.width, H: s.snap.height, heights: s.heights, depth: s.snap.depth, contamination: s.snap.contamination, moisture: s.snap.moisture, soil: s.snap.soilContamination })})`);
  await page.evaluate(`(() => { const r = window.dgm3d.renderer; if (typeof r.setLookChoice === "function") { for (const k of Object.keys(r.highEffects ?? {})) r.setHighEffect(k, true); r.setLookChoice(${JSON.stringify(look)}, false); } })()`);
  if (look === "high") await page.waitForFunction("window.dgm3d.renderer.highSettled", null, { timeout: 180_000 });
  await page.waitForTimeout(1500);
  await page.evaluate(`(() => { const r = window.dgm3d.renderer; r.persp.fov = ${cam.fov}; r.setView(${JSON.stringify({ mode: "orbit", yaw: cam.yaw, pitch: cam.pitch, distance: cam.distance, target: cam.target })}); r.setClock(${CLOCK}); })()`);
  await page.evaluate("new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null))))");
  await page.waitForTimeout(800);
  await page.evaluate("window.dgm3d.renderer.renderNow()");
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
  const servers = [await site(DEV, "dev", PORT), await site(resolve("."), "branch", PORT + 1), ...(BASE ? [await site(BASE, "base", PORT + 2)] : [])];
  const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--enable-gpu", "--use-angle=d3d11", "--ignore-gpu-blocklist"] });
  const results: Record<string, unknown> = {};
  try {
    const tool = await (await browser.newContext()).newPage();
    const cases = [
      { key: "dev", page: await openSite(browser, PORT, null) },
      ...(BASE ? [{ key: "826", page: await openSite(browser, PORT + 2, null) }] : []),
      { key: "ours", page: await openSite(browser, PORT + 1, false) },
      { key: "formula", page: await openSite(browser, PORT + 1, true) },
    ];
    for (const c of cases) console.log(c.key, await c.page.evaluate("window.dgm3d.renderer.gpu().renderer"));
    const total: Record<string, Record<string, { sum: number; n: number }>> = {};
    for (const id of SHOTS) {
      const s = loadShot(id);
      const game = await decode(tool, s.png, "image/jpeg");
      const { cam, score } = fitCamera(s, waterMask(game));
      console.log(`\n${id}: camera fit ${(score * 100).toFixed(1)}% (yaw ${((cam.yaw * 180) / Math.PI).toFixed(1)}°, pitch ${((cam.pitch * 180) / Math.PI).toFixed(1)}°, distance ${cam.distance.toFixed(1)} (the pose's ${s.pose.distance.toFixed(1)}), fov ${cam.fov.toFixed(1)}°)`);
      const pts = samplePoints(s);
      const pr = projector(cam);
      const at = pts.map((q) => ({ q, xy: pr(q.p) })).filter((a) => a.xy && a.xy[0] >= 3 && a.xy[1] >= 3 && a.xy[0] < W_PX - 3 && a.xy[1] < H_PX - 3) as { q: { p: V3; depth: number; kind: Kind }; xy: [number, number] }[];
      const gameAt = at.map((a) => patch(game, a.xy[0], a.xy[1]));
      for (const look of LOOKS) {
        const ours: Record<string, V3[]> = {};
        for (const c of cases) {
          const png = await render(c.page, s, cam, look);
          const px = await decode(tool, png, "image/png");
          ours[c.key] = at.map((a) => patch(px, a.xy[0], a.xy[1]));
          if (c.key !== "dev") {
            const pair = (await tool.evaluate(`(${PAIR_JS})(${JSON.stringify({ a: { t: "jpeg", b: s.png.toString("base64") }, b: { t: "png", b: png.toString("base64") }, la: `the game: ${id}`, lb: `ours (${c.key}, ${look})` })})`)) as string;
            writeFileSync(join(OUT, `${id}-${look}-${c.key}.jpg`), Buffer.from(pair, "base64"));
          }
        }
        const bands: Record<string, BandStats> = {};
        console.log(`  ${look}: band      n   game mean/spread          ` + cases.map((c) => `${c.key} mean/spread (distance)`.padEnd(34)).join(""));
        for (const kind of KINDS)
        for (const [lo, hi] of [...BANDS, [0.05, 9] as [number, number]]) {
          const idx = at.map((a, k) => (a.q.kind === kind && a.q.depth >= lo && a.q.depth < hi ? k : -1)).filter((k) => k >= 0);
          if (idx.length < 20) continue;
          const g = meanSpread(idx.map((k) => gameAt[k]));
          const b: BandStats = { n: idx.length, game: g, ours: {} };
          let line = `  ${look}: ${`${kind} ${lo}-${hi === 9 ? "" : hi}`.padEnd(15)} ${String(idx.length).padStart(5)}   ${fmt(g.mean)} / ${fmt(g.spread)} L* ${meanL(idx.map((k) => gameAt[k])).toFixed(1)}   `;
          for (const c of cases) {
            const o = meanSpread(idx.map((k) => ours[c.key][k]));
            const distance = Math.sqrt(idx.reduce((a, k) => a + [0, 1, 2].reduce((s2, j) => s2 + (ours[c.key][k][j] - gameAt[k][j]) ** 2, 0) / 3, 0) / idx.length);
            b.ours[c.key] = { ...o, distance };
            line += `${fmt(o.mean)} / ${fmt(o.spread)} L* ${meanL(idx.map((k) => ours[c.key][k])).toFixed(1)} (${distance.toFixed(1)})`.padEnd(42);
            if (hi === 9) {
              const t = ((total[`${look} ${kind}`] ??= {})[c.key] ??= { sum: 0, n: 0 });
              t.sum += distance * distance * idx.length;
              t.n += idx.length;
            }
          }
          console.log(line);
          bands[`${kind} ${lo}-${hi}`] = b;
        }
        results[`${id}-${look}-${WATER}`] = { camera: cam, fit: score, bands };
      }
    }
    console.log(`\nall shots, by kind: the distance to the game's pixel (RMS, 0-255)`);
    for (const look of LOOKS) for (const kind of KINDS) console.log(`  ${look} ${kind}: ` + Object.entries(total[`${look} ${kind}`] ?? {}).map(([k, t]) => `${k} ${Math.sqrt(t.sum / t.n).toFixed(1)} (${t.n})`).join(", "));
    results.total = Object.fromEntries(Object.entries(total).map(([look, t]) => [look, Object.fromEntries(Object.entries(t).map(([k, v]) => [k, { distance: Math.sqrt(v.sum / v.n), n: v.n }]))]));
    writeFileSync(join(OUT, `judge-${WATER}.json`), JSON.stringify(results, null, 1));
  } finally {
    await browser.close();
    for (const s of servers) await new Promise<void>((r) => s.httpServer.close(() => r()));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
