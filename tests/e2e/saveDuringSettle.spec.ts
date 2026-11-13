// A map saved while its water still settles reopens byte for byte (D455): its first save into Your maps is taken while
// the edit's water is still on its way (the file carries no stored map), and once the water has settled the map's
// project, its stored map included, is the same whether it is the session that was edited or that file reopened.

import { gunzipSync } from "node:zlib";
import { expect, test, type Page } from "@playwright/test";
import { centreOn, openEditor, topDown, waitForEditor } from "./open";

const decode = (bytes: number[]) => JSON.parse(gunzipSync(Buffer.from(bytes)).toString()) as Record<string, unknown> & { stored?: { map: unknown; blobs: string[] } };

/** The open map's project once its water has settled (the worker's own, with its stored map). */
async function settledProject(page: Page): Promise<ReturnType<typeof decode>> {
  await expect.poll(() => page.evaluate(async () => (await window.dgmEditor!.worker.sessionInfo())?.waterPending), { timeout: 120_000 }).toBe(false);
  return decode(await page.evaluate(async () => Array.from((await window.dgmEditor!.worker.project(6)).bytes)));
}

/** The open map's project as Your maps holds it (IndexedDB), or null. */
async function keptProject(page: Page): Promise<number[] | null> {
  return page.evaluate(
    () =>
      new Promise<number[] | null>((done) => {
        const id = (JSON.parse(localStorage.getItem("dgm.current") ?? "null") as { id?: string } | null)?.id;
        if (!id) return done(null);
        const req = indexedDB.open("dgm-your-maps", 1);
        req.onerror = () => done(null);
        req.onsuccess = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains("projects")) return (db.close(), done(null));
          const get = db.transaction("projects").objectStore("projects").get(id);
          get.onsuccess = () => (db.close(), done(get.result instanceof Uint8Array ? Array.from(get.result) : null));
          get.onerror = () => (db.close(), done(null));
        };
      }),
  );
}

for (const z of [96, 256])
test(`a map first saved while its water settles reopens with the same stored map (${z}²)`, async ({ page, context }) => {
  test.setTimeout(300_000);
  await openEditor(page, `s=4244&z=${z}&d=n&t=riverValley`, { timeout: 240_000 });
  const c = z / 2;
  await topDown(page);
  // (the quiet save after an edit held, the e2e build's hook: the map is saved only when the test says)
  await page.evaluate(() => ((window as unknown as { __dgmHoldAutosave?: boolean }).__dgmHoldAutosave = true));
  await page.getByRole("button", { name: "Lower brush (3)" }).click();
  await centreOn(page, c, c);
  const a = await page.evaluate((c) => window.dgmEditor!.tileToClient(c - 6, c), c);
  const b = await page.evaluate((c) => window.dgmEditor!.tileToClient(c + 6, c), c);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 8 });
  await page.mouse.up();
  await page.waitForFunction(() => window.dgmEditor!.pendingTerrain() === 0, null, { timeout: 30_000 });
  // the save now, its water still settling: the page saves what waits as it is hidden
  await page.evaluate(() => window.dispatchEvent(new Event("pagehide")));
  await expect.poll(() => keptProject(page), { timeout: 60_000 }).not.toBeNull();
  const kept = decode((await keptProject(page))!);
  expect(kept.stored, "the first save was taken while the water settled").toBeUndefined();
  const edited = await settledProject(page);
  expect(edited.stored).toBeDefined();

  // the file reopened in a page of its own (the open page stays, its held save never written)
  const again = await context.newPage();
  await again.goto(page.url());
  await waitForEditor(again, { timeout: 120_000 });
  const reopened = await settledProject(again);
  const { stored: s1, ...doc1 } = edited;
  const { stored: s2, ...doc2 } = reopened;
  expect(doc2).toEqual(doc1);
  const differ = s1!.blobs.flatMap((x, i) => (x === s2!.blobs[i] ? [] : [i]));
  expect({ map: JSON.stringify(s2!.map) === JSON.stringify(s1!.map), blobs: s2!.blobs.length, differ }).toEqual({ map: true, blobs: s1!.blobs.length, differ: [] });
});
