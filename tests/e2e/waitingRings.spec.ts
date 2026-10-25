import { expect, test } from "@playwright/test";

// The first visit's waiting states (#506) must animate in the BUILT page, not only under `vite dev`: the CSS minifier
// once turned the rings' nameless shorthand ("animation: 6s linear infinite") into "animation: none", and the rings
// never drew. This runs on the production e2e build, so it would have caught that.
test("the first visit's contour rings and the making card's water animate in the built page", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("./#s=4242&z=192&d=n&t=riverValley");
  // (polled until the empty land square is there; it goes when the first picture arrives, so the first sight is the one read)
  const handle = await page.waitForFunction(
    () => {
      const rings = [...document.querySelectorAll(".first-look-empty .contours path")];
      const water = document.querySelector(".making-water > span");
      if (rings.length === 0 || !water) return null;
      const contours = document.querySelector(".first-look-empty .contours")!;
      return {
        rings: rings.map((p) => {
          const s = getComputedStyle(p);
          return { name: s.animationName, duration: s.animationDuration, count: s.animationIterationCount };
        }),
        fade: getComputedStyle(contours).animationName,
        near: getComputedStyle(water).animationName,
        far: getComputedStyle(water.parentElement!, "::before").animationName,
      };
    },
    undefined,
    { timeout: 30_000, polling: "raf" },
  );
  const seen = (await handle.jsonValue()) as {
    rings: { name: string; duration: string; count: string }[];
    fade: string;
    near: string;
    far: string;
  };
  expect(seen.rings.map((r) => r.name)).toEqual([1, 2, 3, 4, 5].map((n) => `contour-draw-${n}`));
  for (const r of seen.rings) {
    expect(r.duration).toBe("6s");
    expect(r.count).toBe("infinite");
  }
  expect(seen.fade).toBe("contour-fade");
  expect(seen.near).toContain("making-flow-near");
  expect(seen.far).toBe("making-flow-far");
});
