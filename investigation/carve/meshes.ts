import { meshChunk, CHUNK, type MeshData } from '../../src/render3d/mesh';
import { meshWaterChunk } from '../../src/render3d/waterMesh';
import { waterFromDepth, surfaceWater, entityView } from '../../src/render3d/model';
import { buildEntities, disposeGroup } from '../../src/render3d/entities3d';
import { GROUND, WALL, WATER } from '../../src/render3d/palette';
import { ShaderMaterial, type InstancedMesh } from 'three';
import type { CarveMap } from './engine';
export interface Geometry { positions: Float32Array; normals: Int8Array | Float32Array; indices: Uint32Array | null; colors: Float32Array; data?:Float32Array; flags?:Float32Array }
export interface ObjectMesh { geometry: Geometry; matrices: Float32Array; colors: Float32Array; count: number }
export interface Chunk { key: string; terrain: Geometry; water: Geometry; objects: ObjectMesh[] | null }
const objectMaterial = new ShaderMaterial();
export function frameContext(m: CarveMap) {
  const view = waterFromDepth(m.heights, m.water.depth, m.water.contamination);
  return { view, surface: surfaceWater(m.W,m.H,view) };
}
export function makeChunk(m: CarveMap, cx: number, cy: number, context: ReturnType<typeof frameContext>, includeObjects: boolean): Chunk {
  const terrain = meshChunk({W:m.W,H:m.H,heights:m.heights,columns:new Map()},cx,cy);
  const colors = new Float32Array(terrain.positions.length);
  for (let v=0;v<colors.length;v+=3) {
    const x=Math.min(m.W-1,Math.max(0,Math.floor(terrain.positions[v]))), y=Math.min(m.H-1,Math.max(0,Math.floor(-terrain.positions[v+2])));
    const i=y*m.W+x, top=terrain.normals[v+1]>0;
    const wet = m.water.depth[i]>.01;
    const color=top ? (wet ? GROUND.underwater : GROUND.dry) : WALL.stone;
    const light=top ? 1.18 : .86 + .06*(Math.floor(terrain.positions[v+1])%2);
    for(let a=0;a<3;a++) colors[v+a]=color[a]*light;
  }
  const water=meshWaterChunk(m.W,m.H,m.heights,context.surface,context.view,null,cx,cy);
  const wc=new Float32Array(water.positions.length);
  for(let v=0;v<wc.length/3;v++) {
    const d=water.data[2*v], bad=water.data[2*v+1], curtain=water.normals[3*v+1]===0;
    const deep=Math.min(1,d/2), color=bad>.1?WATER.bad:WATER.teal;
    for(let a=0;a<3;a++) wc[3*v+a]=curtain?WATER.crest[a]:WATER.shallow[a]*(1-deep)+color[a]*deep;
  }
  let objects: ObjectMesh[]|null=null;
  if(includeObjects) {
    const e=m.entities.filter(e=>Math.floor(e.x/CHUNK)===cx&&Math.floor(e.y/CHUNK)===cy);
    const {group}=buildEntities(entityView(e),objectMaterial);
    objects=group.children.map(c=>{
      const mesh=c as InstancedMesh, g=mesh.geometry;
      return {geometry:{positions:new Float32Array(g.getAttribute('position').array), normals:new Float32Array(g.getAttribute('normal').array),
        indices:g.index?new Uint32Array(g.index.array):null,colors:new Float32Array(g.getAttribute('pcolor').array)},
        matrices:new Float32Array(mesh.instanceMatrix.array),colors:new Float32Array(mesh.instanceColor!.array),count:mesh.count};
    });
    disposeGroup(group);
  }
  return {key:cx+','+cy,terrain:{...terrain,colors},water:{...water,colors:wc},objects};
}
export function changedChunks(m:CarveMap,old:CarveMap|null): {cx:number;cy:number;objects:boolean}[] {
  const set=new Map<string,{cx:number;cy:number;objects:boolean}>();
  const add=(x:number,y:number,objects:boolean)=>{
    if(x<0||y<0||x>=m.W||y>=m.H)return;
    const cx=Math.floor(x/CHUNK),cy=Math.floor(y/CHUNK),key=cx+','+cy;
    const prev=set.get(key);set.set(key,{cx,cy,objects:objects||!!prev?.objects});
  };
  for(let i=0;i<m.heights.length;i++) {
    const land=!old||old.heights[i]!==m.heights[i];
    if(land||!old||Math.abs(old.water.depth[i]-m.water.depth[i])>.002||old.water.contamination[i]!==m.water.contamination[i]) {
      const x=i%m.W,y=Math.floor(i/m.W);
      add(x,y,land);add(x-1,y,land);add(x+1,y,land);add(x,y-1,land);add(x,y+1,land);
    }
  }
  if(old&&JSON.stringify(old.entities)!==JSON.stringify(m.entities)) {
    for(const e of old.entities) add(e.x,e.y,true);
    for(const e of m.entities) add(e.x,e.y,true);
  }
  return [...set.values()];
}
export function snapshot(m:CarveMap):CarveMap {
  return {...m,heights:m.heights.slice(),entities:m.entities.slice(),water:{depth:m.water.depth.slice(),contamination:m.water.contamination.slice()}};
}
