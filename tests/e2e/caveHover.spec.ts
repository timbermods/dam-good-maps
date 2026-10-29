// The hover readout on a map with caves: pointing at a cave's floor under a roof names the floor (its level and, once
// dry, its soil), never the roof's height (the voxel pick's level; renderer `onHover`'s second argument). The map is T3 of
// the probe's test maps (tools/terrain3d-maps.ts), built here. Pointing at a roof's top over a cave's water names the
// roof's dry top, never the water under it.

import { expect, test } from "@playwright/test";
import { build, t3CaveWater } from "../../tools/terrain3d-maps";
import { openEditor, topDown, waitForEditor } from "./open";

test("pointing at a cave's floor under a roof: the readout and the corner Z say the floor's level, not the roof's", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await openEditor(page, "s=1&z=96&d=n&t=riverValley");
  const bytes = build(t3CaveWater()).bytes;
  await page.getByLabel("Open a map or a project").setInputFiles({ name: "T3 caves.timber", mimeType: "application/zip", buffer: Buffer.from(bytes) });
  await page.waitForFunction(() => window.dgmEditor?.info().kind === "import", null, { timeout: 120_000 });
  await waitForEditor(page);
  // pointer spots where the ground seen is a run top below its tile's top (a floor under a roof): the camera is
  // turned about the map at a low angle until some are in view, since a cave's floor is seen through its mouth
  const spots = await page.evaluate(async () => {
    const r = window.dgm3d!.renderer;
    const m = r.mapState()!;
    const box = r.canvas.getBoundingClientRect();
    const out: { x: number; y: number; tx: number; ty: number; level: number; top: number }[] = [];
    const frame = () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
    for (const pitch of [0.25, 0.45]) {
      for (let k = 0; k < 8 && out.length < 12; k++) {
        r.setView({ yaw: (k * Math.PI) / 4, pitch, distance: 40, target: [m.W / 2, 8, -m.H / 2] });
        await frame();
        for (let py = 60; py < box.height - 60; py += 6)
          for (let px = 60; px < box.width - 60; px += 6) {
            const h = r.pickSeen(box.left + px, box.top + py);
            if (h?.level === undefined || h.face === "bottom") continue;
            const top = m.heights[h.y * m.W + h.x];
            if (h.level < top) out.push({ x: box.left + px, y: box.top + py, tx: h.x, ty: h.y, level: h.level, top });
          }
        if (out.length) break;
      }
      if (out.length) break;
    }
    return out;
  });
  expect(spots.length, "pointer spots on a floor under a roof").toBeGreaterThan(0);
  let checked = 0;
  for (const s of spots.filter((_, k) => k % Math.ceil(spots.length / 6) === 0)) {
    await page.mouse.move(s.x, s.y);
    const readout = page.locator(".readout");
    await expect(readout).toHaveText(new RegExp(`(Height ${s.level}(?![0-9])|bed level ${s.level}(?![0-9]))`));
    await expect(page.locator(".coords")).toHaveText(new RegExp(`Z ${s.level}$`));
    expect(await readout.textContent()).not.toContain(`Height ${s.top}`);
    checked++;
  }
  expect(checked).toBeGreaterThan(0);
});

test("pointing at a roof over a cave's water: the readout names the roof's dry top, never the water under it", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await openEditor(page, "s=1&z=96&d=n&t=riverValley");
  const bytes = build(t3CaveWater()).bytes;
  await page.getByLabel("Open a map or a project").setInputFiles({ name: "T3 caves.timber", mimeType: "application/zip", buffer: Buffer.from(bytes) });
  await page.waitForFunction(() => window.dgmEditor?.info().kind === "import", null, { timeout: 120_000 });
  await waitForEditor(page);
  await page.getByRole("button", { name: "No more hints" }).click().catch(() => undefined);
  await topDown(page);
  // a tile of the sealed cave's roof (the cave at 3–6 under the plateau's top at 8, tools/terrain3d-maps.ts), away from
  // its source, whose uppermost water is the cave's, under the roof: once the cave has water, read off the map shown
  const roof = await page
    .waitForFunction(
      () => {
        const m = (window.dgm3d!.renderer as unknown as { map: { W: number; heights: Uint8Array; surface: { floor: Float32Array; depth: Float32Array } } }).map;
        for (let y = 7; y <= 10; y++)
          for (let x = 26; x <= 31; x++) {
            const i = y * m.W + x;
            if (Math.max(Math.abs(x - 29), Math.abs(y - 9)) > 1 && m.surface.depth[i] > 0.05 && m.surface.floor[i] < m.heights[i]) return { x, y, top: m.heights[i] };
          }
        return null;
      },
      null,
      { timeout: 120_000 },
    )
    .then((h) => h.jsonValue());
  const p = await page.evaluate(([x, y]) => window.dgmEditor!.tileToClient(x, y), [roof!.x, roof!.y] as const);
  await page.mouse.move(p.x + 4, p.y);
  await page.mouse.move(p.x, p.y, { steps: 3 });
  const readout = page.locator(".readout");
  await expect(readout).toHaveText(new RegExp(`^Height ${roof!.top}(?![0-9])`));
  expect(await readout.textContent()).not.toMatch(/water/i);
  // (nor does it light the sources feeding the water under it: the view's glow on the sources hovered water comes from)
  const feeding = () => page.evaluate(() => (window.dgm3d!.renderer as unknown as { sourceGlow: readonly number[] }).sourceGlow.length);
  expect(await feeding()).toBe(0);
  // the cave's own water, its floor pointed at under the layer cut, lights the sources that feed it (D196)
  await page.evaluate(() => window.dgm3d!.renderer.setSlice(6));
  // (off the tile and back, so the hover is asked again under the cut)
  await page.mouse.move(p.x + 80, p.y + 80);
  await page.mouse.move(p.x, p.y, { steps: 3 });
  const seen = await page.evaluate(([x, y]) => window.dgm3d!.renderer.pickSeen(x, y), [p.x, p.y] as const);
  expect(seen?.level, "the cut shows the cave's floor there").toBeLessThan(roof!.top);
  await expect.poll(feeding).toBeGreaterThan(0);
});

test("a cave's water seen through its mouth keeps its sources lit when the objects change, the pointer resting there", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await openEditor(page, "s=1&z=96&d=n&t=riverValley");
  const bytes = build(t3CaveWater()).bytes;
  await page.getByLabel("Open a map or a project").setInputFiles({ name: "T3 caves.timber", mimeType: "application/zip", buffer: Buffer.from(bytes) });
  await page.waitForFunction(() => window.dgmEditor?.info().kind === "import", null, { timeout: 120_000 });
  await waitForEditor(page);
  await page.getByRole("button", { name: "No more hints" }).click().catch(() => undefined);
  const feeding = () => page.evaluate(() => (window.dgm3d!.renderer as unknown as { sourceGlow: readonly number[] }).sourceGlow.length);
  // the spring cave's pool, seen through its tunnel's mouth on the map's west edge (tools/terrain3d-maps.ts T3 (a)): once
  // it has water, pointer spots on a floor under its roof, with no cut
  await page.waitForFunction(
    () => {
      const m = (window.dgm3d!.renderer as unknown as { map: { W: number; heights: Uint8Array; surface: { floor: Float32Array; depth: Float32Array } } }).map;
      const i = 9 * m.W + 9;
      return m.surface.depth[i] > 0.05 && m.surface.floor[i] < m.heights[i];
    },
    null,
    { timeout: 120_000 },
  );
  const spots = await page.evaluate(async () => {
    const r = window.dgm3d!.renderer;
    const m = r.mapState()!;
    r.setSlice(null);
    r.setView({ mode: "orbit", yaw: -Math.PI / 2, pitch: 0.12, distance: 12, target: [3, 4, -9.5] });
    await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
    const box = r.canvas.getBoundingClientRect();
    const out: { x: number; y: number }[] = [];
    for (let py = 60; py < box.height - 60; py += 8)
      for (let px = 60; px < box.width - 60; px += 8) {
        const h = r.pickSeen(box.left + px, box.top + py);
        if (h?.level === undefined || h.face === "bottom" || h.level >= m.heights[h.y * m.W + h.x]) continue;
        out.push({ x: box.left + px, y: box.top + py });
      }
    return out;
  });
  expect(spots.length, "pointer spots on the cave's floor through its mouth").toBeGreaterThan(0);
  // a spot whose water lights the sources feeding it (D196)
  let lit: { x: number; y: number } | null = null;
  for (const s of spots.filter((_, k) => k % Math.ceil(spots.length / 24) === 0)) {
    await page.mouse.move(s.x + 30, s.y);
    await page.mouse.move(s.x, s.y, { steps: 2 });
    if (await feeding()) {
      lit = s;
      break;
    }
  }
  expect(lit, "a spot on the cave's water that lights its sources").not.toBeNull();
  // the objects change with the pointer resting there (a relic placed far off): the sources are found again from the
  // ground seen, the cave's floor, never the roof's top over it, so the glow stays
  await page.evaluate(() => window.dgmEditor!.edit({ op: "placeEntity", params: { id: crypto.randomUUID(), template: "SmallRelic", x: 40, y: 30, orientation: "Cw0" } } as never, "Place a relic"));
  await page.evaluate(() => window.dgmEditor!.idle());
  await expect.poll(() => page.evaluate(() => window.dgm3d!.renderer.mapState()!.entities.templates.includes("SmallRelic"))).toBe(true);
  expect(await feeding(), "the cave's water still lights its sources after the objects change").toBeGreaterThan(0);
});
