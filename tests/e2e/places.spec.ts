// Real places (ROADMAP "Real places", PLAN §20 D136): the gallery loads, its filters work, a card's
// Download is Node's file byte for byte, Refine opens the map in the editor, and the page works on
// a phone. Screenshots go to .scratch/places/.

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { decodePlaceFile, placeTimber, type PlaceIndex, type PlaceIndexEntry } from "../../src/core/places/place";

const DIR = "public/real-places";
const INDEX = JSON.parse(readFileSync(`${DIR}/index.json`, "utf8")) as PlaceIndex;
const sha256 = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
const entry = (id: string) => INDEX.places.find((p) => p.id === id)!;
/** Node's .timber of a place. */
const node = (e: PlaceIndexEntry) => placeTimber(decodePlaceFile(new Uint8Array(readFileSync(`${DIR}/${e.data}`))));
/** The smallest map, for the flows that build one. */
const SMALL = INDEX.places.find((p) => p.size === 96)!;

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`page error: ${e.message}`));
  page.on("console", (m) => m.type() === "error" && !/favicon/.test(m.text()) && errors.push(`console error: ${m.text()}`));
  return errors;
}

test.beforeAll(() => mkdirSync(".scratch/places", { recursive: true }));

test("the gallery lists every place, filters them and downloads Node's file", async ({ page }) => {
  const errors = watchErrors(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("./real-places/");
  await expect(page).toHaveTitle("Real places · Dam Good Maps");
  await expect(page.getByRole("heading", { level: 1, name: "Real places" })).toBeVisible();
  await expect(page.getByText("Each map is inspired by the land near its namesake, at Timberborn's scale. It is not a replica.")).toBeVisible();
  const cards = page.getByRole("list", { name: "Maps" }).getByRole("listitem");
  await expect(cards).toHaveCount(INDEX.count);
  await expect(page.getByRole("status").filter({ hasText: /maps$/ })).toHaveText(`${INDEX.count} maps`);

  // the credits ATTRIBUTION.md asks for
  const credits = page.locator("#credits");
  await expect(credits.getByRole("heading", { name: "Elevation data" })).toBeVisible();
  await expect(credits).toContainText("Terrain Tiles");
  await expect(credits).toContainText("do not endorse");
  await expect(credits).toContainText("courtesy of the U.S. Geological Survey");
  await expect(credits).toContainText("© Kartverket");

  // each card: our render, the name, landform, size, scale and how it plays
  const first = cards.first();
  const p0 = INDEX.places[0];
  await expect(first.getByRole("heading", { name: p0.name })).toBeVisible();
  await expect(first).toContainText(`${p0.familyName} · ${p0.size}×${p0.size} · ${p0.metres} m per tile`);
  await expect(first).toContainText(p0.plays);
  await expect(first.getByRole("img")).toHaveJSProperty("naturalWidth", 240);
  await page.screenshot({ path: ".scratch/places/desktop.png" });

  // filters: a landform, then a size; the query keeps them
  const canyons = INDEX.places.filter((p) => p.family === "canyon");
  await page.getByLabel("Landform").selectOption("canyon");
  await expect(cards).toHaveCount(canyons.length);
  await expect(page.getByText(`${canyons.length} of ${INDEX.count} maps`)).toBeVisible();
  for (const p of canyons) await expect(page.getByRole("heading", { name: p.name })).toBeVisible();
  await page.getByRole("button", { name: "256×256" }).click();
  const big = canyons.filter((p) => p.size === 256);
  await expect(cards).toHaveCount(big.length);
  await expect(page).toHaveURL(/\/real-places\/\?family=canyon&size=256$/);
  await page.reload();
  await expect(cards).toHaveCount(big.length);
  await expect(page.getByLabel("Landform")).toHaveValue("canyon");
  await page.getByRole("button", { name: "All sizes" }).click();
  await page.getByLabel("Landform").selectOption("");
  await expect(cards).toHaveCount(INDEX.count);
  await page.getByRole("button", { name: "96×96" }).click();
  await expect(cards).toHaveCount(INDEX.places.filter((p) => p.size === 96).length);

  // Download: the place's .timber, named after it, byte for byte Node's and the index's
  const expected = node(SMALL);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: `Download ${SMALL.name}` }).click();
  const d = await download;
  expect(d.suggestedFilename()).toBe(`${SMALL.name}.timber`);
  const bytes = new Uint8Array(readFileSync(await d.path()));
  expect(sha256(bytes)).toBe(sha256(expected.bytes));
  expect(sha256(bytes)).toBe(SMALL.sha256);
  await expect(page.getByRole("button", { name: `Download ${SMALL.name}` })).toHaveText("Download");
  expect(errors).toEqual([]);
});

test("Node and Chromium build the same file for a place of each size", async ({ page }) => {
  await page.goto("./real-places/");
  await page.waitForFunction(() => "dgmPlaces" in window);
  for (const size of INDEX.sizes) {
    const e = INDEX.places.filter((p) => p.size === size).at(-1)!;
    const web = await page.evaluate((id) => window.dgmPlaces!.build(id), e.id);
    const n = node(e);
    expect(web.fileName, e.id).toBe(`${e.name}.timber`);
    expect(web.bytes, e.id).toBe(n.bytes.length);
    expect(web.sha256, e.id).toBe(sha256(n.bytes));
    expect(web.sha256, e.id).toBe(e.sha256);
  }
});

test("Refine opens the place in the editor, and it exports unchanged as the same file", async ({ page }) => {
  const errors = watchErrors(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("./real-places/");
  await page.getByRole("link", { name: `Refine ${SMALL.name} in the editor` }).click();
  await page.waitForFunction(() => !!window.dgmEditor && !!window.dgm3d, null, { timeout: 120_000 });
  const info = await page.evaluate(() => window.dgmEditor!.info());
  expect(info.kind).toBe("import");
  expect(info.name).toBe(SMALL.name);
  expect([info.W, info.H]).toEqual([SMALL.size, SMALL.size]);
  expect(new URL(page.url()).hash).toBe("#edit");

  // the menu's Download .timber (the primary button saves into Timberborn's folder)
  const download = page.waitForEvent("download", { timeout: 120_000 });
  await page.getByRole("button", { name: "More", exact: true }).click();
  await page.getByRole("menuitem", { name: "Download .timber" }).click();
  const d = await download;
  expect(d.suggestedFilename()).toBe(`${SMALL.name}.timber`);
  expect(sha256(new Uint8Array(readFileSync(await d.path())))).toBe(SMALL.sha256);
  expect(errors).toEqual([]);
});

test("the generator links to the gallery, and a place never replaces a saved map unasked", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("./#s=1&z=96&d=n&t=riverValley");
  await expect(page.getByText(/checks passed|checks failed/)).toBeVisible({ timeout: 60_000 });
  // a map in the editor, autosaved
  await page.getByRole("button", { name: "Refine this map" }).click();
  await page.waitForFunction(() => !!window.dgmEditor, null, { timeout: 120_000 });
  await expect(page.getByText("saved in this browser")).toBeVisible({ timeout: 30_000 });
  await page.goto("./");
  await page.getByRole("link", { name: "Real places" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Real places" })).toBeVisible();

  // Refine asks first; Cancel keeps the saved map
  await page.getByRole("link", { name: `Refine ${SMALL.name} in the editor` }).click();
  const ask = page.getByRole("alertdialog");
  await expect(ask).toContainText("Opening this real place replaces River Valley, which is saved in this browser.");
  await expect(ask.getByRole("button", { name: "Save project file" })).toBeVisible();
  await ask.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByText("Continue editing")).toBeVisible();
  await expect(page.getByText(/checks passed|checks failed/)).toBeVisible({ timeout: 60_000 });

  // asked again and accepted: the place opens
  await page.goto("./real-places/");
  await page.getByRole("link", { name: `Refine ${SMALL.name} in the editor` }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Open the real place" }).click();
  await page.waitForFunction(() => window.dgmEditor?.info().kind === "import", null, { timeout: 120_000 });
  expect(await page.evaluate(() => window.dgmEditor!.info().name)).toBe(SMALL.name);
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });

  test("the gallery fits the screen, filters and offers both actions", async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto("./real-places/");
    const cards = page.getByRole("list", { name: "Maps" }).getByRole("listitem");
    await expect(cards).toHaveCount(INDEX.count);
    await expect(page.getByText("It is not a replica.")).toBeVisible();
    // nothing wider than the screen
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    // one card a row, its picture beside the text
    const [a, b] = [await cards.nth(0).boundingBox(), await cards.nth(1).boundingBox()];
    expect(b!.y).toBeGreaterThan(a!.y + a!.height - 1);
    expect(a!.width).toBeLessThanOrEqual(375);
    await page.screenshot({ path: ".scratch/places/phone.png" });

    await page.getByRole("button", { name: "128×128" }).tap();
    await expect(cards).toHaveCount(INDEX.places.filter((p) => p.size === 128).length);
    await page.getByLabel("Landform").selectOption("fjord");
    const fjords = INDEX.places.filter((p) => p.size === 128 && p.family === "fjord");
    await expect(cards).toHaveCount(fjords.length);
    const card = cards.first();
    await expect(card.getByRole("button", { name: `Download ${fjords[0].name}` })).toBeVisible();
    await expect(card.getByRole("link", { name: `Refine ${fjords[0].name} in the editor` })).toBeVisible();
    await page.screenshot({ path: ".scratch/places/phone-filtered.png" });

    // a download from the phone layout
    await page.getByRole("button", { name: "All sizes" }).tap();
    await page.getByLabel("Landform").selectOption("");
    await page.getByRole("button", { name: "96×96" }).tap();
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: `Download ${SMALL.name}` }).tap();
    expect(sha256(new Uint8Array(readFileSync(await (await download).path())))).toBe(SMALL.sha256);
    await page.screenshot({ path: ".scratch/places/phone-top.png", fullPage: false });
    expect(errors).toEqual([]);
  });
});

test("an unknown place says so and shows the generator", async ({ page }) => {
  await page.goto("./#place=near-nowhere");
  await expect(page.getByRole("alert")).toContainText('there is no real place called "near-nowhere"', { timeout: 60_000 });
  await expect(page.getByText(/checks passed|checks failed/)).toBeVisible({ timeout: 60_000 });
  expect(entry("near-nowhere")).toBeUndefined();
});
