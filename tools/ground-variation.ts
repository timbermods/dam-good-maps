// How much our ground's albedo varies from place to place, against the game's textures (D497; docs/progress/3d-view.md,
// "The land's tone"): grass and dry ground each over a whole flat map, drawn from straight above at the start shots'
// distance with the terrain shader patched to its albedo alone (as tools/albedo-means.ts patches it), and the luma's
// spread over blocks of ¼ to 8 tiles, as a share of its mean; and the blending noise (the desert's share and
// contamination's weight read it) drawn alone, its mean and its spread over blocks of a tenth of a tile to two. The game's
// figures (its `Grass` and `Desert` textures × `GrassDetailsAlbedo` × 2, TerrainURP, and its `BlendingNoise`; the
// textures read raw from `resources.assets` by tools/game-water-shader.py's readers, numbers only) are printed beside
// ours. Real Chrome on the GPU, this checkout's dev server.
//
//   npx tsx tools/ground-variation.ts [--looks standard,high] [--port 4797] [--distance 100] [--root <tree>]
//
// It also draws the whole map at moisture 1 to 3 and prints the grass's share there (its greenness between all dry and
// all grass), beside the game's formula worked with its own noise.

import { join, resolve } from "node:path";
import { chromium } from "@playwright/test";
import { createServer } from "vite";
import { waitForEditor } from "./wait-editor";

const arg = (name: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
/** The tree drawn: this checkout, or another (`--root .scratch/judge-dev`, a tree as tools/water-pixel-judge.ts makes). */
const ROOT = arg("root") ? resolve(arg("root") as string) : resolve(import.meta.dirname, "..");
const PORT = Number(arg("port") ?? "4797");
const LOOKS = (arg("looks") ?? "standard,high").split(",");
const DISTANCE = Number(arg("distance") ?? "100");
const BLOCKS = [0.25, 0.5, 1, 2, 4, 8];
/** The game's: the luma's spread over blocks of BLOCKS tiles, % of its mean (its textures at their projection: `Grass`
 *  and `Desert` every 16 tiles, the detail every 32; 2026-11-08, Timberborn 1.1.2.8). */
const GAME: Record<string, number[]> = { grass: [10.8, 10.0, 9.1, 7.5, 5.7, 3.6], dry: [9.4, 8.5, 7.7, 6.7, 5.3, 3.4] };
/** The game's blending noise (`BlendingNoise`, read at world × 0.2): its mean, and its spread over blocks of
 *  NOISE_BLOCKS tiles (0–1). */
const NOISE_BLOCKS = [0.1, 0.25, 0.5, 1, 2];
const GAME_NOISE = { mean: 0.473, spread: [0.0772, 0.0676, 0.0476, 0.0251, 0.006] };
/** Moisture levels the desert's share is measured at, and the grass's share there by the game's formula with its own
 *  noise (1 − the mean of saturate((desert + 0.96 (n − 0.5) − 0.5) × 5.8 + 0.5) over the `BlendingNoise` texture's texels). */
const SHARE_LEVELS = [1, 1.5, 2, 2.5, 3];
const GAME_SHARE = [0.36, 0.66, 0.88, 0.97, 0.99];
/** `noise`: the terrain shader patched further to draw its blending noise (`blendNoise`) as its colour. */
const NOISE_PATCH = `(() => {
  const r = window.dgm3d.renderer;
  for (const mesh of r.terrain.values()) {
    const m = mesh.material;
    if (m.userData.noiseOnly) continue;
    m.userData.noiseOnly = true;
    const s = m.fragmentShader.replace("float soilNoise = blendNoise(g);", "float soilNoise = blendNoise(g); return vec3(soilNoise);");
    if (s === m.fragmentShader) throw new Error("terrain shader not patched for the noise");
    m.fragmentShader = s;
    m.needsUpdate = true;
  }
})()`;

/** The flat map: one soil over all of it (its moisture level), no water, no objects. */
const SET_MAP = `(level) => {
  const r = window.dgm3d.renderer;
  const W = 128, H = 128, N = W * H;
  const e = { count: 0, templates: [], owners: [], template: new Uint16Array(0), x: new Int16Array(0), y: new Int16Array(0), z: new Int16Array(0), orientation: new Uint8Array(0), flags: new Uint8Array(0), owner: new Uint16Array(0), variant: new Uint8Array(0), strength: new Float32Array(0), ids: [] };
  r.setMap({ W, H, heights: new Uint8Array(N).fill(6), columns: { tiles: new Int32Array(0), voxels: new Uint8Array(0) }, entities: e,
    soil: { moisture: new Uint8Array(N).fill(Math.round(level * 15)), contamination: new Uint8Array(N) },
    water: { count: 0, tile: new Int32Array(0), floor: new Float32Array(0), depth: new Float32Array(0), contamination: new Float32Array(0) } }, true);
  r.setClock(12.5);
  return true;
}`;

const PATCH = `(() => {
  const r = window.dgm3d.renderer;
  const seen = new Set();
  const terrain = new Set(r.terrain.values());
  r.scene.traverse((o) => { if (o.isMesh || o.isPoints || o.isLine || o.isInstancedMesh) o.visible = terrain.has(o); });
  for (const mesh of terrain) {
    const m = mesh.material;
    if (seen.has(m) || m.userData.albedoOnly) continue;
    seen.add(m);
    m.userData.albedoOnly = true;
    let s = m.fragmentShader;
    for (const [from, to] of [
      ["c *= light;", ""],
      ["c *= altitudeOf(vWorld.y, moist);", ""],
      [/vec3 cliffTint = [^;]+;/, "vec3 cliffTint = vec3(1.0);"],
      ["c += gameSpecular(n, albedo, n.y > 0.5 ? 0.0 : 0.05);", ""],
      [/return gamePost\\(mix\\(hazeColor, c \\+ emission, [^;]*\\);/, "return c + emission;"],
    ]) {
      const next = s.replace(from, to);
      if (next === s) throw new Error("terrain shader not patched: " + from);
      s = next;
    }
    m.fragmentShader = s;
    m.needsUpdate = true;
  }
  r.uniforms.fogDensity.value = 0;
  r.uniforms.markers.value = 0;
  return seen.size;
})()`;

/** The picture's luma by blocks: the spread of the blocks' means over the mean, %, per block size; the mean colour. */
const MEASURE = `async ([png, blocks]) => {
  const r = window.dgm3d.renderer;
  const canvas = document.querySelector("[data-albedo-view]");
  const box = canvas.getBoundingClientRect();
  const img = new Image(); img.src = "data:image/png;base64," + png; await img.decode();
  const c = document.createElement("canvas"); c.width = img.width; c.height = img.height;
  const g = c.getContext("2d"); g.drawImage(img, 0, 0);
  const px = g.getImageData(0, 0, c.width, c.height).data;
  // (pixels a tile: two points a few tiles apart, picked)
  const a = r.pickSeen(box.left + box.width / 2, box.top + box.height / 2);
  const b = r.pickSeen(box.left + box.width / 2 + 200, box.top + box.height / 2);
  const ppt = 200 / Math.hypot(a.point[0] - b.point[0], a.point[2] - b.point[2]) * (img.width / box.width);
  // (the middle of the picture, where the view is near straight down)
  const x0 = Math.floor(c.width * 0.15), x1 = Math.floor(c.width * 0.85), y0 = Math.floor(c.height * 0.15), y1 = Math.floor(c.height * 0.85);
  const out = { ppt, mean: [0, 0, 0], spread: [] };
  let n = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const o = (y * c.width + x) * 4; out.mean[0] += px[o]; out.mean[1] += px[o + 1]; out.mean[2] += px[o + 2]; n++; }
  out.mean = out.mean.map((v) => v / n);
  for (const bt of blocks) {
    const s = Math.max(1, Math.round(bt * ppt));
    const v = [];
    for (let by = y0; by + s <= y1; by += s) for (let bx = x0; bx + s <= x1; bx += s) {
      let l = 0;
      for (let y = by; y < by + s; y++) for (let x = bx; x < bx + s; x++) { const o = (y * c.width + x) * 4; l += 0.299 * px[o] + 0.587 * px[o + 1] + 0.114 * px[o + 2]; }
      v.push(l / (s * s));
    }
    const m = v.reduce((p, q) => p + q, 0) / v.length;
    const sd = Math.sqrt(v.reduce((p, q) => p + (q - m) ** 2, 0) / v.length);
    out.spread.push({ blocks: bt, n: v.length, pct: (100 * sd) / m, abs: sd / 255 });
  }
  return out;
}`;

process.env.DGM_BASE = "/";
const server = await createServer({ root: ROOT, configFile: join(ROOT, "vite.config.ts"), server: { port: PORT, strictPort: true }, logLevel: "warn" });
await server.listen();
const browser = await chromium.launch({ channel: "chrome", headless: false, args: ["--enable-gpu", "--use-angle=d3d11", "--ignore-gpu-blocklist"] });
try {
  for (const look of LOOKS) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
    await context.addInitScript(`try { localStorage.setItem('dgm.look', '${look}'); } catch {}`);
    await context.addInitScript("window.__name = (f) => f");
    const page = await context.newPage();
    await page.goto(`http://localhost:${PORT}/#s=1&z=128&d=n&t=highlands`, { timeout: 600_000, waitUntil: "domcontentloaded" });
    await waitForEditor(page, 600_000);
    await page.evaluate(() => window.dgmEditor!.idle());
    await page.mouse.move(2, 2);
    await page.keyboard.press("Escape");
    await page.evaluate(() => {
      const cs = [...document.querySelectorAll("canvas")];
      const big = cs.reduce((m, c) => (c.clientWidth * c.clientHeight > m.clientWidth * m.clientHeight ? c : m), cs[0]);
      big.setAttribute("data-albedo-view", "");
      const st = document.createElement("style");
      st.textContent = "body * { visibility: hidden !important } [data-albedo-view] { visibility: visible !important }";
      document.head.append(st);
    });
    if (look === "high") await page.evaluate(() => (window.dgm3d!.renderer as unknown as { setHighEffect(k: string, on: boolean): void }).setHighEffect("sunlight", false));
    // the desert's share by moisture: the mean's greenness (G − (R + B) / 2) between all dry (0) and all grass (10)
    {
      const green = (c: number[]) => c[1] - (c[0] + c[2]) / 2;
      const means: Record<number, number[]> = {};
      for (const level of [0, 10, ...SHARE_LEVELS]) {
        await page.evaluate(`(${SET_MAP})(${level})`);
        await page.waitForTimeout(600);
        await page.evaluate(PATCH);
        await page.evaluate((d) => (window.dgm3d!.renderer as unknown as { setView(v: unknown): void }).setView({ mode: "orbit", yaw: 0, pitch: 1.56, distance: d, target: [64, 6, -64] }), DISTANCE);
        await page.waitForTimeout(800);
        await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null)))));
        const box = (await page.locator("[data-albedo-view]").boundingBox())!;
        const png = await page.screenshot({ type: "png", clip: box });
        means[level] = ((await page.evaluate(`(${MEASURE})(${JSON.stringify([png.toString("base64"), [1]])})`)) as { mean: number[] }).mean;
      }
      const share = (l: number) => (green(means[l]) - green(means[0])) / (green(means[10]) - green(means[0]));
      console.log(`${look} grass's share by moisture ${SHARE_LEVELS.join("/")}: ours ${SHARE_LEVELS.map((l) => share(l).toFixed(2)).join("/")}  the game's formula with its noise ${GAME_SHARE.join("/")}`);
    }
    for (const kind of ["grass", "dry", "noise"] as const) {
      await page.evaluate(`(${SET_MAP})(${kind === "grass" ? 10 : 0})`);
      await page.waitForTimeout(800);
      await page.evaluate(PATCH);
      if (kind === "noise") await page.evaluate(NOISE_PATCH);
      await page.evaluate((d) => (window.dgm3d!.renderer as unknown as { setView(v: unknown): void }).setView({ mode: "orbit", yaw: 0, pitch: 1.56, distance: d, target: [64, 6, -64] }), DISTANCE);
      await page.waitForTimeout(1500);
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null)))));
      const box = (await page.locator("[data-albedo-view]").boundingBox())!;
      const png = await page.screenshot({ type: "png", clip: box });
      const got = (await page.evaluate(`(${MEASURE})(${JSON.stringify([png.toString("base64"), kind === "noise" ? NOISE_BLOCKS : BLOCKS])})`)) as { ppt: number; mean: number[]; spread: { blocks: number; n: number; pct: number; abs: number }[] };
      if (kind === "noise") {
        console.log(`${look} blending noise (${got.ppt.toFixed(1)} px a tile): mean ${(got.mean[0] / 255).toFixed(3)} (game ${GAME_NOISE.mean})`);
        console.log(`   spread over blocks of ${NOISE_BLOCKS.join("/")} tiles: ours ${got.spread.map((s) => s.abs.toFixed(4)).join("/")}  game ${GAME_NOISE.spread.join("/")}`);
        continue;
      }
      console.log(`${look} ${kind} (${got.ppt.toFixed(1)} px a tile): mean ${got.mean.map((v) => v.toFixed(1)).join("/")}`);
      console.log(`   luma spread, % of mean, blocks of ${BLOCKS.join("/")} tiles: ours ${got.spread.map((s) => s.pct.toFixed(1)).join("/")}  game ${GAME[kind].join("/")}`);
    }
    await context.close();
  }
} finally {
  await browser.close();
  await server.close();
}
