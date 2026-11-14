// No edit is lost to a page closed in the moment after Generate asks for the next map (D455): the map is edited (its
// first edit, or another after it was kept), its quiet save not run yet, Generate pressed, and the page reloaded the
// moment the generator's worker is asked for the new map. Reopened from Your maps, the map is the map as edited: its
// document the same (its operations, features and meta; its stored map left aside, which a file saved while the water
// settled leaves out and its reopening builds again). A map counts as kept from its first stroke: Generate pressed while
// that stroke is still on its way to the worker stores the map with it before the next map is asked for.

import { expect, test, type Page } from "@playwright/test";
import { centreOn, generateButton, openDrawer, openEditor, openYourMaps, topDown, waitForEditor } from "./open";

/** Marks the moment the page asks the generator's worker for a map (comlink's call `generate`): `__generateAsked`. */
async function watchAsk(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { __generateAsked?: boolean };
    const post = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function (this: Worker, m: unknown, t?: unknown) {
      const c = m as { type?: string; path?: unknown[] } | null;
      if (c && c.type === "APPLY" && c.path?.[0] === "generate") w.__generateAsked = true;
      return (post as (m: unknown, t?: unknown) => void).call(this, m, t);
    } as typeof Worker.prototype.postMessage;
  });
}

/** While `__dgmSlowAnswers` is set, every answer from a worker reaches the page that much later, in order: a stroke
 *  still on its way when Generate is pressed, as on a large map or a slow machine. */
async function slowAnswers(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { __dgmSlowAnswers?: number };
    const add = Worker.prototype.addEventListener;
    const queue: (() => void)[] = [];
    const pass = () => {
      while (queue.length) queue.shift()!();
    };
    Worker.prototype.addEventListener = function (this: Worker, type: string, fn: EventListenerOrEventListenerObject, o?: boolean | AddEventListenerOptions) {
      if (type !== "message" || typeof fn !== "function") return add.call(this, type, fn, o);
      return add.call(this, type, (e: Event) => {
        if (!w.__dgmSlowAnswers && !queue.length) return fn.call(this, e);
        queue.push(() => fn.call(this, e));
        if (queue.length === 1) setTimeout(pass, w.__dgmSlowAnswers ?? 0);
      }, o);
    } as typeof Worker.prototype.addEventListener;
  });
}

/** A Lower stroke across (x, y); `answered`: waits for its edit to be in the worker. */
async function stroke(page: Page, at: [number, number], answered = true): Promise<void> {
  await centreOn(page, at[0], at[1]);
  const a = await page.evaluate(([x, y]) => window.dgmEditor!.tileToClient(x, y), [at[0] - 3, at[1]] as const);
  const b = await page.evaluate(([x, y]) => window.dgmEditor!.tileToClient(x, y), [at[0] + 3, at[1]] as const);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 6 });
  await page.mouse.up();
  if (answered) await page.waitForFunction(() => window.dgmEditor!.pendingTerrain() === 0, null, { timeout: 30_000 });
}

/** The open map's project, its document without its stored map. */
async function projectDoc(page: Page): Promise<Record<string, unknown>> {
  const { gunzipSync } = await import("node:zlib");
  const doc = JSON.parse(gunzipSync(Buffer.from(await page.evaluate(async () => Array.from((await window.dgmEditor!.worker.project(6)).bytes)))).toString());
  delete doc.stored;
  return doc;
}

for (const when of ["its first edit", "its first edit, Generate pressed as it goes in", "an edit after it was kept"] as const)
  test(`no edit is lost to a reload as Generate asks for the next map (${when})`, async ({ page }) => {
    test.setTimeout(300_000);
    const atOnce = when === "its first edit, Generate pressed as it goes in";
    await watchAsk(page);
    await slowAnswers(page);
    // (wide enough that the map shows beside the generator's panel)
    await page.setViewportSize({ width: 1920, height: 1080 });
    await openEditor(page, "s=4244&z=96&d=n&t=riverValley");
    await page.evaluate(() => localStorage.removeItem("dgm.keptNote"));
    await topDown(page);
    await page.getByRole("button", { name: "Lower brush (3)" }).click();
    if (when === "an edit after it was kept") {
      await stroke(page, [70, 12]);
      await expect(page.getByRole("status").filter({ hasText: "Kept in Your maps, in this browser" })).toBeVisible({ timeout: 60_000 });
      await page.evaluate(() => window.dgmEditor!.idle());
    }
    // (the quiet save after an edit held from here, the e2e build's hook: the edit is stored only as the page stores it)
    await page.evaluate(() => ((window as unknown as { __dgmHoldAutosave?: boolean }).__dgmHoldAutosave = true));
    const name = await page.evaluate(() => window.dgmEditor!.info().name);
    let edited: { doc?: Record<string, unknown>; stroke?: unknown } = {};
    if (atOnce) {
      // (the generator's panel open first, so Generate is pressed the moment the stroke ends, its edit not yet answered)
      await openDrawer(page);
      await page.evaluate(() => ((window as unknown as { __dgmSlowAnswers?: number }).__dgmSlowAnswers = 1500));
      await stroke(page, [70, 12], false);
      edited = { stroke: await page.evaluate(() => window.dgmEditor!.lastStroke()) };
      expect(edited.stroke, "the stroke was made").toBeTruthy();
      await page.evaluate(() => ((window as unknown as { __generateAsked?: boolean }).__generateAsked = false));
      await generateButton(page).click();
      await page.evaluate(() => ((window as unknown as { __dgmSlowAnswers?: number }).__dgmSlowAnswers = 0));
    } else {
      if (when === "an edit after it was kept") {
        await page.evaluate(() => window.dgmEditor!.edit({ op: "brush", params: window.dgmEditor!.lastStroke()! } as never, "Lower"));
        await page.waitForFunction(() => window.dgmEditor!.pendingTerrain() === 0, null, { timeout: 30_000 });
      } else await stroke(page, [70, 12]);
      edited = { doc: await projectDoc(page) };
      await page.keyboard.press("Escape");
      await openDrawer(page);
      await page.evaluate(() => ((window as unknown as { __generateAsked?: boolean }).__generateAsked = false));
      await generateButton(page).click();
    }
    await page.waitForFunction(() => (window as unknown as { __generateAsked?: boolean }).__generateAsked === true, null, { timeout: 120_000, polling: 1 });
    await page.reload();
    await waitForEditor(page, { timeout: 120_000 });
    const yours = await openYourMaps(page);
    const row = yours.locator(".ym-tile").filter({ hasText: name });
    await expect(row).toHaveCount(1, { timeout: 30_000 });
    await row.click();
    await page.waitForFunction((n) => window.dgmEditor?.info().name === n, name, { timeout: 120_000 });
    await page.evaluate(() => window.dgmEditor!.idle());
    const now = await projectDoc(page);
    if (edited.doc) expect(now).toEqual(edited.doc);
    // (the stroke made as Generate was pressed: the map's one edit, that stroke)
    else expect((now.edits as { op: string; params: unknown }[]).map((e) => ({ op: e.op, params: e.params }))).toEqual([{ op: "brush", params: edited.stroke }]);
  });
