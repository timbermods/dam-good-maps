// A force's water starts from the water on screen (Kyler, 2026-10-05). The page plays the map's water
// journey at its own pace, behind the worker's: a force started while the journey still played began
// from the worker's water, so its first frame jumped a settling lake by half a level or more. The page now
// says which water it shows (`forceShows`), and the force's water starts from that.

import { afterEach, expect, it } from "vitest";
import { CRATER_DEFAULTS } from "../../src/core/forces/craterize";
import type { ForceRequest } from "../../src/core/forces/start";
import { MapSession } from "../../src/core/doc/session";
import { decodeProject } from "../../src/core/doc/document";
import { waterFromDepth, type WaterView } from "../../src/render3d/model";
import * as ed from "../../src/worker/session";
import { fixtureInEditor } from "../fixtureEditor";

const W = 96;

afterEach(() => {
  ed.forceCancel();
  ed.listen(null);
  ed.setAutoWater(false);
  ed.closeSession();
});

/** Wait (real time) until `ok`, or fail after `ms`. */
async function until(ok: () => boolean, ms = 60_000): Promise<void> {
  const t0 = Date.now();
  while (!ok()) {
    if (Date.now() - t0 > ms) throw new Error("timed out");
    await new Promise((r) => setTimeout(r, 10));
  }
}

/** The water a view shows on tile `i` (a map without caves: one column a tile). */
const depthAt = (v: WaterView, i: number) => {
  for (let k = 0; k < v.count; k++) if (v.tile[k] === i) return v.depth[k];
  return 0;
};

/** Seed 25's first dry spot clear of objects away from the corner a force strikes (the map as built). */
function drySpot(b: MapSession["built"]): [number, number] {
  const dry = (x: number, y: number) => { for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) if (b.water[(y + dy) * W + x + dx] > 0) return false; return true; };
  for (let y = 40; y < 80; y++) for (let x = 40; x < 80; x++) if (dry(x, y) && !b.entities.some((e) => Math.abs(e.x - x) < 3 && Math.abs(e.y - y) < 3)) return [x, y];
  throw new Error("no dry spot");
}

it("a force started while the page still plays the water's journey starts from the water on screen", async () => {
  // (seed 25 for 21 since generator 0.10.17's start floors, D515, D148: seed 21's first dry spot, (43, 40), drains its
  // source's water away, so the settled water stands over half a level deeper on only 5 tiles; a map with a roof (a cave
  // or an overhang) starts a force from the worker's water by design, `shownByPage`, so the map wants none: of seeds
  // 21, 22 and 25–32, seeds 25 and 27 have no roof, and seed 25's source pools on 423 tiles; seed 27 since generator
  // 0.10.19's dry washes, D517, D148: seed 25's middle holds no dry spot clear of objects now; seed 25 again since D518's
  // mends moved the land, D148: seed 27's dry spot, (55, 40), now pools on only 10 tiles, where seed 25's, (70, 40), pools
  // on 1472, and its map is still roofless, so the force's first water is the water on screen)
  // (the map is a fixture, tests/fixtures/projects/scenario-highlands-96-25, saved at generator 0.10.24: the subject is
  // the force's first water, not the generator, so a land change moves nothing here, D148; 0.10.26's ruin fields
  // moved what stands at seed 25's spot, so the source no longer pooled ahead on more than 20 tiles)
  fixtureInEditor("highlands", W, 25);
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

it("a force taken back while the water still flows after an edit leaves the water as it found it, flowing on from there (#1222)", async () => {
  // (the heightfield's twin of tests/contract/caveLiveWater.test.ts's: the map's water, flowing, handed back as the force
  // found it, not the settle from before the edit)
  fixtureInEditor("highlands", W, 25);
  const b = MapSession.open(decodeProject(ed.project().bytes)).built;
  const spot = drySpot(b);
  const i = spot[1] * W + spot[0];
  const frames: { version: number; draft: boolean; water: WaterView }[] = [];
  ed.listen((e) => {
    if (e.kind === "water") frames.push({ version: e.version, draft: !!e.draft, water: e.water });
  });
  ed.setAutoWater(true);
  const id = "aaaaaaaa-bbbb-4ccc-8ddd-000000000476";
  expect(ed.apply({ op: "placeEntity", params: { id, template: "WaterSource", x: spot[0], y: spot[1], orientation: "Cw0", components: { WaterSource: { SpecifiedStrength: 8, CurrentStrength: 8 } } } } as never).errors).toEqual([]);
  const v = ed.sessionInfo().version;
  // the new source's pool rising, part way, the map's settle not yet in
  await until(() => frames.some((f) => f.version === v && !f.draft && depthAt(f.water, i) > 0.3));
  const risen = depthAt(frames.filter((f) => f.version === v && !f.draft).at(-1)!.water, i);
  expect(ed.collabSession()!.waterStale, "the map's water still flowing").toBe(true);
  // a crater struck far off, then taken back
  const request = { verb: "craterize", settings: { ...CRATER_DEFAULTS, mode: "strike", power: 40, size: 10 }, origin: [12, 12], cut: null } as ForceRequest;
  expect(ed.forceStart(request).errors).toEqual([]);
  const back = ed.forceCancel();
  expect(back.taken).toBe("work");
  // the water as it was when the force began (no pool there in the settle before the edit)
  expect(b.water[i]).toBe(0);
  expect(Math.abs(depthAt(back.water!, i) - risen)).toBeLessThan(0.05);
  // and it flows on from there, never back to the dry ground before the edit
  const n = frames.length;
  await until(() => frames.length > n + 1);
  for (const f of frames.slice(n)) expect(depthAt(f.water, i)).toBeGreaterThan(risen / 2);
  await until(() => !ed.waterSettling());
}, 120_000);
