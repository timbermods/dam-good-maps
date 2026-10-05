// Saving waits for a force at work (Codex's page QA, investigation/page-qa F1, adopted by Kyler 2026-10-05): Download
// project, Save to Timberborn and Download .timber keep a running force first, so the file holds the land shown.

import { expect, test, type Page } from "@playwright/test";
import { openEditor } from "./open";

const land = (page: Page) => page.evaluate(() => Array.from(window.dgm3d!.renderer.mapState()!.heights));

/** The files the page offers: the real anchor's blob, read as it is clicked (the click goes on as usual). */
async function watchFiles(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { files: { name: string; bytes: Promise<number[]> }[] };
    w.files = [];
    document.addEventListener(
      "click",
      (e) => {
        const a = e.target;
        if (a instanceof HTMLAnchorElement && a.download && a.href.startsWith("blob:"))
          w.files.push({
            name: a.download,
            bytes: fetch(a.href)
              .then((r) => r.arrayBuffer())
              .then((b) => Array.from(new Uint8Array(b))),
          });
      },
      true,
    );
  });
}

test("Download project and Download .timber keep a paused Fast force, and the file reopens on the land shown", async ({ page }) => {
  test.setTimeout(300_000);
  for (const choice of ["Download project", "Download .timber"]) {
    await openEditor(page, "s=4242&z=256&d=n&t=highlands");
    await watchFiles(page);
    await page.getByRole("button", { name: "Top-down", exact: true }).click();
    const slow = page.getByRole("button", { name: "Slow forces", exact: true });
    if ((await slow.getAttribute("aria-pressed")) === "true") await slow.click();
    await page.getByRole("button", { name: "Craterize (8)", exact: true }).click();
    await page.evaluate(() => {
      const r = window.dgm3d!.renderer;
      r.setView({ target: [170.5, r.getView().target[1], -70.5] });
    });
    // (Craterize in hand: Select, the resting tool, alone takes Alt itself)
    await page.waitForFunction(() => {
      const p = window.dgmEditor!.tileToClient(170, 70);
      const t = window.dgm3d!.renderer.tool;
      return document.elementFromPoint(p.x, p.y)?.tagName === "CANVAS" && t !== null && !("wantsAlt" in t);
    });
    const before = await land(page);
    const p = await page.evaluate(() => window.dgmEditor!.tileToClient(170, 70));
    await page.mouse.click(p.x, p.y);
    await page.waitForFunction((b) => window.dgmEditor!.force()?.verb === "craterize" && window.dgm3d!.renderer.mapState()!.heights.some((h, i) => h !== b[i]), before);
    await page.keyboard.press("Space");
    expect(await page.evaluate(() => window.dgmEditor!.force()?.paused)).toBe(true);
    await page.getByRole("button", { name: "File", exact: true }).click();
    await page.getByRole("menuitem", { name: choice, exact: true }).click();
    await page.waitForFunction(() => (window as unknown as { files: unknown[] }).files.length > 0, null, { timeout: 120_000 });
    const file = await page.evaluate(async () => {
      const f = (window as unknown as { files: { name: string; bytes: Promise<number[]> }[] }).files.at(-1)!;
      return { name: f.name, bytes: await f.bytes };
    });
    const shown = await land(page);
    expect(shown).not.toEqual(before);
    const version = await page.evaluate(() => window.dgmEditor!.info().version);
    await page.getByLabel("Open a map or a project").setInputFiles({ name: file.name, mimeType: "application/octet-stream", buffer: Buffer.from(file.bytes) });
    await page.waitForFunction((v) => (window.dgmEditor?.info().version ?? 0) > v, version, { timeout: 120_000 });
    const reopened = await land(page);
    expect(reopened.filter((h, i) => h !== shown[i]).length, `${choice}: tiles missing from the land shown when the file was offered`).toBe(0);
  }
});
