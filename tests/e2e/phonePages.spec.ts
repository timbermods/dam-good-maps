// The rest of the page on a phone (#1074 slice 4; EDITOR_PLAN §3, "Phones"): every page the menu opens (Map Generator,
// Real places, Your maps, History) and every dialog and panel (Help and keys, About, New blank map, Description,
// Together, the time-lapse, the checks), upright at 393×852 and on its side at 852×393, three device pixels to a CSS
// pixel and a touch screen. Each: no control under 44px, none off the screen (a page scrolls inside itself, read at its
// top and its foot), fields 16px, the page itself neither zoomed nor scrolled, and a plain close on the screen that
// closes it. Save to Timberborn hands the map's file to the share sheet where the browser has one for files.

import { expect, test, type Locator, type Page } from "@playwright/test";
import { openLayoutMap as openEditor } from "./helpers";
import { phoneControls } from "./phone";

test.describe.configure({ mode: "parallel" });

const PHONES = [
  { name: "upright", viewport: { width: 393, height: 852 } },
  { name: "on its side", viewport: { width: 852, height: 393 } },
];

/** Each thing the menu (or the bar) opens: how it opens, what it is, and its close. */
const OPENED: { name: string; open: (page: Page) => Promise<void>; root: string; close: (page: Page) => Locator; body?: string }[] = [
  { name: "Map Generator", open: (p) => fromMenu(p, "Map Generator"), root: ".phone-page[aria-label='Map Generator']", close: (p) => p.locator(".phone-back"), body: ".phone-page-body" },
  { name: "Real places", open: (p) => fromMenu(p, "Real places"), root: ".phone-page[aria-label='Real places']", close: (p) => p.locator(".phone-back"), body: ".phone-page-body" },
  { name: "Your maps", open: (p) => fromMenu(p, "Your maps"), root: ".phone-page[aria-label='Your maps']", close: (p) => p.locator(".phone-back"), body: ".phone-page-body" },
  { name: "History", open: (p) => fromMenu(p, "History"), root: ".phone-page[aria-label='History']", close: (p) => p.locator(".phone-back"), body: ".phone-page-body" },
  { name: "Help and keys", open: (p) => fromMenu(p, "Help and keys"), root: ".help-dialog", close: (p) => p.locator(".help-dialog footer").getByRole("button", { name: "Close" }), body: ".help-dialog" },
  { name: "About", open: (p) => fromMenu(p, "About"), root: ".dialog.about", close: (p) => p.locator(".dialog.about").getByRole("button", { name: "Close" }) },
  { name: "New blank map", open: (p) => fromMenu(p, "New blank map…"), root: ".dialog.new-blank", close: (p) => p.locator(".dialog.new-blank").getByRole("button", { name: "Cancel" }) },
  { name: "Description", open: (p) => fromMenu(p, "Description…"), root: ".dialog.describe", close: (p) => p.locator(".dialog.describe").getByRole("button", { name: "Cancel" }) },
  { name: "Together", open: (p) => fromMenu(p, "Together…"), root: ".together-panel", close: (p) => p.locator(".together-close") },
  { name: "the time-lapse", open: (p) => fromMenu(p, "Record a time-lapse…"), root: ".lapse-dialog", close: (p) => p.locator(".lapse-dialog footer button").first() },
  { name: "the checks", open: (p) => p.locator(".checks-dot").tap(), root: ".checks-list", close: (p) => p.locator(".checks-dot") },
];

async function fromMenu(page: Page, entry: string) {
  await page.locator(".phone-menu-button").tap();
  await page.getByRole("menuitem", { name: entry, exact: true }).tap();
}

/** The page at the screen's size, every control at least 44px and on the screen, every field 16px. */
async function check(page: Page, W: number, H: number, state: string) {
  await page.waitForTimeout(300);
  const at = await page.evaluate(() => ({ w: document.documentElement.scrollWidth, h: document.documentElement.scrollHeight, x: window.scrollX, y: window.scrollY, scale: window.visualViewport?.scale ?? 1 }));
  expect(at, `${state}: the page neither zoomed nor scrolled`).toEqual({ w: W, h: H, x: 0, y: 0, scale: 1 });
  const controls = await phoneControls(page);
  expect(controls.filter((c) => Math.min(c.w, c.h) < 43.5).map((c) => `${c.name} ${Math.round(c.w)}×${Math.round(c.h)}`), `${state}: controls under 44px`).toEqual([]);
  expect(controls.filter((c) => c.off).map((c) => c.name), `${state}: controls off the screen`).toEqual([]);
  expect(controls.filter((c) => c.font !== null && c.font < 16).map((c) => c.name), `${state}: fields under 16px`).toEqual([]);
}

for (const phone of PHONES) {
  test.describe(`a phone ${phone.name}`, () => {
    test.use({ viewport: phone.viewport, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
    const { width: W, height: H } = phone.viewport;

    test(`at ${W}×${H}: every page and dialog fits, every control 44px and on the screen, each with a close that closes it`, async ({ page }) => {
      test.setTimeout(400_000);
      await openEditor(page);
      // (an edit, so Your maps keeps the map and shows its tile)
      await fromMenu(page, "Clear everything");
      await expect.poll(() => page.evaluate(() => window.dgmEditor!.info().history.length), { timeout: 30_000 }).toBeGreaterThan(0);
      for (const o of OPENED) {
        await o.open(page);
        const root = page.locator(o.root).first();
        await expect(root, `${o.name} opens`).toBeVisible();
        await check(page, W, H, `${o.name}, at its top`);
        if (o.body) {
          await page.locator(o.body).first().evaluate((e) => (e.scrollTop = e.scrollHeight));
          await check(page, W, H, `${o.name}, at its foot`);
        }
        if (o.name === "Your maps") {
          // a map's ⋯: what the right-click gives on a desktop
          await expect(page.locator(".ym-more").first()).toBeVisible({ timeout: 30_000 });
          await page.locator(".ym-more").first().tap();
          await expect(page.getByRole("menu", { name: "Map" })).toBeVisible();
          await check(page, W, H, "a map's ⋯ menu");
          await page.locator(".phone-page-title").tap();
          await expect(page.getByRole("menu", { name: "Map" })).toBeHidden();
        }
        const close = o.close(page).first();
        await expect(close, `${o.name}: its close shows`).toBeVisible();
        const b = (await close.boundingBox())!;
        expect(b.x >= 0 && b.y >= 0 && b.x + b.width <= W && b.y + b.height <= H, `${o.name}: its close on the screen`).toBe(true);
        await close.tap();
        await expect(root, `${o.name} closes`).toBeHidden();
      }
    });

    test(`at ${W}×${H}: Save to Timberborn hands the map's file to the share sheet`, async ({ page }) => {
      test.setTimeout(300_000);
      // (a phone's browser: no folder to save into; a share sheet that takes files, stood in for here)
      await page.addInitScript(() => {
        delete (window as { showDirectoryPicker?: unknown }).showDirectoryPicker;
        const w = window as unknown as { shared: { name: string; size: number }[] };
        w.shared = [];
        Object.defineProperty(navigator, "canShare", { configurable: true, value: (d: { files?: File[] }) => !!d.files?.length });
        Object.defineProperty(navigator, "share", { configurable: true, value: async (d: { files: File[] }) => void w.shared.push(...d.files.map((f) => ({ name: f.name, size: f.size }))) });
      });
      await openEditor(page);
      await page.locator(".save-button").tap();
      await expect.poll(() => page.evaluate(() => (window as unknown as { shared: { name: string; size: number }[] }).shared), { timeout: 120_000 }).toHaveLength(1);
      const [file] = await page.evaluate(() => (window as unknown as { shared: { name: string; size: number }[] }).shared);
      expect(file.name).toMatch(/\.timber$/);
      expect(file.size).toBeGreaterThan(1000);
      await expect(page.locator(".editor-message")).toContainText(`Sent ${file.name}.`);
    });
  });
}
