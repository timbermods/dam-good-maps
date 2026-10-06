// The site's one service worker (public/sw.js, PLAN §20 D397) on a host that sends no headers, as GitHub Pages:
// a first visit reloads once and comes back cross-origin isolated, and a 256² map's water then runs on several
// threads (src/core/sim/parallel.ts) with the same bytes as Node's; the roadmap canvas is left untouched. The
// other tests' preview sends the headers itself (vite.config.ts), so this is the one that sees the worker.

import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import http from "node:http";
import { extname, join, normalize } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { generate } from "../../src/core/gen/generate";
import { encodeSpecFragment, makeSpec } from "../../src/core/spec/mapspec";

const TYPES: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".gz": "application/gzip", ".ogg": "audio/ogg", ".mp3": "audio/mpeg", ".map": "application/json" };
const ROADMAP = "<!doctype html><title>roadmap</title><p>roadmap</p>";

/** dist/ (the tests' build) under /dam-good-maps/, with no headers beyond the content type; a stub roadmap. */
function serve(): Promise<{ url: string; close: () => void }> {
  const root = normalize(join(process.cwd(), "dist"));
  const server = http.createServer((req, res) => {
    const path = decodeURIComponent((req.url ?? "/").split(/[?#]/)[0]);
    if (!path.startsWith("/dam-good-maps/")) return void res.writeHead(404).end();
    if (path.startsWith("/dam-good-maps/roadmap/")) return void res.writeHead(200, { "Content-Type": "text/html" }).end(ROADMAP);
    let file = normalize(join(root, path.slice("/dam-good-maps/".length)));
    if (!file.startsWith(root)) return void res.writeHead(403).end();
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");
    if (!existsSync(file)) return void res.writeHead(404).end();
    res.writeHead(200, { "Content-Type": TYPES[extname(file)] ?? "application/octet-stream" }).end(readFileSync(file));
  });
  return new Promise((done) => server.listen(0, "127.0.0.1", () => done({ url: `http://localhost:${(server.address() as { port: number }).port}/dam-good-maps/`, close: () => server.close() })));
}

/** Whether the page is cross-origin isolated, read across its reload. */
const isolated = (page: Page) => page.evaluate(() => crossOriginIsolated).catch(() => null);

test("a first visit reloads once through the service worker and the water runs on several threads", async ({ page }) => {
  test.setTimeout(600_000);
  const site = await serve();
  try {
    let loads = 0;
    page.on("load", () => loads++);
    await page.goto(site.url);
    await expect.poll(() => isolated(page), { timeout: 30_000 }).toBe(true);
    expect(loads, "at most one reload").toBeLessThanOrEqual(2);
    expect(await page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);

    // a 256² map: the editor's worker runs its water on several threads, and the file is Node's byte for byte
    await page.waitForFunction(() => "dgm" in window);
    const spec = makeSpec({ seed: 4242, size: { x: 256, y: 256 }, theme: "riverValley" });
    const web = await page.evaluate((f) => window.dgm!.generate(f), encodeSpecFragment(spec));
    expect(web.sha256).toBe(createHash("sha256").update(generate(spec).bytes).digest("hex"));
    let water: { threads: number; ticks: number } | null = null;
    for (const w of page.workers()) {
      const got = await w.evaluate(() => (self as unknown as { dgmWater?: () => { threads: number; ticks: number } }).dgmWater?.() ?? null).catch(() => null);
      if (got && (!water || got.ticks > water.ticks)) water = got;
    }
    expect(water, "the editor's worker").not.toBeNull();
    expect(water!.threads).toBeGreaterThan(1);
    expect(water!.ticks, "ticks run on several threads").toBeGreaterThan(0);

    // the roadmap canvas reads other sites live: the worker leaves it alone
    await page.goto(`${site.url}roadmap/`);
    expect(await page.evaluate(() => crossOriginIsolated)).toBe(false);
    await expect(page.getByText("roadmap")).toBeVisible();
  } finally {
    site.close();
  }
});
