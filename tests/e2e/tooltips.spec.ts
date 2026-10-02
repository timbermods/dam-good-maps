// Every tool and control has an accurate tooltip when hovered (PLAN §20 D351, item B12): every tool and force,
// every option in a settings row and in More, every view toggle, every shelf item, every button in the
// panel and the ⋯ menu says in one plain line what it does, and its key where it has one. This test
// collects the interactive controls from the rendered page, in every state the editor has, and fails
// on any control with no tooltip (its own `title`, or the label or group that holds it).
//
// A tooltip is a short phrase that says what the control is for at a glance, then its key where it has
// one (D351, as amended by D361): no second sentence, no technical detail, about 60 characters at most.
// This test fails on any title in the page that has a second sentence or runs past that. The key sits at
// the end as a small key cap, never in brackets in the middle (D368 (6)): one shared tooltip shows the title
// and the control's `data-keys` (src/ui/Tooltip.tsx); a title with a key in brackets fails, and so does a
// control whose name gives a key its tooltip does not end with.

import { expect, test, type Page } from "@playwright/test";
import { openEditor } from "./open";
import { openEditor } from "./open";

const info = (page: Page) => page.evaluate(() => window.dgmEditor!.info());
const idle = (page: Page) => page.evaluate(() => window.dgmEditor!.idle());
const client = (page: Page, x: number, y: number) => page.evaluate(([a, b]) => window.dgmEditor!.tileToClient(a, b), [x, y] as [number, number]);

/** The visible interactive controls that have no tooltip. */
async function untitled(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const sel = 'button, a[href], input, select, textarea, summary, [role="button"], [role="menuitem"], [role="tab"], [role="checkbox"], [role="switch"]';
    const out: string[] = [];
    const seen = new Set<string>();
    for (const el of Array.from(document.querySelectorAll<HTMLElement>(sel))) {
      const r = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      if ((!r.width && !r.height) || style.visibility === "hidden" || style.display === "none") continue;
      // (the page's own file inputs and the map's canvas are not controls with words)
      if (el.tagName === "INPUT" && (el as HTMLInputElement).type === "file") continue;
      if (el.tagName === "INPUT" && (el as HTMLInputElement).type === "hidden") continue;
      let t: HTMLElement | null = el;
      let title = "";
      while (t && !title) {
        // (the one hovered waits in data-tip-held while its tooltip shows)
        title = (t.getAttribute("title") ?? t.getAttribute("data-tip-held") ?? "").trim();
        t = t.parentElement;
      }
      if (title) continue;
      // (a label's own text names an input; the label's title counts, above)
      const name = (el.getAttribute("aria-label") || el.textContent || (el as HTMLInputElement).value || el.tagName).trim().replace(/\s+/g, " ").slice(0, 50);
      const key = `${el.tagName.toLowerCase()} "${name}"`;
      if (!seen.has(key)) {
        seen.add(key);
        out.push(key);
      }
    }
    return out;
  });
}

/** The longest a tooltip may be, keys included. */
const MAX_TOOLTIP = 60;

/** Every tooltip on the page that breaks the form: a second sentence, too long, a key in brackets, or a key the
 *  control's name gives that its tooltip does not end with (D368 (6)). */
async function wordy(page: Page): Promise<string[]> {
  return page.evaluate((max) => {
    const out: string[] = [];
    const seen = new Set<string>();
    // (a key in brackets: "(7)", "(Ctrl+Z)", "(F, [ and ])", "(X or Esc)", "(R turns it)"; "(48 to 256)" is no key)
    const keyWord = /\b(Ctrl|Shift|Alt|Esc|Space|Delete|Enter|Tab|Up|Down|scroll|click)\b/;
    const bracketedKey = (t: string) => [...t.matchAll(/\(([^)]*)\)/g)].some(([, inner]) => /^\s*\S\s*$/.test(inner) || keyWord.test(inner) || /[[\]{}]/.test(inner) || /(^|\s)[A-Z0-9](,|\s|$)/.test(inner));
    for (const el of Array.from(document.querySelectorAll<HTMLElement>("[title], [data-tip-held]"))) {
      const t = (el.getAttribute("title") ?? el.getAttribute("data-tip-held") ?? "").trim().replace(/\s+/g, " ");
      if (!t) continue;
      // (a second sentence: a full stop, ! or ? then a new capital or bracket; ".timber" and "Ctrl+Z" are not)
      const second = /[.!?][)"']?\s+[A-Z(]/.test(t);
      const bracket = bracketedKey(t);
      // (a control named with its key, "Carve (7)": its tooltip ends with that key's cap)
      const named = /\(([^()]+)\)$/.exec(el.getAttribute("aria-label") ?? "")?.[1];
      const keys = (el.getAttribute("data-keys") ?? "").split("|").map((k) => k.split(" ")[0]);
      const missing = named && !/\s/.test(named) && !keys.includes(named) ? named : null;
      if ((second || bracket || missing || t.length > max) && !seen.has(t)) {
        seen.add(t);
        out.push(`${second ? "second sentence" : bracket ? "a key in brackets" : missing ? `no key cap ${missing} at its end` : `${t.length} characters`}: ${t}`);
      }
    }
    return out;
  }, MAX_TOOLTIP);
}

async function open(page: Page) {
  await page.setViewportSize({ width: 1400, height: 1000 });
  await openEditor(page, "s=9&z=96&d=n&t=riverValley");
  await page.getByRole("button", { name: "Top-down" }).click();
  await page.waitForTimeout(500);
}

test("every control in the editor has a tooltip, in every state", async ({ page }) => {
  test.setTimeout(280_000);
  await open(page);
  const missing: Record<string, string[]> = {};
  const check = async (state: string) => {
    const m = [...(await untitled(page)), ...(await wordy(page))];
    if (m.length) missing[state] = m;
  };
  await check("the editor as it opens");

  // every brush, with its options row
  for (const k of ["1", "2", "3", "4", "5"]) {
    await page.keyboard.press(k);
    await check(`brush ${k}`);
  }
  // Flatten's steps
  const steps = page.getByRole("checkbox", { name: "In steps" });
  await page.keyboard.press("3");
  if (await steps.count()) {
    await steps.check();
    await check("Flatten in steps");
    await steps.uncheck();
  }
  await page.keyboard.press("x");

  // every force, with its More
  for (const k of ["7", "8", "9", "0", "-"]) {
    await page.keyboard.press(k);
    await check(`force ${k}`);
    const open = page.locator('.force-options button:text-is("More")');
    if (await open.count()) {
      await open.first().click();
      await check(`force ${k}, More open`);
      await page.locator('.force-options button:text-is("Less")').first().click();
    }
    await page.keyboard.press("Escape");
  }

  // every shelf item, with its options row
  const shelf = page.getByRole("navigation", { name: "Place" });
  const items = await shelf.getByRole("button").evaluateAll((els) => els.map((e) => (e.getAttribute("aria-label") || e.textContent || "").trim()));
  for (const name of items) {
    await shelf.getByRole("button", { name, exact: true }).click();
    await check(`shelf: ${name}`);
    await page.keyboard.press("Escape");
  }

  // Select, its row and its Delete menu
  await page.keyboard.press("m");
  await page.getByRole("group", { name: "How to select" }).getByRole("button", { name: "Whole map" }).click();
  await check("Select with a selection");
  await page.getByRole("group", { name: "Selection" }).getByRole("button", { name: "Delete", exact: true }).click();
  await page.waitForTimeout(400);
  await check("Select, Delete's menu");
  await page.keyboard.press("x");

  // a source picked (its row), an object picked
  const spot = await page.evaluate(() => {
    const m = window.dgm3d!.renderer.mapState()!;
    const st = (window.dgmEditor!.info().features.find((f) => f.kind === "start")!.params as { position: [number, number] }).position;
    for (let y = 12; y < m.H - 12; y++)
      for (let x = 12; x < m.W - 12; x++) {
        if (Math.hypot(x - st[0], y - st[1]) < 16) continue;
        const h0 = m.heights[y * m.W + x];
        let ok = true;
        for (let dy = -4; dy <= 4 && ok; dy++) for (let dx = -4; dx <= 4 && ok; dx++) if (m.heights[(y + dy) * m.W + x + dx] !== h0 || m.surface.depth[(y + dy) * m.W + x + dx] > 0) ok = false;
        for (let k = 0; k < m.entities.count && ok; k++) if (Math.abs(m.entities.x[k] - x) <= 6 && Math.abs(m.entities.y[k] - y) <= 6) ok = false;
        if (ok) return [x, y] as [number, number];
      }
    return null;
  });
  expect(spot).not.toBeNull();
  const [sx, sy] = spot!;
  await shelf.getByRole("button", { name: "Water source (6)" }).click();
  const p = await client(page, sx, sy);
  await page.mouse.move(p.x + 3, p.y);
  await page.mouse.click(p.x, p.y);
  await idle(page);
  await page.keyboard.press("x");
  await page.mouse.click(p.x, p.y);
  await page.waitForTimeout(300);
  await check("a source picked");
  await page.keyboard.press("x");
  await shelf.getByRole("button", { name: "Mine site" }).click();
  const q = await client(page, sx + 10, sy);
  await page.mouse.move(q.x + 3, q.y);
  await page.mouse.click(q.x, q.y);
  await idle(page);
  await page.keyboard.press("x");
  await page.mouse.click(q.x, q.y);
  await page.waitForTimeout(300);
  await check("an object picked");
  await page.keyboard.press("x");

  // the header's menu, the history, the checks dot, the minimap and the water bar
  await page.getByRole("button", { name: "More", exact: true }).click();
  await check("the ⋯ menu");
  await page.getByRole("menuitem", { name: /^History/ }).click();
  await check("the history");
  await page.getByRole("button", { name: "More", exact: true }).click();
  await page.getByRole("menuitem", { name: /^History/ }).click();
  await page.getByRole("button", { name: /^Checks:/ }).click();
  await check("the checks list");
  await page.getByRole("button", { name: /^Checks:/ }).click();
  await page.getByRole("button", { name: "Minimap" }).click();
  await check("the minimap");
  await page.getByRole("button", { name: "Badwater", exact: true }).click();
  await check("the badwater layer");

  expect(missing, "controls with no tooltip, or a tooltip that is not one short phrase, by state").toEqual({});
  expect((await info(page)).W).toBeGreaterThan(0);
});

test("every control in the panel and in each settings sheet has a tooltip", async ({ page }) => {
  test.setTimeout(200_000);
  await page.setViewportSize({ width: 1400, height: 1000 });
  await openEditor(page, "s=9&z=96&d=n&t=riverValley");
  const missing: Record<string, string[]> = {};
  const check = async (state: string) => {
    const m = [...(await untitled(page)), ...(await wordy(page))];
    if (m.length) missing[state] = m;
  };
  await check("the panel");
  // each section's sheet, with every field it holds
  for (const section of ["Terrain", "Water", "Hazards", "Resources", "Advanced: start rules", "Limits for this size"]) {
    await page.getByRole("button", { name: section, exact: true }).click();
    await expect(page.getByRole("dialog", { name: `${section} settings` })).toBeVisible();
    await check(`the ${section} sheet`);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
  }
  // the collapsed panel's strip
  await page.getByRole("button", { name: "Collapse the panel" }).click();
  await check("the collapsed panel");
  await page.getByRole("button", { name: "Open the panel" }).click();
  expect(missing, "controls with no tooltip, by state").toEqual({});
});

test("D368 (6): the shortcut sits at the end of the tooltip as a small key cap, in the one shared tooltip", async ({ page }) => {
  test.setTimeout(200_000);
  await open(page);
  const tip = page.locator(".tip");
  /** The tooltip of a control, hovered: its words and its key caps, in order, and whether its own title waits. */
  const tooltipOf = async (loc: ReturnType<Page["locator"]>) => {
    await page.mouse.move(5, 500);
    await expect(tip).toHaveCount(0);
    await loc.hover();
    await expect(tip).toBeVisible();
    return {
      text: (await tip.locator(".tip-text").textContent())?.trim(),
      caps: await tip.locator("kbd").allTextContents(),
      // (the key caps come last: nothing after the last one but its words)
      last: await tip.evaluate((el) => el.lastElementChild?.className ?? ""),
      native: await loc.getAttribute("title"),
    };
  };
  const tools = page.getByRole("toolbar", { name: "Tools" });
  const forces = page.getByRole("group", { name: "Forces" });
  // Kyler's two: "Carve a river" then 7, "Smooth bumps and steps" then 4
  expect(await tooltipOf(forces.getByRole("button", { name: "Carve (7)" }))).toEqual({ text: "Carve a river", caps: ["7"], last: "tip-key", native: null });
  expect(await tooltipOf(tools.getByRole("button", { name: "Smooth brush (4)" }))).toEqual({ text: "Smooth bumps and steps", caps: ["4"], last: "tip-key", native: null });
  // a few more, keys of every kind: a force's own, a shelf item's with R's turn, the header's, a size's
  expect((await tooltipOf(forces.getByRole("button", { name: "Glaciate (-)" }))).caps).toEqual(["-"]);
  const shelf = page.getByRole("navigation", { name: "Place" });
  expect(await tooltipOf(shelf.getByRole("button", { name: "Water source (6)" }))).toMatchObject({ text: "Where water starts", caps: ["6"] });
  expect(await tooltipOf(page.getByRole("toolbar", { name: "Edit" }).getByRole("button", { name: "Undo (Ctrl+Z)" }))).toMatchObject({ text: "Undo", caps: ["Z", "Ctrl+Z"] });
  await page.keyboard.press("7");
  const size = page.getByRole("group", { name: "Carve options" }).locator(".size-control .slider-field");
  expect(await tooltipOf(size)).toMatchObject({ text: "How wide it cuts", caps: ["F", "{", "}"] });
  const power = page.getByRole("group", { name: "Carve options" }).locator(".slider-field").filter({ hasText: "Power" });
  expect(await tooltipOf(power)).toMatchObject({ text: "How hard it cuts", caps: ["F+scroll", "[", "]"] });
  // a control with no key: its words alone, no cap
  expect(await tooltipOf(page.getByRole("button", { name: "Reset view" }))).toMatchObject({ text: "Frame the whole map again", caps: [] });
  // the pointer gone: no tooltip, and the control's own title back
  await page.mouse.move(5, 500);
  await expect(tip).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Reset view" })).toHaveAttribute("title", "Frame the whole map again");
});
