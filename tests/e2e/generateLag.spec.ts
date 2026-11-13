// Generate asks for the next map without waiting for the file of the map it replaces, when that map is neither kept nor
// edited (App.tsx `holdBack`): the generator's worker hands over the map's document, unwritten (`projectDocument`), and
// its file is written on a worker of the page's own (ui/projectWriter.ts, "project writer") beside the new map's
// making. So, from the click: the generator's worker is never asked for the old map's file (`project`) before the
// request for the next map (`generate`), and the old map's file is written after that request. A kept or edited map is
// stored first, as before (generate-new-map.spec.ts). The time from the click to the request is logged as a measure,
// never asserted (a loaded machine, CI's software drawing).

import { expect, test, type Page } from "@playwright/test";
import { generateButton, openDrawer, openEditor } from "./open";

/** Records, in `__workerLog`, each comlink call the page posts to a worker (its method) and each answer a worker named
 *  "project writer" sends, with the time. */
async function watchWorkers(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const log: { what: string; t: number }[] = [];
    (window as unknown as { __workerLog: typeof log }).__workerLog = log;
    const Real = window.Worker;
    window.Worker = class extends Real {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        if (options?.name === "project writer") this.addEventListener("message", () => log.push({ what: "file written", t: performance.now() }));
      }
      override postMessage(m: unknown, t?: Transferable[] | StructuredSerializeOptions): void {
        const c = m as { type?: string; path?: unknown[] } | null;
        if (c && c.type === "APPLY" && typeof c.path?.[0] === "string") log.push({ what: c.path[0] as string, t: performance.now() });
        super.postMessage(m, t as Transferable[]);
      }
    };
  });
}

test("Generate asks for the next map before the replaced map's file is written, for a map neither kept nor edited", async ({ page }) => {
  test.setTimeout(300_000);
  await watchWorkers(page);
  await openEditor(page, "s=4242&z=128&d=n&t=riverValley");
  await openDrawer(page);
  const lags: number[] = [];
  for (let k = 0; k < 3; k++) {
    await expect(generateButton(page)).toBeEnabled({ timeout: 120_000 });
    await page.waitForTimeout(1500);
    const from = await page.evaluate(() => {
      const w = window as unknown as { __workerLog: unknown[] };
      w.__workerLog.length = 0;
      return performance.now();
    });
    const before = await page.evaluate(() => window.dgm!.current!()!.made);
    await generateButton(page).click();
    await page.waitForFunction((n) => (window.dgm!.current!()?.made ?? 0) > n, before, { timeout: 120_000 });
    const log = await page.evaluate(() => (window as unknown as { __workerLog: { what: string; t: number }[] }).__workerLog.slice());
    const asked = log.find((e) => e.what === "generate");
    expect(asked, "the next map is asked for").toBeTruthy();
    // (the old map's file is never asked of the generator's worker before the next map)
    expect(log.filter((e) => e.what === "project" && e.t < asked!.t)).toEqual([]);
    // (it is written on the page's own worker, after the request)
    const written = log.find((e) => e.what === "file written");
    expect(written, "the replaced map's file is written").toBeTruthy();
    expect(written!.t).toBeGreaterThan(asked!.t);
    lags.push(asked!.t - from);
  }
  console.log(`Generate's lag from the click to the request at 128²: ${lags.map((l) => Math.round(l)).join(", ")} ms`);
});
