// The rest of the page on a phone (#1074 slice 4; EDITOR_PLAN §3, "Phones"): every page the menu opens (Map Generator,
// Real places, Your maps, History) and every dialog and panel (Help and keys, About, New blank map, Description,
// Together, the time-lapse, the checks), upright at 393×852 and on its side at 852×393, three device pixels to a CSS
// pixel and a touch screen. Each: no control under 44px, none off the screen (a page scrolls inside itself, read at its
// top and its foot), fields 16px, the page itself neither zoomed nor scrolled, and a plain close on the screen that
// closes it, and no word cut short (no ellipsis, no clipped label). Save to Timberborn hands the map's file to the share
// sheet where the browser has one for files. The second pass: Generate the page's one green button at its foot, Keep quiet
// beside the seed; History's rows the page's width; two cards a row upright; Help to a finger, the gestures first; the map
// being made centred; a long press in Your maps selecting as Ctrl+click does.

import { expect, test, type Locator, type Page } from "@playwright/test";
import { openLayoutMap as openEditor } from "./helpers";
import { phoneClipped, phoneControls } from "./phone";

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
  expect(await phoneClipped(page), `${state}: words cut short`).toEqual([]);
}

/** A finger held on `target` past a long press (Playwright has no long press for touch: the browser's own touch events). */
async function longPress(page: Page, target: Locator) {
  const b = (await target.boundingBox())!;
  const at = { x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height * 0.6) };
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [at] });
  await page.waitForTimeout(800);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await cdp.detach();
}

/** The buttons under `within` filled in the accent (a primary button's green), not counting a pressed choice, by their words. */
async function greenButtons(page: Page, within: string) {
  return page.locator(within).evaluate((root) => {
    const probe = document.createElement("span");
    probe.style.color = "var(--accent)";
    document.body.appendChild(probe);
    const accent = getComputedStyle(probe).color;
    probe.remove();
    return [...root.querySelectorAll("button")]
      .filter((b) => b.checkVisibility() && getComputedStyle(b).backgroundColor === accent && b.getAttribute("aria-pressed") === null)
      .map((b) => b.textContent!.trim());
  });
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

    test(`at ${W}×${H}: Generate at the page's foot, the lists the page's width, Help to a finger, the map being made centred`, async ({ page }) => {
      test.setTimeout(400_000);
      await openEditor(page);
      // Generate: the one green button, fixed at the page's foot whatever is scrolled; Keep quiet beside the seed
      await fromMenu(page, "Map Generator");
      const gen = page.locator(".phone-page .gen button[type=submit]");
      const body = page.locator(".phone-page-body");
      const atFoot = async () => {
        const b = (await gen.boundingBox())!;
        expect(Math.abs(b.y + b.height - (H - 10)), "Generate stands 10px above the screen's foot").toBeLessThan(1.5);
        expect(b.width, "Generate is the page's width").toBeGreaterThan(W - 30);
        const bb = (await body.boundingBox())!;
        expect(bb.y + bb.height, "the settings end above it").toBeLessThanOrEqual(b.y - 9);
      };
      await atFoot();
      await body.evaluate((e) => (e.scrollTop = e.scrollHeight));
      await atFoot();
      await body.evaluate((e) => (e.scrollTop = 0));
      const keep = page.locator(".phone-page .seed .set-toggle");
      for (const pressed of ["false", "true"]) {
        if ((await keep.getAttribute("aria-pressed")) !== pressed) await keep.tap();
        await expect(keep).toHaveAttribute("aria-pressed", pressed);
        expect(await greenButtons(page, ".phone-page"), `Keep ${pressed === "true" ? "held" : "free"}: the one green button`).toEqual(["Generate"]);
        const k = (await keep.boundingBox())!;
        const s = (await page.locator(".phone-page .seed .set-text").boundingBox())!;
        expect(Math.abs(k.y + k.height / 2 - (s.y + s.height / 2)), "Keep beside the seed").toBeLessThan(1.5);
        expect(k.x).toBeGreaterThan(s.x + s.width);
      }
      // the map being made: centred on the screen, all of it in view
      await gen.tap();
      const making = page.locator(".making-dialog");
      await expect(making).toBeVisible();
      const m = (await making.boundingBox())!;
      expect(Math.abs(m.x + m.width / 2 - W / 2), "the map being made: centred across").toBeLessThan(1.5);
      expect(Math.abs(m.y + m.height / 2 - H / 2), "the map being made: centred up and down").toBeLessThan(1.5);
      expect(m.y >= 0 && m.y + m.height <= H && m.x >= 0 && m.x + m.width <= W).toBe(true);
      expect(await phoneClipped(page), "the map being made: words cut short").toEqual([]);
      await expect(making).toBeHidden({ timeout: 120_000 });
      // History: each step a row the page's width, its whole label; Keep this version (a second map in Your maps)
      await fromMenu(page, "Clear everything");
      await expect.poll(() => page.evaluate(() => window.dgmEditor!.info().history.length), { timeout: 30_000 }).toBeGreaterThan(0);
      await fromMenu(page, "History");
      const rows = page.locator(".history-panel .hist-row");
      await expect(rows).toHaveCount(2);
      const width = await page.locator(".history-panel .hist-steps").evaluate((e) => e.getBoundingClientRect().width);
      for (const r of await rows.all()) expect(Math.abs((await r.boundingBox())!.width - width), "a step's row is the list's width").toBeLessThan(1);
      await page.locator(".history-panel .hist-act:visible", { hasText: "Keep this version" }).tap();
      await page.locator(".phone-back").tap();
      // Real places and Your maps: two cards a row upright, four on its side
      const perRow = W < 600 ? 2 : 4;
      for (const [entry, tile] of [["Real places", ".real-places li"], ["Your maps", ".your-maps li[data-id]"]] as const) {
        await fromMenu(page, entry);
        const tiles = page.locator(tile);
        await expect.poll(() => tiles.count(), { timeout: 30_000 }).toBeGreaterThanOrEqual(2);
        const boxes = await tiles.evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).map((r) => ({ y: r.y, w: r.width })));
        const first = boxes.filter((b) => Math.abs(b.y - boxes[0].y) < 1);
        const room = await page.locator(".phone-page-body").evaluate((e) => e.clientWidth);
        expect(first.length, `${entry}: cards in the first row`).toBe(Math.min(perRow, boxes.length));
        expect(boxes[0].w, `${entry}: a card's share of the row`).toBeGreaterThan(room / perRow - 20);
        await page.locator(".phone-back").tap();
      }
      // Help to a finger: the gestures first; on a phone, no mouse and no key
      await fromMenu(page, "Help and keys");
      const help = page.locator(".help-dialog");
      await expect(help.locator("h3").first()).toHaveText("Controls");
      for (const words of ["Pinch to zoom", "Double tap to zoom in where you tap. On an object, the first tap also selects it.", "Tap with two fingers to undo, with three to redo.", "hold a map to select several"]) await expect(help).toContainText(words);
      await expect(help).not.toContainText(/mouse|Middle-drag|scroll zooms|Keyboard shortcuts|click/i);
      await help.locator("footer").getByRole("button", { name: "Close" }).tap();
    });

    test(`at ${W}×${H}: a long press in Your maps selects as Ctrl+click does, and Delete still asks`, async ({ page }) => {
      test.setTimeout(400_000);
      await openEditor(page);
      await fromMenu(page, "Clear everything");
      await expect.poll(() => page.evaluate(() => window.dgmEditor!.info().history.length), { timeout: 30_000 }).toBeGreaterThan(0);
      await fromMenu(page, "History");
      await page.locator(".history-panel .hist-act:visible", { hasText: "Keep this version" }).tap();
      await page.locator(".phone-back").tap();
      await fromMenu(page, "Your maps");
      const tiles = page.locator(".your-maps li[data-id]");
      await expect(tiles).toHaveCount(2, { timeout: 30_000 });
      const open = await page.evaluate(() => window.dgmEditor!.info().name);
      // the other map (not the open one) held: it alone selected, no tooltip, no menu, nothing opened
      const other = page.locator(".your-maps li[data-id]:not(:has(.ym-tile[aria-current=true]))");
      await longPress(page, other.locator(".ym-tile"));
      await expect(other).toHaveClass(/selected/);
      await expect(page.locator(".your-maps li.selected")).toHaveCount(1);
      await expect(page.locator("[role=tooltip]")).toHaveCount(0);
      await expect(page.locator(".your-maps .ym-title")).toHaveText("1 selected");
      await expect(page.getByRole("menu", { name: "Map" })).toBeHidden();
      // a tap now adds a map (as Ctrl+click), opening none; a second tap takes it out again
      const here = page.locator(".your-maps li[data-id]:has(.ym-tile[aria-current=true])");
      await here.locator(".ym-tile").tap();
      await expect(page.locator(".your-maps li.selected")).toHaveCount(2);
      await expect(page.locator(".your-maps .ym-title")).toHaveText("2 selected");
      expect(await page.evaluate(() => window.dgmEditor!.info().name)).toBe(open);
      await check(page, W, H, "Your maps, two selected");
      // Delete asks first, as on a desktop; Cancel keeps both
      await page.locator(".maps-panel .ym-act", { hasText: "Delete" }).tap();
      const ask = page.getByRole("alertdialog");
      await expect(ask).toContainText("Delete 2 maps?");
      await ask.getByRole("button", { name: "Cancel" }).tap();
      await expect(tiles).toHaveCount(2);
      await here.locator(".ym-tile").tap();
      await expect(page.locator(".your-maps li.selected")).toHaveCount(1);
      // Done ends it: nothing selected, and a tap opens a map again
      await page.locator(".maps-panel .ym-done").tap();
      await expect(page.locator(".your-maps li.selected")).toHaveCount(0);
      await expect(page.locator(".maps-panel .ym-done")).toHaveCount(0);
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
