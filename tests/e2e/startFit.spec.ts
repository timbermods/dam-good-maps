// The start's placement preview reads the same fit rule as the checks (PLAN §20 D342): over any part of another
// object's footprint, not only the tile it is anchored on, the preview is red with a reason and never says "Move the
// start here", and after a click it is refused rather than left to the checks as "Start overlapping another object".

import { expect, test, type Page } from "@playwright/test";
import { generate } from "../../src/core/gen/generate";
import { startFitExtras, startFitWarnings } from "../../src/core/doc/startFit";
import { makeSpec } from "../../src/core/spec/mapspec";
import { openEditor, topDown, waitForEditor } from "./open";

const info = (page: Page) => page.evaluate(() => window.dgmEditor!.info());
const client = (page: Page, x: number, y: number) => page.evaluate(([a, b]) => window.dgmEditor!.tileToClient(a, b), [x, y] as [number, number]);

async function hoverFit(page: Page, x: number, y: number, W: number): Promise<{ tiles: number[]; problem: string | null }> {
  const p = await client(page, x, y);
  await page.mouse.move(p.x + 3, p.y);
  await page.mouse.move(p.x, p.y, { steps: 2 });
  const i = y * W + x;
  await page.waitForFunction((k) => !!window.dgmEditor!.fit()?.tiles.includes(k), i, { timeout: 10_000 });
  return (await page.evaluate(() => window.dgmEditor!.fit()))!;
}

/** Level, dry ground with nothing standing within `r`, away from the start, nearest the middle first. */
async function openGround(page: Page, r: number): Promise<[number, number][]> {
  const start = ((await info(page)).features.find((f) => f.kind === "start")!.params as { position: [number, number] }).position;
  return page.evaluate(
    ([s0, s1, rr]) => {
      const m = window.dgm3d!.renderer.mapState()!;
      const e = m.entities;
      const out: [number, number, number][] = [];
      for (let y = rr + 2; y < m.H - rr - 2; y += 2)
        for (let x = rr + 2; x < m.W - rr - 2; x += 2) {
          if (Math.hypot(x - s0, y - s1) < 16) continue;
          const h0 = m.heights[y * m.W + x];
          let ok = true;
          for (let dy = -rr; dy <= rr && ok; dy++) for (let dx = -rr; dx <= rr && ok; dx++) if (m.heights[(y + dy) * m.W + x + dx] !== h0 || m.surface.depth[(y + dy) * m.W + x + dx] > 0) ok = false;
          for (let k = 0; k < e.count && ok; k++) if (Math.abs(e.x[k] - x) <= rr + 1 && Math.abs(e.y[k] - y) <= rr + 1) ok = false;
          if (ok) out.push([x, y, Math.abs(x - m.W / 2) + Math.abs(y - m.H / 2)]);
        }
      out.sort((a, b) => a[2] - b[2]);
      return out.map(([x, y]) => [x, y] as [number, number]);
    },
    [start[0], start[1], r] as const,
  );
}

test("the start's preview is red over any part of a geothermal field and says so, and is green beside it", async ({ page }) => {
  await openEditor(page, "s=1&z=96&d=n&t=riverValley");
  await topDown(page);
  const W = (await info(page)).W;
  const shelf = page.getByRole("navigation", { name: "Place" });
  const [x, y] = (await openGround(page, 4))[0];

  // a geothermal field on level ground, and the tiles its footprint covers
  await shelf.getByRole("button", { name: "Geothermal field", exact: true }).click();
  const field = await hoverFit(page, x, y, W);
  expect(field.problem).toBeNull();
  expect(field.tiles.length).toBeGreaterThan(1);
  const p = await client(page, x, y);
  await page.mouse.click(p.x, p.y);
  await page.evaluate(() => window.dgmEditor!.idle());
  const xs = field.tiles.map((i) => i % W);
  const ys = field.tiles.map((i) => Math.floor(i / W));
  const farX = Math.max(...xs);
  const farY = Math.max(...ys);

  // the start with only a corner of its 3×3 on the field's far corner: red, with the reason, not "Move the start here"
  await shelf.getByRole("button", { name: "Start", exact: true }).click();
  const over = await hoverFit(page, farX + 1, farY + 1, W);
  expect(over.problem).toBe("on an object");
  await expect(page.locator(".shape-note")).not.toHaveText("Move the start here");
  await expect(page.locator(".shape-note")).toHaveCount(1);
  // a click there is refused: the start has not moved and the checks have nothing to say about it
  const before = (await info(page)).features.find((f) => f.kind === "start")!.params;
  const q = await client(page, farX + 1, farY + 1);
  await page.mouse.click(q.x, q.y);
  await page.evaluate(() => window.dgmEditor!.idle());
  expect((await info(page)).features.find((f) => f.kind === "start")!.params).toEqual(before);

  // clear of the field it fits again
  const clear = await hoverFit(page, farX + 3, farY + 3, W);
  expect(clear.problem).toBeNull();
  // (and says "Move the start here", unless the checks would flag the spot for a generated object: then amber with that, below)
  const flagged = startFitWarnings(startFitExtras((await info(page)).features, W, (await info(page)).H), W, (await info(page)).H, farX + 3, farY + 3)[0];
  await expect(page.locator(".shape-note")).toHaveText(flagged ?? "Move the start here");
});

test("the start's preview is amber with the warning over a spot the checks would flag, without 'Move the start here'", async ({ page }) => {
  await openEditor(page, "s=3&z=128&d=n&t=highlands");
  await topDown(page);
  const i = await info(page);
  const { W, H } = i;
  const shelf = page.getByRole("navigation", { name: "Place" });
  await shelf.getByRole("button", { name: "Start", exact: true }).click();

  // a spot on open ground that fits, where a generated relic, mine site or field is out of its band from the start
  const extras = startFitExtras(i.features, W, H);
  expect(extras.length).toBeGreaterThan(0);
  const spots = (await openGround(page, 2)).filter(([x, y]) => startFitWarnings(extras, W, H, x, y).length > 0);
  expect(spots.length).toBeGreaterThan(0);
  let flagged: string | null = null;
  for (const [x, y] of spots.slice(0, 12)) {
    const fit = await hoverFit(page, x, y, W);
    if (fit.problem) continue;
    flagged = startFitWarnings(extras, W, H, x, y)[0];
    await expect(page.locator(".shape-note")).toHaveText(flagged);
    await expect(page.locator(".shape-note")).toHaveClass(/warn/);
    await expect(page.locator(".shape-note")).not.toHaveText("Move the start here");
    // (the walks come back and stay amber)
    await page.waitForTimeout(500);
    expect((await page.evaluate(() => window.dgmEditor!.fit()))!.status).toBe("warn");
    await expect(page.locator(".shape-note")).toHaveText(flagged);
    break;
  }
  expect(flagged).not.toBeNull();
});

test("on an imported map the start's preview is red over another object", async ({ page }) => {
  const g = generate(makeSpec({ seed: 7, size: { x: 96, y: 96 } }));
  await openEditor(page, "s=1&z=96&d=n&t=riverValley");
  await page.getByLabel("Open a map or a project").setInputFiles({ name: "My island.timber", mimeType: "application/zip", buffer: Buffer.from(g.bytes) });
  await expect(page.locator(".editor-title h1")).toHaveText("My island", { timeout: 60_000 });
  await waitForEditor(page);
  await topDown(page);
  const W = (await info(page)).W;
  // a tree or bush of the map's own, away from the start: the start's 3×3 on it is refused
  const at = await page.evaluate(() => {
    const m = window.dgm3d!.renderer.mapState()!;
    const e = m.entities;
    for (let k = 0; k < e.count; k++) {
      const t = e.templates[e.template[k]];
      if (!/^(Pine|Birch|Oak|BlueberryBush)$/.test(t) || e.x[k] < 6 || e.y[k] < 6 || e.x[k] > m.W - 7 || e.y[k] > m.H - 7) continue;
      if (m.surface.depth[e.y[k] * m.W + e.x[k]] > 0) continue;
      return [e.x[k], e.y[k]] as [number, number];
    }
    return null;
  });
  expect(at).not.toBeNull();
  await page.getByRole("navigation", { name: "Place" }).getByRole("button", { name: "Start", exact: true }).click();
  const over = await hoverFit(page, at![0], at![1], W);
  expect(over.problem).toBe("on an object");
  await expect(page.locator(".shape-note")).not.toHaveText("Move the start here");
});
