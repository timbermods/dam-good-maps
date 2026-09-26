import { meshChunk, CHUNK, type MeshData } from '../../../src/render3d/mesh';
import { meshWaterChunk } from '../../../src/render3d/waterMesh';
import { waterFromDepth, surfaceWater, entityView } from '../../../src/render3d/model';
import { buildEntities, disposeGroup } from '../../../src/render3d/entities3d';
import { GROUND, WALL, WATER } from '../../../src/render3d/palette';
import { waterByte } from '../../../src/render3d/light';
import { ShaderMaterial, BoxGeometry, Matrix4, Quaternion, Vector3, type InstancedMesh } from 'three';
import { entityTiles } from './objects';
import type { ForceMap as QuakeMap } from './map';
import type { QuakePlan } from '../verbs/quake/engine';
export interface Geometry { positions: Float32Array; normals: Int8Array | Float32Array; indices: Uint32Array | null; colors: Float32Array; data?:Float32Array; flags?:Float32Array; grow?:Float32Array; glide?:Float32Array }
export interface ObjectMesh { geometry: Geometry; matrices: Float32Array; colors: Float32Array; count: number; glide?:Float32Array }
export interface Chunk { key: string; terrain: Geometry; water: Geometry; objects: ObjectMesh[] | null; surface:Uint8Array; travel?:Float32Array; motionId?:number; floor?:Geometry }
export interface SlideMotion {id:number;tiles:Float32Array;objects:Map<string,number[]>;floor?:Uint8Array}
let motionSequence=0;
/** Final positions stay integer. The view receives the exact previous position
 * of their source ground, including an X flip or an extended held stroke. */
export function slideMotion(p:QuakePlan,previous:QuakePlan|null,old:QuakeMap):SlideMotion{
 const {W,H}=p.map,tiles=new Float32Array(W*H*3),prior=new Map(old.entities.map(e=>[e.id,e])),objects=new Map<string,number[]>();
 for(let j=0;j<W*H;j++){
  const i=p.source[j];tiles[j*3]=i%W+(previous?.dx[i]??0)-j%W;
  tiles[j*3+2]=-(Math.floor(i/W)+(previous?.dy[i]??0)-Math.floor(j/W));
 }
 for(const e of p.map.entities){const a=prior.get(e.id);if(a)objects.set(e.id,[a.x-e.x,a.z-e.z,e.y-a.y]);}
 return {id:++motionSequence,tiles,objects,floor:Uint8Array.from(p.map.heights,(h,i)=>Math.min(h,old.heights[i]))};
}
const objectMaterial = new ShaderMaterial();
export function frameContext(m: QuakeMap) {
  const view = waterFromDepth(m.heights, m.water.depth, m.water.contamination);
  return { view, surface: surfaceWater(m.W,m.H,view) };
}
export function makeChunk(m: QuakeMap, cx: number, cy: number, context: ReturnType<typeof frameContext>, includeObjects: boolean, motion?:SlideMotion, previous?:QuakeMap): Chunk {
  const terrain = motion||previous?transitionMesh(m,previous??m,cx,cy):meshChunk({W:m.W,H:m.H,heights:m.heights,columns:new Map()},cx,cy);
  const tileAt=(x:number,z:number)=>Math.min(m.H-1,Math.max(0,Math.floor(-z)))*m.W+Math.min(m.W-1,Math.max(0,Math.floor(x)));
  const faceMotion=(g:{positions:Float32Array;normals:Int8Array|Float32Array})=>{
    if(!motion)return undefined;const a=new Float32Array(g.positions.length);
    // Each quad has one source tile. All four corners translate together.
    for(let v=0;v<g.positions.length;v+=12){let x=0,z=0;for(let k=0;k<4;k++){x+=g.positions[v+k*3]/4;z+=g.positions[v+k*3+2]/4;}
      const i=tileAt(x-Math.sign(g.normals[v])*.001,z-Math.sign(g.normals[v+2])*.001);
      for(let k=0;k<4;k++)a.set(motion.tiles.subarray(i*3,i*3+3),v+k*3);
    }return a;
  };
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
    const fallenIds=new Set(m.fallen.map(e=>e.id));
    const e=m.entities.filter(e=>!fallenIds.has(e.id)&&Math.floor(e.x/CHUNK)===cx&&Math.floor(e.y/CHUNK)===cy);
    const owner=new Map<number,string>();
    for(const margin of [1,0])for(const a of e)for(const i of entityTiles(m,a,margin))owner.set(i,a.id);
    const {group}=buildEntities(entityView(e),objectMaterial);
    objects=group.children.map(c=>{
      const mesh=c as InstancedMesh, g=mesh.geometry;
      const glide=motion?new Float32Array(mesh.count*3):undefined;
      if(glide)for(let k=0;k<mesh.count;k++){
        const matrix=mesh.instanceMatrix.array,i=tileAt(matrix[k*16+12],matrix[k*16+14]);
        glide.set(motion!.objects.get(owner.get(i)??'')??[0,0,0],k*3);
      }
      return {geometry:{positions:new Float32Array(g.getAttribute('position').array), normals:new Float32Array(g.getAttribute('normal').array),
        indices:g.index?new Uint32Array(g.index.array):null,colors:new Float32Array(g.getAttribute('pcolor').array)},
        matrices:new Float32Array(mesh.instanceMatrix.array),colors:new Float32Array(mesh.instanceColor!.array),count:mesh.count,glide};
    });
    disposeGroup(group);
    const fallen=m.fallen.filter(e=>Math.floor(e.x/CHUNK)===cx&&Math.floor(e.y/CHUNK)===cy);
    if(fallen.length){
      const g=new BoxGeometry(1,1,1),matrices=new Float32Array(fallen.length*16),colors=new Float32Array(fallen.length*3);
      const q=new Quaternion(),matrix=new Matrix4(),up=new Vector3(0,1,0);
      fallen.forEach((f,k)=>{
        q.setFromUnitVectors(up,new Vector3(f.dx,0,-f.dy).normalize());
        matrix.compose(new Vector3(f.x+f.dx*f.length*.5,f.z+.18,-f.y-f.dy*f.length*.5),q,new Vector3(.22,f.length,.22));
        matrix.toArray(matrices,k*16);colors.set([.34,.25,.15],k*3);
      });
      objects.push({geometry:{positions:new Float32Array(g.attributes.position.array),normals:new Float32Array(g.attributes.normal.array),indices:new Uint32Array(g.index!.array),colors:new Float32Array(g.attributes.position.array.length).fill(1)},matrices,colors,count:fallen.length,glide:motion?Float32Array.from(fallen.flatMap(f=>motion.objects.get(f.id)??[0,0,0])):undefined});
      g.dispose();
    }
  }
  const surface=new Uint8Array(CHUNK*CHUNK*2);
  const travel=motion?new Float32Array(CHUNK*CHUNK*3):undefined;
  for(let y=0;y<CHUNK;y++)for(let x=0;x<CHUNK;x++){
    const xx=cx*CHUNK+x,yy=cy*CHUNK+y;if(xx>=m.W||yy>=m.H)continue;
    const i=yy*m.W+xx,j=(y*CHUNK+x)*2;surface[j]=m.heights[i];surface[j+1]=waterByte(context.surface,m.heights,i);
    if(travel)travel.set(motion!.tiles.subarray(i*3,i*3+3),(y*CHUNK+x)*3);
  }
  // Solid ground under the travelling surface fills the brief opening behind
  // it. Min(old,new) avoids a duplicate ridge, then the view drops this mesh.
  let floor:Geometry|undefined;
  if(motion?.floor){const g=meshChunk({W:m.W,H:m.H,heights:motion.floor,columns:new Map()},cx,cy);for(let i=1;i<g.positions.length;i+=3)g.positions[i]-=.03;floor={...g,colors:new Float32Array(g.positions.length).fill(1)};}
  return {key:cx+','+cy,terrain:{...terrain,colors,glide:faceMotion(terrain)},water:{...water,colors:wc,glide:faceMotion(water)},objects,surface,travel,motionId:motion?.id,floor};
}
export function changedChunks(m:QuakeMap,old:QuakeMap|null,motion?:SlideMotion): {cx:number;cy:number;objects:boolean}[] {
  const set=new Map<string,{cx:number;cy:number;objects:boolean}>();
  const add=(x:number,y:number,objects:boolean)=>{
    if(x<0||y<0||x>=m.W||y>=m.H)return;
    const cx=Math.floor(x/CHUNK),cy=Math.floor(y/CHUNK),key=cx+','+cy;
    const prev=set.get(key);set.set(key,{cx,cy,objects:objects||!!prev?.objects});
  };
  for(let i=0;i<m.heights.length;i++) {
    const land=!old||old.heights[i]!==m.heights[i]||!!motion&&(!!motion.tiles[i*3]||!!motion.tiles[i*3+2]);
    if(land||!old||Math.abs(old.water.depth[i]-m.water.depth[i])>.002||old.water.contamination[i]!==m.water.contamination[i]) {
      const x=i%m.W,y=Math.floor(i/m.W);
      add(x,y,land);add(x-1,y,land);add(x+1,y,land);add(x,y-1,land);add(x,y+1,land);
    }
  }
  if(old&&(JSON.stringify(old.entities)!==JSON.stringify(m.entities)||JSON.stringify(old.fallen)!==JSON.stringify(m.fallen))) {
    const prior=new Map(old.entities.map(e=>[e.id,e]));
    for(const e of m.entities){const a=prior.get(e.id);if(JSON.stringify(a)!==JSON.stringify(e)){if(a)add(a.x,a.y,true);add(e.x,e.y,true);}prior.delete(e.id);}
    for(const e of prior.values())add(e.x,e.y,true);
  }
  return [...set.values()];
}
export { snapshot } from './map';

/** Union of old/new faces. Each tile morphs continuously on the GPU; final heights remain integers. */
function transitionMesh(m:QuakeMap,old:QuakeMap,cx:number,cy:number):Geometry {
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
