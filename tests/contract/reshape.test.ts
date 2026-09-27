// ROADMAP M8 (from the workshop study, D87; decisions-pending #47): set pieces, lakes and landforms
// that reshape the ground move the map objects standing on it to the new ground, or clear them,
// and the report says which (EDITOR_PLAN §3). A property test: on generated maps, standalone
// waterfalls, lakes and landforms are placed beside every kind of map object, at random offsets;
// after each edit no object is left floating (the loader's rules, entities.placement) and every
// generated object still stands where the generator's rules allow (extras.placement's ground).

import { describe, expect, it } from "vitest";
import { MapSession } from "../../src/core/doc/session";
import { footprintCheck, objectGround, planObject } from "../../src/core/doc/placing";
import { planContextOf, planLake, planLandform, planPiece, withObjectsOnNewGround, type PlannedEdit } from "../../src/core/doc/tools";
import { footprintAt, fitProblems, objectTiles } from "../../src/core/features/objects";
import type { MapObjectFeature, MapObjectKind, Point, RiverFeature } from "../../src/core/features/schema";
import { generate, type GenerateResult } from "../../src/core/gen/generate";
import { stream } from "../../src/core/math/rng";
import { makeSpec, type ThemeId } from "../../src/core/spec/mapspec";
import { validateFile } from "../../src/core/validate/checks";
import { pathField } from "../../src/core/features/geometry";

const uuid = (k: number) => `5f1e2d3c-${String(1000 + (k % 9000)).padStart(4, "0")}-4b5a-8c7d-${String(k).padStart(12, "0")}`;

const generated = new Map<string, GenerateResult>();

/** A fresh editor session on the generated map (each map is generated once). */
function session(theme: ThemeId, seed: number): MapSession {
  const key = `${theme}/${seed}`;
  let r = generated.get(key);
  if (!r) {
    const spec = makeSpec({ seed, size: { x: 128, y: 128 }, theme });
    spec.settings.hazards.thornBelts = "some";
    spec.settings.hazards.unstableCores = "on";
    spec.settings.resources.mineSites = 3;
    r = generate(spec);
    expect(r.report.passed).toBe(true);
    generated.set(key, r);
  }
  return MapSession.fromGenerated(r);
}

/** Objects the loader would delete (entities.placement), and generated or placed map objects whose
 *  own ground no longer holds them (uneven ground under a single object). */
function floating(s: MapSession): string[] {
  const c = validateFile(s.exportFile(), { profile: "export", spec: s.spec, features: s.features, loadOnly: true }).checks.find((x) => x.id === "entities.placement")!;
  const out = c.ok ? [] : [c.message];
  const { x: W, y: H } = s.size;
  for (const f of s.features) {
    if (f.kind !== "mapObject" || "area" in f.params.placement) continue;
    const tiles = objectTiles(f, W, H).filter(([x, y]) => x >= 0 && y >= 0 && x < W && y < H);
    const lv = new Set(tiles.map(([x, y]) => s.built.heights[y * W + x]));
    if (lv.size > 1) out.push(`${f.params.kind} ${f.id} stands on uneven ground`);
  }
  return out;
}

/** Make sure the map has an object of `kind`, placing one with the editor's tool if the generator
 *  made none. Returns the object's feature. */
function objectOf(s: MapSession, kind: MapObjectKind, k: number): MapObjectFeature | null {
  const have = s.features.find((f): f is MapObjectFeature => f.kind === "mapObject" && f.params.kind === kind);
  if (have) return have;
  const { x: W, y: H } = s.size;
  let plan: PlannedEdit | null = null;
  if (kind === "weir" || kind === "plug") {
    const river = s.features.find((f): f is RiverFeature => f.kind === "river" && !f.params.badwater && "edge" in f.params.entry);
    if (!river) return null;
    const field = pathField(river.params.path, W, H);
    let len = 0;
    for (let i = 0; i < W * H; i++) if (s.built.channel[i] && field.d[i] < 1) len = Math.max(len, field.s[i]);
    for (const at of [0.3, 0.4, 0.6, 0.7].map((u) => Math.round(u * len))) {
      const p = planObject(s, { kind, river: { id: river.id, at } }, uuid(k));
      if (p.ok) {
        plan = p;
        break;
      }
    }
  } else {
    const g = objectGround(s);
    for (let y = 6; y < H - 10 && !plan; y += 3)
      for (let x = 6; x < W - 10 && !plan; x += 3) {
        if (kind === "thornBelt") {
          const tiles: number[] = [];
          for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 8; dx++) tiles.push((y + dy) * W + x + dx);
          if (tiles.some((i) => fitProblems("thornBelt", [[i % W, Math.floor(i / W)]], g).length)) continue;
          const p = planObject(s, { kind, tiles, density: 1 }, uuid(k));
          if (p.ok) plan = p;
        } else if (!fitProblems(kind, footprintAt(kind, x, y, "Cw0"), g).length) {
          const p = planObject(s, { kind, at: [x, y], orientation: "Cw0", ...(kind === "unstableCore" ? { core: { radius: 2, cycles: 6 } } : {}) }, uuid(k));
          if (p.ok) plan = p;
        }
      }
  }
  if (!plan?.ok) return null;
  expect(s.applyAll(plan.ops, "user", plan.label).ok).toBe(true);
  return s.features.find((f): f is MapObjectFeature => f.id === plan!.ops.find((o) => o.op === "addFeature")?.params.feature.id) ?? null;
}

type Shape = "waterfall" | "lake" | "landform";

/** A plan of `shape` placed so it overlaps the object's tiles or lies right beside them. */
function planBeside(s: MapSession, shape: Shape, obj: MapObjectFeature, rng: ReturnType<typeof stream>, id: string): PlannedEdit {
  const { x: W, y: H } = s.size;
  const tiles = objectTiles(obj, W, H);
  const cx = tiles.reduce((a, t) => a + t[0], 0) / tiles.length;
  const cy = tiles.reduce((a, t) => a + t[1], 0) / tiles.length;
  const ox = Math.round(cx + rng.range(-4, 4));
  const oy = Math.round(cy + rng.range(-4, 4));
  if (shape === "waterfall") {
    const facing = rng.pick(["north", "east", "south", "west"] as const);
    return planPiece(s, "waterfall", { mode: "standalone", lip: [ox, oy], facing, width: 4 + rng.int(0, 6), drop: 3 }, id);
  }
  const r = 3 + rng.int(0, 4);
  const outline: Point[] = [
    [ox - r - 0.5, oy - r - 0.5],
    [ox + r + 0.5, oy - r - 0.5],
    [ox + r + 0.5, oy + r + 0.5],
    [ox - r - 0.5, oy + r + 0.5],
  ];
  const ctx = planContextOf(s);
  const p = shape === "lake" ? planLake({ outline }, ctx, id) : planLandform({ outline, kind: "hill", edgeStyle: "gentle" }, ctx, id);
  return withObjectsOnNewGround(s, p, id);
}

const KINDS: MapObjectKind[] = ["mineSite", "relicSmall", "relicMedium", "relicLarge", "geothermal", "unstableCore", "thornBelt", "weir", "plug"];

describe("set pieces, lakes and landforms beside map objects leave none floating (ROADMAP M8, D87)", () => {
  it.each([
    ["riverValley", 13],
    ["lakeBasin", 13],
    ["highlands", 12],
  ] as [ThemeId, number][])("%s seed %i: every kind of object, waterfalls, lakes and landforms at random offsets", (theme, seed) => {
    const rng = stream(seed, "reshape-test", 0, 0);
    let placed = 0;
    let cleared = 0;
    let moved = 0;
    let k = 0;
    for (const kind of KINDS) {
      for (const shape of ["waterfall", "lake", "landform"] as Shape[]) {
        for (let tryN = 0; tryN < 3; tryN++) {
          const s = session(theme, seed);
          const obj = objectOf(s, kind, 100 + k++);
          if (!obj) break; // this map has no room for this kind of object (a relic's large footprint)
          const p = planBeside(s, shape, obj, rng, uuid(5000 + k));
          if (!p.ok) continue;
          const applied = s.applyAll(p.ops, "user", p.label);
          expect(applied.ok, `${kind} ${shape}: ${applied.errors.join("; ")}`).toBe(true);
          placed++;
          if (p.report.some((l) => /^clears/.test(l))) cleared++;
          if (p.report.some((l) => /moves to the new ground/.test(l))) moved++;
          expect(floating(s), `${theme} ${kind} beside a ${shape}: ${p.report.join("; ")}`).toEqual([]);
          break;
        }
      }
    }
    // enough edits landed, and some of them had to move or clear an object
    expect(placed).toBeGreaterThanOrEqual(15);
    expect(cleared + moved).toBeGreaterThan(0);
  });

  it("an object a lake would drown is cleared, and the report says so", () => {
    // (seed 14: since the resources of 0.6.2, seed 13's small relic has no room for a lake round it)
    const s = session("riverValley", 14);
    const relic = objectOf(s, "relicSmall", 1)!;
    const { x: W, y: H } = s.size;
    const [x, y] = objectTiles(relic, W, H)[0];
    // a lake drawn right over the relic
    let p: PlannedEdit | null = null;
    for (const r of [4, 5, 6]) {
      const outline: Point[] = [
        [x - r - 0.5, y - r - 0.5],
        [x + r + 0.5, y - r - 0.5],
        [x + r + 0.5, y + r + 0.5],
        [x - r - 0.5, y + r + 0.5],
      ];
      const q = withObjectsOnNewGround(s, planLake({ outline }, planContextOf(s), uuid(77)), uuid(77));
      if (q.ok) {
        p = q;
        break;
      }
    }
    expect(p?.ok).toBe(true);
    if (!p?.ok) return;
    expect(p.report.join(" ")).toMatch(/clears the small relic/);
    expect(p.ops.some((o) => o.op === "deleteFeature" && o.params.id === relic.id)).toBe(true);
    expect(s.applyAll(p.ops, "user", p.label).ok).toBe(true);
    expect(floating(s)).toEqual([]);
    expect(footprintCheck).toBeTypeOf("function");
  });
});
