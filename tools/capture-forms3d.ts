// Oblique captures of the generator's 3D forms (D488; docs/progress/3d-generation.md): a spring cave
// feeding the river, an overhang sheltering the start, an arch over a gorge, each seen in the editor's
// 3D view from where it is best seen (the river a cave opens on, the start, the gorge along its river).
//
//   npx tsx tools/capture-forms3d.ts --maps canyon:2:80,highlands:1:20 [--out docs/sheets/3d-generation-1-forms.jpg] [--port 4961]
//     [--views close,high,top] [--only spring-cave,gorge-arch]
//
// Each map (theme:seed:Verticality, 128²) is generated here to find its forms (`IntentionResult.at`,
// `from`), then opened in the page from its share link, which makes the same map, and drawn from a
// camera placed for each form: `close` from where it is best seen, `high` an oblique from further up,
// `top` straight down. The frames go side by side into one JPEG (a row a form when more than one view
// is asked for), each labelled. Our own generated maps only.

import { writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium } from "@playwright/test";
import { build, preview } from "vite";
import { generate } from "../src/core/gen/generate";
import { FORMS, type FormId } from "../src/core/land/forms3d";
import { encodeSpecFragment } from "../src/core/spec/codec";
import { makeSpec, type ThemeId } from "../src/core/spec/mapspec";
import { bottomRunTop, ColumnTerrain } from "../src/core/terrain/runs";
import { waitForEditor } from "./wait-editor";

const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const maps = arg("maps", "canyon:2:80").split(",").map((m) => {
  const [theme, seed, vt] = m.split(":");
  return { theme: theme as ThemeId, seed: Number(seed), vt: Number(vt) };
});
const out = arg("out", "docs/sheets/3d-generation-1-forms.jpg");
const port = Number(arg("port", "4961"));
const views = arg("views", "close").split(",") as ("close" | "high" | "top")[];
const only = arg("only", FORMS.join(",")).split(",");
const ROOT = resolve(import.meta.dirname, "..");

interface Shot {
  label: string;
  fragment: string;
  view: { mode: "orbit" | "top"; yaw: number; pitch: number; distance: number; x: number; y: number; z: number };
}

const shots: Shot[] = [];
for (const m of maps) {
  const spec = makeSpec({ seed: m.seed, theme: m.theme, size: { x: 128, y: 128 } });
  spec.settings.terrain.verticality = m.vt;
  if (m.vt >= 70) spec.settings.terrain.highestTerrain = 22;
  const r = generate(spec);
  const t = ColumnTerrain.fromData(r.field!, 128, 128);
  for (const x of r.intentions) {
    if (!x.ok || !FORMS.includes(x.id as FormId) || !only.includes(x.id) || !x.at || !x.from) continue;
    const [ax, ay] = x.at;
    const [fx, fy] = x.from;
    // (the camera stands toward `from` and looks at the form, low for an arch, at its floor or under
    // its crown; yaw as the 3D view's orbit takes it)
    // (an arch from down the gorge, low over its river, close enough to stay between its walls)
    const yaw = Math.atan2(fx - ax, -(fy - ay));
    const arch = x.id === "gorge-arch";
    const z = bottomRunTop(t.mask[ay * 128 + ax]) + (arch ? 4 : 1.5);
    const label = `${x.id} · ${m.theme} ${m.seed} · Verticality ${m.vt}`;
    const fragment = `#${encodeSpecFragment(r.spec)}`;
    for (const v of views) {
      if (v === "close") shots.push({ label, fragment, view: { mode: "orbit", yaw, pitch: arch ? 0.12 : 0.3, distance: arch ? 9 : 11, x: ax, y: ay, z } });
      if (v === "high") shots.push({ label: `${label} · from above`, fragment, view: { mode: "orbit", yaw, pitch: 0.75, distance: 22, x: ax, y: ay, z } });
      if (v === "top") shots.push({ label: `${label} · top-down`, fragment, view: { mode: "top", yaw: 0, pitch: 0.9, distance: 26, x: ax, y: ay, z } });
    }
  }
}
console.log(`${shots.length} forms to capture`);

process.env.DGM_BASE = "/";
const outDir = resolve(".scratch/capture-forms3d");
await build({ root: ROOT, configFile: join(ROOT, "vite.config.ts"), base: "/", logLevel: "warn", build: { outDir, emptyOutDir: true } });
const server = await preview({ root: ROOT, configFile: join(ROOT, "vite.config.ts"), base: "/", build: { outDir }, preview: { port, strictPort: true }, logLevel: "warn" });
const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--enable-gpu", "--use-angle=d3d11", "--ignore-gpu-blocklist"] });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  const frames: { label: string; png: string }[] = [];
  let open = "";
  for (const s of shots) {
    if (s.fragment !== open) {
      await page.goto("about:blank");
      await page.goto(`http://localhost:${port}/${s.fragment}`);
      await waitForEditor(page, 600_000);
      await page.evaluate("window.dgmEditor.idle()");
      await page.mouse.move(2, 2);
      await page.keyboard.press("Escape");
      await page.addStyleTag({ content: "body * { visibility: hidden !important; } .view3d > canvas { visibility: visible !important; }" });
      await page.waitForTimeout(3000);
      open = s.fragment;
    }
    const v = s.view;
    await page.evaluate(`window.dgm3d.renderer.setView({ mode: "${v.mode}", yaw: ${v.yaw}, pitch: ${v.pitch}, distance: ${v.distance}, target: [${v.x} + 0.5, ${v.z}, -(${v.y} + 0.5)] })`);
    await page.evaluate("new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null))))");
    await page.waitForTimeout(800);
    const png = await page.locator(".view3d > canvas").screenshot({ type: "png" });
    frames.push({ label: s.label, png: png.toString("base64") });
    console.log(`captured ${s.label}`);
  }
  // side by side, two a row (or a form's views a row), about 1280 wide in all, each with its label
  const jpeg = (await page.evaluate(
    `(async (frames) => {
      const imgs = await Promise.all(frames.map(async (f) => { const i = new Image(); i.src = "data:image/png;base64," + f.png; await i.decode(); return i; }));
      const cols = ${views.length > 1 ? views.length : 2}, w = Math.round(1280 / cols), hh = Math.round(imgs[0].height * w / imgs[0].width), band = 24, rows = Math.ceil(imgs.length / cols);
      const c = document.createElement("canvas"); c.width = cols * w; c.height = rows * (hh + band);
      const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height);
      imgs.forEach((im, k) => { const x = (k % cols) * w, y = Math.floor(k / cols) * (hh + band); g.drawImage(im, x, y + band, w, hh); g.fillStyle = "#222"; g.font = "15px sans-serif"; g.fillText(frames[k].label, x + 8, y + 17); });
      return c.toDataURL("image/jpeg", 0.82).split(",")[1];
    })(${JSON.stringify(frames)})`,
  )) as string;
  writeFileSync(out, Buffer.from(jpeg, "base64"));
  console.log(`wrote ${out}`);
} finally {
  await browser.close();
  await new Promise<void>((res) => server.httpServer.close(() => res()));
}
