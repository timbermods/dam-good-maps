// Real places (ROADMAP "Real places", PLAN §20 D136): the gallery loads, its filters work, a card's
// Download is the static .timber built at deploy time (tools/places-build.ts), byte for byte Node's
// and the index's, a card's notes show (D245), Refine opens that file in the editor, the credits page lists every notice, and
// the pages work on a phone. The web server builds the sample's files (placeSample,
// playwright.config.ts). Screenshots go to .scratch/places/.

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { CHANGES, ELEVATION_SOURCE, NOT_ENDORSED, PROVIDERS, RIVERS_LICENCE, RIVERS_LICENCE_URL, RIVERS_NOTICE, RIVERS_SOURCE, WATER_LICENCE, WATER_LICENCE_URL, WATER_NOTICE, WATER_SOURCE } from "../../src/core/places/attribution";
import { decodePlaceFile, placeSample, placeTimber, type PlaceIndex, type PlaceIndexEntry } from "../../src/core/places/place";
import { VIEW_TURNS } from "../../src/core/places/view";
import { northLabel } from "../../src/ui/NorthArrow";

const DIR = "public/real-places";
const INDEX = JSON.parse(readFileSync(`${DIR}/index.json`, "utf8")) as PlaceIndex;
const sha256 = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
const entry = (id: string) => INDEX.places.find((p) => p.id === id)!;
/** Node's .timber of a place. */
const node = (e: PlaceIndexEntry) => placeTimber(decodePlaceFile(new Uint8Array(readFileSync(`${DIR}/${e.data}`))));
/** The places whose files the web server builds: a sample of every size. */
const SAMPLE = placeSample(INDEX);
/** The smallest map, for the flows that download or open one. */
const SMALL = SAMPLE[0];
/** The gallery's sizes, smallest first (at 256² since D306, where the data allows). */
const [FIRST, LAST] = [INDEX.sizes[0], INDEX.sizes[INDEX.sizes.length - 1]];
/** The side of a place's picture from above: a whole number of pixels a tile, about 512. */
const topSide = (e: PlaceIndexEntry) => Math.round(512 / e.size) * e.size;

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`page error: ${e.message}`));
  page.on("console", (m) => m.type() === "error" && !/favicon/.test(m.text()) && errors.push(`console error: ${m.text()}`));
  return errors;
}

test.beforeAll(() => mkdirSync(".scratch/places", { recursive: true }));

test("the gallery lists every place, filters them and downloads Node's file", async ({ page }) => {
  const errors = watchErrors(page);
  const pictures = new Set<string>();
  page.on("request", (r) => r.url().includes("/real-places/cards/") && pictures.add(r.url()));
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("./real-places/");
  await expect(page).toHaveTitle("Real places · Dam Good Maps");
  await expect(page.getByRole("heading", { level: 1, name: "Real places" })).toBeVisible();
  await expect(page.getByText("Each map is inspired by the land near its namesake, at Timberborn's scale. It is not a replica.")).toBeVisible();
  const cards = page.getByRole("list", { name: "Maps" }).getByRole("listitem");
  await expect(cards).toHaveCount(INDEX.count);
  await expect(page.getByRole("status").filter({ hasText: /maps$/ })).toHaveText(`${INDEX.count} maps`);

  // the credits, in full, as on the credits page
  const credits = page.locator("#credits");
  await expect(credits.getByRole("heading", { name: "Elevation data" })).toBeVisible();
  for (const p of PROVIDERS) await expect(credits).toContainText(p.notice);
  await expect(credits).toContainText(NOT_ENDORSED);

  // each card: our render, the name, landform, size, scale and how it plays
  const first = cards.first();
  const p0 = INDEX.places[0];
  await expect(first.getByRole("heading", { name: p0.name, exact: true })).toBeVisible();
  await expect(first).toContainText(`${p0.familyName} · ${p0.size}×${p0.size} · ${p0.metres} m per tile`);
  await expect(first).toContainText(p0.plays);
  await expect(first.locator(`img[alt="${p0.name} seen at an angle"]`)).toHaveJSProperty("naturalWidth", 480);
  await expect(first.locator(`img[alt="${p0.name} from above"]`)).toHaveJSProperty("naturalWidth", topSide(p0));
  await page.screenshot({ path: ".scratch/places/desktop.png" });
  // the pictures load as their cards come near the view, not all at once (how near depends on the
  // browser): fewer than half of them, and none of the last cards'
  expect(pictures.size).toBeGreaterThan(0);
  expect(pictures.size).toBeLessThan(INDEX.count);
  for (const p of INDEX.places.slice(-8)) expect([...pictures].filter((u) => u.includes(`/cards/${p.id}`)), p.id).toEqual([]);

  // filters: a landform, then a size; the query keeps them
  const canyons = INDEX.places.filter((p) => p.family === "canyon");
  await page.getByLabel("Landform").selectOption("canyon");
  await expect(cards).toHaveCount(canyons.length);
  await expect(page.getByText(`${canyons.length} of ${INDEX.count} maps`)).toBeVisible();
  for (const p of canyons) await expect(page.getByRole("heading", { name: p.name, exact: true })).toBeVisible();
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
  await page.getByRole("button", { name: `${FIRST}×${FIRST}` }).click();
  await expect(cards).toHaveCount(INDEX.places.filter((p) => p.size === FIRST).length);

  // Download: a link to the place's static .timber, saved under its title, byte for byte Node's
  // and the index's
  const link = page.getByRole("link", { name: `Download ${SMALL.name}`, exact: true });
  await expect(link).toHaveAttribute("href", `/dam-good-maps/real-places/maps/${SMALL.id}.timber`);
  await expect(link).toHaveAttribute("download", `${SMALL.name}.timber`);
  const download = page.waitForEvent("download");
  const t = Date.now();
  await link.click();
  const d = await download;
  expect(d.suggestedFilename()).toBe(`${SMALL.name}.timber`);
  const bytes = new Uint8Array(readFileSync(await d.path()));
  console.log(`download of ${SMALL.name}: ${Date.now() - t} ms, ${bytes.length} B`);
  expect(sha256(bytes)).toBe(sha256(node(SMALL).bytes));
  expect(sha256(bytes)).toBe(SMALL.sha256);
  expect(errors).toEqual([]);
});

test("a card's pictures: the overview, with a minimap from above that fills it on hover, focus or a click, each with its north arrow", async ({ page }) => {
  const errors = watchErrors(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("./real-places/");
  const p0 = INDEX.places[0];
  const card = page.getByRole("list", { name: "Maps" }).getByRole("listitem").first();
  const main = card.locator(`img[alt="${p0.name} seen at an angle"]`);
  const mini = card.getByRole("button", { name: `Show ${p0.name} from above`, exact: true });
  await expect(main).toHaveJSProperty("naturalWidth", 480);
  await expect(mini.locator("img")).toHaveJSProperty("naturalWidth", topSide(p0));
  const full = (await main.boundingBox())!;
  const width = async () => (await mini.boundingBox())!.width;
  // a north arrow on each picture, drawn by the page, pointing where north is in both (the index's
  // view: the two pictures face the same way)
  const turns = VIEW_TURNS[p0.view];
  const arrows = card.locator(".north");
  await expect(arrows).toHaveCount(2);
  for (const k of [0, 1]) await expect(arrows.nth(k)).toHaveAttribute("data-turns", String(turns));
  await expect(card.getByRole("img", { name: northLabel(turns) }).first()).toBeVisible();
  const arrow = (await arrows.first().boundingBox())!;
  expect(arrow.x).toBeLessThan(full.x + full.width / 4);
  expect(arrow.y).toBeLessThan(full.y + full.height / 4);
  const insetArrow = (await arrows.nth(1).boundingBox())!;
  const inset = (await mini.boundingBox())!;
  expect(insetArrow.x).toBeGreaterThanOrEqual(inset.x);
  expect(insetArrow.y).toBeGreaterThanOrEqual(inset.y);
  // a card facing another way turns its arrows
  const other = INDEX.places.find((p) => VIEW_TURNS[p.view] !== turns)!;
  await expect(
    page.getByRole("list", { name: "Maps" }).getByRole("listitem").filter({ has: page.getByRole("heading", { name: other.name, exact: true }) }).locator(".north").first(),
  ).toHaveAttribute("data-turns", String(VIEW_TURNS[other.view]));
  // a minimap in the corner
  expect(await width()).toBeLessThan(full.width / 2);
  const corner = (await mini.boundingBox())!;
  expect(corner.x + corner.width).toBeGreaterThan(full.x + full.width * 0.9);
  expect(corner.y + corner.height).toBeGreaterThan(full.y + full.height * 0.9);
  await page.screenshot({ path: ".scratch/places/minimap.png", clip: { x: 0, y: full.y - 20, width: 1280, height: full.height + 180 } });
  // hover: the map from above fills the picture; away, it is a minimap again
  await main.hover();
  await expect.poll(width).toBeGreaterThan(full.width - 2);
  await page.screenshot({ path: ".scratch/places/minimap-hover.png", clip: { x: 0, y: full.y - 20, width: 1280, height: full.height + 180 } });
  await page.mouse.move(2, 2);
  await expect.poll(width).toBeLessThan(full.width / 2);
  // keyboard focus fills it too
  await mini.focus();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");
  await expect(mini).toBeFocused();
  await expect.poll(width).toBeGreaterThan(full.width - 2);
  await page.keyboard.press("Shift+Tab");
  await expect.poll(width).toBeLessThan(full.width / 2);
  // a click (a tap on a phone) keeps it, and another puts it back
  await mini.click();
  await expect(mini).toHaveAttribute("aria-pressed", "true");
  await page.mouse.move(2, 2);
  await expect.poll(width).toBeGreaterThan(full.width - 2);
  await mini.click();
  await expect(mini).toHaveAttribute("aria-pressed", "false");
  await page.mouse.move(2, 2);
  await expect.poll(width).toBeLessThan(full.width / 2);
  expect(errors).toEqual([]);
});

test("a card says what would sink a player who goes straight to the game, and nothing for the rest (D245)", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("./real-places/");
  const noted = INDEX.places.filter((p) => p.notes?.length);
  expect(noted.length).toBeGreaterThan(0);
  for (const p of [noted[0], noted.find((q) => q.notes!.length > 1) ?? noted[1]]) {
    const card = page.locator("li.place").filter({ has: page.getByRole("heading", { name: p.name, exact: true }) });
    await expect(card.locator(".place-note")).toHaveText(p.notes!);
  }
  const quiet = INDEX.places.find((p) => !p.notes)!;
  const card = page.locator("li.place").filter({ has: page.getByRole("heading", { name: quiet.name, exact: true }) });
  await expect(card.locator(".place-note")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("the site serves each place's .timber, built at deploy time, as Node builds it (a sample of every size)", async ({ page }) => {
  expect(new Set(SAMPLE.map((e) => e.size))).toEqual(new Set(INDEX.sizes));
  for (const e of SAMPLE) {
    const res = await page.request.get(`./real-places/${e.file}`);
    expect(res.status(), e.id).toBe(200);
    const bytes = new Uint8Array(await res.body());
    const n = node(e);
    expect(n.fileName, e.id).toBe(`${e.name}.timber`);
    expect(bytes.length, e.id).toBe(n.bytes.length);
    expect(sha256(bytes), e.id).toBe(sha256(n.bytes));
    expect(sha256(bytes), e.id).toBe(e.sha256);
  }
});

test("the credits page lists every notice with its licence, and links back to the gallery", async ({ page }) => {
  const errors = watchErrors(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  const res = await page.goto("./real-places/credits/");
  expect(res?.status()).toBe(200);
  await expect(page).toHaveTitle("Credits · Real places · Dam Good Maps");
  await expect(page.getByRole("heading", { level: 1, name: "Real places credits" })).toBeVisible();
  const credits = page.locator("#credits");
  await expect(credits.getByRole("link", { name: ELEVATION_SOURCE })).toBeVisible();
  await expect(credits).toContainText(CHANGES);
  await expect(credits).toContainText(NOT_ENDORSED);
  const items = credits.getByRole("listitem");
  await expect(items).toHaveCount(PROVIDERS.length);
  for (const [k, p] of PROVIDERS.entries()) {
    await expect(items.nth(k)).toContainText(p.notice);
    await expect(items.nth(k).getByRole("link", { name: p.licence })).toHaveAttribute("href", p.licenceUrl);
  }
  // the water data (D271): its sources, their notices verbatim and their licences
  const water = page.locator("#water-credits");
  await expect(water.getByRole("link", { name: WATER_SOURCE })).toBeVisible();
  await expect(water).toContainText(WATER_NOTICE);
  await expect(water.getByRole("link", { name: WATER_LICENCE })).toHaveAttribute("href", WATER_LICENCE_URL);
  await expect(water.getByRole("link", { name: RIVERS_SOURCE, exact: true })).toBeVisible();
  await expect(water).toContainText(RIVERS_NOTICE);
  await expect(water.getByRole("link", { name: RIVERS_LICENCE })).toHaveAttribute("href", RIVERS_LICENCE_URL);
  await page.screenshot({ path: ".scratch/places/credits.png", fullPage: true });
  await page.getByRole("navigation", { name: "Pages" }).getByRole("link", { name: "Real places" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Real places" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("Refine opens the place in the editor, and it exports unchanged as the same file", async ({ page }) => {
  const errors = watchErrors(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("./real-places/");
  await page.getByRole("link", { name: `Refine ${SMALL.name} in the editor`, exact: true }).click();
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
  await page.getByRole("link", { name: `Refine ${SMALL.name} in the editor`, exact: true }).click();
  const ask = page.getByRole("alertdialog");
  await expect(ask).toContainText("Opening this real place replaces River Valley, which is saved in this browser.");
  await expect(ask.getByRole("button", { name: "Save project file" })).toBeVisible();
  await ask.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByText("Continue editing")).toBeVisible();
  await expect(page.getByText(/checks passed|checks failed/)).toBeVisible({ timeout: 60_000 });

  // asked again and accepted: the place opens
  await page.goto("./real-places/");
  await page.getByRole("link", { name: `Refine ${SMALL.name} in the editor`, exact: true }).click();
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

    await page.getByRole("button", { name: `${LAST}×${LAST}` }).tap();
    await expect(cards).toHaveCount(INDEX.places.filter((p) => p.size === LAST).length);
    await page.getByLabel("Landform").selectOption("fjord");
    const fjords = INDEX.places.filter((p) => p.size === LAST && p.family === "fjord");
    await expect(cards).toHaveCount(fjords.length);
    const card = cards.first();
    await expect(card.getByRole("link", { name: `Download ${fjords[0].name}`, exact: true })).toBeVisible();
    await expect(card.getByRole("link", { name: `Refine ${fjords[0].name} in the editor`, exact: true })).toBeVisible();
    await page.screenshot({ path: ".scratch/places/phone-filtered.png" });

    // a download from the phone layout
    await page.getByRole("button", { name: "All sizes" }).tap();
    await page.getByLabel("Landform").selectOption("");
    await page.getByRole("button", { name: `${SMALL.size}×${SMALL.size}` }).tap();
    const download = page.waitForEvent("download");
    await page.getByRole("link", { name: `Download ${SMALL.name}`, exact: true }).tap();
    expect(sha256(new Uint8Array(readFileSync(await (await download).path())))).toBe(SMALL.sha256);
    await page.screenshot({ path: ".scratch/places/phone-top.png", fullPage: false });
    expect(errors).toEqual([]);
  });

  test("a tap on the minimap shows the map from above, with its north arrow", async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto("./real-places/");
    const mini = page.getByRole("list", { name: "Maps" }).getByRole("listitem").first().getByRole("button", { name: /from above/ });
    const small = (await mini.boundingBox())!.width;
    await mini.tap();
    await expect(mini).toHaveAttribute("aria-pressed", "true");
    await expect.poll(async () => (await mini.boundingBox())!.width).toBeGreaterThan(small * 2);
    await expect(mini.locator(".north")).toBeVisible();
    await page.screenshot({ path: ".scratch/places/phone-minimap-tapped.png", fullPage: false });
    expect(errors).toEqual([]);
  });

  test("the credits page fits the screen", async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto("./real-places/credits/");
    await expect(page.locator("#credits").getByRole("listitem")).toHaveCount(PROVIDERS.length);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await page.screenshot({ path: ".scratch/places/phone-credits.png", fullPage: false });
    expect(errors).toEqual([]);
  });
});

test("an unknown place says so and shows the generator", async ({ page }) => {
  await page.goto("./#place=near-nowhere");
  await expect(page.getByRole("alert")).toContainText('there is no real place called "near-nowhere"', { timeout: 60_000 });
  await expect(page.getByText(/checks passed|checks failed/)).toBeVisible({ timeout: 60_000 });
  expect(entry("near-nowhere")).toBeUndefined();
});
