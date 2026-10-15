// A force's water starts from the water on screen (Kyler, 2026-10-05). The page plays the map's water
// journey at its own pace, behind the worker's: a force started while the journey still played began
// from the worker's water, so its first frame jumped a settling lake by half a level or more. The page now
// says which water it shows (`forceShows`), and the force's water starts from that.

import { afterEach, expect, it } from "vitest";
import { CRATER_DEFAULTS } from "../../src/core/forces/craterize";
import type { ForceRequest } from "../../src/core/forces/start";
import { MapSession } from "../../src/core/doc/session";
import { decodeProject } from "../../src/core/doc/document";
import { makeSpec } from "../../src/core/spec/mapspec";
import { waterFromDepth } from "../../src/render3d/model";
import { runGenerate } from "../../src/worker/api";
import * as ed from "../../src/worker/session";

const W = 96;

afterEach(() => {
  ed.forceCancel();
  ed.closeSession();
});

it("a force started while the page still plays the water's journey starts from the water on screen", async () => {
  await runGenerate(makeSpec({ seed: 21, theme: "highlands", size: { x: W, y: W } }));
  ed.refine();
  const b = MapSession.open(decodeProject(ed.project().bytes)).built;
  // the page shows the map's water as it was before the edit below (its journey has only begun)
  const shown = waterFromDepth(b.heights, b.water, b.contamination);
  // a strong source on dry ground away from the corner the force strikes
  const dry = (x: number, y: number) => { for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) if (b.water[(y + dy) * W + x + dx] > 0) return false; return true; };
  let spot: [number, number] | null = null;
  for (let y = 40; y < 80 && !spot; y++) for (let x = 40; x < 80 && !spot; x++) if (dry(x, y) && !b.entities.some((e) => Math.abs(e.x - x) < 3 && Math.abs(e.y - y) < 3)) spot = [x, y];
  expect(spot, "a dry spot").not.toBeNull();
  const id = "aaaaaaaa-bbbb-4ccc-8ddd-000000000475";
  expect(ed.apply({ op: "placeEntity", params: { id, template: "WaterSource", x: spot![0], y: spot![1], orientation: "Cw0", components: { WaterSource: { SpecifiedStrength: 8, CurrentStrength: 8 } } } } as never).errors).toEqual([]);
  // the worker's water runs ahead: settled, its new pool in place
  ed.settleWater();
  const settled = MapSession.open(decodeProject(ed.project().bytes)).built.water;
  let ahead = 0;
  for (let i = 0; i < W * W; i++) if (Math.abs(settled[i] - b.water[i]) > 0.5) ahead++;
  expect(ahead, "the worker's water is ahead of the page's").toBeGreaterThan(20);

  ed.forceShows(shown);
  const request = { verb: "craterize", settings: { ...CRATER_DEFAULTS, mode: "strike", power: 40, size: 10 }, origin: [12, 12], cut: null } as ForceRequest;
  expect(ed.forceStart(request).errors).toEqual([]);
  const first = ed.flowForceWater(0)!;
  expect(first).not.toBeNull();
  // away from the crater, the force's first water is the water on screen
  const onScreen = new Float64Array(W * W);
  for (let k = 0; k < shown.count; k++) onScreen[shown.tile[k]] = shown.depth[k];
  let off = 0;
  for (let i = 0; i < W * W; i++) {
    const x = i % W;
    const y = (i - x) / W;
    if (Math.hypot(x - 12, y - 12) < 14) continue;
    if (Math.abs(first[i] - onScreen[i]) > 1e-6) off++;
  }
  expect(off, "tiles whose water jumped from the water on screen").toBe(0);
}, 120_000);
