// The start's one fit rule (PLAN §20 D342): edge, river, water and every other object's whole footprint stop the
// district center; plants and ruins of a generated map make room for it. Beyond the refusals, `startFitWarnings` says
// what the checks would flag with it there (the generation's objects out of their distance band from the start).
// The core's `startProblem`, the move operation (`planStart`) and the page's preview share the rule, and the checks
// (`entities.placement`, `start.clear`, `extras.placement`) agree with it on a generated map.

import { describe, expect, it } from "vitest";
import { MapSession } from "../../src/core/doc/session";
import { moveStartNear, startGroundOf, startMiddle, startProblem } from "../../src/core/doc/start";
import type { Feature } from "../../src/core/features/schema";
import { makesRoomForStart, standingFeatures, standingOf, startFitExtras, startFitProblem, startFitWarnings, takenTiles, type StartFitGround } from "../../src/core/doc/startFit";
import { EVERY_KIND, planRemove } from "../../src/core/doc/remove";
import { EXTRA_BANDS } from "../../src/core/validate/playability";
import { moveEdit, objectsOnNewGround, planStart } from "../../src/core/doc/tools";
import type { EditOp } from "../../src/core/doc/ops";
import { OBJECT_TEMPLATE, objectTiles, placementsOf } from "../../src/core/features/objects";
import { planMoveEntity } from "../../src/core/doc/placing";
import { tilesToRuns } from "../../src/core/math/grid";
import type { MapObjectFeature, StartFeature } from "../../src/core/features/schema";
import { entityTiles } from "../../src/core/features/edits";
import { footprintTiles } from "../../src/core/format/footprints";
import { writeTimber } from "../../src/core/format/timber";
import { generate } from "../../src/core/gen/generate";
import { makeSpec } from "../../src/core/spec/mapspec";

const W = 20;
const ground = (over: Partial<StartFitGround> = {}): StartFitGround => ({ W, H: W, river: () => false, depth: () => 0, taken: () => false, ...over });

describe("startFitProblem", () => {
  it("fits on clear ground and refuses the edge, a river, water and an object on any of its tiles, the door too", () => {
    expect(startFitProblem(ground(), 10, 10, [11, 8])).toBeNull();
    expect(startFitProblem(ground(), 1, 10, [2, 8])).toBe("too close to the map edge");
    expect(startFitProblem(ground({ river: (i) => i === 9 * W + 9 }), 10, 10, [11, 8])).toBe("in a river");
    expect(startFitProblem(ground({ depth: (i) => (i === 11 * W + 11 ? 0.5 : 0) }), 10, 10, [11, 8])).toBe("under water");
    // (a corner of the 3×3 and the door tile each)
    expect(startFitProblem(ground({ taken: (i) => i === 11 * W + 11 }), 10, 10, [11, 8])).toBe("on an object");
    expect(startFitProblem(ground({ taken: (i) => i === 8 * W + 11 }), 10, 10, [11, 8])).toBe("on an object");
  });

  it("makes room only for a generated plant or ruin, and the start itself", () => {
    expect(makesRoomForStart("Pine", false)).toBe(true);
    expect(makesRoomForStart("Pine", true)).toBe(false);
    expect(makesRoomForStart("GeothermalField", false)).toBe(false);
    expect(makesRoomForStart("StartingLocation", true)).toBe(true);
  });
});

describe("takenTiles", () => {
  it("covers every tile of an object's footprint, not only the tile it is anchored on (a geothermal field, a mine site), but for plants a generated map made room for and the start's own feature", () => {
    const o = (template: string, extra: object = {}) => ({ template, tiles: () => footprintTiles(template, { template, x: 30, y: 30, z: 0, orientation: "Cw0", flipped: false }), ...extra });
    for (const template of ["GeothermalField", "UndergroundRuins"]) {
      const tiles = footprintTiles(template, { template, x: 30, y: 30, z: 0, orientation: "Cw0", flipped: false });
      expect(tiles.length, template).toBeGreaterThan(1);
      const taken = takenTiles(64, 64, [o(template)], null);
      for (const [x, y] of tiles) expect(taken[y * 64 + x], `${template} at ${x},${y}`).toBe(1);
      // the start on any of them is refused
      const g: StartFitGround = { W: 64, H: 64, river: () => false, depth: () => 0, taken: (i) => !!taken[i] };
      for (const [x, y] of tiles) expect(startFitProblem(g, x, y, [x, y - 2]), `${template} at ${x},${y}`).toBe("on an object");
    }
    expect(takenTiles(64, 64, [o("Pine")], null).some(Boolean)).toBe(false);
    expect(takenTiles(64, 64, [o("Pine", { raw: {} })], null).some(Boolean)).toBe(true);
    expect(takenTiles(64, 64, [o("GeothermalField", { owner: "start-feature" })], "start-feature").some(Boolean)).toBe(false);
  });
});

describe("startFitWarnings", () => {
  it("names a generated object out of its band, in the checks' own words and distance; none inside it", () => {
    const W = 256;
    const tiles = [[100, 100], [101, 100], [100, 101], [101, 101]] as const;
    const extras = [{ kind: "geothermal" as const, tiles }];
    // the start's 3×3 at (90, 100) ends at x = 91, the field starts at x = 100: 9 tiles
    expect(startFitWarnings(extras, W, W, 90, 100)).toEqual(["Geothermal field 9 tiles from the start, wanted 30–120"]);
    expect(startFitWarnings(extras, W, W, 60, 100)).toEqual([]);
    expect(startFitWarnings(extras, W, W, 254, 100)[0]).toMatch(/^Geothermal field 1\d\d tiles from the start, wanted 30–120$/);
    // a smaller map scales the scaled bands (side ÷ 128)
    expect(startFitWarnings([{ kind: "geothermal", tiles: [[10, 30]] }], 64, 64, 20, 30)).toEqual(["Geothermal field 9 tiles from the start, wanted 15–60"]);
  });
  it("measures each object where it stands: a feature whose objects were removed is not asked, a moved one is asked where it went, a belt only where its thorns stand", () => {
    const f = { id: "g1", kind: "mapObject", origin: "generated", params: { kind: "relicSmall", placement: { x: 100, y: 100, orientation: "Cw0" } } } as unknown as Feature;
    const at = (x: number, y: number, orientation: "Cw0" | "Cw90" = "Cw0") => ({ owner: "g1", x, y, orientation });
    expect(startFitExtras([f], 256, 256)).toEqual([{ kind: "relicSmall", tiles: objectTiles(f as MapObjectFeature, 256, 256) }]);
    // standing where the feature says: the same array
    const where = placementsOf(f as MapObjectFeature, 256, 256)[0];
    const same = [f];
    expect(standingFeatures(same, [at(where.x, where.y)], 256, 256)).toBe(same);
    expect(startFitExtras([f], 256, 256, [{ ...at(0, 0), owner: "other" }])).toEqual([]);
    // moved 20 tiles east and turned: measured at its new footprint
    const template = OBJECT_TEMPLATE.relicSmall;
    expect(startFitExtras([f], 256, 256, [at(120, 100, "Cw90")])[0].tiles).toEqual(footprintTiles(template, { template, x: 120, y: 100, z: 0, orientation: "Cw90", flipped: false }));
    // a belt with two of its three thorns removed: only the third is measured
    const belt = { id: "b1", kind: "mapObject", origin: "generated", params: { kind: "thornBelt", placement: { area: tilesToRuns([10 * 256 + 10, 10 * 256 + 11, 10 * 256 + 12], 256) } } } as unknown as Feature;
    expect(startFitExtras([belt], 256, 256, [{ owner: "b1", x: 12, y: 10, orientation: "Cw0" }])).toEqual([{ kind: "thornBelt", tiles: [[12, 10]] }]);
  });
});

describe("an imported map's start", () => {
  it("is refused on a geothermal field, a mine site, a relic or thorns, though every imported object is owned by \"import\" (the start is skipped by its template, not its owner)", () => {
    const g = generate(makeSpec({ seed: 3, theme: "highlands", size: { x: 128, y: 128 } }));
    const s = MapSession.importMap(writeTimber(g.file), "valley.timber");
    const start = s.built.entities.find((e) => e.template === "StartingLocation")!;
    expect(start.owner).toBe("import");
    const objects = s.built.entities.filter((e) => /^(GeothermalField|UndergroundRuins|SmallRelic|MediumRelic|Thorns)$/.test(e.template));
    expect(objects.length).toBeGreaterThan(0);
    let refused = 0;
    for (const e of objects) {
      const [x, y] = entityTiles(e)[0];
      if (x < 3 || y < 3 || x > 124 || y > 124) continue;
      const plan = planStart(s, x, y, undefined, () => "x");
      expect(plan.ok, `${e.template} at ${x},${y}`).toBe(false);
      refused++;
    }
    expect(refused).toBeGreaterThan(0);
    // and the search for the nearest good spot never lands on one
    const at = startMiddle(s)!;
    const ops = moveStartNear(s, at[0], at[1]);
    if (ops) {
      const move = ops.find((o) => o.op === "moveEntity") as { params: { x: number; y: number } };
      const ground = startGroundOf(s.built, s.features, null);
      expect(startProblem(s.built, move.params.x + 1, move.params.y + 1, start.orientation, true, null, null, ground)).toBeNull();
    }
  });
});

describe("the fit rule and the checks agree on a generated map", () => {
  const r = generate(makeSpec({ seed: 3, theme: "highlands", size: { x: 128, y: 128 } }));
  const objects = r.features.filter((f): f is MapObjectFeature => f.kind === "mapObject" && f.origin === "generated" && ["geothermal", "mineSite", "relicSmall", "relicMedium"].includes(f.params.kind));
  const fresh = () => MapSession.fromGenerated(r, r.file);

  it("a start on an object's footprint is refused and the checks flag it; one the rule warns about is flagged by extras.placement; one it accepts raises neither", () => {
    expect(objects.length).toBeGreaterThan(0);
    const base = fresh();
    const feat = base.features.find((f): f is StartFeature => f.kind === "start")!;
    const ground = startGroundOf(base.built, base.features, feat.id);
    const o = feat.params.orientation;
    const { x: W, y: H } = base.size;
    const verdict = (x: number, y: number) => {
      const problem = startProblem(base.built, x, y, o, false, feat.id, null, ground, false);
      return problem ? ("on" as const) : startProblem(base.built, x, y, o, false, feat.id, null, ground, true) ? ("warn" as const) : ("clear" as const);
    };
    // spots on, beside and a few tiles from each object, and where the start stands now
    const tried: { x: number; y: number; kind: "on" | "warn" | "clear" }[] = [];
    const seen = { on: 0, warn: 0, clear: 0 };
    const cap = { on: 2, warn: 3, clear: 2 };
    const now = startMiddle(base)!;
    const spots: [number, number][] = [[now[0], now[1]]];
    for (const f of objects) {
      const tiles = objectTiles(f, W, H);
      const [cx, cy] = tiles[Math.floor(tiles.length / 2)];
      for (const [dx, dy] of [[0, 0], [3, 0], [-3, 0], [0, 4], [0, -4], [8, 0], [-8, 0], [0, 12]]) spots.push([cx + dx, cy + dy]);
    }
    for (const [x, y] of spots) {
      if (x < 3 || y < 3 || x > W - 4 || y > H - 4) continue;
      const kind = verdict(x, y);
      const hard = startProblem(base.built, x, y, o, false, feat.id, null, ground, false);
      // (only an object's footprint is tried as a refusal: the water and the river have their own tests)
      if (hard && hard !== "on an object") continue;
      if (seen[kind] < cap[kind]) {
        seen[kind]++;
        tried.push({ x, y, kind });
      }
    }
    expect(seen.on).toBeGreaterThan(0);
    expect(seen.warn).toBeGreaterThan(0);
    expect(seen.clear).toBeGreaterThan(0);
    const checksOf = (s: MapSession) => Object.fromEntries(s.validate().report.checks.map((c) => [c.id, c]));
    for (const t of tried) {
      const s = fresh();
      const plan = planStart(s, t.x, t.y, undefined, () => "x");
      if (t.kind === "on") {
        // the operation refuses it, and the checks flag it where it is forced
        expect(plan.ok, `on an object at ${t.x},${t.y}`).toBe(false);
        const at = startMiddle(s)!;
        const forced = moveEdit(s, feat.id, t.x - at[0], t.y - at[1]);
        expect(forced.ok).toBe(true);
        if (!forced.ok) continue;
        expect(s.applyAll(forced.ops, "user", "forced").ok).toBe(true);
        expect(checksOf(s)["entities.placement"]?.ok, `entities.placement at ${t.x},${t.y}`).toBe(false);
        continue;
      }
      expect(plan.ok, `${t.kind} at ${t.x},${t.y}`).toBe(true);
      if (!plan.ok) continue;
      expect(s.applyAll(plan.ops, "user", plan.label).ok).toBe(true);
      expect(startMiddle(s)).toEqual([t.x, t.y]);
      const checks = checksOf(s);
      expect(checks["entities.placement"]?.ok && checks["start.clear"]?.ok, `entities.placement and start.clear at ${t.x},${t.y}`).toBe(true);
      expect(checks["extras.placement"]?.ok, `extras.placement at ${t.x},${t.y} (${t.kind})`).toBe(t.kind === "clear");
    }
  });

  it("the start's own fix never moves it to a spot the checks would flag for the generation's objects", () => {
    const s = fresh();
    const at = startMiddle(s)!;
    // (from beside a mine site, where the nearest good spot is close to an object with a band)
    const f = objects.find((g) => g.params.kind === "mineSite")!;
    const [fx, fy] = objectTiles(f, s.size.x, s.size.y)[0];
    for (const from of [at, [fx, fy] as [number, number]]) {
      const ops = moveStartNear(s, from[0], from[1]);
      if (!ops) continue;
      const move = ops.find((o) => o.op === "updateFeature") as { params: { patch: { params?: { position?: [number, number] } } } };
      const pos = move.params.patch.params!.position!;
      const feat = s.features.find((g): g is StartFeature => g.kind === "start")!;
      expect(startProblem(s.built, pos[0], pos[1], feat.params.orientation, false, feat.id, null, startGroundOf(s.built, s.features, feat.id), true)).toBeNull();
    }
  });
});

describe("Clear everything on a generated map", () => {
  it("leaves no distance flag behind: the checks and the start's preview measure only the objects that stand, before and after a start is placed", () => {
    const r = generate(makeSpec({ seed: 3, theme: "highlands", size: { x: 128, y: 128 } }));
    const s = MapSession.fromGenerated(r, r.file);
    const { x: W, y: H } = s.size;
    const owners = () => standingOf(s.built.entities);
    // on the map as generated every relic, mine site, field, belt and core stands: the checks read every feature
    const banded = s.features.filter((f) => f.kind === "mapObject" && f.params.kind in EXTRA_BANDS);
    expect(banded.length).toBeGreaterThan(0);
    expect(standingFeatures(s.features, owners(), W, H)).toBe(s.features);
    const p = planRemove(s, Array.from({ length: W * H }, (_, i) => i), EVERY_KIND, "Clear everything");
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    expect(s.applyAll(p.ops, "user", p.label).ok).toBe(true);
    expect(s.features.some((f) => f.kind === "start")).toBe(false);
    // (the features stay in the document, their objects gone)
    expect(s.features.filter((f) => f.kind === "mapObject" && f.params.kind in EXTRA_BANDS).length).toBe(banded.length);
    expect(startFitExtras(s.features, W, H, owners())).toEqual([]);
    const flag = () => s.validate().report.checks.find((c) => c.id === "extras.placement");
    expect(flag()?.ok, flag()?.message).not.toBe(false);
    // a spot the removed objects' bands would have flagged: the start's preview says "Place here" there, and placed
    // there the checks raise no distance flag
    const stale = startFitExtras(s.features, W, H);
    let spot: [number, number] | null = null;
    for (let y = 4; y < H - 4 && !spot; y += 3)
      for (let x = 4; x < W - 4 && !spot; x += 3) if (!startProblem(s.built, x, y, "Cw0", false, null) && startFitWarnings(stale, W, H, x, y).length) spot = [x, y];
    expect(spot).not.toBeNull();
    const [x, y] = spot!;
    expect(startProblem(s.built, x, y, "Cw0", false, null, null, startGroundOf(s.built, s.features, null), true)).toBeNull();
    const placed = planStart(s, x, y, undefined, () => crypto.randomUUID());
    expect(placed.ok).toBe(true);
    if (!placed.ok) return;
    const applied = s.applyAll(placed.ops, "user", placed.label);
    expect(applied.ok, applied.errors.join("; ")).toBe(true);
    expect(startMiddle(s)).toEqual([x, y]);
    expect(flag()?.ok, flag()?.message).toBe(true);
  });
});

describe("a map object measured where it stands, by the checks and the start's preview alike", () => {
  // (Highlands seed 4 for 3 since generator 0.10.6, D498, D148: on seed 3 every spot within 12 tiles of its relic has more than
  // the relic out of its band, and a start put there is flagged for the geothermal field and more; of Highlands seeds 1–12 checked,
  // 4 and 6 have a spot a few tiles from the relic where only the relic is out of its band)
  const r = generate(makeSpec({ seed: 4, theme: "highlands", size: { x: 128, y: 128 } }));
  const fresh = () => MapSession.fromGenerated(r, r.file);
  const W = 128;
  const startOf = (s: MapSession) => s.features.find((g): g is StartFeature => g.kind === "start")!;
  /** The start's preview at (x, y), or at its middle: the core's strict reading, what the page's amber shows. */
  const preview = (s: MapSession, at?: readonly [number, number]) => {
    const [x, y] = at ?? startMiddle(s)!;
    return startFitWarnings(startGroundOf(s.built, s.features, startOf(s).id).extras, W, W, x, y);
  };
  const fits = (s: MapSession, x: number, y: number) => !startProblem(s.built, x, y, startOf(s).params.orientation, false, startOf(s).id, null, startGroundOf(s.built, s.features, startOf(s).id), false);
  const check = (s: MapSession) => s.validate().report.checks.find((c) => c.id === "extras.placement")!;
  const relic = r.features.find((f): f is MapObjectFeature => f.kind === "mapObject" && f.origin === "generated" && f.params.kind === "relicSmall")!;
  const near = /^Small relic \d+ tiles from the start, wanted 13–70$/;
  /** Drags the relic, as the select tool does, to the first spot within `radius` of the start the move allows whose
   *  preview matches `want`. */
  const dragRelic = (s: MapSession, want: (w: string[]) => boolean, radius: number) => {
    const [sx, sy] = startMiddle(s)!;
    const standing = standingOf(s.built.entities);
    for (let d = 2; d <= radius; d++)
      for (const [tx, ty] of [[sx + d, sy], [sx - d, sy], [sx, sy + d], [sx, sy - d], [sx + d, sy + d], [sx - d, sy - d], [sx + d, sy - d], [sx - d, sy + d]]) {
        // (only the spots whose preview would match are tried: a move and its settle are slow)
        const there = standing.map((o) => (o.owner === relic.id ? { ...o, x: tx, y: ty } : o));
        if (!want(startFitWarnings(startFitExtras(s.features, W, W, there), W, W, sx, sy))) continue;
        const e = s.built.entities.find((g) => g.owner === relic.id)!;
        const p = planMoveEntity(s, e.id, tx - e.x, ty - e.y);
        if (!p.ok || !s.applyAll(p.ops, "user", p.label).ok) continue;
        if (want(preview(s))) return true;
        s.undo();
      }
    return false;
  };

  it("a relic dragged too near the start is flagged where it went", () => {
    const s = fresh();
    expect(relic).toBeDefined();
    expect(preview(s).some((w) => w.startsWith("Small relic"))).toBe(false);
    expect(dragRelic(s, (w) => w.some((l) => near.test(l)), 12)).toBe(true);
    const c = check(s);
    expect(c.ok).toBe(false);
    expect(c.message).toContain(preview(s).find((l) => near.test(l))!);
  });

  it("a relic the check flags is no longer flagged once dragged away", () => {
    const s = fresh();
    const [rx, ry] = objectTiles(relic, W, W)[0];
    // the start placed a few tiles from the relic, where only the relic is out of its band
    let placed = false;
    for (let d = 5; d <= 12 && !placed; d++)
      for (const [x, y] of [[rx + d, ry], [rx - d, ry], [rx, ry + d], [rx, ry - d], [rx + d, ry + d], [rx - d, ry - d]]) {
        if (!fits(s, x, y)) continue;
        const w = preview(s, [x, y]);
        if (w.length !== 1 || !near.test(w[0])) continue;
        const p = planStart(s, x, y, undefined, () => "x");
        if (!p.ok || !s.applyAll(p.ops, "user", p.label).ok) continue;
        placed = true;
        break;
      }
    expect(placed).toBe(true);
    expect(check(s).ok).toBe(false);
    // dragged into its band: the preview and the check both clear
    expect(dragRelic(s, (w) => w.length === 0, 40)).toBe(true);
    expect(check(s).ok, check(s).message).toBe(true);
  });

  it("a terrain edit at a dragged relic's old spot neither clears nor names it; one at its new spot does", () => {
    const s = fresh();
    const old = objectTiles(relic, W, W);
    expect(dragRelic(s, () => true, 40)).toBe(true);
    const now = startFitExtras(s.features, W, W, standingOf(s.built.entities)).find((e) => e.kind === "relicSmall" && e.tiles.some(([x, y]) => !old.some(([ox, oy]) => ox === x && oy === y)))!;
    expect(now).toBeDefined();
    // (the two footprints well apart)
    expect(old.every(([ox, oy]) => now.tiles.every(([x, y]) => Math.max(Math.abs(x - ox), Math.abs(y - oy)) > 4))).toBe(true);
    /** A plateau over a footprint and the ground around it: its ground changes under it (a footprint it covered only in
     *  part would be cleared, the same pass). */
    const plateau = (tiles: readonly (readonly [number, number])[]) => {
      const xs = tiles.map((q) => q[0]);
      const ys = tiles.map((q) => q[1]);
      const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
      const h = s.built.heights[y0 * W + x0];
      const id = crypto.randomUUID();
      const outline: [number, number][] = [[x0 - 3.5, y0 - 3.5], [x1 + 3.5, y0 - 3.5], [x1 + 3.5, y1 + 3.5], [x0 - 3.5, y1 + 3.5]];
      const op: EditOp = { op: "addFeature", params: { feature: { id, kind: "landform", origin: "user", locked: false, params: { kind: "plateau", edgeStyle: "cliff", outline, height: h > 12 ? h - 3 : h + 3 } } } };
      return objectsOnNewGround(s, [op], new Set([id]));
    };
    const atOld = plateau(old);
    expect(atOld.refuse).toBeUndefined();
    expect(atOld.ops.some((o) => o.op === "deleteFeature" && o.params.id === relic.id)).toBe(false);
    expect(atOld.report.some((l) => l.includes("small relic"))).toBe(false);
    const atNew = plateau(now.tiles);
    expect(atNew.refuse).toBeUndefined();
    expect(atNew.report.some((l) => l.includes("small relic"))).toBe(true);
  });

  it("a thorn belt's removed thorns no longer flag: what stands of it is measured", () => {
    const s = fresh();
    const belt = s.features.find((f): f is MapObjectFeature => f.kind === "mapObject" && f.origin === "generated" && f.params.kind === "thornBelt")!;
    expect(belt).toBeDefined();
    const bt = objectTiles(belt, W, W);
    // (the check's distance: chamfer, from the start's 3×3 to the tile)
    const dist = (tx: number, ty: number, x: number, y: number) => {
      const ax = Math.max(Math.abs(tx - x) - 1, 0);
      const ay = Math.max(Math.abs(ty - y) - 1, 0);
      return Math.SQRT2 * Math.min(ax, ay) + Math.abs(ax - ay);
    };
    // (the map's other belts, which must keep their band where the start goes)
    const others = s.features.filter((f): f is MapObjectFeature => f.kind === "mapObject" && f.params.kind === "thornBelt" && f.id !== belt.id).map((f) => ({ kind: f.params.kind, tiles: objectTiles(f, W, W) }));
    // the start near the belt, where it is out of its band (20+) and some of its thorns are 21+ tiles off
    let spot: [number, number] | null = null;
    for (let d = 10; d <= 18 && !spot; d++)
      for (const [bx, by] of bt) {
        for (const [x, y] of [[bx + d, by], [bx - d, by], [bx, by + d], [bx, by - d]]) {
          if (x < 3 || y < 3 || x > W - 4 || y > W - 4 || !fits(s, x, y)) continue;
          if (!preview(s, [x, y]).some((l) => l.startsWith("Thorn belt")) || !bt.some(([qx, qy]) => dist(qx, qy, x, y) >= 21) || startFitWarnings(others, W, W, x, y).length) continue;
          spot = [x, y];
          break;
        }
        if (spot) break;
      }
    expect(spot).not.toBeNull();
    const [x, y] = spot!;
    const ps = planStart(s, x, y, undefined, () => "x");
    expect(ps.ok && s.applyAll(ps.ops, "user", ps.label).ok).toBe(true);
    expect(check(s).message).toContain("Thorn belt");
    // its thorns nearer than its band removed
    const close = bt.filter(([qx, qy]) => dist(qx, qy, x, y) < 21).map(([qx, qy]) => qy * W + qx);
    const pr = planRemove(s, close, ["objects"], "Remove thorns");
    expect(pr.ok).toBe(true);
    if (!pr.ok) return;
    expect(s.applyAll(pr.ops, "user", pr.label).ok).toBe(true);
    expect(s.built.entities.some((e) => e.owner === belt.id)).toBe(true);
    // the preview and the check agree: neither names the belt now
    const w = preview(s);
    expect(w.some((l) => l.startsWith("Thorn belt"))).toBe(false);
    const c = check(s);
    expect(c.message).not.toContain("Thorn belt");
    expect(c.ok).toBe(w.length === 0);
    for (const l of w) expect(c.message).toContain(l);
  });
});

describe("an imported map", () => {
  it("refuses the start over another object, though every imported object is owned by 'import'", () => {
    const r = generate(makeSpec({ seed: 3, theme: "highlands", size: { x: 128, y: 128 } }));
    const imp = MapSession.importMap(writeTimber(r.file), "valley.timber");
    expect(imp.features.some((f) => f.kind === "start")).toBe(false);
    const own = imp.built.entities.find((e) => e.template === "StartingLocation")!;
    expect(own.owner).toBe("import");
    const refused = imp.built.entities
      .filter((e) => e.template !== "StartingLocation" && e.x > 4 && e.y > 4 && e.x < 123 && e.y < 123)
      .filter((e) => (planStart(imp, e.x, e.y, undefined, () => "x") as { errors?: string[] }).errors?.[0]?.endsWith("on an object"));
    expect(refused.length).toBeGreaterThan(0);
  });
});
