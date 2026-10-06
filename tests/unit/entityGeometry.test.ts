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
