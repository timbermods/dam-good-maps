import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { HEADROOM, planErode } from "../core/erode";
import type { ErodeMap } from "../core/map";
import { Terrain } from "../core/terrain";
import { CASES } from "../demo/cases";

export function round3Checks(load: (id: string) => ErodeMap) {
  const plans = CASES.map(c => {
    const m = load(c.map), before = Terrain.fromHeights(m.W, m.H, m.heights);
    return { c, before, p: planErode({ terrain: before, rock: m.rock, keep: m.keep, water: m.water }, { points: c.points }, c) };
  });
  // Round 2 reference results: the unrelated cases and small wash must remain byte-identical.
  const unchanged: Record<string, string> = {
    "crater-lip": "5a6396df73d7a49495e4a32a1875ced8196f65326d7b19e95029dcc3d8d6baa2",
    "canyon-cave": "1474fe5cf21fa33a5fe10503f7c620ea77c6eff5f68d252d63e98177cf5e6372",
    "tall-shore": "7a7b7dad797f68bdce5d346e91a38d121560de16fb10b0da985a3e0afc861a71",
    "wash-small": "692ed5e43c168f801ad496b59ae4a2287f91bc6359fafb771c74bb24d39595d5",
  };
  for (const { c, p } of plans) if (unchanged[c.id]) assert.equal(
    createHash("sha256").update(new Uint8Array(p.final.cols.buffer)).digest("hex"), unchanged[c.id], `${c.id}: Round 2 changed`);

  const arch = plans.find(({ c }) => c.id === "tall-arch")!;
  const a = arch.p.final, floor = arch.p.focus!.z;
  let building: { x: number; y: number; roofedTiles: number } | undefined;
  for (let y = arch.p.box.y0; y <= arch.p.box.y1; y++) for (let x = arch.p.box.x0; x <= arch.p.box.x1; x++) {
    if (x + 2 >= a.W || y + 2 >= a.H) continue;
    const tiles = Array.from({ length: 9 }, (_, k) => (y + Math.floor(k / 3)) * a.W + x + k % 3);
    if (!tiles.every(i => a.at(i, floor - 1) && Array.from({ length: HEADROOM }, (_, z) => !a.at(i, floor + z)).every(Boolean))) continue;
    if (!tiles.some(i => arch.before.surface(i) === floor)) continue; // level access from outside
    const roofedTiles = tiles.filter(i => a.surface(i) > floor + HEADROOM).length;
    if (!building || roofedTiles > building.roofedTiles) building = { x, y, roofedTiles };
  }
  assert.ok(building && building.roofedTiles >= 3, "arch needs a level 3×3×5 building space under its thin roof");

  const wash = plans.find(({ c }) => c.id === "wash-giant")!;
  const w = wash.p.final, path = wash.p.wash!.path;
  const heights = path.map(i => w.run0Top(i));
  const falls = heights.slice(1).map((z, k) => heights[k] - z).filter(d => d >= 2);
  const bed = wash.p.wash!.bedTiles.filter(i => w.run0Top(i) < wash.before.run0Top(i));
  const tributaryTiles = bed.filter(i => path.every(j => Math.hypot(i % w.W - j % w.W, Math.floor(i / w.W) - Math.floor(j / w.W)) > 12)).length;
  let shelves = 0, sheerEdges = 0;
  for (const i of bed) {
    const z = w.run0Top(i), x = i % w.W;
    const ns = [x ? i - 1 : -1, x < w.W - 1 ? i + 1 : -1, i - w.W, i + w.W].filter(j => j >= 0 && j < w.N);
    if (ns.some(j => w.run0Top(j) - z >= 4)) sheerEdges++;
    if (z > 6 && z < wash.before.run0Top(i) - 1 && ns.some(j => w.run0Top(j) === z)) shelves++;
  }
  const washShape = { dryFallsAtLeastTwoLevels: falls.length, fallHeights: falls, tributaryTiles,
    shelfTiles: shelves, sheerBankTiles: sheerEdges, undercutTiles: w.multiRun() };
  assert.ok(falls.length >= 1, "giant wash needs a visible dry fall");
  assert.ok(tributaryTiles > 0, "giant wash needs tributaries beyond its main banks");
  assert.ok(shelves > 0 && sheerEdges > 0 && w.multiRun() > 0, "giant wash needs varied banks");
  const row = { result: "PASS", unchangedRound2Cases: Object.keys(unchanged),
    arch: { footprint: "3×3", headroom: HEADROOM, floor, ...building }, wash: washShape };
  console.log(JSON.stringify(row));
  return row;
}
