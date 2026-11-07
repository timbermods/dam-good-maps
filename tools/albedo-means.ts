// Our terrain's albedo, measured in the page, for calibrating it against the game's textures (D497; docs/progress/3d-view.md,
// "The game's light"). Real Chrome, headed, Standard and High from this checkout's dev server (High with its warm
// sunlight switched off). In the page the terrain shader is patched to draw its albedo alone: no light, no specular, no
// altitude ramp, no cliff gradient, no fog or post chain, nothing but the terrain. Every 4th pixel is picked
// (`pickSeen`), sorted into tops and walls, and the tops by their tile's soil into grass and dry ground (only a tile's
// middle, where its soil is its own; contaminated and wet tiles left out). Means are display values, 0–255, as the
// game's texture means.
//
//   npx tsx tools/albedo-means.ts                     (Canyon 128² seed 1 and River Valley 128² seed 4242, their opening views)
//   options: --maps canyon:1,riverValley:4242  --looks standard,high  --port 4796
//   --lit: the terrain as drawn (nothing patched): what the screen shows of each kind, the dry ground's also by its
//   height (levels 0–7, 8–13, 14 and up), to set against the game's own screenshots

import { join, resolve } from "node:path";
import { chromium } from "@playwright/test";
import { createServer } from "vite";
import { waitForEditor } from "./wait-editor";

const arg = (name: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const ROOT = resolve(import.meta.dirname, "..");
const PORT = Number(arg("port") ?? "4796");
const MAPS = (arg("maps") ?? "canyon:1,riverValley:4242").split(",").map((m) => m.split(":"));
const LOOKS = (arg("looks") ?? "standard,high").split(",");
const LIT = process.argv.includes("--lit");

/** Views over each map: high and close enough that the patterns resolve, looking down. */
const VIEWS = [0.15, 0.35, 0.55, 0.75].flatMap((u) => [0.25, 0.5, 0.75].map((v) => ({ u, v })));

const PATCH = `(() => {
  const r = window.dgm3d.renderer;
  const seen = new Set();
  const terrain = new Set(r.terrain.values());
  r.scene.traverse((o) => { if (o.isMesh || o.isPoints || o.isLine || o.isInstancedMesh) o.visible = terrain.has(o); });
  for (const mesh of terrain) {
    const m = mesh.material;
    if (seen.has(m)) continue;
    seen.add(m);
    let s = m.fragmentShader;
    const before = s;
    s = s.replace("c *= light;", "");
    s = s.replace("c *= altitudeOf(vWorld.y, moist);", "");
    s = s.replace(/float shade = [^;]+;/, "float shade = 1.0;");
    s = s.replace(/vec3 cliffTint = [^;]+;/, "vec3 cliffTint = vec3(1.0);");
    s = s.replace("c += gameSpecular(n, albedo, n.y > 0.5 ? 0.0 : 0.05);", "");
    s = s.replace("return gamePost(c);", "return c;");
    if (s === before) throw new Error("terrain shader not patched");
    m.fragmentShader = s;
    m.needsUpdate = true;
  }
  r.uniforms.fogDensity.value = 0;
  r.uniforms.markers.value = 0;
  return seen.size;
})()`;

const MEASURE = `async ([png, step]) => {
  const r = window.dgm3d.renderer;
  const canvas = document.querySelector("[data-albedo-view]");
  const box = canvas.getBoundingClientRect();
  const img = new Image(); img.src = "data:image/png;base64," + png; await img.decode();
  const c = document.createElement("canvas"); c.width = img.width; c.height = img.height;
  const g = c.getContext("2d"); g.drawImage(img, 0, 0);
  const px = g.getImageData(0, 0, c.width, c.height).data;
  const sx = img.width / box.width, sy = img.height / box.height;
  const m = r.map, W = m.W, soil = m.soil;
  const depth = (i) => (m.surface && m.surface.depth ? m.surface.depth[i] : 0);
  const acc = {};
  const add = (k, o) => { const a = (acc[k] ||= [0, 0, 0, 0]); a[0]++; a[1] += px[o]; a[2] += px[o + 1]; a[3] += px[o + 2]; };
  for (let y = step / 2; y < box.height; y += step)
    for (let x = step / 2; x < box.width; x += step) {
      const o = (Math.floor(y * sy) * c.width + Math.floor(x * sx)) * 4;
      const h = r.pickSeen(box.left + x, box.top + y);
      if (!h) continue;
      if (h.face === "top") {
        // (a tile's own top, its middle only, where its soil is its own; no contamination, no water)
        const tx = h.point[0], ty = -h.point[2], i = Math.floor(ty) * W + Math.floor(tx);
        const fx = tx - Math.floor(tx), fy = ty - Math.floor(ty);
        if (fx < 0.2 || fx > 0.8 || fy < 0.2 || fy > 0.8 || Math.abs(h.point[1] - m.heights[i]) > 0.01) continue;
        if (soil.contamination[i] > 0 || depth(i) > 0) continue;
        add(soil.moisture[i] > 0 ? "grass" : "dry", o);
        if (soil.moisture[i] === 0) add(m.heights[i] < 8 ? "dry, levels 0–7" : m.heights[i] < 14 ? "dry, levels 8–13" : "dry, levels 14+", o);
      } else if (h.face !== "bottom") add("wall", o);
    }
  return acc;
}`;

const totals: Record<string, Record<string, [number, number, number, number]>> = {};
process.env.DGM_BASE = "/";
const server = await createServer({ root: ROOT, configFile: join(ROOT, "vite.config.ts"), server: { port: PORT, strictPort: true }, logLevel: "warn" });
await server.listen();
const browser = await chromium.launch({ channel: "chrome", headless: false, args: ["--enable-gpu", "--ignore-gpu-blocklist"] });
try {
  for (const look of LOOKS)
  for (const [theme, seed] of MAPS) {
    const total = (totals[look] ||= {});
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
    await context.addInitScript(`try { localStorage.setItem('dgm.look', '${look}'); } catch {}`);
    await context.addInitScript("window.__name = (f) => f");
    const page = await context.newPage();
    page.on("console", (m) => {
      if (m.type() === "error") console.log(`  [page] ${m.text().slice(0, 200)}`);
    });
    await page.goto(`http://localhost:${PORT}/#s=${seed}&z=128&d=n&t=${theme}`, { timeout: 600_000, waitUntil: "domcontentloaded" });
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
    if (look === "high" && !LIT)
      await page.evaluate(() => {
        const r = window.dgm3d!.renderer as unknown as { setHighEffect(k: string, on: boolean): void };
        r.setHighEffect("sunlight", false);
      });
    if (!LIT) console.log(`${look} ${theme} ${seed}: patched ${await page.evaluate(PATCH)} terrain programs`);
    else {
      await page.evaluate(() => {
        const r = window.dgm3d!.renderer as unknown as { terrain: Map<unknown, unknown>; scene: { traverse(f: (o: { isMesh?: boolean; isInstancedMesh?: boolean; isPoints?: boolean; visible: boolean }) => void): void } };
        const terrain = new Set(r.terrain.values());
        r.scene.traverse((o) => {
          if (o.isMesh || o.isPoints || o.isInstancedMesh) o.visible = terrain.has(o);
        });
      });
      console.log(`${look} ${theme} ${seed}: as drawn`);
    }
    const acc: Record<string, [number, number, number, number]> = {};
    for (const { u, v } of VIEWS) {
      await page.evaluate(([u, v]) => {
        const r = window.dgm3d!.renderer as unknown as { map: { W: number; H: number; heights: Uint8Array }; setView(v: unknown): void };
        const { W, H, heights } = r.map;
        const x = Math.floor(u * W), y = Math.floor(v * H);
        r.setView({ mode: "orbit", yaw: 0.6, pitch: 1.2, distance: 34, target: [x + 0.5, heights[y * W + x], -(y + 0.5)] });
      }, [u, v] as const);
      await page.waitForTimeout(1200);
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null)))));
      const box = (await page.locator("[data-albedo-view]").boundingBox())!;
      const png = await page.screenshot({ type: "png", clip: box });
      const got = (await page.evaluate(`(${MEASURE})(${JSON.stringify([png.toString("base64"), 4])})`)) as Record<string, [number, number, number, number]>;
      for (const [k, a] of Object.entries(got)) {
        const t = (acc[k] ||= [0, 0, 0, 0]);
        const T = (total[k] ||= [0, 0, 0, 0]);
        for (let i = 0; i < 4; i++) (t[i] += a[i]), (T[i] += a[i]);
      }
    }
    for (const [k, a] of Object.entries(acc)) console.log(`  ${k}: ${[a[1], a[2], a[3]].map((s) => (s / a[0]).toFixed(1)).join("/")} (n ${a[0]})`);
    await context.close();
  }
  for (const [look, total] of Object.entries(totals)) {
    console.log(`${look}, all maps:`);
    for (const [k, a] of Object.entries(total)) console.log(`  ${k}: ${[a[1], a[2], a[3]].map((s) => (s / a[0]).toFixed(1)).join("/")} (n ${a[0]})`);
  }
} finally {
  await browser.close();
  await server.close();
}
