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
});
