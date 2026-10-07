// Real places (ROADMAP "Real places", PLAN §20 D136): the gallery loads, its filters work, a card's
// Download is Node's file byte for byte, Refine opens the map in the editor, and the page works on
// a phone. With DGM_CAPTURES=1 its screenshots go to .scratch/places/ for a look by eye; they are never
// a check, so a busy machine that cannot take one (CI's software drawing beside another shard's 3D) never
// fails a test (D341).

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { openEditor, openFileMenu, openYourMaps, waitForEditor } from "./open";
import { namedFile } from "../../src/core/gen/pack";
import { decodePlaceFile, galleryIndex, placeTimber, type PlaceIndex, type PlaceIndexEntry } from "../../src/core/places/place";

const DIR = "public/real-places";
/** The index as the gallery page lists it: every place (D445). */
const INDEX = galleryIndex(JSON.parse(readFileSync(`${DIR}/index.json`, "utf8")) as PlaceIndex);
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

const CAPTURES = !!process.env.DGM_CAPTURES;
test.beforeAll(() => void (CAPTURES && mkdirSync(".scratch/places", { recursive: true })));

/** A capture for the eye (DGM_CAPTURES=1), never a check. */
const capture = async (page: Page, name: string) => void (CAPTURES && (await page.screenshot({ path: `.scratch/places/${name}.png` })));

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
  await capture(page, "desktop");

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
  expect(d.suggestedFilename()).toBe(namedFile(SMALL.name));
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
    expect(web.fileName, e.id).toBe(namedFile(e.name));
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
  await waitForEditor(page);
  const info = await page.evaluate(() => window.dgmEditor!.info());
  expect(info.kind).toBe("import");
  expect(info.name).toBe(SMALL.name);
  expect([info.W, info.H]).toEqual([SMALL.size, SMALL.size]);
  // (the address keeps the place's own link)
  expect(new URL(page.url()).hash).toBe(`#place=${SMALL.id}`);
  await expect(page.getByRole("heading", { level: 1, name: SMALL.name })).toBeVisible();

  // the File menu's Download .timber (the primary button saves into Timberborn's folder)
  const download = page.waitForEvent("download", { timeout: 120_000 });
  await (await openFileMenu(page)).getByRole("menuitem", { name: "Download .timber" }).click();
  const d = await download;
  expect(d.suggestedFilename()).toBe(namedFile(SMALL.name));
  expect(sha256(new Uint8Array(readFileSync(await d.path())))).toBe(SMALL.sha256);
  expect(errors).toEqual([]);
});

test("a real place replaces the open map without asking, and the replaced map stays in Your maps with its edit", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  // (a generated map's name is its own since M9b, from its standout, D278)
  // a map in the editor, autosaved
  await openEditor(page, "s=1&z=96&d=n&t=riverValley");
  const name = await page.evaluate(() => window.dgmEditor!.info().name);
  await page.getByRole("button", { name: "Top-down" }).click();
  await page.getByRole("button", { name: "Lower brush (3)" }).click();
  const a = await page.evaluate(() => window.dgmEditor!.tileToClient(20, 20));
  const b = await page.evaluate(() => window.dgmEditor!.tileToClient(26, 20));
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 6 });
  await page.mouse.up();
  await page.evaluate(() => window.dgmEditor!.idle());
  await page.keyboard.press("Escape");
  await expect.poll(() => page.evaluate(() => window.dgmEditor!.info().edits)).toBe(1);
  // (the save itself, not a time: the edited map is in Your maps once it is written. Leaving before that,
  // the browser asks first and the test's navigation goes ahead without it; 2.5 s was enough only while
  // seed 1's background search kept the page busy, until 0.8.6, D480)
  await expect((await openYourMaps(page)).locator(".ym-tile")).toHaveCount(1, { timeout: 30_000 });
  await page.goto("./real-places/");
  await expect(page.getByRole("heading", { level: 1, name: "Real places" })).toBeVisible();

  // Refine opens the place at once: nothing is asked, however the open map stands
  await page.getByRole("link", { name: `Refine ${SMALL.name} in the editor` }).click();
  await page.waitForFunction(() => window.dgmEditor?.info().kind === "import", null, { timeout: 120_000 });
  expect(await page.evaluate(() => window.dgmEditor!.info().name)).toBe(SMALL.name);
  await expect(page.getByRole("alertdialog")).toHaveCount(0);

  // the map it replaced is in Your maps, its edit with it, and its row opens it again; the place, unedited, isn't (D330)
  const yours = await openYourMaps(page);
  await expect(yours.locator(".ym-tile")).toHaveCount(1, { timeout: 30_000 });
  await expect(yours.locator(".ym-tile[aria-current]")).toHaveCount(0);
  await yours.locator(".ym-tile").filter({ hasText: name }).click();
  await expect.poll(() => page.evaluate(() => window.dgmEditor?.info().name), { timeout: 60_000 }).toBe(name);
  expect((await page.evaluate(() => window.dgmEditor!.info())).edits).toBe(1);
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
    await capture(page, "phone");

    await page.getByRole("button", { name: "128×128" }).tap();
    await expect(cards).toHaveCount(INDEX.places.filter((p) => p.size === 128).length);
    await page.getByLabel("Landform").selectOption("fjord");
    const fjords = INDEX.places.filter((p) => p.size === 128 && p.family === "fjord");
    await expect(cards).toHaveCount(fjords.length);
    const card = cards.first();
    await expect(card.getByRole("button", { name: `Download ${fjords[0].name}` })).toBeVisible();
    await expect(card.getByRole("link", { name: `Refine ${fjords[0].name} in the editor` })).toBeVisible();
    await capture(page, "phone-filtered");

    // a download from the phone layout
    await page.getByRole("button", { name: "All sizes" }).tap();
    await page.getByLabel("Landform").selectOption("");
    await page.getByRole("button", { name: "96×96" }).tap();
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: `Download ${SMALL.name}` }).tap();
    expect(sha256(new Uint8Array(readFileSync(await (await download).path())))).toBe(SMALL.sha256);
    await capture(page, "phone-top");
    expect(errors).toEqual([]);
  });
});

test("an unknown place says so and opens a generated map instead", async ({ page }) => {
  await page.goto("./#place=near-nowhere");
  await expect(page.getByRole("alert")).toContainText('there is no real place called "near-nowhere"', { timeout: 60_000 });
  await waitForEditor(page);
  expect((await page.evaluate(() => window.dgmEditor!.info())).kind).toBe("generated");
  expect(entry("near-nowhere")).toBeUndefined();
});

test("Real places in the header: the places three across in the generator's box; a click opens one in the editor (Kyler, 2026-10-04)", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await openEditor(page, "s=1&z=96&d=n&t=riverValley");
  await page.locator("header.editor-bar").getByRole("button", { name: "Real places", exact: true }).click();
  const places = page.getByRole("region", { name: "Real places" });
  const tile = places.getByTitle(`Open ${SMALL.name.replace(/^Near /, "")}`, { exact: true });
  await expect(tile).toHaveCount(1, { timeout: 30_000 });
  // three across
  const tops = await places.getByRole("button").evaluateAll((b) => b.slice(0, 4).map((e) => Math.round(e.getBoundingClientRect().top)));
  expect(tops[0]).toBe(tops[2]);
  expect(tops[3]).toBeGreaterThan(tops[0]);
  await tile.scrollIntoViewIfNeeded();
  await tile.click();
  await page.waitForFunction((n) => window.dgmEditor?.info().kind === "import" && window.dgmEditor?.info().name === n, SMALL.name, { timeout: 120_000 });
  await expect(page).toHaveURL(new RegExp(`#place=${SMALL.id}$`));
});
