// The start is the faction's district center with the game's fire in its bowl (D178 as amended 2026-11-10, D496):
// startFire.ts draws the fire by the game's own numbers (palette.ts `START_FIRE`), entities3d.ts the Folktails' or the
// Iron Teeth's building by the faction the renderer is given, Folktails by default.

import { describe, expect, it } from "vitest";
import { ShaderMaterial, Vector4 } from "three";
import { FIRE_PARTICLES, fireDrawn, StartFire, startCentres } from "../../src/render3d/startFire";
import { buildEntities, modelKeyOf, modelTriangles, startBatch } from "../../src/render3d/entities3d";
import { entityView } from "../../src/render3d/model";

const starts = entityView([
  { template: "StartingLocation", x: 4, y: 6, z: 3, orientation: "Cw0", owner: "s" },
  { template: "Pine", x: 9, y: 9, z: 4, orientation: "Cw0", owner: "p" },
  { template: "StartingLocation", x: 12, y: 2, z: 5, orientation: "Cw180", owner: "t" },
]);
const uniforms = () => ({ time: { value: 0 }, slice: { value: 99 }, objectFade: { value: new Vector4() }, objectHide: { value: 0 } });

describe("the start's fire", () => {
  it("burns over each start's footprint middle, at its level, whichever way it faces", () => {
    const c = startCentres(starts);
    expect(c).toHaveLength(2);
    expect(c[0]).toEqual([5.5, 3, -7.5]);
    // (turned half round, the footprint lies the other way from its anchor; its middle is still a tile's middle)
    expect(c[1][1]).toBe(5);
    expect(c[1][0] % 1).toBe(0.5);
    expect(Math.abs(c[1][2] % 1)).toBe(0.5);
  });

  it("is the game's 125 particles a start, made again only when the starts change", () => {
    const fire = new StartFire(uniforms());
    expect(fire.set(startCentres(starts))).toBe(true);
    expect(fire.mesh.count).toBe(2 * FIRE_PARTICLES);
    expect(fire.count).toBe(2);
    expect(fire.set(startCentres(starts))).toBe(false);
    expect(fire.set([])).toBe(true);
    expect(fire.mesh.visible).toBe(false);
    fire.dispose();
  });

  it("is not drawn, so asks for no frames and lights nothing, while the objects are hidden or the cut is below its bowl", () => {
    const c = startCentres(starts)[0];
    // (the bowl's emitter 3.16 above the start's level, 3)
    expect(fireDrawn(c, 99, 0)).toBe(true);
    expect(fireDrawn(c, 6.16, 0)).toBe(true);
    expect(fireDrawn(c, 6, 0)).toBe(false);
    expect(fireDrawn(c, 3, 0)).toBe(false);
    expect(fireDrawn(c, 99, 1)).toBe(false);
  });

  it("hides and fades with the objects and is cut away above the layer, by the scene's own uniforms", () => {
    const u = uniforms();
    const fire = new StartFire(u);
    const m = fire.mesh.material as ShaderMaterial;
    for (const k of ["time", "slice", "objectFade", "objectHide"] as const) expect(m.uniforms[k]).toBe(u[k]);
    expect(m.fragmentShader).toContain("discard");
    fire.dispose();
  });
});

describe("the faction's district center", () => {
  it("draws the Folktails' by default and the Iron Teeth's when given that faction, under the same model key", () => {
    expect(modelKeyOf("StartingLocation", 0)).toBe("start");
    expect(startBatch("Folktails")).toBe("start");
    expect(startBatch("IronTeeth")).toBe("start.IronTeeth");
    const folk = buildEntities(starts, new ShaderMaterial());
    const names = (g: typeof folk.group) => new Set(g.children.map((c) => c.name));
    expect(names(folk.group).has("start")).toBe(true);
    expect(names(folk.group).has("start.IronTeeth")).toBe(false);
    const iron = buildEntities(starts, new ShaderMaterial(), null, 0, false, undefined, undefined, "IronTeeth");
    expect(names(iron.group).has("start.IronTeeth")).toBe(true);
    expect(names(iron.group).has("start")).toBe(false);
    const ironMesh = iron.group.children.find((c) => c.name === "start.IronTeeth") as unknown as { count: number };
    expect(ironMesh.count).toBe(2);
    // (a building of its own, not the Folktails' redrawn)
    expect(modelTriangles("start.IronTeeth")).toBeGreaterThan(0);
    expect(modelTriangles("start.IronTeeth")).not.toBe(modelTriangles("start"));
  });
});
