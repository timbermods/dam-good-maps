import { meshChunk, CHUNK, type MeshData } from '../../src/render3d/mesh';
import { meshWaterChunk } from '../../src/render3d/waterMesh';
import { waterFromDepth, surfaceWater, entityView } from '../../src/render3d/model';
import { buildEntities, disposeGroup } from '../../src/render3d/entities3d';
import { GROUND, WALL, WATER } from '../../src/render3d/palette';
import { ShaderMaterial, BoxGeometry, Matrix4, Quaternion, Vector3, type InstancedMesh } from 'three';
import type { EruptMap } from './engine';
export interface Geometry { positions: Float32Array; normals: Int8Array | Float32Array; indices: Uint32Array | null; colors: Float32Array; data?:Float32Array; flags?:Float32Array; grow?:Float32Array }
export interface ObjectMesh { geometry: Geometry; matrices: Float32Array; colors: Float32Array; count: number }
export interface Chunk { key: string; terrain: Geometry; water: Geometry; objects: ObjectMesh[] | null }
const objectMaterial = new ShaderMaterial();
export function frameContext(m: EruptMap) {
  const view = waterFromDepth(m.heights, m.water.depth, m.water.contamination);
  return { view, surface: surfaceWater(m.W,m.H,view) };
}
export function makeChunk(m: EruptMap, cx: number, cy: number, context: ReturnType<typeof frameContext>, includeObjects: boolean, before?:EruptMap): Chunk {
  const terrain = before?transitionMesh(m,before,cx,cy):meshChunk({W:m.W,H:m.H,heights:m.heights,columns:new Map()},cx,cy);
  const colors = new Float32Array(terrain.positions.length);
  for (let v=0;v<colors.length;v+=3) {
    const x=Math.min(m.W-1,Math.max(0,Math.floor(terrain.positions[v]))), y=Math.min(m.H-1,Math.max(0,Math.floor(-terrain.positions[v+2])));
    const i=y*m.W+x, top=terrain.normals[v+1]>0;
    const wet = m.water.depth[i]>.01;
    const color=top ? (wet ? GROUND.underwater : GROUND.dry) : WALL.stone;
    const fresh=!!(m.lava[i]&(1<<Math.max(0,m.heights[i]-1)));
    const light=(top ? 1.18 : .86 + .06*(Math.floor(terrain.positions[v+1])%2))*(fresh?.88:1);
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
    const fallenIds=new Set(m.fallen.map(e=>e.id));
    const e=m.entities.filter(e=>!fallenIds.has(e.id)&&Math.floor(e.x/CHUNK)===cx&&Math.floor(e.y/CHUNK)===cy);
    const {group}=buildEntities(entityView(e),objectMaterial);
    objects=group.children.map(c=>{
      const mesh=c as InstancedMesh, g=mesh.geometry;
      return {geometry:{positions:new Float32Array(g.getAttribute('position').array), normals:new Float32Array(g.getAttribute('normal').array),
        indices:g.index?new Uint32Array(g.index.array):null,colors:new Float32Array(g.getAttribute('pcolor').array)},
        matrices:new Float32Array(mesh.instanceMatrix.array),colors:new Float32Array(mesh.instanceColor!.array),count:mesh.count};
    });
    disposeGroup(group);
    const fallen=m.fallen.filter(e=>Math.floor(e.x/CHUNK)===cx&&Math.floor(e.y/CHUNK)===cy);
    if(fallen.length){
      const g=new BoxGeometry(1,1,1),matrices=new Float32Array(fallen.length*16),colors=new Float32Array(fallen.length*3);
      const q=new Quaternion(),matrix=new Matrix4(),up=new Vector3(0,1,0);
      fallen.forEach((f,k)=>{
        q.setFromUnitVectors(up,new Vector3(f.dx,0,-f.dy));
        matrix.compose(new Vector3(f.x+f.dx*f.length*.5,f.z+.18,-f.y-f.dy*f.length*.5),q,new Vector3(.22,f.length,.22));
        matrix.toArray(matrices,k*16);colors.set([.34,.25,.15],k*3);
      });
      objects.push({geometry:{positions:new Float32Array(g.attributes.position.array),normals:new Float32Array(g.attributes.normal.array),indices:new Uint32Array(g.index!.array),colors:new Float32Array(g.attributes.position.array.length).fill(1)},matrices,colors,count:fallen.length});
      g.dispose();
    }
  }
  return {key:cx+','+cy,terrain:{...terrain,colors},water:{...water,colors:wc},objects};
}
export function changedChunks(m:EruptMap,old:EruptMap|null): {cx:number;cy:number;objects:boolean}[] {
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
  if(old&&(JSON.stringify(old.entities)!==JSON.stringify(m.entities)||JSON.stringify(old.fallen)!==JSON.stringify(m.fallen))) {
    for(const e of old.entities) add(e.x,e.y,true);
    for(const e of m.entities) add(e.x,e.y,true);
  }
  return [...set.values()];
}
export function snapshot(m:EruptMap):EruptMap {
  return {...m,heights:m.heights.slice(),entities:m.entities.slice(),fallen:m.fallen.slice(),water:{depth:m.water.depth.slice(),contamination:m.water.contamination.slice()}};
}

/** Union of old/new faces. Each tile morphs continuously on the GPU; final heights remain integers. */
function transitionMesh(m:EruptMap,old:EruptMap,cx:number,cy:number):Geometry {
  const p:number[]=[],n:number[]=[],idx:number[]=[],grow:number[]=[];
  function quad(points:number[][],normal:number[],oldY:number[]){
    const base=p.length/3;
    points.forEach((v,k)=>{p.push(...v);n.push(...normal);grow.push(0,oldY[k]-v[1],0);});
    idx.push(base,base+1,base+2,base,base+2,base+3);
  }
  for(let y=cy*CHUNK;y<Math.min(m.H,(cy+1)*CHUNK);y++)for(let x=cx*CHUNK;x<Math.min(m.W,(cx+1)*CHUNK);x++){
    const i=y*m.W+x,h=m.heights[i],o=old.heights[i];
    quad([[x,h,-y],[x+1,h,-y],[x+1,h,-y-1],[x,h,-y-1]],[0,1,0],[o,o,o,o]);
    const faces=[
      {dx:1,dy:0,normal:[1,0,0],a:[x+1,-y],b:[x+1,-y-1]},
      {dx:-1,dy:0,normal:[-1,0,0],a:[x,-y-1],b:[x,-y]},
      {dx:0,dy:1,normal:[0,0,-1],a:[x+1,-y-1],b:[x,-y-1]},
      {dx:0,dy:-1,normal:[0,0,1],a:[x,-y],b:[x+1,-y]},
    ];
    for(const f of faces){
      const nx=x+f.dx,ny=y+f.dy,inside=nx>=0&&ny>=0&&nx<m.W&&ny<m.H,j=ny*m.W+nx;
      const low=inside?m.heights[j]:0,prior=inside?old.heights[j]:0;if(h<=low&&o<=prior)continue;
      const l=Math.min(h,low),ol=Math.min(o,prior);
      quad([[...f.a.slice(0,1),l,f.a[1]],[f.b[0],l,f.b[1]],[f.b[0],h,f.b[1]],[f.a[0],h,f.a[1]]],f.normal,[ol,ol,o,o]);
    }
  }
  return {positions:Float32Array.from(p),normals:Float32Array.from(n),indices:Uint32Array.from(idx),grow:Float32Array.from(grow),colors:new Float32Array(p.length)};
}

