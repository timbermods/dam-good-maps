// Every force is fast, with a choice to watch (PLAN §20 D321, item 29), through the page. Fast, the
// default: each force's land is final within about two seconds of its gesture, however large. Watch
// (in the view bar beside Sound, remembered): about four times as long, and a click anywhere jumps it
// straight to its final land, kept as one step. The water stays as it was until the land is final
// (item 30): no frame of a force carries any.
//
// DGM_BENCH_FORCES=1 also times each force's largest case (Power 100, its largest size) at 128² and
// 256², the numbers item 29 asks for (information, never a failure).

import { expect, test, type Page } from "@playwright/test";

const info = (page: Page) => page.evaluate(() => window.dgmEditor!.info());
const idle = (page: Page) => page.evaluate(() => window.dgmEditor!.idle());
const labels = async (page: Page) => (await info(page)).history.filter((h) => h.applied).map((h) => h.label);
const status = (page: Page) => page.evaluate(() => window.dgmEditor!.force());
const timing = (page: Page) => page.evaluate(() => window.dgmEditor!.forceTiming());
const client = (page: Page, x: number, y: number) => page.evaluate(([a, b]) => window.dgmEditor!.tileToClient(a, b), [x, y] as [number, number]);

async function refine(page: Page, size: number) {
  await page.goto("about:blank");
  await page.goto(`./#s=4242&z=${size}&d=n&t=highlands`);
  await expect(page.getByText(/All \d+ checks passed/)).toBeVisible({ timeout: 120_000 });
  await page.getByRole("button", { name: "Refine this map" }).click();
  await page.waitForFunction(() => !!window.dgmEditor && !!window.dgm3d, null, { timeout: 120_000 });
  await page.getByRole("button", { name: "Top-down" }).click();
  await idle(page);
}

/** High dry ground on the map (not under a bar), its lowest dry ground far from it, and the middle. */
async function spots(page: Page): Promise<{ high: [number, number]; low: [number, number]; mid: [number, number] }> {
  return page.evaluate(() => {
    const m = window.dgm3d!.renderer.mapState()!;
    const onMap = (x: number, y: number) => {
      const p = window.dgmEditor!.tileToClient(x, y);
      return document.elementFromPoint(p.x, p.y)?.tagName === "CANVAS";
    };
    let high: [number, number] = [8, 8];
    let low: [number, number] = [m.W - 8, m.H - 8];
    let top = -1;
    let bottom = Infinity;
    const edge = Math.max(8, Math.round(m.W / 10));
    for (let y = edge; y < m.H - edge; y += 2)
      for (let x = edge; x < m.W - edge; x += 2) {
        if (m.surface.depth[y * m.W + x] > 0 || !onMap(x, y)) continue;
        const h = m.heights[y * m.W + x];
        if (h > top) {
          top = h;
          high = [x, y];
        }
      }
    for (let y = edge; y < m.H - edge; y += 2)
      for (let x = edge; x < m.W - edge; x += 2) {
        if (m.surface.depth[y * m.W + x] > 0 || !onMap(x, y) || Math.hypot(x - high[0], y - high[1]) < m.W / 3) continue;
        const h = m.heights[y * m.W + x];
        if (h < bottom) {
          bottom = h;
          low = [x, y];
        }
      }
    return { high, low, mid: [Math.round(m.W / 2), Math.round(m.H / 2)] as [number, number] };
  });
}

/** Every slider of the force's row at its end (Power 100, its largest size). */
async function largest(page: Page, name: string) {
  const row = page.getByRole("group", { name: `${name} options` });
  await row.getByRole("slider").evaluateAll((els) =>
    els.forEach((e) => {
      const i = e as HTMLInputElement;
      i.value = i.max;
      i.dispatchEvent(new Event("input", { bubbles: true }));
    }),
  );
}

async function drag(page: Page, from: [number, number], to: [number, number]) {
  const a = await client(page, from[0], from[1]);
  const b = await client(page, to[0], to[1]);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  for (let k = 1; k <= 12; k++) {
    await page.mouse.move(a.x + ((b.x - a.x) * k) / 12, a.y + ((b.y - a.y) * k) / 12);
    await page.waitForTimeout(16);
  }
  await page.mouse.up();
}

async function click(page: Page, at: [number, number]) {
  const p = await client(page, at[0], at[1]);
  await page.mouse.click(p.x, p.y);
}

async function kept(page: Page) {
  await expect.poll(() => status(page), { timeout: 60_000 }).toBeNull();
  await idle(page);
}

/** Each force's largest case: its key, its row's name, and its gesture. */
const CASES: { name: string; key: string; mode?: string; go(page: Page, s: Awaited<ReturnType<typeof spots>>): Promise<void> }[] = [
  { name: "Carve", key: "7", go: (page, s) => drag(page, s.high, s.low) },
  { name: "Craterize", key: "8", go: (page, s) => click(page, s.mid) },
  { name: "Quake", key: "9", mode: "Slide", go: (page, s) => drag(page, [s.mid[0] - 30, s.mid[1] - 12], [s.mid[0] + 30, s.mid[1] + 12]) },
  { name: "Erupt", key: "0", go: (page, s) => click(page, s.mid) },
  { name: "Glaciate", key: "-", go: (page, s) => click(page, s.high) },
];

test("Fast (the default): each force's land is final within about two seconds of its gesture; Watch plays about four times as long, and a click jumps it to its final land as one step", async ({ page }) => {
  await refine(page, 96);
  const watch = page.getByRole("button", { name: "Watch", exact: true });
  await expect(watch).toHaveAttribute("aria-pressed", "false");
  const s = await spots(page);
  const software = await page.evaluate(() => !!(window.dgm3d!.renderer as unknown as { software?: boolean }).software);
  for (const c of CASES.filter((k) => k.name !== "Quake")) {
    await page.keyboard.press(c.key);
    await largest(page, c.name);
    await c.go(page, s);
    await kept(page);
    const t = (await timing(page))!;
    expect(t.final, c.name).toBeGreaterThan(0);
    // about two seconds from the gesture on a GPU (a busy machine's frames add a little); where the
    // browser draws in software (CI), each frame costs the page far more: there the pacing is checked
    // by forceDriver.test and the wall clock only bounded, as Erupt's (c90e071b)
    console.log(`${c.name}: worked out ${t.worked} ms, land final ${t.final} ms${software ? " (software rendering)" : ""}`);
    expect(t.final, c.name).toBeLessThan(software ? 8000 : 2600);
    await page.keyboard.press("Control+z");
    await idle(page);
  }
  // Watch: remembered; a carve plays on past Fast's two seconds, and a click jumps it to its end
  await watch.click();
  await expect(watch).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("7");
  const n0 = (await labels(page)).length;
  await drag(page, s.high, s.low);
  await page.waitForTimeout(2500);
  expect((await status(page))?.speed).toBe("watch");
  await click(page, s.mid);
  await kept(page);
  expect((await labels(page)).length).toBe(n0 + 1);
  await page.reload();
  await page.waitForFunction(() => !!window.dgmEditor, null, { timeout: 120_000 });
  await expect(page.getByRole("button", { name: "Watch", exact: true })).toHaveAttribute("aria-pressed", "true");
});

test("the forces' Fast timings at 128² and 256² (DGM_BENCH_FORCES=1: information only)", async ({ page }) => {
  test.skip(!process.env.DGM_BENCH_FORCES, "a measure, run by hand");
  test.setTimeout(900_000);
  const rows: string[] = [];
  for (const size of [128, 256]) {
    await refine(page, size);
    const s = await spots(page);
    for (const c of CASES) {
      await page.keyboard.press(c.key);
      await largest(page, c.name);
      if (c.mode) await page.getByRole("group", { name: `${c.name} options` }).getByRole("button", { name: c.mode, exact: true }).click();
      await c.go(page, s);
      await kept(page);
      const t = await timing(page);
      rows.push(`${size}² ${c.name}${c.mode ? " " + c.mode : ""}: worked out ${t?.worked} ms, land final ${t?.final} ms, kept ${t?.kept} ms`);
      console.log(rows.at(-1));
      await page.keyboard.press("Control+z");
      await idle(page);
    }
  }
  console.log(rows.join("\n"));
});
