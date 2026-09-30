import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {Terrain,meshes,clipped,fields,dirtyChunks} from './geometry';
let cases=0,faces=0;
// An independent unit-face oracle checks greedy output, including cuts and chunk boundaries.
function verify(t:Terrain,level:number){
 const v=clipped(t,level),expected=new Set<string>(),actual=new Set<string>();
 for(let y=0;y<t.H;y++)for(let x=0;x<t.W;x++)for(let z=0;z<level;z++)if(v.solid(x,y,z))for(const [dx,dy,dz]of [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]])if(!v.solid(x+dx,y+dy,z+dz))expected.add(`${x},${y},${z}:${dx},${dy},${dz}`);
 for(const m of meshes(t,level))for(let q=0;q<m.positions.length;q+=12){
  const p=Array.from(m.positions.slice(q,q+12)),n=Array.from(m.normals.slice(q,q+3),a=>Math.round(a/127));
  const u=p.slice(3,6).map((a,i)=>a-p[i]),w=p.slice(6,9).map((a,i)=>a-p[i]),cross=[u[1]*w[2]-u[2]*w[1],u[2]*w[0]-u[0]*w[2],u[0]*w[1]-u[1]*w[0]];
  assert.ok(cross.reduce((s,a,i)=>s+a*n[i],0)>0,'outward winding');
  const X=[p[0],p[3],p[6],p[9]],Y=[-p[2],-p[5],-p[8],-p[11]],Z=[p[1],p[4],p[7],p[10]];
  const dirs=[n[0],-n[2],n[1]],mins=[Math.min(...X),Math.min(...Y),Math.min(...Z)],maxs=[Math.max(...X),Math.max(...Y),Math.max(...Z)];
  for(let a=0;a<3;a++)if(dirs[a]){mins[a]-=+(dirs[a]>0);maxs[a]=mins[a]+1;}
  for(let z=mins[2];z<maxs[2];z++)for(let y=mins[1];y<maxs[1];y++)for(let x=mins[0];x<maxs[0];x++){const key=`${x},${y},${z}:${dirs.join(',')}`;assert.ok(!actual.has(key),'duplicate face');actual.add(key);}
 }
 assert.deepEqual(actual,expected,'no missing faces, cavity caps, or seam faces');cases++;faces+=expected.size;
}
for(const id of ['t1-support','t2-walking','t3-cave-water','block-tunnel']){
 const f=JSON.parse(readFileSync(`local/fixtures/${id}.json`,'utf8')),t=new Terrain(f.W,f.H,Uint32Array.from(f.mask));for(const level of [3,4,6,7,11,23])verify(t,level);
}
const t=Terrain.fromHeights(64,40,new Uint8Array(64*40).fill(9));for(let y=15;y<20;y++)for(let x=0;x<56;x++)for(let z=3;z<6;z++)t.set(y*t.W+x,z,false);
const before=t.cols.slice(),base=fields(t,[]);for(let z=6;z<9;z++)t.set(17*t.W+31,z,false);
const dirty=dirtyChunks(t,before);assert.ok(dirty.includes(0)&&dirty.includes(1),'edit at chunk seam invalidates both neighbors');
const partial=fields(t,[],base.light.slice(),{x0:31,x1:31,y0:17,y1:17}),full=fields(t,[]);assert.deepEqual(partial.light,full.light,'incremental light equals full bake after opening skylight');
const sample=(a:Uint8Array,x:number,y:number,z:number)=>a[(z*t.N+y*t.W+x)*2];
assert.ok(sample(full.light,31,17,4)>sample(base.light,31,17,4),'skylight spills light into chamber');
assert.ok(sample(base.light,10,17,4)>=64,'deep cave has working-light floor');
assert.ok(sample(base.light,1,17,4)>=sample(base.light,10,17,4),'entrance-to-depth gradient');
t.cols.set(before);assert.deepEqual(fields(t,[],full.light.slice(),{x0:31,x1:31,y0:17,y1:17}).light,base.light,'closing skylight restores light');
writeFileSync('geometry-checks.json',JSON.stringify({cases,unitFacesChecked:faces,incrementalLighting:'open/close exact',chunkSeam:'both sides',caps:'voxel oracle exact'},null,2));console.log({cases,faces});
