// Captures of the poisoned floodplain's land (docs/design/poisoned-floodplain.md §9 row 2), as tools/capture-gate.ts
// renders the wall-with-one-gate's maps: each map's land made by `src/core/premise/plainLand.ts` (stage 2, not offered
// on the page), built dry with its start only (the land's stage has no water beyond its measures and no works), opened
// as a file through the page's "Open a map or a project", the 3D view at the High look, only the 3D canvas captured.
// Two frames a map: `whole`, the whole map from near overhead with north up (pitch 62°, as the Gate's widest frame),
// the plan's courses drawn over it as thin lines; and `vista`, the first frame from the start's terrace (planning's
// verdict on round 1): the eye over the start's terrace, at a low pitch (`VISTA_PITCH`) looking at the Red Fall's lip,
// `VISTA_OVER` levels over the plain (over the far wall's crest, so the horizon shows over it) and at least `VISTA_BACK`
// tiles behind the start: the plain lies below, the far wall and the fall stand behind it, the horizon in the frame. The sheet sets the maps out two to a row, the start's numbers first under each,
// then the walls' heights where the first frame sees them, the Red Fall's drop, the floor's share, day 1's bands and
// the tiles the mend changed, then each wall's longest straight run on the ground (`wall.wanders`' measure) and the
// held attempt's time; the single frames are written beside it. Real Chrome, the site
// built from this checkout into its own folder with its own Vite cache, served on its own port.
// With `--water` (§9 row 3), each map is the premise's whole map (`plainMap.ts`: built, its life and dead band in,
// settled), its file opened as it is, the whole frame without the plan's lines (the water drawn is the settled water);
// the captions give the start's numbers first, then the bands on the settled water, the three sources' strengths, the
// water off its courses (0), the Red Fall's settled drop, the badtide's tiles past the low places (0) and the time.
//
//   npx tsx tools/capture-plain.ts [--water] [--seeds 1,2] [--sizes 128,192,256]
//                                  [--out C:/dgm-showcase/poisoned-plain/land, or .../water with --water]
//                                  [--port 4491] [--dist .scratch/capture-plain-dist] [--quality 80]

import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium, type Browser } from "@playwright/test";
import { build, preview } from "vite";
import { buildMap } from "../src/core/features/build";
import { featureId } from "../src/core/features/ids";
import type { StartFeature } from "../src/core/features/schema";
import { startMiddleTile } from "../src/core/format/footprints";
import { writeTimber } from "../src/core/format/timber";
import { toTimberFile } from "../src/core/gen/pack";
import { fallDrop, groundFoot, plainBands, plainLand, plainStart, wallHeights, type PlainLand } from "../src/core/premise/plainLand";
import { plainMap } from "../src/core/premise/plainMap";
import { longestStraight } from "../src/core/premise/raster/levee";
import { PLAIN_IDS, plainOf, WALL } from "../src/core/premise/premises/poisonedPlain";
import type { Point } from "../src/core/premise/types";
import { makeSpec } from "../src/core/spec/mapspec";
import { waitForEditor } from "./wait-editor";

const arg = (name: string, f: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : f;
};
const SEEDS = arg("seeds", "1,2").split(",").map(Number);
const SIZES = arg("sizes", "128,192,256").split(",").map(Number);
const WATER = process.argv.includes("--water");
const OUT = arg("out", WATER ? "C:/dgm-showcase/poisoned-plain/water" : "C:/dgm-showcase/poisoned-plain/land");
const PORT = Number(arg("port", "4491"));
const DIST = arg("dist", ".scratch/capture-plain-dist");
const CACHE = `${DIST}-vite-cache`;
const QUALITY = Number(arg("quality", "80"));
const VIEWPORT = { width: 1280, height: 720 };
/** The whole-map frame: pitch from the horizontal, the camera's distance per tile of the map's side, and how far south
 *  of the map's middle it looks (a share of the side), so the near edge is in the frame. */
const WHOLE = { pitch: 62, distance: 1.5, south: 0.06 } as const;
/** The first frame's pitch (degrees under the horizontal: the top of a 35° frame stands just over the horizon), its eye's
 *  height over the plain's head (levels) and the least it stands behind the start (tiles). */
const VISTA_PITCH = 15;
const VISTA_OVER = 16;
const VISTA_BACK = 2;
/** The courses drawn on the whole-map frame: the plan's links and the sloughs, by colour. */
const COURSE = { water: "#4aa3ff", red: "#ff3b30", dry: "#f4d35e" } as const;

type Shot = { label: string; file: string; jpg: Buffer };

/** The plan's courses as map polylines with a colour: the river and the brook blue, the red water red, the sloughs and
 *  the Dry Fork (dry beds) yellow. */
function courses(land: PlainLand): { pts: Point[]; colour: string }[] {
  const I = PLAIN_IDS;
  const p = plainOf(land.plan)!;
  const out: { pts: Point[]; colour: string }[] = [];
  for (const l of land.plan.links) {
    if (!l.path) continue;
    const red = l.id === I.red || l.id === I.redFall;
    out.push({ pts: l.path as Point[], colour: red ? COURSE.red : COURSE.water });
  }
  for (const s of p.sloughs) out.push({ pts: s.path as Point[], colour: COURSE.dry });
  out.push({ pts: p.fork.path as Point[], colour: COURSE.dry });
  return out;
}

/** A map to capture: its land, its file on disk and its caption (lines). */
type Made = { land: PlainLand; timber: string; caption: string; lines: boolean };

/** The premise's whole map, settled (`--water`): its file and the caption the sheet asks for, the start first. */
function waterMap(seed: number, size: number): Made | null {
  const spec = makeSpec({ seed, size: { x: size, y: size }, theme: "any", premise: "any" });
  const t0 = performance.now();
  const m = plainMap(spec);
  const ms = Math.round(performance.now() - t0);
  if ("reason" in m) {
    console.log(`seed ${seed} at ${size}²: no map: ${m.reason}`);
    return null;
  }
  const st = m.start;
  const n = (k: keyof typeof st) => `${st[k].value}${st[k].ok ? "" : " (short of " + st[k].limit + ")"}`;
  const s = m.settled;
  const pct = (v: number) => `${Math.round(100 * v)} %`;
  const caption = [
    `start: level land ${n("start.level_land")}, reach ${n("start.reach")}, wood ${n("start.wood")} (fast ${n("start.wood_fast")}), water within ${n("start.water")}, food ${n("start.food")}, farmland ${n("start.farmland")}`,
    `seed ${seed} at ${size}²${m.held ? "" : " (did not hold: " + m.settledFails.map((f) => f.id).join(", ") + ")"}`,
    `river: ${s.stand.steps} steps; its water ${s.stand.crest.toFixed(2)} under the levees' crest at the least, ${s.stand.plain.toFixed(2)} under the plain beside it; ${s.mix ? `below the join the mix is ${s.mix.below.toFixed(3)} (median), the most ${s.mix.most.toFixed(2)}; above it red reaches ${s.mix.creep.toFixed(0)} tiles up at ${s.mix.trace.toExponential(0)} (0 in the file)` : "the red stream leaves by its own exit: no join, no mix"}`,
    `settled: dead ${pct(s.bands.dead)}, green ${pct(s.bands.green)}, dry ${pct(s.bands.dry)} of the floor; ${s.deadTrees} dead trees on the dead band`,
    `sources: river ${s.sources.river}, brook ${s.sources.brook}, red ${s.sources.red}; leaks ${s.leaks.tiles}; clean water red ${s.river.tiles}; the Red Fall drops ${s.fall.drop.toFixed(1)}; a badtide past the low places ${s.badtide.beyond}`,
    `attempt ${m.attempt + 1} took ${m.ms.total} ms (land ${m.ms.land}, settle ${m.ms.settle}, life ${m.ms.life}, checks ${m.ms.checks}); all attempts ${ms} ms`,
  ].join("<br>");
  console.log(`seed ${seed} at ${size}²: ${caption.replace(/<br>/g, "; ")}`);
  const timber = resolve(`.scratch/capture-plain/water-${size}-${seed}.timber`);
  mkdirSync(resolve(".scratch/capture-plain"), { recursive: true });
  writeFileSync(timber, writeTimber(m.map.file));
  return { land: m.land, timber, caption, lines: false };
}

/** The land alone, dry with its start (stage 2). */
function landMap(seed: number, size: number): Made | null {
  const spec = makeSpec({ seed, size: { x: size, y: size }, theme: "any", premise: "any" });
  const t0 = performance.now();
  const land = plainLand(spec);
  const ms = Math.round(performance.now() - t0);
  if ("reason" in land) {
    console.log(`seed ${seed} at ${size}²: no land: ${land.reason}`);
    return null;
  }
  const st = land.frame.start;
  const b = plainBands(land.plan, land.water, land.heights, land.relief.floor);
  const n = plainStart(land.plan, land.water, land.heights, land.relief.floor, land.frame);
  const wh = wallHeights(land.plan, land.heights, land.relief.floor);
  const fd = fallDrop(land.plan, land.heights, land.relief.floor, land.relief.valleys);
  const pct = (v: number) => `${Math.round(100 * v)} %`;
  // (each wall's foot on the ground: its longest run within WALL.near tiles of one straight line, against 1.2 P)
  const P = plainOf(land.plan)!.P;
  const run = (wall: "far" | "near") => Math.round(longestStraight(groundFoot(land.plan, land.relief.floor, wall), WALL.near));
  const caption = [
    `seed ${seed} at ${size}²${land.held ? "" : " (did not hold: " + [...land.landFails.map((f) => f.id), ...(land.frame.reason ? ["frame.start"] : [])].join(", ") + ")"}`,
    `start: level land ${n.bench}, reach ${n.reach}, to its own water ${n.own}, to the plain ${n.plain}, to the river ${n.river}, to red water ${n.red}`,
    `in the frame: far wall ${wh.far.least} to ${wh.far.most} over the plain, near wall ${wh.near.least} to ${wh.near.most}; the Red Fall drops ${fd ? fd.drop : "?"}`,
    `floor ${pct(b.floor)} of the map; dead ${pct(b.dead)}, green ${pct(b.green)}, dry ${pct(b.dry)}; M ${b.M.toFixed(1)}; the mend changed ${land.found.changed} tiles`,
    `straight runs of the walls' feet: far ${run("far")}, near ${run("near")} (at most ${Math.round(WALL.longest * P)}); attempt ${land.attempt + 1} took ${land.ms.total} ms (all attempts ${ms} ms)`,
  ].join("<br>");
  console.log(`seed ${seed} at ${size}²: ${caption.replace(/<br>/g, "; ")}; stage ${ms} ms ${JSON.stringify(land.ms)}`);
  const start: StartFeature = {
    id: featureId(land.plan.seed, "start", "start/main"),
    kind: "start",
    origin: "generated",
    role: "start/main",
    locked: false,
    params: { position: [st.x, st.y], orientation: st.orientation, benchRadius: 2, benchLevel: st.z, player: 0 },
  };
  const built = buildMap({ W: size, H: size, seed, features: [start], field: { heights: land.heights, contains: new Set(), top: land.plan.top } });
  const timber = resolve(`.scratch/capture-plain/plain-${size}-${seed}.timber`);
  mkdirSync(resolve(".scratch/capture-plain"), { recursive: true });
  writeFileSync(timber, writeTimber(toTimberFile(spec, built)));
  return { land, timber, caption, lines: true };
}

async function shoot(browser: Browser, made: Made): Promise<{ shots: Shot[]; caption: string }> {
  const { land, timber, caption } = made;
  const size = land.plan.W;
  const seed = land.plan.seed;
  const st = land.frame.start;
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1, colorScheme: "light" });
  await context.addInitScript("window.__name = (f) => f");
  const page = await context.newPage();
  await page.goto(`http://localhost:${PORT}/#s=1&z=96&d=n&t=riverValley`);
  await waitForEditor(page, 600_000);
  await page.getByLabel("Open a map or a project").setInputFiles(timber);
  await page.waitForFunction(() => window.dgmEditor?.info().kind === "import" && !!window.dgm3d, null, { timeout: 600_000 });
  await page.evaluate(() => window.dgmEditor!.idle());
  await page.evaluate(() => {
    const cs = [...document.querySelectorAll("canvas")];
    const big = cs.reduce((m, c) => (c.clientWidth * c.clientHeight > m.clientWidth * m.clientHeight ? c : m), cs[0]);
    big.setAttribute("data-opening-view", "");
    const s = document.createElement("style");
    s.textContent = "body * { visibility: hidden !important } [data-opening-view] { visibility: visible !important }";
    document.head.append(s);
  });
  // the High look, every effect on (as tools/capture-crisp.ts sets it)
  await page.evaluate(() => {
    const r = window.dgm3d!.renderer as unknown as { highEffects: Record<string, boolean>; setHighEffect(k: string, on: boolean): void; setLookChoice(c: string, save: boolean): void };
    for (const k of Object.keys(r.highEffects)) r.setHighEffect(k, true);
    r.setLookChoice("high", false);
  });
  await page.waitForFunction(() => (window.dgm3d!.renderer as unknown as { highSettled: boolean }).highSettled, null, { timeout: 300_000 });
  const [mx, my] = startMiddleTile({ x: st.x, y: st.y, orientation: st.orientation });
  const shots: Shot[] = [];
  for (const frame of ["whole", "vista"] as const) {
    let view: unknown;
    if (frame === "whole") view = { mode: "orbit", yaw: 0, pitch: (WHOLE.pitch * Math.PI) / 180, distance: WHOLE.distance * size, target: [size / 2, 8, -size * (0.5 - WHOLE.south)] };
    else {
      // (the eye on the line from the lip through the start, raised by the pitch over the lip)
      const fall = land.plan.links.find((l) => l.id === PLAIN_IDS.redFall)!.fall!;
      const lx = (fall.lip[0][0] + fall.lip[1][0]) / 2;
      const ly = (fall.lip[0][1] + fall.lip[1][1]) / 2;
      const dx = lx - (mx + 0.5);
      const dy = ly - (my + 0.5);
      const far = Math.hypot(dx, dy);
      const pitch = (VISTA_PITCH * Math.PI) / 180;
      const p = plainOf(land.plan)!;
      const across = Math.max(far + VISTA_BACK, (p.L + VISTA_OVER - fall.crest) / Math.tan(pitch));
      view = { mode: "orbit", yaw: Math.atan2(-dx / far, dy / far), pitch, distance: across / Math.cos(pitch), target: [lx, fall.crest, -ly] };
    }
    await page.evaluate((v) => {
      const rr = window.dgm3d!.renderer as unknown as { persp: { fov: number; updateProjectionMatrix(): void }; setView(v: unknown): void; setClock?: (t: number | null) => void };
      rr.persp.fov = 35;
      rr.persp.updateProjectionMatrix();
      rr.setClock?.(6);
      rr.setView(v);
    }, view);
    await page.waitForTimeout(3000);
    await page.evaluate(() => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(() => res(null)))));
    const box = (await page.locator("[data-opening-view]").boundingBox())!;
    const w = Math.min(box.width, (box.height * 16) / 9);
    const clip = { x: box.x + (box.width - w) / 2, y: box.y, width: w, height: box.height };
    let jpg = await page.screenshot({ type: "jpeg", quality: 92, clip });
    if (frame === "whole") {
      // the plan's courses, projected through the renderer's own camera onto the frame (a tile's world point is
      // (x, level, −y)), drawn as thin lines
      const lines = (made.lines ? courses(land) : []).map((c) => ({ colour: c.colour, pts: c.pts.map(([x, y]) => [x, (land.heights[Math.min(size - 1, Math.max(0, Math.floor(y))) * size + Math.min(size - 1, Math.max(0, Math.floor(x)))] ?? 8) + 0.4, -y]) }));
      // (north up: the map's north edge, y = its side, above its south edge on the frame)
      lines.push({ colour: "none", pts: [[size / 2, 8, 0], [size / 2, 8, -size]] });
      const proj = await page.evaluate(
        ({ lines, clip, box }) => {
          const cam = (window.dgm3d!.renderer as unknown as { persp: { updateMatrixWorld(): void; matrixWorldInverse: { elements: number[] }; projectionMatrix: { elements: number[] } } }).persp;
          cam.updateMatrixWorld();
          const v = cam.matrixWorldInverse.elements;
          const pm = cam.projectionMatrix.elements;
          const mul = (m: number[], q: number[]) => [0, 1, 2, 3].map((r) => m[r] * q[0] + m[4 + r] * q[1] + m[8 + r] * q[2] + m[12 + r] * q[3]);
          return lines.map((l) => ({
            colour: l.colour,
            pts: l.pts.map((q) => {
              const c = mul(pm, mul(v, [q[0], q[1], q[2], 1]));
              const nx = c[0] / c[3];
              const ny = c[1] / c[3];
              return [box.x + ((nx + 1) / 2) * box.width - clip.x, box.y + ((1 - ny) / 2) * box.height - clip.y];
            }),
          }));
        },
        { lines, clip, box },
      );
      const ns = proj.pop()!.pts;
      if (!(ns[1][1] < ns[0][1])) throw new Error(`the whole-map frame is not north up (south edge at ${ns[0][1].toFixed(0)}, north at ${ns[1][1].toFixed(0)})`);
      const tool = await browser.newPage({ viewport: { width: Math.round(clip.width), height: Math.round(clip.height) } });
      const svg = proj.map((l) => `<polyline fill="none" stroke="${l.colour}" stroke-width="1.6" stroke-opacity="0.9" points="${l.pts.map((q) => q.map((c) => c.toFixed(1)).join(",")).join(" ")}"/>`).join("");
      await tool.setContent(`<body style="margin:0"><div style="position:relative"><img src="data:image/jpeg;base64,${jpg.toString("base64")}" style="display:block"><svg style="position:absolute;left:0;top:0" width="${Math.round(clip.width)}" height="${Math.round(clip.height)}">${svg}</svg></div></body>`);
      await tool.evaluate(() => Promise.all([...document.images].map((i) => i.decode())));
      jpg = await tool.screenshot({ type: "jpeg", quality: 92, clip: { x: 0, y: 0, width: Math.round(clip.width), height: Math.round(clip.height) } });
      await tool.close();
    }
    const file = `plain-${size}-${seed}-${frame}.jpg`;
    writeFileSync(join(OUT, file), jpg);
    shots.push({ label: `seed ${seed} at ${size}², ${frame === "whole" ? "the whole map, north up" : "the first frame from the start's terrace, facing the Red Fall"}`, file, jpg });
  }
  await context.close();
  return { shots, caption };
}

async function main(): Promise<void> {
  process.env.DGM_BASE = "/";
  mkdirSync(OUT, { recursive: true });
  console.log("building the site…");
  await build({ configFile: "vite.config.ts", base: "/", cacheDir: CACHE, logLevel: "warn", build: { outDir: DIST, emptyOutDir: true } });
  const server = await preview({ configFile: "vite.config.ts", base: "/", cacheDir: CACHE, build: { outDir: DIST }, preview: { port: PORT, strictPort: true }, logLevel: "warn" });
  const browser = await chromium.launch({ channel: "chrome", headless: false });
  try {
    const maps: { shots: Shot[]; caption: string }[] = [];
    for (const size of SIZES)
      for (const seed of SEEDS) {
        const made = WATER ? waterMap(seed, size) : landMap(seed, size);
        if (made) maps.push(await shoot(browser, made));
      }
    // the sheet: two maps a row, each its two frames side by side with its numbers under them
    const pw = 480;
    const cell = (m: { shots: Shot[]; caption: string }) =>
      `<div style="width:${2 * pw + 2}px"><div style="display:flex;gap:2px">${m.shots.map((s) => `<img src="data:image/jpeg;base64,${s.jpg.toString("base64")}" style="display:block;width:${pw}px">`).join("")}</div><div style="padding:4px 6px 10px;line-height:1.35">${m.caption}</div></div>`;
    const html = `<body style="margin:0;background:#1d1d1d;font:13px sans-serif;color:#eee"><div style="display:grid;grid-template-columns:repeat(2,${2 * pw + 2}px);gap:8px">${maps.map(cell).join("")}</div></body>`;
    const page = await browser.newPage({ viewport: { width: 2 * (2 * pw + 2) + 8, height: 400 } });
    await page.setContent(html);
    await page.evaluate(() => Promise.all([...document.images].map((i) => i.decode())));
    writeFileSync(join(OUT, "sheet.jpg"), await page.screenshot({ type: "jpeg", quality: QUALITY, fullPage: true }));
    await page.close();
    console.log(join(OUT, "sheet.jpg"));
  } finally {
    await browser.close();
    await new Promise<void>((done) => server.httpServer.close(() => done()));
  }
}

void main();
