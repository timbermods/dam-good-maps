// ROADMAP M8 acceptance: a local edit re-previews in ≤ 2 s at 256² (EDITOR_PLAN §6, §9), in the
// page's worker. On 256² maps of the two themes with the slowest water (Islands and Lake Basin,
// PLAN §20 D83), ground beside the water is lowered and a weir closes the main river. Since live
// editing (Kyler: an edit never waits on the water) the worker answers an edit at once with the
// last settled water on the new ground, and the warm-started water follows in the background; the
// two times reported are the edit's answer and its water settled (D148: this test timed one
// answer that held both before). The background check then settles the water canonically, and
// the export is the canonical file (tools/bench-preview.ts measures the same in Node).
//
// The edits must apply; their times are reported against the budget, not asserted (timings are
// information, tools/timings.ts): a loaded machine or a shared CI runner is slower than a player's.
// The budget is 2 s locally (this machine, PLAN §20 D46's rule for budgets) and 6 s in CI, whose
// runners are slower and share their cores. `npm run bench:preview` measures the same in Node.

import { expect, test } from "@playwright/test";
import { recordTiming } from "../../tools/timings";

const BUDGET = process.env.CI ? 6000 : 2000;

for (const theme of ["islands", "lakeBasin"]) {
  test(`${theme} 256²: a local edit re-previews, and its time is reported`, async ({ page }) => {
    test.setTimeout(300_000);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`./#s=1&z=256&d=n&t=${theme}`);
    await expect(page.getByText(/All \d+ checks passed/)).toBeVisible({ timeout: 120_000 });
    await page.getByRole("button", { name: "Refine this map" }).click();
    await page.waitForFunction(() => !!window.dgmEditor && !!window.dgm3d, null, { timeout: 120_000 });
    // let the first background check finish, so the edit is timed on its own
    await expect(page.getByRole("button", { name: /^Checks: (Ready to play|\d+ things? to look at)/ })).toBeVisible({ timeout: 120_000 });

    const times = await page.evaluate(async () => {
      const ed = window.dgmEditor!;
      const api = ed.worker;
      const view = await api.sessionView();
      const info = view.info;
      const W = info.W;
      const out: { name: string; ms: number; ok: boolean }[] = [];
      // ground beside deep water, away from the start
      const surface = new Map<number, number>();
      for (let k = 0; k < view.view.water.count; k++) surface.set(view.view.water.tile[k], view.view.water.depth[k]);
      const start = info.features.find((f) => f.kind === "start")!.params as { position: [number, number] };
      let at: [number, number] | null = null;
      for (let i = 0; i < W * W && !at; i += 7) {
        const x = i % W;
        const y = Math.floor(i / W);
        if (x < 12 || y < 12 || x > W - 14 || y > W - 14 || surface.has(i) || Math.hypot(x - start.position[0], y - start.position[1]) < 24) continue;
        for (let dy = -4; dy <= 4 && !at; dy++) for (let dx = -4; dx <= 4; dx++) if ((surface.get((y + dy) * W + x + dx) ?? 0) > 0.3) at = [x, y];
      }
      const cells: [number, number, number][] = [];
      for (let y = at![1] - 3; y <= at![1] + 3; y++) cells.push([y, at![0] - 3, at![0] + 3]);
      let t0 = performance.now();
      let u = await api.apply({ op: "sculpt", params: { mode: "lower", cells, amount: 2 } }, "user", "Lower terrain");
      out.push({ name: "lower ground beside water", ms: performance.now() - t0, ok: u.ok });
      await api.whenWaterSettles();
      out.push({ name: "lower ground beside water, its water settled", ms: performance.now() - t0, ok: u.ok });
      // a weir across the main river
      const river = u.info.features.find((f) => f.kind === "river" && "edge" in (f.params as { entry: object }).entry && !(f.params as { badwater: boolean }).badwater)!;
      for (const s of [30, 40, 60, 80]) {
        const plan = await api.planTool({ tool: "object", kind: "weir", river: { id: river.id, at: s } }, "7a1b2c3d-2222-4222-8333-444455556666");
        if (!plan.ok) continue;
        t0 = performance.now();
        u = await api.applyAll(plan.ops, "Add weir");
        out.push({ name: "a weir across the main river", ms: performance.now() - t0, ok: u.ok });
        await api.whenWaterSettles();
        out.push({ name: "a weir across the main river, its water settled", ms: performance.now() - t0, ok: u.ok });
        break;
      }
      // the canonical settle in the background, then the export
      t0 = performance.now();
      const bg = await api.backgroundCheck();
      out.push({ name: "background check (canonical settle and every check)", ms: performance.now() - t0, ok: !!bg });
      return out;
    });
    expect(times.length).toBe(5);
    for (const t of times.slice(0, 4)) {
      expect(t.ok, t.name).toBe(true);
      recordTiming({ what: `${theme} 256²: ${t.name} (preview.spec)`, ms: t.ms, budget: BUDGET });
    }
    console.log(`${theme} 256²: ${times[4].name}: ${Math.round(times[4].ms)} ms`);
    expect(times[4].ok).toBe(true);
  });
}
