// Before and after captures of the 3D view's object models, for Kyler's Map look fix rounds (PLAN
// §20 D178: mine sites and ruins): the same scenes from the same cameras before and after a change,
// composed side by side, with greyscale and colour-blindness sheets of the after views. Kyler
// decides from them (no blind review, D115).
//
//   npx tsx tools/capture-objects.ts --label before|after [--only mine-close,ruins-low]
//   npx tsx tools/capture-objects.ts --compose [--out docs/look/mine-ruins]
//   npx tsx tools/capture-objects.ts --bench --label before|after [--seconds 8]
//
// The before run is made on the code before the change (the branch's base), the after run on the
// branch; the after run takes every camera from the before run's record, so the two match exactly.
// (To run the base's code again once the branch's work is committed, check out the base's `src`,
// run, and check out the branch's `src` again.)
// Raw captures (PNG) go to .scratch/objects/<label>/; --compose writes the side-by-side JPEGs and
// the sheets to --out, each under about 400 KB, and poses.json (the cameras).
//
// Scenes, all our own:
//   - map: River Valley, seed 4242, 256² (Normal), opened in the editor by the page; the
//     first mine site close up (the game's default angle, a low angle, from above), a ruin field
//     close up and low, and the whole map from the default camera with **Markers** off and on;
//   - showcase: a flat test ground drawn by the renderer itself: moist grass in the west half, dry
//     earth in the east, and in each half a row of ruins in the five variants (A to E) and a field
//     of neighbouring columns of mixed heights;
//   - lineup: the objects that must not be mistaken for each other, side by side on dry ground, from
//     as far as a view of a whole 256² map: the start, a badwater source, a mine site, a geothermal
//     field, a ruin field, a water source and a relic.
// The water is held at one moment of its movement. Chrome runs headed (a real GPU, not the light
// look of software rendering), at a device pixel ratio of 1.
//
// --bench: the frame time (information, D115) on the map above, orbiting the whole map and a ruin
// field (the renderer's own benchOrbit), written to .scratch/objects/<label>/bench.json. With
// --other-gpu, on the machine's other GPU (an integrated one, as tools/bench3d.ts picks it) with the
// page's CPU slowed 4×, written to bench-other.json. --port serves the site on another port.

import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Page } from "@playwright/test";
import { build, preview } from "vite";
import { waitForEditor } from "./wait-editor";

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const LABEL = arg("label") ?? "after";
const ONLY = arg("only")?.split(",");
const OUT = arg("out") ?? "docs/look/mine-ruins";
const SECONDS = Number(arg("seconds") ?? 8);
const RAW = ".scratch/objects";
const PORT = Number(arg("port") ?? 4193);
const DIST = ".scratch/capture-objects-dist";
const VIEWPORT = { width: 1280, height: 800 };
/** The largest a committed image may be. */
const MAX_BYTES = 400 * 1024;

type View = { mode: "orbit" | "top"; yaw: number; pitch: number; distance: number; target: [number, number, number] };

interface Pose {
  id: string;
  scene: "map" | "showcase" | "lineup";
  /** What Kyler looks at (the README's line). */
  what: string;
  view: View;
  markers: boolean;
  /** World points to enlarge in a corner (views from afar): the point and a label; with `crop`,
   *  the objects named under the cropped region. */
  insets?: { point: [number, number, number]; label: string }[];
  /** A region of the ground to show alone, enlarged in whole pixels (a view from afar): two
   *  opposite corners (x, z) at height y. */
  crop?: { from: [number, number]; to: [number, number]; y: number };
}

interface Shot extends Pose {
  file: string;
  size: [number, number];
  /** The insets' screen positions in the capture (px). */
  insetsAt?: { x: number; y: number; label: string }[];
  /** The crop's region in the capture (px). */
  cropAt?: { x: number; y: number; w: number; h: number };
}

const GAME_YAW = -Math.PI / 6; // the game's camera looks 30° east of north
const GAME_PITCH = (70 * Math.PI) / 180;

// ------------------------------------------------------------------------------ scenes

/** The page-side test ground: a flat map at one height, moist west of `moistBelowX`, with objects.
 *  The renderer draws it as it draws any map (a string, so the bundler's helpers stay out of the
 *  page). */
const SCENE_JS = `(spec) => {
  const { W, H, height, moistBelowX, objects } = spec;
  const N = W * H;
  const heights = new Uint8Array(N).fill(height);
  const moisture = new Uint8Array(N);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (x < moistBelowX) moisture[y * W + x] = 120;
  const templates = [];
  const n = objects.length;
  const e = { count: n, templates, owners: ["test"], template: new Uint16Array(n), x: new Int16Array(n), y: new Int16Array(n), z: new Int16Array(n), orientation: new Uint8Array(n), flags: new Uint8Array(n), owner: new Uint16Array(n), variant: new Uint8Array(n) };
  objects.forEach((o, k) => {
    let t = templates.indexOf(o.template);
    if (t < 0) { t = templates.length; templates.push(o.template); }
    e.template[k] = t;
    e.x[k] = o.x;
    e.y[k] = o.y;
    e.z[k] = height;
    e.orientation[k] = o.orientation ?? 0;
    e.variant[k] = o.variant ?? 0;
  });
  const view = {
    W, H, heights,
    columns: { tiles: new Int32Array(0), voxels: new Uint8Array(0) },
    water: { count: 0, tile: new Int32Array(0), floor: new Float32Array(0), depth: new Float32Array(0), contamination: new Float32Array(0) },
    entities: e,
    soil: { moisture, contamination: new Uint8Array(N) },
  };
  const r = window.dgm3d.renderer;
  r.setMap(view);
  r.setClock(12.5);
}`;

interface SceneSpec {
  W: number;
  H: number;
  height: number;
  moistBelowX: number;
  objects: { template: string; x: number; y: number; orientation?: number; variant?: number }[];
}

/** Ruins in the five variants, moist (west) and dry (east): a row of one column per variant, and a
 *  field of neighbouring columns of mixed heights and variants. */
function showcase(): SceneSpec {
  const objects: SceneSpec["objects"] = [];
  const heights = [5, 3, 6, 4, 7];
  for (const base of [3, 21]) {
    for (let v = 0; v < 5; v++) objects.push({ template: `RuinColumnH${heights[v]}`, x: base + v * 3, y: 15, variant: v });
    // a field: 5 × 3 neighbouring columns, heights 1–4, variants mixed as a generated field mixes them
    for (let j = 0; j < 3; j++) for (let i = 0; i < 5; i++) objects.push({ template: `RuinColumnH${1 + ((i * 7 + j * 3 + base) % 4)}`, x: base + 1 + i, y: 7 + j, variant: (i * 2 + j * 3 + base) % 5 });
  }
  return { W: 38, H: 22, height: 4, moistBelowX: 19, objects };
}

/** The objects a mine site must not be mistaken for, on dry ground. */
function lineup(): SceneSpec {
  const objects: SceneSpec["objects"] = [
    { template: "StartingLocation", x: 3, y: 6 },
    { template: "BadwaterSource", x: 11, y: 6 },
    { template: "UndergroundRuins", x: 19, y: 5 },
    { template: "GeothermalField", x: 29, y: 6 },
    { template: "WaterSource", x: 45, y: 7 },
    { template: "MediumRelic", x: 50, y: 6 },
  ];
  for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) objects.push({ template: `RuinColumnH${2 + ((i + 2 * j) % 4)}`, x: 36 + i, y: 6 + j, variant: (i + j * 2) % 5 });
  return { W: 58, H: 16, height: 3, moistBelowX: 0, objects };
}

// ------------------------------------------------------------------------------ the page

async function openMap(page: Page): Promise<void> {
  await page.goto("about:blank");
  await page.goto(`http://localhost:${PORT}/#s=4242&z=256&d=n&t=riverValley`);
  await waitForEditor(page, 300_000);
  await page.mouse.move(2, 2);
  await page.keyboard.press("Escape");
  // wait for the background check (it may replace the water once)
  await page.waitForTimeout(2500);
  await page.evaluate(() => window.dgmEditor!.idle());
  await page.evaluate(() => (window.dgm3d!.renderer as unknown as { setClock(t: number | null): void }).setClock(12.5));
  await page.addStyleTag({ content: ".view3d > :not(canvas), .editor-map > :not(.view3d) { visibility: hidden !important; }" });
}

async function openScene(page: Page, spec: SceneSpec): Promise<void> {
  await page.goto("about:blank");
  await page.goto(`http://localhost:${PORT}/#s=1&z=96&d=n&t=riverValley`);
  await waitForEditor(page, 240_000);
  await page.mouse.move(2, 2);
  await page.evaluate(`(${SCENE_JS})(${JSON.stringify(spec)})`);
  await page.addStyleTag({ content: ".view3d > :not(canvas) { visibility: hidden !important; }" });
}

/** The map's first mine site's middle and the densest ruin field (read from what the view draws). */
async function mapPoints(page: Page): Promise<{ mine: [number, number, number]; ruins: [number, number, number]; W: number; H: number; mean: number }> {
  return (await page.evaluate(`(() => {
    const m = window.dgm3d.renderer.map;
    const e = m.entities;
    const rot = (o, x, y) => [[x, y], [y, -x], [-x, -y], [-y, x]][o];
    let mine = null;
    const ruins = [];
    for (let k = 0; k < e.count; k++) {
      const t = e.templates[e.template[k]];
      if (t === "UndergroundRuins" && !mine) {
        const [dx, dy] = rot(e.orientation[k], 2, 2);
        mine = [e.x[k] + dx + 0.5, e.z[k], -(e.y[k] + dy + 0.5)];
      }
      if (/^RuinColumnH\\d$/.test(t)) ruins.push([e.x[k], e.y[k], e.z[k]]);
    }
    let best = null;
    let bestN = -1;
    for (const [x, y, z] of ruins) {
      let n = 0;
      for (const [a, b] of ruins) if (Math.abs(a - x) <= 5 && Math.abs(b - y) <= 5) n++;
      if (n > bestN) { bestN = n; best = [x + 0.5, z, -(y + 0.5)]; }
    }
    let sum = 0;
    for (let i = 0; i < m.heights.length; i++) sum += m.heights[i];
    return { mine, ruins: best, W: m.W, H: m.H, mean: sum / m.heights.length };
  })()`)) as { mine: [number, number, number]; ruins: [number, number, number]; W: number; H: number; mean: number };
}

function mapPoses(p: Awaited<ReturnType<typeof mapPoints>>): Pose[] {
  const whole: View = { mode: "orbit", yaw: GAME_YAW, pitch: GAME_PITCH, distance: Math.max(p.W, p.H) * 1.6, target: [p.W / 2, p.mean, -p.H / 2] };
  const insets = [
    { point: p.mine, label: "mine site" },
    { point: p.ruins, label: "ruins" },
  ];
  return [
    { id: "mine-close", scene: "map", what: "a mine site close up, from the game's default angle (30° east of north, 70° down)", view: { mode: "orbit", yaw: GAME_YAW, pitch: GAME_PITCH, distance: 15, target: p.mine }, markers: false },
    { id: "mine-low", scene: "map", what: "the same mine site from a low angle (25° down): the pit's depth", view: { mode: "orbit", yaw: GAME_YAW + 0.5, pitch: 0.44, distance: 12, target: [p.mine[0], p.mine[1] - 0.4, p.mine[2]] }, markers: false },
    { id: "mine-top", scene: "map", what: "the same mine site from straight above (north up)", view: { mode: "top", yaw: 0, pitch: 1.5, distance: 14, target: p.mine }, markers: false },
    { id: "ruins-close", scene: "map", what: "a ruin field on dry ground close up, from the game's default angle", view: { mode: "orbit", yaw: GAME_YAW, pitch: GAME_PITCH, distance: 26, target: p.ruins }, markers: false },
    { id: "ruins-low", scene: "map", what: "the same ruin field from a low angle (20° down)", view: { mode: "orbit", yaw: GAME_YAW, pitch: 0.35, distance: 20, target: [p.ruins[0], p.ruins[1] + 1.5, p.ruins[2]] }, markers: false },
    { id: "overview", scene: "map", what: "the whole 256² map from the default camera, Markers off; the insets enlarge the mine site and the ruin field 3 times, pixels as drawn", view: whole, markers: false, insets },
    { id: "overview-markers", scene: "map", what: "the same, with Markers on (the information layer)", view: whole, markers: true, insets },
  ];
}

function scenePoses(): Pose[] {
  const s = showcase();
  const l = lineup();
  // as far as the default view of a whole 256² map (256 × 1.6 away)
  const far = 256 * 1.6;
  return [
    { id: "ruins-showcase", scene: "showcase", what: "ruins in the five variants A–E (the row at the back, heights 5, 3, 6, 4, 7) and a field of neighbouring columns (front), on moist ground (left) and dry ground (right), at the game's default pitch (70° down), looking north", view: { mode: "orbit", yaw: 0, pitch: GAME_PITCH, distance: 40, target: [s.W / 2, s.height + 1, -s.H / 2] }, markers: false },
    { id: "ruins-moist", scene: "showcase", what: "the five variants A–E on moist ground, close up (35° down, looking north)", view: { mode: "orbit", yaw: 0, pitch: 0.6, distance: 17, target: [9.5, s.height + 2.5, -15.5] }, markers: false },
    { id: "ruins-dry", scene: "showcase", what: "the five variants A–E on dry ground, close up (35° down, looking north)", view: { mode: "orbit", yaw: 0, pitch: 0.6, distance: 17, target: [27.5, s.height + 2.5, -15.5] }, markers: false },
    {
      id: "ruins-far",
      scene: "showcase",
      what: "the same test ground from as far as a view of a whole 256² map, enlarged in whole pixels as drawn: ruins from afar on moist ground (left) and dry ground (right)",
      view: { mode: "orbit", yaw: 0, pitch: GAME_PITCH, distance: far, target: [s.W / 2, s.height, -s.H / 2] },
      markers: false,
      insets: [
        { point: [9.5, s.height, -11], label: "moist" },
        { point: [27.5, s.height, -11], label: "dry" },
      ],
      crop: { from: [0, 0], to: [s.W, -s.H], y: s.height },
    },
    { id: "ruins-showcase-low", scene: "showcase", what: "the whole test ground from a low angle (20° down), looking north", view: { mode: "orbit", yaw: 0, pitch: 0.35, distance: 30, target: [s.W / 2, s.height + 2, -s.H / 2 - 2] }, markers: false },
    {
      id: "lineup-far",
      scene: "lineup",
      what: "from as far as a view of a whole 256² map: the start, a badwater source, a mine site, a geothermal field, a ruin field, a water source and a relic, left to right on dry ground, enlarged in whole pixels as drawn",
      view: { mode: "orbit", yaw: 0, pitch: GAME_PITCH, distance: far, target: [l.W / 2, l.height, -l.H / 2] },
      markers: false,
      insets: [
        { point: [5, l.height, -7.5], label: "start" },
        { point: [12.5, l.height, -7.5], label: "badwater" },
        { point: [21.5, l.height, -7.5], label: "mine site" },
        { point: [30.5, l.height, -7.5], label: "geothermal" },
        { point: [37.5, l.height, -7.5], label: "ruins" },
        { point: [45.5, l.height, -7.5], label: "water" },
        { point: [51.5, l.height, -7.5], label: "relic" },
      ],
      crop: { from: [0, 0], to: [l.W, -l.H], y: l.height },
    },
    {
      id: "lineup-mid",
      scene: "lineup",
      what: "the same objects closer, at the game's default pitch, looking north: the start, a badwater source, a mine site, a geothermal field, a ruin field, a water source and a relic",
      view: { mode: "orbit", yaw: 0, pitch: GAME_PITCH, distance: 55, target: [l.W / 2, l.height, -l.H / 2] },
      markers: false,
    },
  ];
}

async function settle(page: Page): Promise<void> {
  if (await page.evaluate(() => !!window.dgmEditor)) await page.evaluate(() => window.dgmEditor!.idle());
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null)))));
  await page.waitForTimeout(250);
}

async function shoot(page: Page, canvasSel: string, pose: Pose, dir: string): Promise<Shot> {
  await page.evaluate(
    ([v, markers]) => {
      const r = window.dgm3d!.renderer;
      r.setMarkers(markers as boolean);
      r.setView(v as View);
    },
    [pose.view, pose.markers] as [View, boolean],
  );
  await settle(page);
  const canvas = page.locator(canvasSel).first();
  const png = await canvas.screenshot({ type: "png" });
  const box = (await canvas.boundingBox())!;
  const file = join(dir, `${pose.id}.png`);
  writeFileSync(file, png);
  let insetsAt: Shot["insetsAt"];
  if (pose.insets)
    insetsAt = (await page.evaluate(
      (pts) => pts.map((q) => ({ ...window.dgm3d!.renderer.project(q.point[0], q.point[1], q.point[2]), label: q.label })),
      pose.insets,
    )) as Shot["insetsAt"];
  let cropAt: Shot["cropAt"];
  if (pose.crop) {
    const { from, to, y } = pose.crop;
    const corners = (await page.evaluate(
      (pts) => pts.map((q) => window.dgm3d!.renderer.project(q[0], q[1], q[2])),
      [[from[0], y, from[1]], [to[0], y, from[1]], [from[0], y, to[1]], [to[0], y, to[1]]],
    )) as { x: number; y: number }[];
    const x0 = Math.floor(Math.min(...corners.map((q) => q.x))) - 4;
    const y0 = Math.floor(Math.min(...corners.map((q) => q.y))) - 10;
    const x1 = Math.ceil(Math.max(...corners.map((q) => q.x))) + 4;
    const y1 = Math.ceil(Math.max(...corners.map((q) => q.y))) + 6;
    cropAt = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }
  console.log(`  ${file}`);
  return { ...pose, file, size: [Math.round(box.width), Math.round(box.height)], insetsAt, cropAt };
}

function readPoses(label: string): Shot[] {
  const f = join(RAW, label, "poses.json");
  return existsSync(f) ? (JSON.parse(readFileSync(f, "utf8")) as { shots: Shot[] }).shots : [];
}

/** Chrome's other GPU (not the one it uses by default; on a desktop with an integrated GPU, that
 *  one), as tools/bench3d.ts finds it: its LUID for --use-adapter-luid, and its name. */
async function otherGpu(): Promise<{ luid: string; name: string } | null> {
  const b = await chromium.launch({ channel: "chrome", headless: true });
  const p = await b.newPage();
  await p.goto("chrome://gpu");
  await p.waitForTimeout(1500);
  const text = (await p.evaluate(
    "(() => { const walk = (n) => { let s = ''; if (n.shadowRoot) s += walk(n.shadowRoot); n.childNodes.forEach((c) => { s += c.nodeType === 3 ? c.textContent + '\\n' : walk(c); }); return s; }; return walk(document.body); })()",
  )) as string;
  await b.close();
  for (const line of text.split("\n")) {
    const m = /VENDOR= 0x([0-9a-f]+), DEVICE=0x[0-9a-f]+ \[([^\]]+)\].*LUID=\{(\d+),(\d+)\}(.*)/i.exec(line);
    if (m && m[1] !== "1414" && !/ACTIVE/.test(m[5])) return { luid: `${m[3]},${m[4]}`, name: m[2] };
  }
  return null;
}

/** The site built from this checkout and served, in the installed Chrome, headed (a real GPU). */
async function withSite<T>(run: (page: Page) => Promise<T>, extraArgs: string[] = [], cpuSlowdown = 1): Promise<T> {
  process.env.DGM_BASE = "/";
  console.log("building the site…");
  await build({ configFile: "vite.config.ts", base: "/", logLevel: "warn", build: { outDir: DIST, emptyOutDir: true } });
  const server = await preview({ configFile: "vite.config.ts", base: "/", build: { outDir: DIST }, preview: { port: PORT, strictPort: true }, logLevel: "warn" });
  const keepDrawing = ["--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding", "--disable-background-timer-throttling"];
  const browser = await chromium.launch({ channel: "chrome", headless: false, args: [...keepDrawing, ...extraArgs] });
  try {
    // Standard held: this is a Map look fix round (D178), before the High look existed; a capable
    // GPU would otherwise draw it in High by itself (found auditing capture-badwater.ts's same gap,
    // D304's investigation)
    const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1, colorScheme: "light" });
    await context.addInitScript("try { localStorage.setItem('dgm.look', 'standard'); } catch {}");
    const page = await context.newPage();
    if (cpuSlowdown > 1) await (await page.context().newCDPSession(page)).send("Emulation.setCPUThrottlingRate", { rate: cpuSlowdown });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("console", (m) => m.type() === "error" && errors.push(m.text().slice(0, 400)));
    const out = await run(page);
    if (errors.length) console.log(`page errors: ${errors.join("; ")}`);
    return out;
  } finally {
    await browser.close();
    await server.close();
  }
}

async function capture(): Promise<void> {
  const dir = join(RAW, LABEL);
  mkdirSync(dir, { recursive: true });
  const before = LABEL === "before" ? [] : readPoses("before");
  const keep = (p: Pose) => !ONLY || ONLY.includes(p.id);
  /** The before run's camera, where it recorded one (so before and after match). */
  const recorded = (p: Pose): Pose => {
    const b = before.find((s) => s.id === p.id);
    return b ? { ...p, view: b.view } : p;
  };
  await withSite(async (page) => {
    const shots: Shot[] = [];
    // the generated map
    if (mapPoses({ mine: [0, 0, 0], ruins: [0, 0, 0], W: 1, H: 1, mean: 0 }).some(keep)) {
      console.log("River Valley 4242, 256²: opening");
      await openMap(page);
      const points = await mapPoints(page);
      for (const p of mapPoses(points).filter(keep)) shots.push(await shoot(page, ".editor-view canvas", recorded(p), dir));
    }
    // the test grounds
    for (const [name, spec] of [["showcase", showcase()], ["lineup", lineup()]] as const) {
      const poses = scenePoses().filter((p) => p.scene === name && keep(p));
      if (!poses.length) continue;
      console.log(`${name}: opening`);
      await openScene(page, spec);
      for (const p of poses) shots.push(await shoot(page, ".view3d canvas", recorded(p), dir));
    }
    const f = join(dir, "poses.json");
    const old = existsSync(f) && ONLY ? readPoses(LABEL).filter((s) => !shots.some((n) => n.id === s.id)) : [];
    writeFileSync(f, JSON.stringify({ label: LABEL, date: new Date().toISOString().slice(0, 10), viewport: VIEWPORT, shots: [...old, ...shots] }, null, 1) + "\n");
    console.log(`wrote ${shots.length} captures and ${f}`);
  });
}

// ------------------------------------------------------------------------------ composing

/** The page-side composer: before and after side by side (each labelled, with the insets), or the
 *  after view in greyscale and the three colour-blindness simulations (Machado, Oliveira and
 *  Fernandes 2009, severity 1, in linear RGB) as a 2 × 2 sheet. With a crop (a view from afar),
 *  the cropped region instead, enlarged in whole pixels (as drawn), one row per image, each object
 *  named under it. Returns a JPEG (base64). */
const COMPOSE_JS = `async ({ kind, images, insets, crop, scale, quality }) => {
  const load = async (b64) => { const i = new Image(); i.src = "data:image/png;base64," + b64; await i.decode(); return i; };
  const imgs = await Promise.all(images.map(load));
  const pad = 6;
  const head = 26;
  const c = document.createElement("canvas");
  const g = c.getContext("2d");
  const label = (text, x, y) => {
    g.font = "600 15px system-ui, sans-serif";
    const tw = g.measureText(text).width;
    g.fillStyle = "rgba(0,0,0,0.72)";
    g.fillRect(x, y, tw + 14, 22);
    g.fillStyle = "#fff";
    g.fillText(text, x + 7, y + 16);
  };
  /** The image in greyscale and the three simulations: [name, canvas]. */
  const simulate = (img) => {
    const M = {
      greyscale: [0.2126, 0.7152, 0.0722, 0.2126, 0.7152, 0.0722, 0.2126, 0.7152, 0.0722],
      protanopia: [0.152286, 1.052583, -0.204868, 0.114503, 0.786281, 0.099216, -0.003882, -0.048116, 1.051998],
      deuteranopia: [0.367322, 0.860646, -0.227968, 0.280085, 0.672501, 0.047413, -0.01182, 0.04294, 0.968881],
      tritanopia: [1.255528, -0.076749, -0.178779, -0.078411, 0.930809, 0.147602, 0.004733, 0.691367, 0.3039],
    };
    const t = document.createElement("canvas");
    t.width = img.width;
    t.height = img.height;
    const tg = t.getContext("2d");
    tg.drawImage(img, 0, 0);
    const src = tg.getImageData(0, 0, t.width, t.height).data;
    const table = new Float32Array(256);
    for (let k = 0; k < 256; k++) { const s = k / 255; table[k] = s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); }
    const enc = (v) => { const s = v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(Math.max(0, v), 1 / 2.4) - 0.055; return Math.max(0, Math.min(255, Math.round(s * 255))); };
    return Object.keys(M).map((name) => {
      const m = M[name];
      const d = tg.createImageData(t.width, t.height);
      for (let q = 0; q < src.length; q += 4) {
        const r = table[src[q]], gg = table[src[q + 1]], b = table[src[q + 2]];
        d.data[q] = enc(m[0] * r + m[1] * gg + m[2] * b);
        d.data[q + 1] = enc(m[3] * r + m[4] * gg + m[5] * b);
        d.data[q + 2] = enc(m[6] * r + m[7] * gg + m[8] * b);
        d.data[q + 3] = 255;
      }
      const u = document.createElement("canvas");
      u.width = t.width;
      u.height = t.height;
      u.getContext("2d").putImageData(d, 0, 0);
      return [name, u];
    });
  };
  const rows = kind === "pair" ? [["before (dev)", imgs[0]], ["after", imgs[1]]] : simulate(imgs[0]);
  if (crop) {
    const zoom = Math.max(2, Math.floor(1100 / crop.w));
    const sw = crop.w * zoom;
    const sh = crop.h * zoom;
    const foot = 20;
    c.width = sw + pad * 2;
    c.height = rows.length * (head + sh + foot) + pad;
    g.fillStyle = "#1d1f22";
    g.fillRect(0, 0, c.width, c.height);
    rows.forEach(([name, img], r) => {
      const oy = r * (head + sh + foot);
      label(name, pad, oy + 2);
      g.imageSmoothingEnabled = false;
      g.drawImage(img, crop.x, crop.y, crop.w, crop.h, pad, oy + head, sw, sh);
      g.imageSmoothingEnabled = true;
      g.font = "13px system-ui, sans-serif";
      g.fillStyle = "#eee";
      for (const p of insets || []) {
        const tw = g.measureText(p.label).width;
        g.fillText(p.label, pad + (p.x - crop.x) * zoom - tw / 2, oy + head + sh + 15);
      }
    });
    return c.toDataURL("image/jpeg", quality / 100).split(",")[1];
  }
  const w = Math.round(imgs[0].width * scale);
  const h = Math.round(imgs[0].height * scale);
  /** An inset: a 3× enlargement (whole pixels) of the capture round a point, in a corner. */
  const inset = (img, p, k, ox, oy) => {
    const r = 26;
    const sx = Math.round(p.x - r);
    const sy = Math.round(p.y - r);
    const size = r * 2 * 3;
    const dx = ox + pad + k * (size + 6);
    const dy = oy + head + pad;
    g.imageSmoothingEnabled = false;
    g.fillStyle = "#000";
    g.fillRect(dx - 2, dy - 2, size + 4, size + 4 + 18);
    g.drawImage(img, sx, sy, r * 2, r * 2, dx, dy, size, size);
    g.imageSmoothingEnabled = true;
    g.font = "12px system-ui, sans-serif";
    g.fillStyle = "#fff";
    g.fillText(p.label, dx + 3, dy + size + 13);
    // the region it enlarges, outlined on the view
    g.strokeStyle = "rgba(255,255,255,0.9)";
    g.lineWidth = 1;
    g.strokeRect(ox + sx * scale, oy + head + sy * scale, r * 2 * scale, r * 2 * scale);
  };
  c.width = w * 2 + pad * 3;
  c.height = Math.ceil(rows.length / 2) * (h + head) + pad;
  g.fillStyle = "#1d1f22";
  g.fillRect(0, 0, c.width, c.height);
  rows.forEach(([name, img], k) => {
    const ox = pad + (k % 2) * (w + pad);
    const oy = Math.floor(k / 2) * (h + head);
    g.drawImage(img, ox, oy + head, w, h);
    label(name, ox, oy + 2);
    (insets || []).forEach((p, j) => inset(img, p, j, ox, oy));
  });
  return c.toDataURL("image/jpeg", quality / 100).split(",")[1];
}`;


async function composeOne(tool: Page, kind: "pair" | "sheet", pngs: Buffer[], insets: Shot["insetsAt"], crop: Shot["cropAt"], scale: number): Promise<Buffer> {
  for (let q = 82; ; q -= 6) {
    const b64 = (await tool.evaluate(`(${COMPOSE_JS})(${JSON.stringify({ kind, images: pngs.map((p) => p.toString("base64")), insets: insets ?? [], crop: crop ?? null, scale, quality: q })})`)) as string;
    const buf = Buffer.from(b64, "base64");
    if (buf.length <= MAX_BYTES || q <= 40) return buf;
  }
}

async function compose(): Promise<void> {
  const before = readPoses("before");
  const after = readPoses("after");
  mkdirSync(OUT, { recursive: true });
  const all = [...mapPoses({ mine: [0, 0, 0], ruins: [0, 0, 0], W: 256, H: 256, mean: 0 }), ...scenePoses()];
  // (composing needs only a canvas: a blank page in Chrome, headless)
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const tool = await browser.newPage();
  try {
    const lines: string[] = [];
    for (const pose of all) {
      const a = after.find((s) => s.id === pose.id);
      const b = before.find((s) => s.id === pose.id);
      if (!a || !b) {
        console.log(`  ${pose.id}: no ${a ? "before" : "after"} capture, skipped`);
        continue;
      }
      // the insets sit where the view drew the points (before and after share the camera)
      const insets = a.insetsAt?.map((p) => ({ x: p.x, y: p.y, label: p.label }));
      const pair = await composeOne(tool, "pair", [readFileSync(b.file), readFileSync(a.file)], insets, a.cropAt, 0.75);
      const pairFile = join(OUT, `${pose.id}.jpg`);
      writeFileSync(pairFile, pair);
      const sheet = await composeOne(tool, "sheet", [readFileSync(a.file)], insets, a.cropAt, 0.55);
      const sheetFile = join(OUT, `${pose.id}-sheet.jpg`);
      writeFileSync(sheetFile, sheet);
      console.log(`  ${pairFile} (${Math.round(statSync(pairFile).size / 1024)} KB), ${sheetFile} (${Math.round(statSync(sheetFile).size / 1024)} KB)`);
      lines.push(pose.id);
    }
    // the cameras (the after run took the before run's), and what each view shows
    const camera = (s: Shot) => ({ id: s.id, what: s.what, view: s.view, markers: s.markers, size: s.size });
    writeFileSync(join(OUT, "poses.json"), JSON.stringify({ viewport: VIEWPORT, shots: after.filter((a) => before.some((b) => b.id === a.id)).map(camera) }, null, 1) + "\n");
    console.log(`composed ${lines.length} views into ${OUT}`);
  } finally {
    await browser.close();
  }
}

// ------------------------------------------------------------------------------ frame time

async function bench(): Promise<void> {
  const dir = join(RAW, LABEL);
  mkdirSync(dir, { recursive: true });
  const other = process.argv.includes("--other-gpu") ? await otherGpu() : null;
  if (process.argv.includes("--other-gpu") && !other) throw new Error("no other GPU");
  if (other) console.log(`on ${other.name}, the page's CPU 4× slower`);
  await withSite(async (page) => {
    await openMap(page);
    const points = await mapPoints(page);
    const poses = mapPoses(points);
    const runs: Record<string, unknown> = {};
    for (const [name, view] of [
      ["whole map, default camera", poses.find((p) => p.id === "overview")!.view],
      ["ruin field, 60 away", { ...poses.find((p) => p.id === "ruins-close")!.view, distance: 60 }],
    ] as const) {
      await page.evaluate((v) => {
        const r = window.dgm3d!.renderer as unknown as { setView(v: unknown): void; setClock(t: number | null): void };
        r.setClock(null);
        r.setView(v);
      }, view);
      await page.waitForTimeout(500);
      const info = await page.evaluate(() => window.dgm3d!.renderer.info());
      const o = await page.evaluate((ms) => window.dgm3d!.renderer.benchOrbit(ms), SECONDS * 1000);
      const gpu = await page.evaluate(() => window.dgm3d!.renderer.gpu());
      runs[name] = { ...o, triangles: info.triangles, calls: info.calls, gpu: gpu.renderer };
      console.log(`${name}: ${info.triangles.toLocaleString()} triangles, ${info.calls} calls; ${o.fps.toFixed(0)} fps, frames p50/p95 ${o.p50.toFixed(1)}/${o.p95.toFixed(1)} ms, CPU ${o.cpuP50.toFixed(2)}/${o.cpuP95.toFixed(2)} ms${o.gpuP50 === null ? "" : `, GPU ${o.gpuP50.toFixed(2)}/${o.gpuP95!.toFixed(2)} ms`}`);
    }
    const build = await page.evaluate(() => window.dgm3d!.build);
    writeFileSync(join(dir, other ? "bench-other.json" : "bench.json"), JSON.stringify({ label: LABEL, date: new Date().toISOString().slice(0, 10), seconds: SECONDS, cpuSlowdown: other ? 4 : 1, build, runs }, null, 1) + "\n");
  }, other ? [`--use-adapter-luid=${other.luid}`] : [], other ? 4 : 1);
}

if (process.argv.includes("--compose")) await compose();
else if (process.argv.includes("--bench")) await bench();
else await capture();
