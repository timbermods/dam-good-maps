// The captures REPORT.md shows, taken from the demo itself in the installed Google Chrome (headless,
// on the machine's GPU), on a free local port:
// - per case: the land before and after from the same overview, and the low views (under the
//   overhang, into the cave, through the arch, and from inside where the case has one);
// - a GIF of the moment on the crater case, frame by frame on the demo's own clock (so the frames
//   are exact whatever the capture's speed);
// - checks/browser.json: each case's time to the final land and its support check, in the browser.
//
//   npm --prefix investigation/erode run captures        (about two minutes)
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { createServer as netServer } from "node:net";
import { fileURLToPath } from "node:url";
import { encodeGif } from "./gif";

const here = fileURLToPath(new URL("../", import.meta.url));
const port = await new Promise<number>((res) => {
  const s = netServer();
  s.listen(0, "127.0.0.1", () => {
    const p = (s.address() as { port: number }).port;
    s.close(() => res(p));
  });
});
process.env.ERODE_PORT = String(port);
const { createServer } = await import("vite");
const server = await createServer({ configFile: here + "vite.config.ts", root: here, logLevel: "warn" });
await server.listen();
const url = `http://127.0.0.1:${port}/`;
const out = new URL("../captures/", import.meta.url);
mkdirSync(out, { recursive: true });
mkdirSync(new URL("../checks/", import.meta.url), { recursive: true });

const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors: string[] = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
await page.goto(url);
await page.waitForSelector("body[data-ready='1']", { timeout: 120000 });

const ev = <T>(js: string) => page.evaluate(js) as Promise<T>;
const shot = async (name: string) => {
  await page.waitForTimeout(300);
  await page.screenshot({ path: fileURLToPath(new URL(`${name}.jpg`, out)), type: "jpeg", quality: 86 });
  console.log("  ", name);
};

const cases = await ev<string[]>("window.erode.cases");
const timings: Record<string, unknown>[] = [];
for (const id of cases) {
  console.log(id);
  await ev(`(async () => { await window.erode.open(${JSON.stringify(id)}); document.body.classList.add('capture'); })()`);
  await ev(`window.erode.pose(window.erode.caseOf(${JSON.stringify(id)}).overview)`);
  await shot(`${id}-before`);
  await ev(`(async () => { window.erode.play(0, true); while (!window.erode.idle) await new Promise(r => setTimeout(r, 50)); window.erode.quiet(); })()`);
  const last = await ev<Record<string, number>>("window.erode.last");
  timings.push({ case: id, worn: last.worn, held: last.held, fell: last.fell, droppedOnLoad: last.dropped, msToFinal: Math.round(last.ms), checkMs: Math.round(last.checkMs) });
  await shot(`${id}-after`);
  for (const v of ["low", "inside"]) {
    const ok = await ev<boolean>(`(() => { const c = window.erode.caseOf(${JSON.stringify(id)}); if (!c.${v}) return false; window.erode.pose(c.${v}); return true; })()`);
    if (ok) await shot(`${id}-${v}`);
  }
}
writeFileSync(new URL("../checks/browser.json", import.meta.url), JSON.stringify({ note: "npm --prefix investigation/erode run captures: the time to the final land (planning in the worker) and the support check over every voxel, in installed Chrome on this machine", cases: timings }, null, 1) + "\n");

// the moment, on the crater: 10 frames a second, 5 seconds from the gesture
{
  const id = "crater-lip";
  await ev(`(async () => { await window.erode.open(${JSON.stringify(id)}); document.body.classList.add('capture'); })()`);
  await page.setViewportSize({ width: 960, height: 600 });
  await ev(`window.erode.pose({ target: [114.5, 12, -103.5], yaw: -1.05, pitch: 0.1, distance: 15 })`);
  // the plan comes back from the worker on its own time; the clock waits for it frame by frame
  const W = 480, H = 300, frames: Uint8Array[] = [];
  const grab = async () => {
    const b64 = await ev<string>(`(() => {
      const src = document.getElementById('view');
      const c = document.createElement('canvas'); c.width = ${W}; c.height = ${H};
      const g = c.getContext('2d'); g.drawImage(src, 0, 0, ${W}, ${H});
      const d = g.getImageData(0, 0, ${W}, ${H}).data;
      let s = ''; for (let k = 0; k < d.length; k += 0x8000) s += String.fromCharCode.apply(null, d.subarray(k, k + 0x8000));
      return btoa(s);
    })()`);
    frames.push(new Uint8Array(Buffer.from(b64, "base64")));
  };
  // the land as it was, then the gesture
  await ev("window.erode.manual(true)");
  await ev("window.erode.step(100)");
  await grab();
  await ev("window.erode.play(0, false)");
  for (let k = 0; k < 3; k++) (await ev("window.erode.step(100)"), await grab());
  while (await ev<boolean>("window.erode.planning")) await page.waitForTimeout(20);
  for (let k = 0; k < 46; k++) (await ev("window.erode.step(100)"), await grab());
  await ev("window.erode.manual(false)");
  const gif = encodeGif(W, H, frames, 10);
  writeFileSync(new URL("crater-moment.gif", out), gif);
  console.log(`crater-moment.gif: ${frames.length} frames, ${(gif.length / 1048576).toFixed(2)} MB`);
}

await browser.close();
await server.close();
if (errors.length) console.log("page errors:\n" + errors.join("\n"));
