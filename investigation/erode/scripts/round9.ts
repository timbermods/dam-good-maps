import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { checkSupport } from "../../terrain3d/proto/support";
import { autoSize, landAt, planErode } from "../core/erode";
import type { ErodeMap } from "../core/map";
import { LAYERS, Terrain } from "../core/terrain";
import { CASES } from "../demo/cases";
import { WALL_CALIBRATION } from "../demo/calibration";
import { kylerCase } from "../demo/sweeps";
import { shelterMetrics } from "./round2";
import { floorCheck } from "./round6";

type Reference = { case: string; power: number; size: number | null; worn: number; held: number; sha256: string };
export function round9Checks(load: (id: string) => ErodeMap) {
  const refs = JSON.parse(readFileSync(new URL("../checks/round9-baseline.json", import.meta.url), "utf8")) as
    Record<"round7" | "round8", { ref: string; cases: Reference[] }>;
  let frames = 0, gestures = 0;
  const rows = refs.round7.cases.map(r => {
    const c = [...CASES, WALL_CALIBRATION].find(c => c.id === r.case)!, m = load(c.map);
    const before = Terrain.fromHeights(m.W, m.H, m.heights), input = { terrain: before, rock: m.rock, keep: m.keep, water: m.water };
    const settings = { ...c, power: r.power, size: r.size };
    for (const normal of [undefined, 0]) {
      const points = c.points.map(p => ({ ...p, nz: normal }));
      const p = planErode(input, { points }, settings);
      assert.equal(p.worn, r.worn, `${c.id} P${r.power}: Round 7 worn volume`);
      assert.equal(p.held, r.held, `${c.id} P${r.power}: Round 7 held volume`);
      assert.equal(createHash("sha256").update(new Uint8Array(p.final.cols.buffer)).digest("hex"), r.sha256, "face terrain differs from Round 7");
      assert.equal(shelterMetrics(before, p).leftoverSingleBlocks, 0);
      for (let b = 0; b < p.buckets; b++) {
        const shown = landAt(before, p, b);
        floorCheck(before, { ...p, final: shown }, 1);
        assert.equal(checkSupport(m.W, m.H, shown.voxels(), LAYERS).unsupported.length, 0);
        for (let i = 0; i < before.N; i++) if (m.keep[i]) assert.equal(shown.cols[i], before.cols[i]);
        frames++;
      }
      assert.deepEqual(landAt(before, p, 23).cols, p.final.cols);
      gestures++;
    }
    if (r.case === WALL_CALIBRATION.id) for (const floor of [8, 14, 22]) {
      const p = planErode(input, { points: c.points }, { ...settings, floor }); floorCheck(before, p, floor);
      assert.equal(checkSupport(m.W, m.H, p.final.voxels(), LAYERS).unsupported.length, 0); gestures++;
    }
    return { case: r.case, power: r.power, size: r.size ?? autoSize(r.power),
      round7Worn: r.worn, round8Worn: refs.round8.cases.find(b => b.case === r.case && b.power === r.power)!.worn,
      round9Worn: r.worn, byteIdenticalToRound7: true, result: "PASS" };
  });
  const wall = rows.filter(r => r.case === WALL_CALIBRATION.id);
  assert.ok(wall[0].round9Worn < wall[1].round9Worn && wall[1].round9Worn < wall[2].round9Worn);
  assert.ok(wall[0].round8Worn > wall[0].round9Worn, "fixture did not reproduce excessive Round 8 wear");
  const m = load("crater"), before = Terrain.fromHeights(m.W, m.H, m.heights), c = kylerCase(m);
  const long = planErode({ terrain: before, rock: m.rock, keep: m.keep, water: m.water }, { points: c.points }, c);
  assert.equal(createHash("sha256").update(new Uint8Array(long.final.cols.buffer)).digest("hex"),
    "9f575170dc4abd3d8441d7a66d1ae0647170be22a1d8e53ab18224b3c9398a46", "Round 8 long-sweep terrain changed");
  let samples = 0, changed = 0;
  for (let k = 1; k < c.points.length; k++) {
    const a = c.points[k - 1], b = c.points[k], n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y));
    for (let j = 0; j <= n; j++) { const i = Math.floor(a.y + (b.y - a.y) * j / n) * m.W + Math.floor(a.x + (b.x - a.x) * j / n);
      samples++; if (before.cols[i] !== long.final.cols[i]) changed++; }
  }
  assert.equal(samples, 152); assert.equal(changed, 152); assert.equal(long.worn, 6597);
  const result = { result: "PASS", gestures, animationBuckets: frames, droppedVoxels: 0, leftoverSingleBlocks: 0,
    belowFloorVoxelsRemoved: 0, sourceGround: "PASS", round7FaceFixtures: rows,
    longSweep: { worn: long.worn, changedSamples: changed, strokeSamples: samples, byteIdenticalToRound8: true } };
  console.log(JSON.stringify(result)); return result;
}
