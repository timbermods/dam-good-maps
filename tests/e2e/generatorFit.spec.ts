// The map generator's panel fits the room it has (D330: every setting at once, nothing scrolling), Enter in it is Generate,
// Esc closes it, and its Name box names the next map. The panel takes one of four shapes (src/editor/generator/panelFit.ts):
// two columns 640px wide where the window is tall (1920×1080 and up), three columns where it is not (1600×900), the same
// tighter, and two tighter where the window is too narrow for three. In a window shorter than the shortest shape that fits
// its width (1280×720) it scrolls inside, with its fade at the foot.

import { expect, test, type Locator, type Page } from "@playwright/test";
import { BEAT_NAMES, BEATS } from "../../src/core/gen/showcaseBeats";
import { SHAPES } from "../../src/editor/generator/panelFit";
import { generateButton, openDrawer, openEditor } from "./open";

const SPEC = "s=4243&z=96&d=n&t=riverValley";

/** Every settings group's name and how many settings it holds (the generator's own list, so one dropped from the panel is
 *  noticed). */
const SETTINGS = 31;

interface Seen {
  cls: string;
  w: number;
  top: number;
  bottom: number;
  natural: number;
  scrolls: boolean;
  /** Settings whose controls are not whole inside the panel's box (cut by it or by its scroll). */
  cut: string[];
  items: number;
  fade: boolean;
}

async function look(panel: Locator): Promise<Seen> {
  return panel.evaluate((aside: HTMLElement) => {
    const r = aside.getBoundingClientRect();
    const cut: string[] = [];
    let items = 0;
    for (const e of aside.querySelectorAll<HTMLElement>(".gen-item")) {
      items++;
      const b = e.getBoundingClientRect();
      if (b.top < r.top - 0.5 || b.bottom > r.bottom + 0.5 || b.left < r.left - 0.5 || b.right > r.right + 0.5) cut.push(e.querySelector(".set-label")?.textContent?.trim() ?? e.textContent!.trim().slice(0, 20));
    }
    return {
      cls: aside.className.replace("gen gen-panel ", "").replace(" blank", ""),
      w: Math.round(r.width),
      top: Math.round(r.top),
      bottom: Math.round(r.bottom),
      natural: aside.scrollHeight + (aside.offsetHeight - aside.clientHeight),
      scrolls: aside.scrollHeight > aside.clientHeight + 1,
      cut,
      items,
      fade: getComputedStyle(aside.querySelector(".gen-more")!).opacity === "1",
    };
  });
}

/** The panel once the band's layout has settled on its shape. */
async function settled(page: Page, panel: Locator): Promise<Seen> {
  let last = "";
  let seen = await look(panel);
  await expect
    .poll(async () => {
      seen = await look(panel);
      const now = JSON.stringify([seen.cls, seen.w, seen.top, seen.bottom]);
      const same = now === last;
      last = now;
      return same;
    })
    .toBe(true);
  return seen;
}

interface Box {
  name: string;
  l: number;
  t: number;
  r: number;
  b: number;
}

/** The panel and the chrome it must stay clear of: the bar's cells, the minimap, the objects' list, the corner's buttons, the band's rows and the open legend. */
const CLEAR = [".gen", ".tool-settings", ".tool-bar", ".editor-view .minimap", ".objects-menu", ".view3d-corner > *", ".show-bar", ".water-bar", ".legend-row", ".legend-panel", ".coords", ".readout"];

async function overlapping(page: Page): Promise<string[]> {
  const boxes = await page.evaluate((pieces) => {
    const out: Box[] = [];
    for (const s of pieces)
      document.querySelectorAll(s).forEach((e, k) => {
        const r = e.getBoundingClientRect();
        if (r.width && r.height && getComputedStyle(e).visibility !== "hidden") out.push({ name: `${s}${k ? `#${k}` : ""}`, l: r.left, t: r.top, r: r.right, b: r.bottom });
      });
    return out;
  }, CLEAR);
  const gen = boxes.filter((b) => b.name === ".gen");
  const bad: string[] = [];
  for (const g of gen)
    for (const o of boxes) {
      if (o === g || o.name === ".gen") continue;
      if (g.l < o.r - 0.5 && o.l < g.r - 0.5 && g.t < o.b - 0.5 && o.t < g.b - 0.5) bad.push(`${g.name} overlaps ${o.name}`);
    }
  return bad;
}

const FITS: [number, number, string][] = [
  [1920, 1080, "c2"],
  [2560, 1440, "c2"],
  [1600, 900, "c3 tight"],
  [1600, 1000, "c3"],
  [1536, 864, "c3 tight"],
  [1440, 900, "c3 tight"],
  [1280, 1100, "c2 tight"],
];

for (const scheme of ["light", "dark"] as const) {
  for (const [w, h, shape] of FITS) {
    test(`the generator panel fits without scrolling at ${w}×${h} (${shape}), ${scheme}: every setting whole, the hints stepping aside, the open legend clear`, async ({ page }) => {
      test.setTimeout(240_000);
      await page.emulateMedia({ colorScheme: scheme });
      await page.setViewportSize({ width: w, height: h });
      // (a newcomer's page: the first-run hints showing)
      await openEditor(page, SPEC);
      await expect(page.getByRole("status", { name: "First steps" })).toBeVisible();
      const panel = await openDrawer(page);
      await expect(page.getByRole("status", { name: "First steps" })).toBeHidden();
      const seen = await settled(page, panel);
      expect(seen.cls, "the shape the room asks for").toBe(shape);
      const s = SHAPES.find((x) => (x.cols === 3 ? "c3" : "c2") + (x.tight ? " tight" : "") === shape)!;
      expect(seen.w).toBe(s.width);
      expect(seen.natural, "no taller than the shape says it is").toBeLessThanOrEqual(s.height);
      expect(seen.scrolls, "nothing scrolls").toBe(false);
      expect(seen.fade, "no fade at the foot: nothing lies below").toBe(false);
      expect(seen.items).toBe(SETTINGS);
      expect(seen.cut, "every setting whole inside the panel").toEqual([]);
      // the settings a newcomer never found are in view
      for (const [group, name] of [["Water", "Waterfalls"], ["Water", "Sources"], ["Hazards", "Badwater"], ["Hazards", "Thorn belts"]] as const) {
        const g = panel.getByRole("region", { name: group, exact: true }).getByRole("group", { name, exact: true });
        const b = (await g.boundingBox())!;
        expect(b.y + b.height, `${name} above the panel's foot`).toBeLessThanOrEqual(seen.bottom);
      }
      await expect(panel.getByText("On this map")).toBeVisible();
      expect(await overlapping(page), "clear of the chrome").toEqual([]);
      // the legend beside it, never over it (ticking it moves nothing)
      const before = await panel.boundingBox();
      await page.getByRole("checkbox", { name: "Legend", exact: true }).click();
      await expect(page.locator(".legend-panel")).toBeVisible();
      await page.waitForTimeout(200);
      expect(await panel.boundingBox()).toEqual(before);
      expect(await overlapping(page), "clear of the chrome, the legend open").toEqual([]);
    });
  }
}

test("in a window shorter than any shape, 1280×720, the panel keeps its place, scrolls inside and its fade says more lies below", async ({ page }) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1280, height: 720 });
  await openEditor(page, SPEC);
  const panel = await openDrawer(page);
  const seen = await settled(page, panel);
  expect(seen.cls).toBe("c2 tight");
  expect(seen.scrolls).toBe(true);
  await expect.poll(() => look(panel).then((s) => s.fade)).toBe(true);
  expect(await overlapping(page)).toEqual([]);
  // (the last setting is a scroll away, and the fade goes at the foot)
  await panel.evaluate((e) => (e.scrollTop = e.scrollHeight));
  await expect.poll(() => look(panel).then((s) => s.fade)).toBe(false);
});

test("Enter anywhere in the panel generates, never Another like this: a Custom size typed and tabbed out of is the size made, and the run keeps it", async ({ page }) => {
  test.setTimeout(300_000);
  await page.setViewportSize({ width: 1600, height: 900 });
  await openEditor(page, SPEC);
  const panel = await openDrawer(page);
  const made = () => page.evaluate(() => window.dgm!.current!()!.made);
  const done = async (n: number) => {
    await page.waitForFunction((n) => (window.dgm!.current!()?.made ?? 0) > n, n, { timeout: 120_000 });
    await expect(generateButton(page)).toBeEnabled({ timeout: 120_000 });
  };

  // Custom, 144 × 112, tabbed out of the last box: the focus is on Another like this, and Enter makes the typed size
  await panel.getByRole("group", { name: "Size", exact: true }).getByRole("button", { name: "Custom" }).click();
  await panel.locator("#size-x").fill("144");
  await page.keyboard.press("Tab");
  await panel.locator("#size-y").fill("112");
  await page.keyboard.press("Tab");
  await expect(panel.getByRole("button", { name: "Another like this" })).toBeFocused();
  let n = await made();
  await page.keyboard.press("Enter");
  await done(n);
  let info = await page.evaluate(() => ({ ...window.dgmEditor!.info() }));
  expect([info.W, info.H], "the size typed, not the open map's").toEqual([144, 112]);
  expect(info.spec?.variation ?? 0, "a new map, not a sibling").toBe(0);
  // the run did not reset the Custom size the player typed
  await expect(panel.locator("#size-x")).toHaveValue("144");
  await expect(panel.locator("#size-y")).toHaveValue("112");

  // Enter in a size box commits it and generates at once
  n = await made();
  await panel.locator("#size-x").fill("128");
  await panel.locator("#size-x").press("Enter");
  await done(n);
  info = await page.evaluate(() => ({ ...window.dgmEditor!.info() }));
  expect([info.W, info.H]).toEqual([128, 112]);

  // Enter in the Name box generates a map with that name; the box is empty again after it
  n = await made();
  const field = panel.locator("#map-name");
  await field.fill("Echo Gorge");
  await field.press("Enter");
  await done(n);
  await expect.poll(() => page.evaluate(() => window.dgmEditor!.info().name), { timeout: 60_000 }).toBe("Echo Gorge");
  await expect(field).toHaveValue("");
  await expect(field).toHaveAttribute("placeholder", "Echo Gorge");
  info = await page.evaluate(() => ({ ...window.dgmEditor!.info() }));
  expect([info.W, info.H], "the size still the one typed").toEqual([128, 112]);

  // Enter on a button that is not Generate generates too (Space presses it)
  n = await made();
  await panel.getByRole("button", { name: "Surprise me" }).focus();
  await page.keyboard.press("Enter");
  await done(n);
  // Esc closes it
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
});

test("Esc closes the panel from the button that opened it, from a field in it, and from nowhere; the Showcase sheet's Esc closes the sheet first", async ({ page }) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1600, height: 900 });
  await openEditor(page, SPEC);
  const header = page.locator("header.editor-bar");
  const opener = header.getByRole("button", { name: "Map Generator", exact: true });
  const panel = page.locator('aside[aria-label="Map Generator"]');

  await opener.click();
  await expect(panel).toBeVisible();
  // (its tooltip says so while it is open, the key as a cap)
  expect(await opener.getAttribute("data-keys")).toBe("Esc");
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
  await expect(opener).toHaveAttribute("aria-pressed", "false");
  expect(await opener.getAttribute("data-keys")).toBeNull();

  await opener.click();
  await panel.locator("#seed").focus();
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();

  await opener.click();
  await panel.getByRole("button", { name: "Showcase…" }).click();
  const sheet = panel.getByRole("region", { name: "Showcase" });
  await expect(sheet).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  await expect(panel).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
});

test("the Name box starts empty with the open map's name in grey, and its tooltip says it names the next map", async ({ page }) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1600, height: 900 });
  await openEditor(page, SPEC);
  const open = await page.evaluate(() => window.dgmEditor!.info().name);
  const panel = await openDrawer(page);
  const field = panel.locator("#map-name");
  await expect(field).toHaveValue("");
  await expect(field).toHaveAttribute("placeholder", open);
  // (the placeholder is grey, the muted colour, not the typed name's ink)
  const colours = await field.evaluate((e) => ({ placeholder: getComputedStyle(e, "::placeholder").color, ink: getComputedStyle(e).color }));
  expect(colours.placeholder).not.toBe(colours.ink);
  expect(await panel.locator(".gen-name").getAttribute("title")).toBe("Names the next map");
  // typing then clearing is no name: Generate keeps the map's own naming
  await field.fill("x");
  await field.fill("");
  await expect(field).toHaveValue("");
  await expect(page.locator(".editor-title .title-button")).toHaveText(open);
});

// Showcase's sheet once a search has filled it (cards made here with the longest words a card holds: the longest beat names,
// a name at the limit, a story of three lines): no beat touches the next or runs to the card's border, and the cards stand whole
// inside the panel, which never scrolls
for (const [w, h] of [[1920, 1080], [1600, 1000], [1600, 900], [1536, 864], [1440, 900]] as const) {
  test(`Showcase's filled sheet at ${w}×${h}: no beat overlaps another or runs into its card, the cards whole in the room`, async ({ page }) => {
    test.setTimeout(240_000);
    await page.setViewportSize({ width: w, height: h });
    await openEditor(page, SPEC);
    const panel = await openDrawer(page);
    await panel.getByRole("button", { name: "Showcase…" }).click();
    await expect(panel.getByRole("region", { name: "Showcase" })).toBeVisible();
    await settled(page, panel);
    await panel.locator(".sc-cards").evaluate(
      (ol, [beats, names]) => {
        const says = "A valley behind a gate: the first drought choice is a long way from the water, and the water 19 tiles' walk away holds.";
        ol.innerHTML = [0, 1, 2]
          .map(
            (k) => `<li class="sc-card" aria-label="${k + 1}. Twin Channel Island Chain"><span class="sc-pic hero" aria-hidden="true"></span><div class="sc-body"><div class="sc-top"><b class="sc-name">Twin Channel Island Chain</b><span class="sc-score">6 of 6 beats</span><button type="button" class="ghost sc-open">Open</button></div><ul class="sc-beats">${beats
              .map((id, i) => `<li class="${i % 2 ? "met" : ""}"><svg width="12" height="12" viewBox="0 0 12 12"><circle cx="6" cy="6" r="3.2" fill="none" stroke="currentColor"/></svg><span>${names[id]}</span></li>`)
              .join("")}</ul><p class="sc-says">${says}</p></div></li>`,
          )
          .join("");
      },
      [[...BEATS], BEAT_NAMES] as const,
    );
    const seen = await panel.evaluate((aside: HTMLElement) => {
      const bad: string[] = [];
      const box = (e: Element) => e.getBoundingClientRect();
      for (const card of aside.querySelectorAll(".sc-card")) {
        const c = box(card);
        const lis = [...card.querySelectorAll(".sc-beats li")];
        lis.forEach((li, i) => {
          const b = box(li);
          const words = li.querySelector("span")!;
          const wr = (() => { const r = document.createRange(); r.selectNodeContents(words); return r.getBoundingClientRect(); })();
          if (wr.right > b.right + 0.5 || words.scrollWidth > words.clientWidth + 0.5) bad.push(`beat "${words.textContent}" wider than its place`);
          if (wr.right > c.right - 8) bad.push(`beat "${words.textContent}" runs to the card's border`);
          for (const o of lis.slice(i + 1)) {
            const r = box(o);
            if (b.left < r.right - 0.5 && r.left < b.right - 0.5 && b.top < r.bottom - 0.5 && r.top < b.bottom - 0.5) bad.push(`beats overlap: ${li.textContent} / ${o.textContent}`);
          }
        });
        const says = card.querySelector(".sc-says")!;
        if (box(says).bottom > c.bottom - 4) bad.push("the story runs out of its card");
        const a = box(aside);
        if (c.bottom > a.bottom - 1) bad.push(`card cut by the panel's foot (${Math.round(c.bottom)} > ${Math.round(a.bottom)})`);
      }
      return { bad, scrolls: aside.scrollHeight > aside.clientHeight + 1, natural: aside.scrollHeight + aside.offsetHeight - aside.clientHeight };
    });
    expect(seen.bad).toEqual([]);
    expect(seen.scrolls, `the filled sheet scrolls (${seen.natural}px)`).toBe(false);
  });
}
