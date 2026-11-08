// Our rings and bubbles over the sources with Markers alone (D249 as amended, D497; the water-character audit's gap 6):
// dev against this checkout on River Valley 128² seed 2, in Standard and High on the GPU, with Markers off and on, the
// water's clock held. Three views: a plain water source with water over its middle, a running badwater source (the
// game's own 3 × 3 pattern under ours) and the map from the game's 55° pitch. It prints, for each look, view and
// Markers, the pixels this checkout's frame differs from dev's (any channel over 2 levels), their mean and largest L*
// change, and how many of them lie farther than the rings reach (1.5 tiles) from every source's middle. Numbers only:
// no frames are written.
//
//   git archive --output=.scratch/judge-dev.tar origin/dev index.html real-places src public vite.config.ts tsconfig.json package.json tools/rust/vite-plugin.mjs
//   mkdir -p .scratch/judge-dev && tar -xf .scratch/judge-dev.tar -C .scratch/judge-dev
//   npx tsx tools/capture-source-rings.ts [--dev .scratch/judge-dev] [--after .] [--port 6795]
//
// (`--after .scratch/judge-dev` serves dev on both sides: what two loads of the same build differ by)

import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium, type Page } from "@playwright/test";
import { GPU_ARGS, VIEWPORT, open, setLook, shot, site, type View } from "./water-capture";

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const DEV = resolve(arg("dev") ?? ".scratch/judge-dev");
const AFTER = resolve(arg("after") ?? ".");
const PORT = Number(arg("port") ?? 6795);
/** A folder to keep the frames in, for a look (outside git; never committed). */
const SAVE = arg("save");
const CLOCK = 12.5;
const MAP = arg("map") ?? "#s=2&z=128&d=n&t=riverValley";
const PITCH = (55 * Math.PI) / 180;

/** Page side: the views, and every source's middle in the world (the rings' centres). */
const FIND_JS = `([pitch]) => {
  const r = window.dgm3d.renderer;
  const m = r.map, s = m.surface, W = m.W, H = m.H, e = m.entities;
  const wet = (i) => s.surface[i] === s.surface[i] && s.depth[i] > 0.05;
  const top = (i) => (wet(i) ? s.surface[i] : m.heights[i]);
  const at = (i) => [i % W + 0.5, top(i), -(Math.floor(i / W) + 0.5)];
  const middles = [];
  const views = {};
  for (let k = 0; k < e.count; k++) {
    const name = e.templates[e.template[k]];
    let i = -1;
    if (name === "WaterSource") i = e.y[k] * W + e.x[k];
    else if (name === "BadwaterSource") {
      const o = e.orientation[k];
      i = (e.y[k] + (o === 0 || o === 3 ? 1 : -1)) * W + e.x[k] + (o === 0 || o === 1 ? 1 : -1);
    } else continue;
    middles.push(at(i));
    if (!wet(i)) continue;
    if (name === "WaterSource" && !views.plain) views.plain = { mode: "orbit", yaw: -0.5, pitch: 1.0, distance: 8, target: at(i) };
    if (name === "BadwaterSource" && e.strength[k] > 0 && !views.bad) views.bad = { mode: "orbit", yaw: -0.5, pitch: 1.0, distance: 9, target: at(i) };
  }
  views.wide = { mode: "orbit", yaw: -0.5, pitch, distance: 90, target: [W / 2, m.heights[(H >> 1) * W + (W >> 1)], -H / 2] };
  return { views, middles };
}`;

/** Page side: each source's middle on screen and the farthest its rings reach there (1.5 tiles round it, in pixels). */
const PROJECT_JS = `([middles, w, h]) => {
  const c = window.dgm3d.renderer.camera();
  c.updateMatrixWorld();
  const v = c.matrixWorldInverse.elements, p = c.projectionMatrix.elements;
  const mul = (m, x, y, z, w0) => [m[0] * x + m[4] * y + m[8] * z + m[12] * w0, m[1] * x + m[5] * y + m[9] * z + m[13] * w0, m[2] * x + m[6] * y + m[10] * z + m[14] * w0, m[3] * x + m[7] * y + m[11] * z + m[15] * w0];
  const px = (x, y, z) => { const a = mul(v, x, y, z, 1); const b = mul(p, a[0], a[1], a[2], a[3]); return b[3] <= 0 ? null : [((b[0] / b[3]) * 0.5 + 0.5) * w, (0.5 - (b[1] / b[3]) * 0.5) * h]; };
  const out = [];
  for (const [x, y, z] of middles) {
    const o = px(x, y, z);
    if (!o) continue;
    let reach = 0;
    for (let a = 0; a < 16; a++) { const q = px(x + 1.5 * Math.cos(a * Math.PI / 8), y, z + 1.5 * Math.sin(a * Math.PI / 8)); if (q) reach = Math.max(reach, Math.hypot(q[0] - o[0], q[1] - o[1])); }
    out.push([o[0], o[1], reach + 2]);
  }
  return out;
}`;

/** Page side: the pixels two PNGs differ by (any channel over 2 levels), their L* change, and those outside every ring. */
const DIFF_JS = `async ([a, b, rings]) => {
  const load = async (b64) => { const i = new Image(); i.src = "data:image/png;base64," + b64; await i.decode(); const c = document.createElement("canvas"); c.width = i.width; c.height = i.height; const g = c.getContext("2d"); g.drawImage(i, 0, 0); return [g.getImageData(0, 0, i.width, i.height).data, i.width]; };
  const [p, w] = await load(a), [q] = await load(b);
  const L = (r, g, b) => { const f = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; const y = 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); return y > 216 / 24389 ? 116 * Math.cbrt(y) - 16 : (24389 / 27) * y; };
  let n = 0, sum = 0, most = 0, outside = 0;
  for (let i = 0; i < p.length; i += 4) {
    if (Math.max(Math.abs(p[i] - q[i]), Math.abs(p[i + 1] - q[i + 1]), Math.abs(p[i + 2] - q[i + 2])) <= 2) continue;
    const d = L(q[i], q[i + 1], q[i + 2]) - L(p[i], p[i + 1], p[i + 2]);
    n++; sum += d; most = Math.max(most, Math.abs(d));
    const x = (i / 4) % w, y = Math.floor(i / 4 / w);
    if (!rings.some(([cx, cy, r]) => Math.hypot(x - cx, y - cy) <= r)) outside++;
  }
  return { pixels: n, meanL: n ? +(sum / n).toFixed(2) : 0, mostL: +most.toFixed(2), outsideRings: outside };
}`;

async function setMarkers(p: Page, on: boolean): Promise<void> {
  await p.evaluate(`window.dgm3d.renderer.setMarkers(${on})`);
  await p.waitForTimeout(300);
}

async function main() {
  if (SAVE) mkdirSync(SAVE, { recursive: true });
  const servers = [await site(DEV, "source-rings", "dev", PORT), await site(AFTER, "source-rings", "after", PORT + 1)];
  const gpu = await chromium.launch({ channel: "chrome", headless: true, args: GPU_ARGS });
  try {
    const errors: string[] = [];
    const ctx = await gpu.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1, colorScheme: "light" });
    const tool = await ctx.newPage();
    const p = await ctx.newPage();
    p.on("pageerror", (e) => errors.push(String(e)));
    p.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    await open(p, PORT + 1, MAP);
    const found = (await p.evaluate(`(${FIND_JS})(${JSON.stringify([PITCH])})`)) as { views: Record<string, View>; middles: [number, number, number][] };
    const views = Object.keys(found.views);
    const got = new Map<string, Buffer>();
    const rings = new Map<string, number[][]>();
    const facts: Record<string, unknown> = { views, sources: found.middles.length };
    for (const [k, port] of [["dev", PORT], ["after", PORT + 1]] as const) {
      await open(p, port, MAP);
      for (const look of ["standard", "high"] as const) {
        await setLook(p, look);
        for (const on of [false, true]) {
          await setMarkers(p, on);
          for (const v of views) {
            got.set(`${look}-${v}-${on}-${k}`, await shot(p, found.views[v], CLOCK));
            if (SAVE) writeFileSync(join(SAVE, `${look}-${v}-${on ? "on" : "off"}-${k}.png`), got.get(`${look}-${v}-${on}-${k}`)!);
            if (k === "after") rings.set(v, (await p.evaluate(`(${PROJECT_JS})(${JSON.stringify([found.middles, VIEWPORT.width, VIEWPORT.height])})`)) as number[][]);
          }
        }
      }
    }
    for (const look of ["standard", "high"] as const)
      for (const v of views)
        for (const on of [false, true]) {
          const a = got.get(`${look}-${v}-${on}-dev`)!.toString("base64");
          const b = got.get(`${look}-${v}-${on}-after`)!.toString("base64");
          facts[`${look} ${v} Markers ${on ? "on" : "off"}: after vs dev`] = await tool.evaluate(`(${DIFF_JS})(${JSON.stringify([a, b, rings.get(v)])})`);
        }
    // (with Markers off, this checkout's frame against itself with Markers on: what Markers adds now)
    for (const look of ["standard", "high"] as const)
      for (const v of views) {
        const a = got.get(`${look}-${v}-true-after`)!.toString("base64");
        const b = got.get(`${look}-${v}-false-after`)!.toString("base64");
        facts[`${look} ${v}: after, Markers off vs on`] = await tool.evaluate(`(${DIFF_JS})(${JSON.stringify([a, b, rings.get(v)])})`);
      }
    console.log(JSON.stringify(facts, null, 2));
    if (errors.length) console.log(`page errors:\n${errors.join("\n")}`);
  } finally {
    await gpu.close();
    for (const s of servers) await new Promise<void>((r) => s.httpServer.close(() => r()));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
