import { describe, expect, it } from "vitest";
import { ShaderMaterial, type BufferAttribute, type InstancedMesh } from "three";
import { EntityGeometryCache } from "../../src/render3d/entityGeometry";
import { buildEntities, disposeGroup } from "../../src/render3d/entities3d";
import { entityView, soilView } from "../../src/render3d/model";

describe("force object model data can be reused without sharing mutable batch state", () => {
  for(const lite of [false,true]) it(`matches fresh models, with changed life, soil, size and variant (${lite ? "light" : "GPU"})`, () => {
    const models = new EntityGeometryCache();
    const material = new ShaderMaterial();
    for(let step=0;step<3;step++) {
      const view=entityView([
        {id:"pine",template:"Pine",x:3,y:3,z:step,owner:"a",orientation:"Cw0",dead:step===1,young:step===2},
        {id:"ruin",template:"RuinColumnH4",x:6,y:3,z:step,owner:"a",orientation:"Cw0",variant:["A","B","C"][step]},
        {id:"start",template:"StartingLocation",x:12,y:4,z:2,owner:"a",orientation:"Cw90"},
        {id:"source",template:"WaterSource",x:20,y:4,z:step,owner:"a",orientation:"Cw0",strength:step+1},
      ]);
      const moisture=new Float64Array(32*32).fill(step===1 ? 1 : 0);
      const soil=soilView(moisture,new Float64Array(32*32));
      const fresh=buildEntities(view,material,soil,32,lite);
      const cached=buildEntities(view,material,soil,32,lite,models);
      expect(cached.instances).toBe(fresh.instances);
      expect(cached.group.children.map(m=>m.name)).toEqual(fresh.group.children.map(m=>m.name));
      for(let i=0;i<fresh.group.children.length;i++) {
        const a=fresh.group.children[i] as InstancedMesh,b=cached.group.children[i] as InstancedMesh;
        expect(Array.from(b.instanceMatrix.array)).toEqual(Array.from(a.instanceMatrix.array));
        expect(Array.from(b.instanceColor!.array)).toEqual(Array.from(a.instanceColor!.array));
        for(const name of Object.keys(a.geometry.attributes)) expect(Array.from(b.geometry.getAttribute(name).array)).toEqual(Array.from(a.geometry.getAttribute(name).array));
        expect(b.userData).toEqual(a.userData);
      }
      disposeGroup(fresh.group);disposeGroup(cached.group);
    }
    models.dispose();material.dispose();
  });
  it("reuses immutable arrays but keeps GPU attributes and growth data independent", () => {
    const models=new EntityGeometryCache(),material=new ShaderMaterial();
    const view=entityView([{template:"Pine",x:3,y:3,z:2,owner:"a",orientation:"Cw0"}]);
    const a=buildEntities(view,material,null,32,false,models).group;
    const b=buildEntities(view,material,null,32,false,models).group;
    const ga=(a.children[0] as InstancedMesh).geometry,gb=(b.children[0] as InstancedMesh).geometry;
    expect(ga.getAttribute("position")).not.toBe(gb.getAttribute("position"));
    expect(ga.getAttribute("position").array).toBe(gb.getAttribute("position").array);
    expect(ga.getAttribute("grow").array).not.toBe(gb.getAttribute("grow").array);
    (ga.getAttribute("grow") as BufferAttribute).setX(0,99);
    expect(gb.getAttribute("grow").getX(0)).toBe(0);
    disposeGroup(a);disposeGroup(b);models.dispose();material.dispose();
  });
});

describe("a rebuild keeps the batches it would build as they are drawn", () => {
  const at = (id: string, template: string, x: number, y: number, extra: Record<string, unknown> = {}) => ({ id, template, x, y, z: 2, owner: "a", orientation: "Cw0", ...extra });
  const before = [at("p1", "Pine", 3, 3), at("p2", "Pine", 5, 3), at("o1", "Oak", 7, 7), at("r1", "RuinColumnH3", 9, 9), at("s1", "WaterSource", 12, 12, { strength: 2 })];
  it("keeps the unchanged batches (their objects renumbered), builds the changed, and draws what a fresh build draws", () => {
    const models = new EntityGeometryCache();
    const material = new ShaderMaterial();
    const v1 = entityView(before);
    const g1 = buildEntities(v1, material, null, 32, false, models).group;
    const kept = new Map(g1.children.map((c) => [c.name, c]));
    // a source placed first in the list: every other object's number moves
    const v2 = entityView([at("s2", "WaterSource", 20, 4, { strength: 3 }), ...before]);
    const g2 = buildEntities(v2, material, null, 32, false, models, { group: g1, entities: v1 }).group;
    const fresh = buildEntities(v2, material, null, 32, false, models).group;
    expect(g2.children.map((c) => c.name)).toEqual(fresh.children.map((c) => c.name));
    for (let i = 0; i < fresh.children.length; i++) {
      const a = fresh.children[i] as InstancedMesh;
      const b = g2.children[i] as InstancedMesh;
      expect(b === kept.get(b.name)).toBe(b.name !== "WaterSource");
      expect(Array.from(b.instanceMatrix.array)).toEqual(Array.from(a.instanceMatrix.array));
      expect(Array.from(b.instanceColor!.array)).toEqual(Array.from(a.instanceColor!.array));
      expect(Array.from(b.geometry.getAttribute("grow").array)).toEqual(Array.from(a.geometry.getAttribute("grow").array));
      expect(b.userData).toEqual(a.userData);
    }
    disposeGroup(g2);
    disposeGroup(g1);
    disposeGroup(fresh);
    models.dispose();
    material.dispose();
  });
  it("a batch kept after ground a stroke painted settles to the new land, as a fresh build does", () => {
    const material = new ShaderMaterial();
    const trees = [at("p1", "Pine", 3, 3), at("p2", "Pine", 5, 3)];
    const v1 = entityView(trees);
    const g1 = buildEntities(v1, material, null, 32).group;
    const pines = g1.children.find((c) => c.name === "Pine") as InstancedMesh;
    // a stroke raises the first pine's tile by one: the page moves it there (renderer `followGround`)
    const ty0 = pines.userData.ty0 as Float32Array;
    pines.instanceMatrix.array[13] = ty0[0] + 1;
    // the worker's objects on that land come while the stroke's land is held: the batch is kept, as it stands
    const v2 = entityView([{ ...trees[0], z: 3 }, trees[1]]);
    const g2 = buildEntities(v2, material, null, 32, false, undefined, { group: g1, entities: v1 }).group;
    const kept = g2.children.find((c) => c.name === "Pine") as InstancedMesh;
    expect(kept).toBe(pines);
    // a later stroke, then settling (renderer `settleObjects`): each stands at its batch's own height
    const a = kept.instanceMatrix.array;
    (kept.userData.ty0 as Float32Array).forEach((y, i) => (a[i * 16 + 13] = y));
    const fresh = buildEntities(v2, material, null, 32).group.children.find((c) => c.name === "Pine") as InstancedMesh;
    expect(Array.from(kept.userData.ty0 as Float32Array)).toEqual(Array.from(fresh.userData.ty0 as Float32Array));
    expect(Array.from(a)).toEqual(Array.from(fresh.instanceMatrix.array));
    material.dispose();
  });
  it("builds again a batch drawn otherwise than it would be built (a highlight)", () => {
    const material = new ShaderMaterial();
    const v1 = entityView(before);
    const g1 = buildEntities(v1, material, null, 32).group;
    const pines = g1.children.find((c) => c.name === "Pine") as InstancedMesh;
    pines.instanceColor!.array[0] *= 1.6;
    const oaks = g1.children.find((c) => c.name === "Oak");
    const g2 = buildEntities(v1, material, null, 32, false, undefined, { group: g1, entities: v1 }).group;
    const again = g2.children.find((c) => c.name === "Pine") as InstancedMesh;
    expect(again).not.toBe(pines);
    expect(again.instanceColor!.array[0]).not.toBe(pines.instanceColor!.array[0]);
    expect(g2.children.find((c) => c.name === "Oak")).toBe(oaks);
    material.dispose();
  });
});
