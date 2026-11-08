// The shadows objects cast on the ground, in both looks (D497: draw as the game draws; docs/progress/3d-view.md,
// "Objects' shadows"): each object's shadow measured from straight above on a flat meadow, and a sheet of a real map.
//
//   npx tsx tools/object-shadows.ts --label dev|pr [--port 6741] [--built] [--meadow] [--size 48]
//   npx tsx tools/object-shadows.ts --label dev|pr --built --game <shot>,<shot> [--distance 45]
//   npx tsx tools/object-shadows.ts --sheet [--labels dev,pr]
//
// --label builds this checkout's site (--built: the one built before), opens a meadow at level 4 (48 × 32, or --size
// square round it: High's depth map is fitted to the whole map) with a pine, an oak, a birch, a blueberry bush, ruin
// columns of 2 and 4 storeys, the start, and a 2 × 2 pillar four levels high (its shadow is the ground's full shadow),
// and draws it from straight above (the orthographic top view) in Standard and in High, with the objects and hidden
// (`setObjectsHidden`: no objects, none of their shadows). Each ground point's darkening is how much its luma fell,
// against the full shadow's fall under the pillar: 1 is full shadow. Per object, along the sun's way from its middle
// (u) and across it (v), outside its own footprint (seen from above an object hides the ground under it):
//   - core: the darkening its shadow reaches (the 99.5th centile of its points);
//   - mass: the darkening summed over the ground (tiles², a full shadow's area that much);
//   - area: the ground darkened at least half (tiles²);
//   - reach, width: how far along and across the ground darkened at least half lies (tiles).
// It writes .scratch/object-shadows/<label>-meadow<size>.json and, unless --meadow, for the sheet, a real map (River
// Valley 4242, 128²) round the start near (distance 22) and mid (distance 48), at the game's 55°, in both looks:
// .scratch/object-shadows/<label>-*.png.
// --game draws each probe shot's map (batch 20261002-1610) from its `start` pose in both looks, with the objects and
// without, for tools/object-shadow-check.py to set beside the game's frames.
// --sheet composes docs/sheets/object-shadows.jpg from the labels' captures (rows: each label in each look; columns:
// near, mid). The page runs on the GPU (Chrome headless with ANGLE on D3D11, as the pixel judge does).

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { gunzipSync } from "node:zlib";
import { chromium, type Page } from "@playwright/test";
import { build, preview } from "vite";
import { waitForEditor } from "./wait-editor";

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const PORT = Number(arg("port") ?? 6741);
const OUT = resolve(".scratch/object-shadows");
const VIEWPORT = { width: 1280, height: 800 };
/** `--size`: the meadow's map side (48 × 32 at least). */
const SIZE = Number(arg("size") ?? 48);

/** Page side: the meadow drawn from above in `look`, measured. */
const MEADOW_JS = `async (look, size) => {
  const Make = window.dgm3d.renderer.constructor;
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;left:0;top:0;width:1280px;height:800px;opacity:0;pointer-events:none";
  const c = document.createElement("canvas");
  c.style.cssText = "width:100%;height:100%;display:block";
  host.append(c);
  document.body.append(host);
  const r = new Make(c, { still: true });
  r.setLookChoice(look, false);
  if (r.highEffects) for (const k of Object.keys(r.highEffects)) r.setHighEffect(k, true);
  // (the meadow's objects on a map of size² round its middle: High's depth map is fitted to the whole map)
  const W = Math.max(48, size), H = Math.max(32, size), LEVEL = 4, OX = (W - 48) / 2, OY = (H - 32) / 2;
  const heights = new Uint8Array(W * H).fill(LEVEL);
  // the pillar: 2 x 2, four levels over the meadow
  const PILLAR = [40 + OX, 4 + OY];
  for (let y = PILLAR[1]; y < PILLAR[1] + 2; y++) for (let x = PILLAR[0]; x < PILLAR[0] + 2; x++) heights[y * W + x] = LEVEL + 4;
  // [template, x, y, the footprint's half width seen from above, its middle's offset]
  const objs = [
    ["Pine", 6, 6, 0.65, 0.5], ["Oak", 16, 6, 0.9, 0.5], ["Birch", 26, 6, 0.6, 0.5], ["BlueberryBush", 6, 18, 0.62, 0.5],
    ["RuinColumnH2", 16, 18, 0.72, 0.5], ["RuinColumnH4", 26, 18, 0.72, 0.5], ["StartingLocation", 34, 16, 2.15, 1.5],
  ];
  const n = objs.length;
  const entities = { count: n, templates: objs.map((o) => o[0]), owners: [], template: Uint16Array.from(objs, (_, k) => k),
    x: Int16Array.from(objs, (o) => o[1] + OX), y: Int16Array.from(objs, (o) => o[2] + OY), z: new Int16Array(n).fill(LEVEL),
    orientation: new Uint8Array(n), flags: new Uint8Array(n), owner: new Uint16Array(n), variant: new Uint8Array(n),
    strength: new Float32Array(n), ids: objs.map((_, k) => "o" + k) };
  const water = { count: 0, tile: new Int32Array(0), floor: new Float32Array(0), depth: new Float32Array(0), contamination: new Float32Array(0) };
  const moisture = new Uint8Array(W * H).fill(60);
  r.setClock(12.5);
  r.setMap({ W, H, heights, columns: { tiles: new Int32Array(0), voxels: new Uint8Array(0) }, water, entities, soil: { moisture, contamination: new Uint8Array(W * H) } });
  r.setView({ mode: "top", yaw: 0, pitch: 1.5, distance: 38, target: [W / 2, LEVEL, -H / 2] });
  const g = r.gl.getContext();
  const wait = (ms) => new Promise((d) => setTimeout(d, ms));
  const settle = async () => {
    await Promise.race([r.whenDrawn(), wait(30000)]);
    await wait(250);
    r.renderNow();
    await wait(150);
  };
  const frame = () => {
    r.renderNow();
    const px = new Uint8Array(g.drawingBufferWidth * g.drawingBufferHeight * 4);
    g.readPixels(0, 0, g.drawingBufferWidth, g.drawingBufferHeight, g.RGBA, g.UNSIGNED_BYTE, px);
    return px;
  };
  await settle();
  const withObjs = frame();
  const shot = c.toDataURL("image/png");
  r.setObjectsHidden(true);
  await settle();
  const bare = frame();
  r.setObjectsHidden(false);
  const BW = g.drawingBufferWidth, BH = g.drawingBufferHeight, k = BW / c.clientWidth;
  const luma = (p, x, y) => {
    // bilinear, device pixels, rows bottom up
    const fx = x - 0.5, fy = BH - 1 - (y - 0.5);
    const x0 = Math.max(0, Math.min(BW - 2, Math.floor(fx))), y0 = Math.max(0, Math.min(BH - 2, Math.floor(fy)));
    const ax = Math.min(1, Math.max(0, fx - x0)), ay = Math.min(1, Math.max(0, fy - y0));
    const at = (xx, yy) => { const o = (yy * BW + xx) * 4; return 0.299 * p[o] + 0.587 * p[o + 1] + 0.114 * p[o + 2]; };
    return (at(x0, y0) * (1 - ax) + at(x0 + 1, y0) * ax) * (1 - ay) + (at(x0, y0 + 1) * (1 - ax) + at(x0 + 1, y0 + 1) * ax) * ay;
  };
  const px = (gx, gy) => { const p = r.project(gx, LEVEL, -gy); return [p.x * k, p.y * k]; };
  const ratio = (gx, gy) => { const [x, y] = px(gx, gy); return luma(withObjs, x, y) / Math.max(1, luma(bare, x, y)); };
  // the sun's way on the ground, away from the sun (tile axes: x east, y north)
  const s = r.uniforms.sunDir.value;
  const len = Math.hypot(s.x, s.z);
  const ax = [-s.x / len, s.z / len];
  const across = [-ax[1], ax[0]];
  const STEP = 0.05;
  // the full shadow: the pillar's, from 1.5 to 3 tiles past its middle
  const pc = [PILLAR[0] + 1, PILLAR[1] + 1];
  // (the pillar casts in both frames: its shadow against the lit ground on its sunny side, in the frame without objects)
  const median = (a) => a.sort((p, q) => p - q)[Math.floor(a.length / 2)];
  const bareAt = (u, v) => { const [x, y] = px(pc[0] + ax[0] * u + across[0] * v, pc[1] + ax[1] * u + across[1] * v); return luma(bare, x, y); };
  const shade = [], sunny = [];
  for (let u = 2.6; u <= 3.6; u += STEP) for (let v = -0.4; v <= 0.4; v += STEP) { shade.push(bareAt(u, v)); sunny.push(bareAt(-u, v)); }
  const fullRatio = median(shade) / median(sunny);
  const out = { look: r.look, gpu: r.gpu().renderer, sunUp: s.y, fullRatio, objects: [] };
  for (const [name, x, y, half, mid] of objs) {
    const cx = x + OX + mid, cy = y + OY + mid;
    const ts = [];
    let mass = 0, area = 0, reach = 0, width = 0;
    for (let u = -2; u <= 7; u += STEP)
      for (let v = -3; v <= 3; v += STEP) {
        const gx = cx + ax[0] * u + across[0] * v, gy = cy + ax[1] * u + across[1] * v;
        // (outside its footprint as seen from above: a square round its middle, as its tile's axes)
        if (Math.abs(gx - cx) <= half && Math.abs(gy - cy) <= half) continue;
        const t = (1 - ratio(gx, gy)) / (1 - fullRatio);
        ts.push(t);
        mass += Math.max(0, t) * STEP * STEP;
        if (t >= 0.5) { area += STEP * STEP; reach = Math.max(reach, u); width = Math.max(width, Math.abs(v)); }
      }
    ts.sort((a, b) => a - b);
    out.objects.push({ name, core: ts[Math.floor(ts.length * 0.995)], mass, area, reach, width: 2 * width });
  }
  r.dispose?.();
  host.remove();
  out.shot = shot;
  return out;
}`;

/** Page side: the real map's start, near and mid, in `look`. */
const SCENE_JS = `async ({ look, distance }) => {
  const r = window.dgm3d.renderer;
  r.setLookChoice(look, false);
  if (r.highEffects) for (const k of Object.keys(r.highEffects)) r.setHighEffect(k, true);
  // (the start's middle: its footprint's middle tile, at its level)
  const en = r.map.entities;
  let t = r.getView().target;
  for (let i = 0; i < en.count; i++)
    if (en.templates[en.template[i]] === "StartingLocation") t = [en.x[i] + 1.5, en.z[i], -(en.y[i] + 1.5)];
  r.setView({ mode: "orbit", yaw: -Math.PI / 6, pitch: (55 * Math.PI) / 180, distance, target: t });
  await Promise.race([r.whenDrawn(), new Promise((d) => setTimeout(d, 30000))]);
  await new Promise((d) => setTimeout(d, 400));
  r.renderNow();
  return true;
}`;

async function capture(label: string): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const dist = resolve(`.scratch/object-shadows-dist-${label}`);
  process.env.DGM_BASE = "/";
  if (!process.argv.includes("--built")) {
    console.log(`building the ${label} site…`);
    await build({ configFile: "vite.config.ts", base: "/", logLevel: "warn", build: { outDir: dist, emptyOutDir: true } });
  }
  const server = await preview({ configFile: "vite.config.ts", base: "/", build: { outDir: dist }, preview: { port: PORT, strictPort: true }, logLevel: "warn" });
  const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--enable-gpu", "--use-angle=d3d11", "--ignore-gpu-blocklist"] });
  try {
    const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1, colorScheme: "light" });
    await context.addInitScript("try { localStorage.setItem('dgm.look', 'standard'); localStorage.setItem('dgm.keptNote', '1'); } catch {}");
    const page = await context.newPage();
    page.on("pageerror", (e) => console.error(`page: ${e.message}`));
    const result: Record<string, unknown> = {};
    // the meadow, measured
    await page.goto(`http://localhost:${PORT}/#s=1&z=128&d=n&t=lakeBasin`);
    await waitForEditor(page);
    for (const look of ["standard", "high"] as const) {
      const m = (await page.evaluate(`(${MEADOW_JS})(${JSON.stringify(look)}, ${SIZE})`)) as { shot: string; look: string };
      writeFileSync(join(OUT, `${label}-meadow${SIZE}-${look}.png`), Buffer.from(m.shot.split(",")[1], "base64"));
      delete (m as { shot?: string }).shot;
      result[look] = m;
      console.log(JSON.stringify(m));
    }
    writeFileSync(join(OUT, `${label}-meadow${SIZE}.json`), JSON.stringify(result, null, 2));
    // the real map, near and mid
    if (process.argv.includes("--meadow")) return;
    await page.goto("about:blank");
    await page.goto(`http://localhost:${PORT}/#s=4242&z=128&d=n&t=riverValley`);
    await waitForEditor(page);
    await page.mouse.move(2, 2);
    await page.waitForTimeout(2500);
    await page.evaluate("window.dgmEditor.idle()");
    await page.addStyleTag({ content: ".view3d > :not(canvas) { visibility: hidden !important; }" });
    // (the view's target: the start, as the page frames it on opening)
    for (const look of ["standard", "high"] as const)
      for (const [range, distance] of [["near", 22], ["mid", 48]] as const) {
        await page.evaluate(`(${SCENE_JS})(${JSON.stringify({ look, distance })})`);
        await page.locator(".view3d > canvas").screenshot({ path: join(OUT, `${label}-${look}-${range}.png`) });
      }
  } finally {
    await browser.close();
    await new Promise<void>((done) => server.httpServer.close(() => done()));
  }
}

/** Page side: a probe shot's map at its start (the snapshot's land, water and plants, the start's other objects), drawn
 *  from the shot's pose in `look` (the probe's `start` pose: investigation/probe/runner/catalog.ts `standardPoses`). */
const GAME_JS = `async ({ look, g, cam }) => {
  const r = window.dgm3d.renderer;
  const N = g.W * g.H;
  const tile = [], floor = [], depth = [], cont = [];
  for (let i = 0; i < N; i++) if (g.depth[i] > 0.001) { tile.push(i); floor.push(g.heights[i]); depth.push(g.depth[i]); cont.push(g.contamination[i]); }
  const mb = (v) => v <= 0 ? 0 : Math.max(1, Math.min(255, Math.round(v * 15)));
  const names = [...new Set(g.objects.map((o) => o.template))];
  const n = g.objects.length;
  const e = { count: n, templates: names, owners: ["import"], template: Uint16Array.from(g.objects, (o) => names.indexOf(o.template)),
    x: Int16Array.from(g.objects, (o) => o.x), y: Int16Array.from(g.objects, (o) => o.y), z: Int16Array.from(g.objects, (o) => o.z),
    orientation: Uint8Array.from(g.objects, (o) => ["Cw0", "Cw90", "Cw180", "Cw270"].indexOf(o.orientation)), flags: Uint8Array.from(g.objects, (o) => o.flags),
    owner: new Uint16Array(n), variant: new Uint8Array(n).fill(255), strength: new Float32Array(n), ids: g.objects.map((_, k) => "g" + k) };
  r.setLookChoice(look, false);
  if (r.highEffects) for (const k of Object.keys(r.highEffects)) r.setHighEffect(k, true);
  r.setMap({ W: g.W, H: g.H, heights: Uint8Array.from(g.heights), columns: { tiles: new Int32Array(0), voxels: new Uint8Array(0) }, entities: e,
    soil: { moisture: Uint8Array.from(g.moisture.map(mb)), contamination: Uint8Array.from(g.soil.map((v) => v <= 0 ? 0 : Math.max(1, Math.min(255, Math.round(v * 255))))) },
    water: { count: tile.length, tile: Int32Array.from(tile), floor: Float32Array.from(floor), depth: Float32Array.from(depth), contamination: Float32Array.from(cont) } }, true);
  r.setClock(12.5);
  r.persp.fov = cam.fov;
  r.setView({ mode: "orbit", yaw: cam.yaw, pitch: cam.pitch, distance: cam.distance, target: cam.target });
  await Promise.race([r.whenDrawn(), new Promise((d) => setTimeout(d, 30000))]);
  await new Promise((d) => setTimeout(d, 500));
  r.renderNow();
  return true;
}`;

const HIDE_JS = (on: boolean) => `(async () => { const r = window.dgm3d.renderer; r.setObjectsHidden(${on}); await Promise.race([r.whenDrawn(), new Promise((d) => setTimeout(d, 30000))]); await new Promise((d) => setTimeout(d, 400)); r.renderNow(); })()`;

/** Ours beside the game's: each probe shot's `start` pose of its map at the start of play, in both looks. */
async function game(label: string, shots: string[]): Promise<void> {
  const BATCH = "20261002-1610-batch";
  mkdirSync(OUT, { recursive: true });
  const dist = resolve(`.scratch/object-shadows-dist-${label}`);
  const server = await preview({ configFile: "vite.config.ts", base: "/", build: { outDir: dist }, preview: { port: PORT, strictPort: true }, logLevel: "warn" });
  const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--enable-gpu", "--use-angle=d3d11", "--ignore-gpu-blocklist"] });
  try {
    const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1, colorScheme: "light" });
    await context.addInitScript("try { localStorage.setItem('dgm.look', 'standard'); localStorage.setItem('dgm.keptNote', '1'); } catch {}");
    const page = await context.newPage();
    page.on("pageerror", (e) => console.error(`page: ${e.message}`));
    await page.goto(`http://localhost:${PORT}/#s=1&z=128&d=n&t=lakeBasin`);
    await waitForEditor(page);
    await page.mouse.move(2, 2);
    await page.waitForTimeout(2000);
    await page.evaluate("window.dgmEditor.idle()");
    await page.addStyleTag({ content: ".view3d { position: fixed !important; left: 0 !important; top: 0 !important; width: 1280px !important; height: 800px !important; z-index: 9999; } .view3d > :not(canvas) { visibility: hidden !important; }" });
    await page.evaluate("window.dispatchEvent(new Event('resize'))");
    for (const shot of shots) {
      const result = JSON.parse(readFileSync(`C:/dgm-probe/results/${BATCH}/m9b-${shot}.json`, "utf8"));
      const snap = JSON.parse(gunzipSync(readFileSync(`C:/dgm-probe/results/${BATCH}/m9b-${shot}-start.snapshot.json.gz`)).toString());
      const PLANT = new Set(["Pine", "Oak", "Birch", "BlueberryBush", "Succulent"]);
      const objects: { template: string; x: number; y: number; z: number; orientation: string; flags: number }[] = [];
      for (const p of snap.plants) objects.push({ template: p.template, x: p.x, y: p.y, z: p.z, orientation: p.orientation, flags: (p.plant?.dead ? 1 : 0) | ((p.plant?.growth ?? 1) < 1 ? 4 : 0) });
      for (const o of result.entitiesAtStart) {
        if (PLANT.has(o.template)) continue;
        objects.push({ template: o.template.startsWith("DistrictCenter") ? "StartingLocation" : o.template, x: o.x, y: o.y, z: o.z, orientation: o.orientation, flags: 0 });
      }
      const W = snap.width;
      const heights = snap.terrain;
      const dc = result.start.districtCenter;
      const cam = { yaw: -Math.PI / 6, pitch: (55 * Math.PI) / 180, fov: 40, distance: Number(arg("distance") ?? 45), target: [dc.x + 0.5, heights[dc.y * W + dc.x], -(dc.y + 0.5)] };
      const g = { W, H: snap.height, heights, depth: snap.depth, contamination: snap.contamination, moisture: snap.moisture, soil: snap.soilContamination, objects };
      for (const look of ["standard", "high"] as const) {
        await page.evaluate(`(${GAME_JS})(${JSON.stringify({ look, g, cam })})`);
        await page.locator(".view3d > canvas").screenshot({ path: join(OUT, `${label}-game-${shot}-${look}.png`) });
        // (the same without the objects: the ground each object's shadow falls on, lit)
        await page.evaluate(HIDE_JS(true));
        await page.locator(".view3d > canvas").screenshot({ path: join(OUT, `${label}-game-${shot}-${look}-bare.png`) });
        await page.evaluate(HIDE_JS(false));
      }
      writeFileSync(join(OUT, `${label}-game-${shot}.json`), JSON.stringify({ cam, objects }));
      console.log(`${shot}: drawn`);
    }
  } finally {
    await browser.close();
    await new Promise<void>((done) => server.httpServer.close(() => done()));
  }
}

async function sheet(labels: string[]): Promise<void> {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const page = await browser.newPage();
    const cells: string[] = [];
    for (const label of labels)
      for (const look of ["standard", "high"])
        for (const range of ["near", "mid"]) cells.push(`data:image/png;base64,${readFileSync(join(OUT, `${label}-${look}-${range}.png`)).toString("base64")}`);
    const names = labels.flatMap((l) => ["Standard", "High"].map((k) => `${l}: ${k}`));
    const jpg = (await page.evaluate(
      `(async ({ cells, names }) => {
        const imgs = await Promise.all(cells.map((s) => new Promise((d) => { const i = new Image(); i.onload = () => d(i); i.src = s; })));
        const cw = 800, ch = 500, top = 26;
        const c = document.createElement("canvas");
        c.width = cw * 2; c.height = (ch + top) * names.length;
        const x = c.getContext("2d");
        x.fillStyle = "#fff"; x.fillRect(0, 0, c.width, c.height);
        x.font = "bold 18px sans-serif"; x.fillStyle = "#111";
        names.forEach((n, row) => {
          x.fillText(n + "  (near: distance 22 | mid: distance 48)", 8, row * (ch + top) + 19);
          for (let col = 0; col < 2; col++) x.drawImage(imgs[row * 2 + col], col * cw, row * (ch + top) + top, cw, ch);
        });
        return c.toDataURL("image/jpeg", 0.8);
      })(${JSON.stringify({ cells, names })})`,
    )) as string;
    mkdirSync("docs/sheets", { recursive: true });
    writeFileSync("docs/sheets/object-shadows.jpg", Buffer.from(jpg.split(",")[1], "base64"));
    console.log("wrote docs/sheets/object-shadows.jpg");
  } finally {
    await browser.close();
  }
}

if (arg("game")) await game(arg("label") ?? "pr", (arg("game") as string).split(","));
else if (process.argv.includes("--sheet")) await sheet((arg("labels") ?? "dev,pr").split(","));
else await capture(arg("label") ?? "pr");
