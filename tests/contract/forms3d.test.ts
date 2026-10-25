// A generated map with 3D forms (D488; gen/forms3d.ts, land/forms3d.ts): its caves are in its field and
// its file, its water is the stacked engine's on every column (D120, #435's gap closed for generated
// caves), nothing it holds falls (D121), and its project reopens to the same .timber, byte for byte.
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decodeProject, encodeProject, generatedDocument } from "../../src/core/doc/document";
import { MapSession } from "../../src/core/doc/session";
import { generate } from "../../src/core/gen/generate";
import { standProblem } from "../../src/core/features/objects";
import { FORMS, type FormId } from "../../src/core/land/forms3d";
import { makeSpec } from "../../src/core/spec/mapspec";
import { ColumnTerrain } from "../../src/core/terrain/runs";

const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");

let made: ReturnType<typeof generate> | null = null;
/** Canyon 96² seed 3 at Verticality 80, made once. */
function canyon3(): ReturnType<typeof generate> {
  if (made) return made;
  const spec = makeSpec({ seed: 3, theme: "canyon", size: { x: 96, y: 96 } });
  spec.settings.terrain.verticality = 80;
  made = generate(spec);
  return made;
}

describe("a generated map's 3D forms (D488)", () => {
  it("Canyon 96² seed 3 at Verticality 80: spring caves and an arch, stacked water, the project reopens to the same file", () => {
    const r = canyon3();
    expect(r.report.passed).toBe(true);
    const kept = r.intentions.filter((x) => x.ok && FORMS.includes(x.id as FormId)).map((x) => x.id);
    expect(kept).toContain("spring-cave");
    expect(kept).toContain("gorge-arch");
    // nothing falls, and the water settled on every column
    expect(r.built.dropped ?? 0).toBe(0);
    expect(r.built.waterModel.stacked).toBeDefined();
    expect(r.built.settle.stack?.stacked).toBe(true);
    // the file holds the caves and the water on every column, as the game saves such a map
    const w = r.file.world;
    expect(ColumnTerrain.fromVoxels(w.voxels, w.sizeX, w.sizeY, w.layers).allPlain()).toBe(false);
    expect((w.singletons.WaterMapNew as { Levels: number }).Levels).toBeGreaterThan(1);
    // a cave's spring stands on the cave's floor, under its roof
    const springs = r.features.filter((f) => f.kind === "river" && f.role?.startsWith("river/caveSpring/")).map((f) => f.id);
    const sources = r.built.entities.filter((e) => e.template === "WaterSource" && springs.includes(e.owner));
    expect(sources.length).toBeGreaterThan(0);
    for (const e of sources) expect(r.built.heights[e.y * 96 + e.x]).toBeGreaterThan(e.z);
    // the project reopens to the same file, its caves the session's
    const s = MapSession.open(decodeProject(encodeProject(generatedDocument(r))));
    expect(sha(s.exportTimber().bytes)).toBe(sha(r.bytes));
    expect(s.columns.size).toBeGreaterThan(0);
    expect(s.plainAt(sources[0].y * 96 + sources[0].x)).toBe(false);
  });

  it("a cave spring's source stands where the game keeps it, and no object is placed in its cells (D491)", () => {
    const r = canyon3();
    const springs = r.features.filter((f) => f.kind === "river" && f.role?.startsWith("river/caveSpring/")).map((f) => f.id);
    const src = r.built.entities.find((e) => e.template === "WaterSource" && springs.includes(e.owner))!;
    // the source passes the game's own rule on the cave's floor (the build routes every source on a map
    // with caves through it)
    const mask = r.built.waterModel.stacked!.mask;
    expect(standProblem("WaterSource", { x: src.x, y: src.y, z: src.z, orientation: "Cw0" }, { W: 96, H: 96, mask })).toBeNull();
    // a relic at the source's level, on its tile, is refused with the reason; beside it, in the cave, it stands
    const s = MapSession.open(decodeProject(encodeProject(generatedDocument(r))));
    const relic = (x: number, y: number) => ({ op: "addFeature", params: { feature: { id: "f-aaaaaaaaaaaab", kind: "mapObject", origin: "user", locked: false, params: { kind: "relicSmall", placement: { x, y, orientation: "Cw0", z: src.z } } } } });
    const on = s.apply(relic(src.x, src.y) as never);
    expect(on.ok).toBe(false);
    expect(on.errors[0]).toMatch(/a water source stands there/i);
    expect(s.built.entities.some((e) => e.id === src.id && e.x === src.x && e.y === src.y)).toBe(true);
  });

  it("at Verticality 0 the same map grows none", () => {
    const spec = makeSpec({ seed: 3, theme: "canyon", size: { x: 96, y: 96 } });
    spec.settings.terrain.verticality = 0;
    const r = generate(spec);
    expect(r.intentions.filter((x) => FORMS.includes(x.id as FormId))).toEqual([]);
    expect(r.built.waterModel.stacked).toBeUndefined();
  });
});
