// The clipping net, in a file of its own (out of layout.spec.ts, 2026-10-27): its ten cases are the slowest of the
// browser specs on CI's software drawing, and the shards are split by test count in file order, so beside layout.spec
// and look-high.spec they took one shard past its 30 minutes. Its tests stand alone and run in parallel.

import { expect, test, type Page } from "@playwright/test";
import { openLayoutMap as openEditor, settle } from "./helpers";

test.describe.configure({ mode: "parallel" });

// The clipping net (Kyler, 2026-10-15): at each supported width, in light and dark, across the main states, no visible
// text spills out of the box that holds it (a label, a cell, a plate, a menu item, a shelf row, a panel's words): the
// words never reach more than a pixel past the box's padding edges, which is what scrollWidth over clientWidth would say,
// measured on the words alone so an invisible hit area or a turning dial doesn't count. A word that spills out, or is cut
// short, fails here, with its state and where it stands.
const NET_SIZES: [number, number][] = [[1280, 800], [1366, 768], [1600, 900], [1920, 1080], [2560, 1440]];

/** The visible text in the page that is wider than its own box, each as "state: where "its words" scrollWidth > clientWidth". */
async function clippedText(page: Page, state: string): Promise<string[]> {
  return page.evaluate((state) => {
    const TEXTY = "button, [role=button], [role=menuitem], [role=checkbox], label, a, summary, output, li, h1, h2, h3, h4, p, legend, dt, dd, th, td, option";
    const found: { el: Element; line: string }[] = [];
    const where = (e: Element) => {
      const name = (e.getAttribute("aria-label") || e.textContent || "").trim().replace(/\s+/g, " ").slice(0, 28);
      const cls = [...e.classList].slice(0, 2).join(".");
      return `${e.tagName.toLowerCase()}${cls ? `.${cls}` : ""} "${name}"`;
    };
    for (const e of document.body.querySelectorAll("*")) {
      const el = e as HTMLElement;
      if (el.closest("[aria-hidden=true], .visually-hidden, script, style, svg, canvas")) continue;
      const own = [...el.childNodes].some((n) => n.nodeType === 3 && (n.textContent ?? "").trim() !== "");
      if (!own && !el.matches(TEXTY)) continue;
      if (!el.textContent?.trim()) continue;
      if (!el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true } as never)) continue;
      if (el.clientWidth === 0) continue;
      const r = el.getBoundingClientRect();
      if (r.right < 0 || r.bottom < 0 || r.left > innerWidth || r.top > innerHeight) continue;
      // (what the words themselves cover, against the box's padding edges: not an invisible hit area, nor a dial that turns)
      const range = document.createRange();
      range.selectNodeContents(el);
      const w = range.getBoundingClientRect();
      if (w.width === 0) continue;
      const left = r.left + el.clientLeft;
      const right = left + el.clientWidth;
      const spill = Math.max(w.right - right, left - w.left);
      if (spill > 1 && !el.querySelector("[style*=rotate]")) found.push({ el, line: `${state}: ${where(el)} spills ${Math.round(spill * 10) / 10}px past its box (words ${Math.round(w.width)}px, box ${el.clientWidth}px)` });
    }
    // (a button and the span inside it spill together: report the innermost)
    return found.filter((f) => !found.some((g) => g !== f && f.el.contains(g.el))).map((f) => f.line);
  }, state);
}

for (const scheme of ["light", "dark"] as const) {
  for (const [w, h] of NET_SIZES) {
    test(`no visible text is clipped at ${w}×${h}, ${scheme}: at rest, a tool, a force, Select's rows, the menus, the shelf and the panels`, async ({ page }) => {
      test.setTimeout(300_000);
      // (the net covers what a GPU shows, the Look menu among it: a browser that draws in software, as CI's does, has no
      // Look button, so the page is told it has a GPU; the Standard look stays held by the config's storage)
      await page.addInitScript(() => {
        (window as unknown as { dgmLookTest: unknown }).dgmLookTest = { gpu: true };
      });
      await page.emulateMedia({ colorScheme: scheme });
      await page.setViewportSize({ width: w, height: h });
      await openEditor(page);
      const bad: string[] = [];
      const look = async (state: string) => {
        await settle(page, w, h);
        bad.push(...(await clippedText(page, state)));
      };
      const bar = page.locator(".tool-bar");
      const header = page.locator("header.editor-bar");
      await look("at rest");
      for (const tool of ["Raise", "Carve", "Rift", "Quake", "Deposit"]) {
        await bar.getByRole("button", { name: new RegExp(`^${tool}`) }).click();
        await look(`${tool} picked`);
        await page.keyboard.press("Escape");
      }
      // Select's rows, with a box marked
      await bar.getByRole("button", { name: /^Select/ }).click();
      const a = await page.evaluate(() => window.dgmEditor!.tileToClient(30, 30));
      const b = await page.evaluate(() => window.dgmEditor!.tileToClient(52, 48));
      await page.mouse.move(a.x, a.y);
      await page.mouse.down();
      await page.mouse.move(b.x, b.y, { steps: 5 });
      await page.mouse.up();
      await page.evaluate(() => window.dgmEditor!.idle());
      await look("Select with a box");
      await page.keyboard.press("Escape");
      // the menus
      await header.getByRole("button", { name: "File", exact: true }).click();
      await look("the File menu");
      await page.keyboard.press("Escape");
      await header.getByRole("button", { name: /^Look/ }).click();
      await look("the Look menu");
      await page.keyboard.press("Escape");
      // the shelf, scrolled to its foot, and an object picked with its window
      await page.locator(".objects-menu").evaluate((e) => (e.scrollTop = e.scrollHeight));
      await look("the shelf's foot");
      await page.locator(".objects-menu").evaluate((e) => (e.scrollTop = 0));
      await page.locator(".objects-menu .shelf-item", { hasText: "Water source" }).first().click();
      await look("an object picked");
      await page.keyboard.press("Escape");
      // the panels
      for (const panel of ["Map Generator", "Your maps", "History"]) {
        await header.getByRole("button", { name: panel, exact: true }).click();
        await look(panel);
        if (panel === "Map Generator") {
          // Showcase mode's sheet over the settings (D488 (2)), Esc closing it
          const gen = page.locator('aside[aria-label="Map Generator"]');
          await gen.getByRole("button", { name: "Showcase…" }).click();
          await expect(gen.getByRole("region", { name: "Showcase" })).toBeVisible();
          await look("the Showcase sheet");
          await page.keyboard.press("Escape");
          await expect(gen.getByRole("region", { name: "Showcase" })).toBeHidden();
        }
        await header.getByRole("button", { name: panel, exact: true }).click();
      }
      expect(bad, "text wider than its box").toEqual([]);
    });
  }
}
