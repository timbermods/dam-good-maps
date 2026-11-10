// A showcase map's pictures, in DGM's own 3D view (real Chrome on the GPU, headed): the project opened as the
// page opens one, then a list of cameras, each on the map's own day and, when asked, on a held day of a
// Drought or a Badtide (the Weather view). One JPEG a shot and a contact sheet.
//
//   npx tsx tools/showcase/capture.ts --project <file.damgoodmaps.json|file.timber> --shots <shots.json> --out <dir>
//                                     [--name r1] [--dist .scratch/showcase-site] [--port 4391] [--look high] [--size 1600x900]
//
// shots.json: [{ "name": "opening", "view": { "yaw": -0.61, "pitch": 1.047, "distance": 154, "target": [x, level, y] },
//                "top"?: true, "hazard"?: "drought"|"badtide", "day"?: 9, "clock"?: 12.5 }, …]
// A view's target is in tiles (x, level, y north); yaw is the camera's bearing in radians (0 looks north, positive
// turns west, as the renderer's); pitch is the angle above the horizon. The field of view is the game's 35°.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium, type Page } from "@playwright/test";
import { build, preview } from "vite";
import { waitForEditor } from "../wait-editor";

const arg = (name: string, d?: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d;
};
const PROJECT = resolve(arg("project")!);
const SHOTS = JSON.parse(readFileSync(arg("shots")!, "utf8")) as Shot[];
const OUT = arg("out", ".scratch/showcase/shots")!;
const NAME = arg("name", "shot")!;
const DIST = arg("dist", ".scratch/showcase-site")!;
const PORT = Number(arg("port", "4391"));
const LOOK = arg("look", "high")!;
const [VW, VH] = arg("size", "1600x900")!.split("x").map(Number);
const GPU_ARGS = ["--enable-gpu", "--use-angle=d3d11", "--ignore-gpu-blocklist"];

interface Shot {
  name: string;
  view?: { yaw: number; pitch: number; distance: number; target: [number, number, number] };
  top?: boolean;
  hazard?: "drought" | "badtide";
  day?: number;
  clock?: number;
  label?: string;
}

async function holdDay(page: Page, hazard: string | undefined, day: number | undefined, held: { hazard?: string; day?: number }): Promise<void> {
  if (held.hazard === hazard && held.day === day) return;
  const bar = page.getByRole("toolbar", { name: "Water time" });
  if (hazard && held.hazard !== hazard) {
    await bar.getByRole("button", { name: hazard === "badtide" ? "Badtide" : "Drought", exact: true }).click();
    await page.waitForFunction(() => /Day \d+/.test(document.querySelector('[aria-label="Water time"]')?.textContent ?? ""), null, { timeout: 900_000 });
  }
  if (hazard || held.hazard) {
    await bar.locator(".day-label").dblclick();
    await bar.getByRole("textbox", { name: "Day" }).fill(String(hazard ? day ?? 0 : 0));
    await bar.getByRole("textbox", { name: "Day" }).press("Enter");
    await page.waitForTimeout(600);
    await page.waitForFunction(() => !document.querySelector(".day-fill"), null, { timeout: 900_000 });
    await page.waitForTimeout(1200);
  }
  held.hazard = hazard;
  held.day = day;
}

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  process.env.DGM_BASE = "/";
  if (!existsSync(join(DIST, "index.html"))) {
    console.log("building the site…");
    await build({ configFile: "vite.config.ts", base: "/", logLevel: "warn", build: { outDir: DIST, emptyOutDir: true } });
  }
  const server = await preview({ configFile: "vite.config.ts", base: "/", build: { outDir: DIST }, preview: { port: PORT, strictPort: true }, logLevel: "warn" });
  const browser = await chromium.launch({ channel: "chrome", headless: false, args: GPU_ARGS, ignoreDefaultArgs: ["--enable-unsafe-swiftshader"] });
  const done: { file: string; label: string; b64: string }[] = [];
  try {
    const context = await browser.newContext({ viewport: { width: VW, height: VH }, deviceScaleFactor: 1, colorScheme: "light" });
    await context.addInitScript("window.__name = (f) => f");
    await context.addInitScript(`try { localStorage.setItem('dgm.look', '${LOOK}'); } catch {}`);
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.goto(`http://localhost:${PORT}/#s=1&z=64&d=n&t=riverValley`);
    await waitForEditor(page, 600_000);
    await page.evaluate("window.dgmEditor.idle()");
    await page.evaluate("window.was = window.dgm3d.renderer.map");
    await page.getByLabel("Open a map or a project").setInputFiles(PROJECT);
    await page.waitForFunction("window.dgm3d.renderer.map !== window.was", undefined, { timeout: 900_000 });
    await waitForEditor(page, 900_000);
    await page.evaluate("window.dgmEditor.idle()");
    await page.waitForFunction("window.dgmEditor.waterSettled()", null, { timeout: 900_000 });
    const gpu = (await page.evaluate(`(() => { const g = document.createElement('canvas').getContext('webgl'); const e = g.getExtension('WEBGL_debug_renderer_info'); return g.getParameter(e.UNMASKED_RENDERER_WEBGL); })()`)) as string;
    console.log(`GPU: ${gpu}`);
    await page.evaluate(`(() => { const r = window.dgm3d.renderer; if (${JSON.stringify(LOOK)} === 'high') for (const k of Object.keys(r.highEffects ?? {})) r.setHighEffect(k, true); r.setLookChoice?.(${JSON.stringify(LOOK)}, false); })()`);
    if (LOOK === "high") await page.waitForFunction("window.dgm3d.renderer.highSettled !== false", null, { timeout: 120_000 }).catch(() => {});
    // only the 3D view: every other element hidden (the largest canvas is the view)
    await page.evaluate(() => {
      const cs = [...document.querySelectorAll("canvas")];
      const big = cs.reduce((m, c) => (c.clientWidth * c.clientHeight > m.clientWidth * m.clientHeight ? c : m), cs[0]);
      big.setAttribute("data-shot-view", "");
    });
    const hide = async (on: boolean) => {
      await page.evaluate((on) => {
        document.getElementById("shot-hide")?.remove();
        if (!on) return;
        const st = document.createElement("style");
        st.id = "shot-hide";
        st.textContent = "body * { visibility: hidden !important } [data-shot-view] { visibility: visible !important }";
        document.head.append(st);
      }, on);
    };
    const held: { hazard?: string; day?: number } = {};
    for (const shot of SHOTS) {
      await hide(false);
      await holdDay(page, shot.hazard, shot.day, held);
      await hide(true);
      await page.evaluate(
        ([v, top, clock]) => {
          const r = window.dgm3d!.renderer as unknown as { persp: { fov: number; updateProjectionMatrix(): void }; setView(v: unknown): void; setClock?: (t: number | null) => void };
          r.persp.fov = 35;
          r.persp.updateProjectionMatrix();
          r.setClock?.(clock as number);
          const view = v as { yaw: number; pitch: number; distance: number; target: [number, number, number] };
          r.setView({ mode: top ? "top" : "orbit", yaw: view.yaw, pitch: view.pitch, distance: view.distance, target: [view.target[0], view.target[1], -view.target[2]] });
        },
        [shot.view ?? { yaw: 0, pitch: 1.2, distance: 300, target: [96, 6, 96] }, !!shot.top, shot.clock ?? 10.5] as const,
      );
      await page.mouse.move(VW / 2, 4);
      await page.waitForTimeout(2600);
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null)))));
      const box = (await page.locator("[data-shot-view]").boundingBox())!;
      const w = Math.min(box.width, (box.height * 16) / 9);
      const jpg = await page.screenshot({ type: "jpeg", quality: 86, clip: { x: box.x + (box.width - w) / 2, y: box.y, width: w, height: box.height } });
      const file = join(OUT, `${NAME}-${shot.name}.jpg`);
      writeFileSync(file, jpg);
      done.push({ file, label: shot.label ?? shot.name, b64: jpg.toString("base64") });
      console.log(file);
    }
    if (errors.length) console.log("page errors: " + errors.slice(0, 5).join(" | "));
    // the contact sheet: three across
    const code = `async ({ imgs, labels }) => {
      const els = await Promise.all(imgs.map(async (b) => { const i = new Image(); i.src = "data:image/jpeg;base64," + b; await i.decode(); return i; }));
      const cols = 3, w = 800, h = Math.round(els[0].height * w / els[0].width), band = 28, gap = 6;
      const rows = Math.ceil(els.length / cols);
      const c = document.createElement("canvas"); c.width = cols * w + (cols - 1) * gap; c.height = rows * (h + band) + (rows - 1) * gap;
      const g = c.getContext("2d"); g.fillStyle = "#1b1b1b"; g.fillRect(0, 0, c.width, c.height);
      els.forEach((e, k) => { const x = (k % cols) * (w + gap), y = Math.floor(k / cols) * (h + band + gap); g.drawImage(e, x, y + band, w, h); g.fillStyle = "#f2f2f2"; g.font = "17px system-ui, sans-serif"; g.fillText(labels[k], x + 8, y + 20); });
      return c.toDataURL("image/jpeg", 0.84).split(",")[1];
    }`;
    await hide(false);
    const b64 = (await page.evaluate(`(${code})(${JSON.stringify({ imgs: done.map((d) => d.b64), labels: done.map((d) => d.label) })})`)) as string;
    const sheet = join(OUT, `${NAME}-sheet.jpg`);
    writeFileSync(sheet, Buffer.from(b64, "base64"));
    console.log(`${sheet}: ${Math.round(Buffer.from(b64, "base64").length / 1024)} KB`);
    await context.close();
  } finally {
    await browser.close();
    await new Promise<void>((r) => server.httpServer.close(() => r()));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
