// A source's one number (PLAN §20 D368 (4); D361 (6) did not hold): Ctrl+scroll over a source changes its strength,
// and its label on the map (with Markers on), the settings row of the picked source and the source's real strength
// (the worker's) always show the same number, live with every notch, for a source alone and for a source in a row,
// however quickly the notches come.

import { expect, test, type Page } from "@playwright/test";

const idle = (page: Page) => page.evaluate(() => window.dgmEditor!.idle());
const client = (page: Page, x: number, y: number) => page.evaluate(([a, b]) => window.dgmEditor!.tileToClient(a, b), [x, y] as [number, number]);
const ID = (k: number) => `00000000-0000-4000-8000-00000000000${k}`;
/** The number in some words ("this source 0.5 · row 1.25 water/s": the first, this source's). */
const first = (t: string | null) => Number(/([\d.]+)/.exec(t ?? "")?.[1] ?? NaN);

/** Two dry, level spots away from the start and every object, each with room for a row of three. */
async function spots(page: Page): Promise<[number, number][]> {
  return page.evaluate(() => {
    const m = window.dgm3d!.renderer.mapState()!;
    const st = (window.dgmEditor!.info().features.find((f) => f.kind === "start")!.params as { position: [number, number] }).position;
    const out: [number, number][] = [];
    const onMap = (x: number, y: number) => {
      const p = window.dgmEditor!.tileToClient(x, y);
      return document.elementFromPoint(p.x, p.y)?.tagName === "CANVAS";
    };
    for (let y = 16; y < m.H - 16 && out.length < 2; y++)
      for (let x = 16; x < m.W - 16 && out.length < 2; x++) {
        if (Math.hypot(x - st[0], y - st[1]) < 16 || out.some(([a, b]) => Math.hypot(a - x, b - y) < 14)) continue;
        const h0 = m.heights[y * m.W + x];
        let ok = onMap(x, y) && onMap(x + 2, y);
        for (let dy = -3; dy <= 3 && ok; dy++) for (let dx = -3; dx <= 5 && ok; dx++) if (m.heights[(y + dy) * m.W + x + dx] !== h0 || m.surface.depth[(y + dy) * m.W + x + dx] > 0) ok = false;
        for (let k = 0; k < m.entities.count && ok; k++) if (Math.abs(m.entities.x[k] - x) <= 7 && Math.abs(m.entities.y[k] - y) <= 7) ok = false;
        if (ok) out.push([x, y]);
      }
    return out;
  });
}

test("D368 (4): Ctrl+scroll over a source: its label, its row and its real strength show the same number at every notch, alone and in a row", async ({ page }) => {
  test.setTimeout(240_000);
  await page.addInitScript(() => localStorage.setItem("dgm.markers", "on"));
  await page.setViewportSize({ width: 1400, height: 1000 });
  await page.goto("./#s=9&z=96&d=n&t=riverValley");
  await expect(page.getByText(/All \d+ checks passed/)).toBeVisible({ timeout: 120_000 });
  await page.getByRole("button", { name: "Refine this map" }).click();
  await page.waitForFunction(() => !!window.dgmEditor && !!window.dgm3d, null, { timeout: 60_000 });
  await page.getByRole("button", { name: "Top-down" }).click();
  await page.waitForTimeout(500);
  const found = await spots(page);
  expect(found.length).toBe(2);
  const [[ax, ay], [rx, ry]] = found;
  const place = (id: string, x: number, y: number) =>
    page.evaluate(
      ([id, x, y]) => window.dgmEditor!.edit({ op: "placeEntity", params: { id, template: "WaterSource", x, y, orientation: "Cw0", components: { WaterSource: { SpecifiedStrength: 1, CurrentStrength: 1 } } } } as never, "Place water source"),
      [id, x, y] as [string, number, number],
    );
  await place(ID(0), ax, ay);
  for (let k = 1; k <= 3; k++) await place(ID(k), rx + k - 1, ry);
  await idle(page);

  /** The worker's own strength of the source on (x, y). */
  const real = (x: number, y: number) =>
    page.evaluate(
      async ([x, y]) => {
        const list = await window.dgmEditor!.worker.entitiesAt(x, y);
        const e = list.find((g) => g.template === "WaterSource");
        return Number((e?.components.WaterSource as { SpecifiedStrength?: number } | undefined)?.SpecifiedStrength);
      },
      [x, y] as [number, number],
    );
  const row = page.getByRole("group", { name: "Water source, selected" });
  const readout = row.getByRole("status", { name: "This source" }).locator("output");
  const strength = row.getByRole("combobox", { name: "Strength" });

  for (const [what, x, y, n] of [
    ["alone", ax, ay, 1],
    ["in a row", rx + 1, ry, 3],
  ] as const) {
    // the source picked: its row shows
    const p = await client(page, x, y);
    await page.mouse.move(p.x + 3, p.y);
    await page.mouse.move(p.x, p.y);
    await page.mouse.click(p.x, p.y);
    await expect(row).toBeVisible();
    // its marker: the one whose words count its row
    const label = page.locator(".source-marker").filter({ hasText: n > 1 ? `${n} sources` : /^[\d.]+ water\/s$/ });
    const labelOf = async () => {
      // (the marker nearest the source, for a lone one; a row's says how many)
      const all = await label.evaluateAll((els, [px, py]) => els.map((e) => ({ t: e.textContent ?? "", d: Math.hypot(e.getBoundingClientRect().left - px, e.getBoundingClientRect().top - py) })), [p.x, p.y]);
      all.sort((a, b) => a.d - b.d);
      return all[0]?.t ?? "";
    };
    /** The row's total in the label, in a row; the one number, alone. */
    const labelNumber = async () => {
      const t = await labelOf();
      return n > 1 ? Number(/sources, ([\d.]+)/.exec(t)?.[1] ?? NaN) : first(t);
    };
    const rowTotal = async () => {
      const t = await readout.textContent();
      return n > 1 ? Number(/row ([\d.]+)/.exec(t ?? "")?.[1] ?? NaN) : first(t);
    };
    // at rest: one number everywhere
    await expect.poll(rowTotal).toBe(n);
    expect(await labelNumber()).toBe(n);
    expect(first(await readout.textContent())).toBe(1);
    await expect(strength).toHaveValue("1");

    // four notches up in quick succession, one down: after each, before the next, the label, the row and
    // the note beside the pointer say the same number at once
    const steps = [1.5, 2, 3, 4, 3];
    /** The label, the row (its readout and its Strength) and the note, read in one go (one frame). */
    const sample = () =>
      page.evaluate(
        ([px, py, many]) => {
          const num = (t: string | null | undefined, re: RegExp) => Number(re.exec(t ?? "")?.[1] ?? NaN);
          const labels = Array.from(document.querySelectorAll<HTMLElement>(".source-marker")).filter((e) => (many > 1 ? (e.textContent ?? "").startsWith(`${many} sources`) : /^[\d.]+ water\/s$/.test(e.textContent ?? "")));
          labels.sort((a, b) => Math.hypot(a.getBoundingClientRect().left - px, a.getBoundingClientRect().top - py) - Math.hypot(b.getBoundingClientRect().left - px, b.getBoundingClientRect().top - py));
          const group = document.querySelector('[role="group"][aria-label="Water source, selected"]');
          const words = group?.querySelector('[aria-label="This source"] output')?.textContent;
          return {
            label: num(labels[0]?.textContent, many > 1 ? /sources, ([\d.]+)/ : /([\d.]+)/),
            own: num(words, /([\d.]+)/),
            row: num(words, many > 1 ? /row ([\d.]+)/ : /([\d.]+)/),
            select: Number((group?.querySelector('select[aria-label="Strength"]') as HTMLSelectElement | null)?.value),
            note: num(document.querySelector(".shape-note")?.textContent, /([\d.]+)/),
          };
        },
        [p.x, p.y, n] as [number, number, number],
      );
    await page.keyboard.down("Control");
    for (let k = 0; k < steps.length; k++) {
      const own = steps[k];
      const total = n > 1 ? n - 1 + own : own;
      await page.mouse.wheel(0, k < 4 ? -120 : 120);
      // the note says the new number; in that same frame the label and the row say it too, never a step behind.
      // (One sample is both the wait and the check: the note fades 1.5 s after the notch, so a second read on a
      // slow machine could come after it had gone.)
      let seen: Awaited<ReturnType<typeof sample>> | null = null;
      await expect.poll(async () => (seen = await sample()).note, { message: `${what}, notch ${k + 1}: the note` }).toBe(own);
      expect(seen, `${what}, notch ${k + 1}: one number everywhere`).toEqual({ label: total, own, row: total, select: own, note: own });
    }
    await page.keyboard.up("Control");
    // the source's real strength is the same number, and so are the label and the row once it is
    await expect.poll(() => real(x, y), { timeout: 20_000, message: `${what}: its real strength` }).toBe(3);
    await idle(page);
    expect(first(await readout.textContent())).toBe(3);
    await expect(strength).toHaveValue("3");
    expect(await labelNumber()).toBe(n > 1 ? n + 2 : 3);
    await page.keyboard.press("x");
  }
});
