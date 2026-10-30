// The forces beside caves and objects (D487, D368 (10)): a force runs round a cave and the ground that
// holds up its roof, so nothing it leaves falls and nothing is taken back after it plays; a gesture on a
// cave is refused before it plays, naming the place; a force that would still leave ground falling is
// refused before it plays; Rift, Deposit and Erode leave every object of several tiles on its ground; the
// placement check's fix keeps an object it can set on level ground.

import { describe, expect, it } from "vitest";
import { applyForce } from "../../src/core/collab";
import { checkItem } from "../../src/core/doc/checkItems";
import type { EditOp } from "../../src/core/doc/ops";
import { MapSession } from "../../src/core/doc/session";
import { CarvePlay } from "../../src/core/forces/carve/play";
import { DEFAULTS as CARVE_DEFAULTS } from "../../src/core/forces/carve/run";
import { CRATER_DEFAULTS } from "../../src/core/forces/craterize";
import { DepositRun, DEPOSIT_DEFAULTS } from "../../src/core/forces/deposit";
import { footprint } from "../../src/core/forces/objects";
import { ERODE_DEFAULTS } from "../../src/core/forces/erode";
import { ERUPT_DEFAULTS } from "../../src/core/forces/erupt";
import { GLACIATE_DEFAULTS } from "../../src/core/forces/glaciate/model";
import { QUAKE_DEFAULTS } from "../../src/core/forces/quake";
import { RIFT_DEFAULTS } from "../../src/core/forces/rift";
import { fallsBeforePlay, planForce, type ForceRequest } from "../../src/core/forces/start";
import { forceMapOfSession } from "../../src/core/collab/forceStep";
import { writeTimber } from "../../src/core/format/timber";
import { voxelsFromHeights } from "../../src/core/format/world";
import { roofHolders, unsupportedVoxels } from "../../src/core/terrain/support";
import { CAVE, CAVE_H as H, CAVE_W as W, caveFile, caveSession } from "./caveMap";

const G = "00000000-0000-4000-8000-000000000001";
const S = "00000000-0000-4000-8000-000000000002";
const base = { cut: null, natural: true } as const;

/** Each force at (x, y): a click there, or a line drawn down through it. */
function gestures(x: number, y: number, power = 60, seed = 3): ForceRequest[] {
  const line = [{ x, y: y - 7 }, { x, y }, { x, y: y + 7 }];
  return [
    { verb: "carve", settings: { ...CARVE_DEFAULTS, power, seed, dry: true }, origin: [x, y], ...base },
    { verb: "craterize", settings: { ...CRATER_DEFAULTS, power, seed }, origin: [x, y], ...base },
    { verb: "erupt", settings: { ...ERUPT_DEFAULTS, power, seed }, origin: [x, y], ...base },
    { verb: "quake", settings: { ...QUAKE_DEFAULTS, mode: "lift", power, seed }, path: line, side: 1, ...base },
    { verb: "glaciate", settings: { ...GLACIATE_DEFAULTS, power, seed }, origin: [x, y], ...base },
    { verb: "rift", settings: { ...RIFT_DEFAULTS, power, size: 12, seed }, path: line, ...base },
    { verb: "deposit", settings: { ...DEPOSIT_DEFAULTS, power, size: 16, seed }, path: line, ...base },
    { verb: "erode", settings: { ...ERODE_DEFAULTS, power, seed }, path: line, ...base },
  ];
}

function settled(s: MapSession): MapSession {
  s.settleCanonical();
  return s;
}

describe("a force beside a cave (D487)", () => {
  it("every force runs round the cave and the ground holding up its roof: it changes the land, and nothing falls or is taken back", () => {
    const s0 = caveSession();
    const holders = roofHolders(s0.terrain, s0.columns.keys());
    // (the cave's rim and the cliff behind the ledge hold the roofs; the lowland under the ledge holds nothing)
    expect(holders).toContain(17 * W + CAVE.x0 - 1);
    expect(holders).not.toContain(12 * W + 33);
    for (const request of gestures(12, 17)) {
      const s = settled(caveSession());
      const before = s.terrain.mask.slice();
      const r = applyForce(s, { id: G, sourceId: S, request });
      expect(r.ok ? "" : r.reason, request.verb).toBe("");
      expect(s.terrain.mask.some((m, i) => m !== before[i]), `${request.verb} changes the land`).toBe(true);
      expect(unsupportedVoxels(s.terrain).every((v) => v === 0), `${request.verb}: nothing falls`).toBe(true);
      // (Erode is the force that works under roofs, D281: the others leave the caves and their holders as they are)
      if (request.verb !== "erode") for (const i of [...s0.columns.keys(), ...holders]) expect(s.terrain.mask[i], `${request.verb} at (${i % W}, ${Math.floor(i / W)})`).toBe(before[i]);
    }
  });

  it("a gesture on a cave, or on the ground holding up its roof, is refused before it plays, naming the place", () => {
    const s = settled(caveSession());
    const mask = s.terrain.mask.slice();
    const [carve, crater, , quake, , rift] = gestures(17, 17);
    const refused = (request: ForceRequest) => {
      const r = applyForce(s, { id: G, sourceId: S, request });
      return r.ok ? "" : r.reason;
    };
    expect(refused(carve)).toBe("A carve leaves caves and overhangs as they are: there is one at X 17 · Y 17");
    expect(refused(crater)).toBe("A force leaves caves and overhangs as they are: there is one at X 17 · Y 17");
    expect(refused(gestures(14, 17)[1])).toBe("That ground holds up a cave or overhang at X 14 · Y 17: a force leaves it as it is");
    // (a drawn line pressed on the cave)
    expect(refused({ ...rift, path: [{ x: 17, y: 17 }, { x: 10, y: 25 }] } as ForceRequest)).toBe("A force leaves caves and overhangs as they are: there is one at X 17 · Y 17");
    expect(refused({ ...quake, path: [{ x: 18, y: 16 }] } as ForceRequest)).toBe("A force leaves caves and overhangs as they are: there is one at X 18 · Y 16");
    expect(Array.from(s.terrain.mask)).toEqual(Array.from(mask));
    expect(s.canUndo).toBe(false);
  });

  it("a force whose result would still leave ground falling is refused before it plays, naming the place", () => {
    const s = settled(caveSession());
    for (const request of gestures(12, 17).filter((r) => r.verb === "craterize" || r.verb === "carve")) {
      const plan = planForce({ base: forceMapOfSession(s), request, caves: s.columns.keys(), state: s.terrainState(), newId: () => S });
      expect(plan.ok).toBe(true);
      if (!plan.ok) continue;
      const play = plan.carve ? new CarvePlay(plan.carve, false) : null;
      // the roofs' ground kept, its planned result makes nothing fall
      expect(fallsBeforePlay(plan, play, W, H, (h, m) => s.forceFalls(h, m))).toBeNull();
      // (and where something would, say an object that held a roof went with it, it is refused with the place)
      expect(fallsBeforePlay(plan, play, W, H, () => [3 * W * H + 19 * W + 32, 3 * W * H + 19 * W + 33])).toBe("2 blocks of ground would fall at X 32 · Y 19: nothing would hold them up");
    }
  });
});

/** A flat imported map at level 4 with a NaturalOverhang2x1 at (10, 10) (its anchor's tile plain) and one
 *  block of ground at z 5 over its other tile, held up by nothing but the overhang's top. */
function overhangMap(): MapSession {
  const v = voxelsFromHeights(new Uint8Array(W * H).fill(4), W, H);
  v[5 * W * H + 11 * W + 10] = 1;
  const file = caveFile(v);
  file.world.entities = [{ Id: "00000000-0000-4000-8000-0000000000aa", Template: "NaturalOverhang2x1", Components: { BlockObject: { Coordinates: { X: 10, Y: 10, Z: 4 }, Orientation: "Cw0" } } }] as never;
  return settled(MapSession.importMap(writeTimber(file), "overhang.timber"));
}

describe("an object that holds up a roof (D487)", () => {
  it("a force beside it runs round it and its ground; without it the planned result would drop the roof, and is refused naming the place", () => {
    const s = overhangMap();
    const overhang = s.built.entities.find((e) => e.template === "NaturalOverhang2x1")!;
    expect(overhang).toBeDefined();
    expect(unsupportedVoxels(s.terrain, null).some((v) => v === 1)).toBe(true);
    // (the planned result without the overhang: its roof would fall, and the falls name it)
    const gone = s.built.entities.filter((e) => e.id !== overhang.id);
    expect(s.forceFalls(s.built.heights, null, gone)).toEqual([5 * W * H + 11 * W + 10]);
    expect(s.forceFalls(s.built.heights, null, s.built.entities)).toEqual([]);
    const request: ForceRequest = { verb: "craterize", settings: { ...CRATER_DEFAULTS, power: 50, seed: 3 }, origin: [13, 10], ...base };
    const plan = planForce({ base: forceMapOfSession(s), request, caves: s.columns.keys(), state: s.terrainState(), newId: () => S });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    // (the planned map leaves the overhang where it was: the force ran round it)
    expect(fallsBeforePlay(plan, null, W, H, (h, m, e) => s.forceFalls(h, m, e))).toBeNull();
    expect(plan.staged!.final()!.entities.some((e) => e.id === overhang.id)).toBe(true);
    const r = applyForce(s, { id: G, sourceId: S, request });
    expect(r.ok ? "" : r.reason).toBe("");
    expect(s.built.entities.some((e) => e.id === overhang.id)).toBe(true);
    expect(s.terrain.mask[11 * W + 10]).toBe(0b101111);
    // (and with its ground not kept, the planned result is refused before it plays, naming the roof's place)
    expect(fallsBeforePlay(plan, null, W, H, (h, m) => s.forceFalls(h, m, gone))).toBe("1 block of ground would fall at X 10 · Y 11: nothing would hold it up");
  });
});

/** A flat imported map at level 8 with relics and natural overhangs on a grid (every fifth tile from 6). */
function relicMap(): MapSession {
  const s = MapSession.importMap(writeTimber(caveFile(voxelsFromHeights(new Uint8Array(W * H).fill(8), W, H))), "relics.timber");
  let n = 0;
  for (let y = 6; y < 34; y += 5)
    for (let x = 6; x < 34; x += 5) {
      const template = ["SmallRelic", "MediumRelic", "LargeRelic", "NaturalOverhang3x1"][n % 4];
      const id = `00000000-0000-4000-8000-${String(100000000000 + n++).padStart(12, "0")}`;
      expect(s.apply({ op: "placeEntity", params: { id, template, x, y, orientation: "Cw0" } } as EditOp).ok).toBe(true);
    }
  return settled(s);
}

describe("objects of several tiles ride their ground whole (D368 (10))", () => {
  it("a Rift, a Deposit and an Erode across relics leave every one on its ground", () => {
    const placed = relicMap().built.entities.length;
    let k = 0;
    for (const [x, y] of [[12, 13], [17, 18], [27, 8]] as [number, number][])
      for (const a of [0, 0.7, 1.6]) {
        const line = [-8, 0, 8].map((d) => ({ x: Math.max(1, Math.min(38, x + d * Math.cos(a))), y: Math.max(1, Math.min(38, y + d * Math.sin(a))) }));
        const power = 40 + 20 * (k++ % 3);
        const seed = k;
        for (const request of [
          { verb: "rift", settings: { ...RIFT_DEFAULTS, power, size: 8, seed }, path: line, ...base },
          { verb: "deposit", settings: { ...DEPOSIT_DEFAULTS, power, size: 10, seed }, path: line, ...base },
          { verb: "erode", settings: { ...ERODE_DEFAULTS, power, seed }, path: line, ...base },
        ] as ForceRequest[]) {
          const s = relicMap();
          const r = applyForce(s, { id: G, sourceId: S, request });
          expect(r.ok ? "" : r.reason, request.verb).toBe("");
          const check = s.validate("export").report.checks.find((c) => c.id === "entities.placement")!;
          expect(check.ok ? "" : check.message, `${request.verb} at (${x}, ${y}) ${a}`).toBe("");
          if (request.verb !== "deposit") expect(s.built.entities.length).toBe(placed);
        }
      }
  });

  it("a Deposit's numbers count the ground as it leaves it, the relics' footprints kept and its material too", () => {
    const before = forceMapOfSession(relicMap());
    const W0 = before.W;
    const relics = before.entities.map((e) => footprint(before, e)).filter((tiles) => tiles.length > 1);
    let kept = 0;
    for (const [x, y] of [[12, 13], [17, 18], [27, 8]] as [number, number][])
      for (const a of [0, 0.7, 1.6])
        for (const power of [40, 60, 80]) {
          const path = [-8, 0, 8].map((d) => ({ x: Math.max(1, Math.min(38, x + d * Math.cos(a))), y: Math.max(1, Math.min(38, y + d * Math.sin(a))) }));
          const r = new DepositRun(before, { ...DEPOSIT_DEFAULTS, power, size: 10, seed: power }, { path }).finishAll();
          const { stats, raw } = r.plan0;
          const dz = (i: number) => raw.heights[i] - before.heights[i];
          let changed = 0;
          let eroded = 0;
          let deposited = 0;
          for (let i = 0; i < raw.heights.length; i++) {
            if (dz(i)) changed++;
            if (dz(i) > 0) deposited += dz(i);
            else eroded -= dz(i);
          }
          const at = `${x}, ${y}, ${a}, ${power}`;
          expect([stats.changed, stats.eroded, stats.deposited, stats.balance], at).toEqual([changed, eroded, deposited, deposited - eroded]);
          // (what a relic's footprint kept as it was took back is laid or left elsewhere: it keeps its material, D356, #714)
          expect(deposited, at).toBe(eroded);
          for (const tiles of relics) {
            expect(new Set(tiles.map(dz)).size, at).toBe(1);
            const edge = tiles.flatMap((i) => [i - 1, i + 1, i - W0, i + W0]).filter((j) => j >= 0 && j < raw.heights.length && !tiles.includes(j));
            if (dz(tiles[0]) === 0 && edge.some((j) => dz(j) !== 0)) kept++;
          }
        }
    // (somewhere the fan reached a relic and kept its footprint as it was)
    expect(kept).toBeGreaterThan(0);
  });

  it("the placement check's fix sets a relic left on uneven ground on level ground, and keeps it", () => {
    const s = relicMap();
    const relic = s.built.entities.find((e) => e.template === "LargeRelic")!;
    // (two tiles under it raised: a single raised tile is a spike the integrity pass removes)
    expect(s.apply({ op: "sculpt", params: { mode: "raise", cells: [[relic.y + 1, relic.x + 1, relic.x + 2]], amount: 1 } }).ok).toBe(true);
    const failing = s.validate("export").report.checks.find((c) => c.id === "entities.placement")!;
    expect(failing.ok).toBe(false);
    const item = checkItem(s, failing);
    expect(item.fix![0].label).toBe("Level the ground under the objects");
    expect(item.fix!.some((op) => op.op === "deleteEntities")).toBe(false);
    expect(s.applyAll(item.fix!, "fix", item.fix![0].label).ok).toBe(true);
    expect(s.validate("export").report.checks.find((c) => c.id === "entities.placement")!.ok).toBe(true);
    expect(s.built.entities.some((e) => e.id === relic.id)).toBe(true);
  });
});
