// The 3D view at every map size (D357), in real Chrome on this machine's GPU, headed: each size's map (made by
// tools/size-fixtures.ts, in .scratch/sizes) opened in the editor, its opening view captured in the Standard and
// High looks, dark at 1920×1080 and light at 1280×800, and one sheet of them all.
//
//   npx tsx tools/size-fixtures.ts                     (once: the maps)
//   npx tsx tools/capture-sizes.ts [--sizes 512x512,512x96,4x4] [--out docs/sheets/renderer-custom-sizes.jpg]
//        [--shots .scratch/size-shots] [--no-build] [--measure 512x512]
//
// --measure W×H: instead of the sheet, orbit that size for a few seconds in each look and print the frame times, the
// build and the page's memory (information, not a test). The sheet is under 1 MB (D144's habit); our own maps only.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { build, preview } from "vite";
import { waitForEditor } from "./wait-editor";

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const SIZES = (arg("sizes") ?? "512x512,512x96,4x4").split(",");
const MEASURE = arg("measure")?.split(",");
const OUT = arg("out") ?? "docs/sheets/renderer-custom-sizes.jpg";
const SHOTS = arg("shots") ?? ".scratch/size-shots";
/** --views "name=orbit:x,y,distance,pitchDeg,yawDeg;name=top:x,y,distance": extra shots of the chosen views (tile
 *  coordinates, y north), for looking closely at a part of a map; the opening view is not taken then. */
const VIEWS = arg("views")?.split(";").filter(Boolean);
const PORT = Number(arg("port") ?? 4963);
const NOMIN = process.argv.includes("--unminified");
const DIST = NOMIN ? ".scratch/sizes-dist-unmin" : ".scratch/sizes-dist";
const FIXTURES = ".scratch/sizes";

const SCREENS = [
  { id: "dark1920", width: 1920, height: 1080, scheme: "dark" as const },
  { id: "light1280", width: 1280, height: 800, scheme: "light" as const },
];
const LOOKS = (arg("looks")?.split(",") ?? ["standard", "high"]) as ("standard" | "high")[];
const ONLY_SCREENS = arg("screens")?.split(",");

async function open(ctx: BrowserContext, size: string, look: string): Promise<Page> {
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log(`  [pageerror ${size} ${look}] ${String(e).split("\n")[0]}`));
  page.on("console", (m) => (m.type() === "error" || m.type() === "warning") && console.log(`  [console ${m.type()} ${size} ${look}] ${m.text().split("\n")[0].slice(0, 200)}`));
  await page.addInitScript(`try { localStorage.setItem('dgm.look', '${look}'); localStorage.setItem('dgm.firstRun', 'done'); } catch {}`);
  await page.goto(`http://localhost:${PORT}/#s=1&z=48&d=n&t=highlands`);
  await waitForEditor(page, 300_000);
  await page.evaluate("window.dgmEditor = undefined");
  const t0 = Date.now();
  await page.getByLabel("Open a map or a project").setInputFiles(join(FIXTURES, `${size}.timber`));
  const [W, H] = size.split("x").map(Number);
  await page.waitForFunction(([w, h]) => window.dgmEditor?.info().kind === "import" && window.dgmEditor.info().W === w && window.dgmEditor.info().H === h && !!window.dgm3d, [W, H], { timeout: 600_000 });
  console.log(`  opened ${size} (${look}) in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  // settle: the first frames, the water, the look's passes
  await page.waitForTimeout(2500);
  return page;
}

async function main() {
  process.env.DGM_BASE = "/";
  if (!process.argv.includes("--no-build") || !existsSync(DIST)) {
    console.log("building the site…");
    await build({ configFile: "vite.config.ts", base: "/", logLevel: "warn", build: { outDir: DIST, emptyOutDir: true, ...(NOMIN ? { minify: false } : {}) } });
  }
  const server = await preview({ configFile: "vite.config.ts", base: "/", build: { outDir: DIST }, preview: { port: PORT, strictPort: true }, logLevel: "warn" });
  mkdirSync(SHOTS, { recursive: true });
  let browser: Browser | null = null;
  try {
    browser = await chromium.launch({
      channel: "chrome",
      headless: false,
      ignoreDefaultArgs: ["--enable-unsafe-swiftshader"],
      args: ["--enable-gpu", "--ignore-gpu-blocklist", "--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding", "--disable-background-timer-throttling"],
    });
    const done: { size: string; look: string; screen: string; file: string }[] = [];
    for (const size of MEASURE ?? SIZES) {
      for (const look of LOOKS) {
        for (const sc of MEASURE ? SCREENS.slice(0, 1) : SCREENS.filter((q) => !ONLY_SCREENS || ONLY_SCREENS.includes(q.id))) {
          const ctx = await browser.newContext({ viewport: { width: sc.width, height: sc.height }, colorScheme: sc.scheme });
          const page = await open(ctx, size, look);
          const gpu = (await page.evaluate(`(() => { const c = document.createElement('canvas').getContext('webgl2'); const e = c.getExtension('WEBGL_debug_renderer_info'); return String(e ? c.getParameter(e.UNMASKED_RENDERER_WEBGL) : c.getParameter(c.RENDERER)) + ' maxTex ' + c.getParameter(c.MAX_TEXTURE_SIZE); })()`)) as string;
          if (!/NVIDIA/i.test(gpu)) console.log(`  WARNING: not the NVIDIA card: ${gpu}`);
          const info = await page.evaluate(`(() => { const r = window.dgm3d.renderer; return { look: r.look, view: r.getView(), build: window.dgm3d.build, info: r.info() }; })()`);
          console.log(`  ${size} ${look} ${sc.id}: ${gpu}\n  ${JSON.stringify(info)}`);
          if (MEASURE) {
            const o = (await page.evaluate("window.dgm3d.renderer.benchOrbit(6000)")) as Record<string, number>;
            const mem = (await page.evaluate(`(() => { const m = performance.memory; return m ? Math.round(m.usedJSHeapSize / 1048576) : null; })()`)) as number | null;
            // the textures the scene's materials read (bytes as uploaded, mip levels not counted) and the render targets the High look holds
            const tex = (await page.evaluate(`(() => {
              const r = window.dgm3d.renderer; const seen = new Set(); let bytes = 0; let n = 0;
              const add = (t) => { if (!t || seen.has(t)) return; seen.add(t); const im = t.image; if (!im || !im.width) return; const bpp = (t.type === 1015 ? 16 : 4); bytes += im.width * im.height * bpp; n++; };
              r.scene.traverse((o) => { const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : []; for (const m of ms) for (const u of Object.values(m.uniforms || {})) { const v = u && u.value; if (v && v.isTexture) add(v); else if (v && v.texture && v.texture.isTexture) { /* a render target */ seen.add(v.texture); bytes += v.width * v.height * 4; n++; } } });
              return { textures: n, MB: Math.round(bytes / 1048576), memory: r.gl.info.memory };
            })()`)) as unknown;
            // painting: a Raise stroke wandering over the middle of the map for four seconds (frame gaps, information)
            await page.evaluate("window.dgm3d.renderer.resetView()");
            await page.waitForTimeout(600);
            await page.keyboard.press("2");
            await page.evaluate(`(() => { window.__gaps = []; let last = performance.now(); const f = (t) => { window.__gaps.push(t - last); last = t; window.__raf = requestAnimationFrame(f); }; window.__raf = requestAnimationFrame(f); })()`);
            const cx = sc.width / 2;
            const cy = sc.height / 2;
            await page.evaluate(`(() => { const r = window.dgm3d.renderer; window.__calls = {}; for (const k of ["updateWaterSoon", "updateWater", "updateTerrain", "updateTerrainRect", "flushTerrain"]) { const f = r[k]; if (typeof f !== "function") continue; r[k] = function (...a) { const t = performance.now(); const o = f.apply(this, a); const c = (window.__calls[k] ||= { n: 0, ms: 0 }); c.n++; c.ms += performance.now() - t; return o; }; } })()`);
            const cdp = process.argv.includes("--profile") ? await ctx.newCDPSession(page) : null;
            if (cdp) {
              await cdp.send("Profiler.enable");
              await cdp.send("Profiler.setSamplingInterval", { interval: 200 });
              await cdp.send("Profiler.start");
            }
            await page.mouse.move(cx, cy);
            await page.mouse.down();
            for (let k = 0; k < 240; k++) {
              await page.mouse.move(cx + Math.sin(k / 25) * sc.width * 0.18, cy + Math.cos(k / 17) * sc.height * 0.16);
              await page.waitForTimeout(16);
            }
            await page.mouse.up();
            await page.waitForTimeout(500);
            if (cdp) {
              const { profile } = (await cdp.send("Profiler.stop")) as { profile: { nodes: { id: number; callFrame: { functionName: string; url: string; lineNumber: number } }[]; samples: number[]; timeDeltas: number[] } };
              const self = new Map<number, number>();
              profile.samples.forEach((id, i) => self.set(id, (self.get(id) ?? 0) + (profile.timeDeltas[i] ?? 0)));
              const byName = new Map<string, number>();
              for (const n of profile.nodes) {
                const key = `${n.callFrame.functionName || "(anon)"} ${n.callFrame.url.replace(/^.*\//, "")}:${n.callFrame.lineNumber}`;
                byName.set(key, (byName.get(key) ?? 0) + (self.get(n.id) ?? 0));
              }
              const top = [...byName.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14);
              console.log("  PROFILE (self ms over the stroke):\n" + top.map(([k, v]) => `    ${(v / 1000).toFixed(0).padStart(6)}  ${k}`).join("\n"));
            }
            const g =(await page.evaluate("cancelAnimationFrame(window.__raf), window.__gaps")) as number[];
            console.log(`  CALLS ${size} ${look}: ${JSON.stringify(await page.evaluate("window.__calls"))}`);
            const sorted = [...g].sort((a, b) => a - b);
            const q = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))].toFixed(1);
            console.log(`  PAINT ${size} ${look}: ${g.length} frames, p50 ${q(0.5)} p95 ${q(0.95)} p99 ${q(0.99)} max ${sorted[sorted.length - 1].toFixed(1)} ms, over 50 ms: ${g.filter((x) => x > 50).length}`);
            console.log(`  TEXTURES ${size} ${look}: ${JSON.stringify(tex)}`);
            console.log(`  MEASURE ${size} ${look}: ${JSON.stringify(o)} jsHeapMB ${mem}`);
          } else if (VIEWS) {
            for (const label of (arg("click") ?? "").split(",").filter(Boolean)) await page.getByRole("button", { name: label, exact: true }).click();
            if (arg("click")) await page.waitForTimeout(4000);
            for (const v of VIEWS) {
              const [name, rest] = v.split("=");
              const [mode, nums] = rest.split(":");
              const [x, y, d, pitch, yaw] = nums.split(",").map(Number);
              await page.evaluate(
                ([mode, x, y, d, pitch, yaw]) => {
                  const r = window.dgm3d!.renderer;
                  const h = r.heightAt(Math.max(0, Math.min(r.map!.W - 1, Math.floor(x as number))), Math.max(0, Math.min(r.map!.H - 1, Math.floor(y as number))));
                  r.setView({ mode: mode as "orbit" | "top", target: [x as number, h, -(y as number)], distance: d as number, pitch: (((pitch as number) || 70) * Math.PI) / 180, yaw: (((yaw as number) || 0) * Math.PI) / 180 });
                  r.renderNow();
                },
                [mode, x, y, d, pitch, yaw],
              );
              await page.waitForTimeout(1200);
              const file = join(SHOTS, `${size}-${look}-${sc.id}-${name}.png`);
              await page.screenshot({ path: file });
            }
          } else {
            const file = join(SHOTS, `${size}-${look}-${sc.id}.png`);
            await page.screenshot({ path: file });
            done.push({ size, look, screen: sc.id, file });
          }
          await ctx.close();
        }
      }
    }
    writeFileSync(join(SHOTS, "list.json"), JSON.stringify(done, null, 1));
    void readFileSync;
    void OUT;
  } finally {
    await browser?.close();
    await server.close();
  }
}

await main();
