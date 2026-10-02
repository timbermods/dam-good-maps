import {describe,it,expect} from 'vitest';
import {meshWaterChunk as proposed} from '../../src/render3d/waterMesh';
// Vite treats the query as a separate module; the adoption plugin deliberately leaves it alone.
import {meshWaterChunk as original} from '../../src/render3d/waterMesh?reference';
import {surfaceWater,type WaterView} from '../../src/render3d/model';
import {lowerByTile} from '../../src/render3d/waterMesh';
function equal(a:any,b:any){
 expect(Object.keys(a).sort()).toEqual(Object.keys(b).sort());
 for(const k of Object.keys(a)){
  if(ArrayBuffer.isView(a[k]))expect(Buffer.from(a[k].buffer,a[k].byteOffset,a[k].byteLength).equals(Buffer.from(b[k].buffer,b[k].byteOffset,b[k].byteLength)),k).toBe(true);
  else expect(a[k],k).toEqual(b[k]);
 }
}
describe('one-file water buffer byte identity',()=>{
 it('preserves every geometry/fall byte across seeded shores, steps, contamination, caves and chunk boundaries',()=>{
  let seed=413;const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/2**32);
  for(const [W,H] of [[1,1],[31,29],[33,65],[64,32],[256,256]]){
   const heights=Uint8Array.from({length:W*H},()=>Math.floor(random()*12));
   const tiles:number[]=[],floors:number[]=[],depths:number[]=[],bad:number[]=[];
   for(let i=0;i<W*H;i++)if(random()<0.7){
    if(random()<0.2){tiles.push(i);floors.push(Math.max(0,heights[i]-3));depths.push(random()*2);bad.push(random());}
    tiles.push(i);floors.push(heights[i]);depths.push(random()*4);bad.push(random());
   }
   const view:WaterView={count:tiles.length,tile:Int32Array.from(tiles),floor:Float32Array.from(floors),depth:Float32Array.from(depths),contamination:Float32Array.from(bad)};
   const sw=surfaceWater(W,H,view),lower=lowerByTile(sw,view);
   const kept:any[]=[];
   for(let y=0;y<Math.ceil(H/32);y++)for(let x=0;x<Math.ceil(W/32);x++){
    const before=original(W,H,heights,sw,view,lower,x,y),after=proposed(W,H,heights,sw,view,lower,x,y);equal(after,before);kept.push([before,after]);
   }
   // Later scratch reuse must not mutate any answer already held by the renderer.
   for(const [before,after] of kept)equal(after,before);
  }
 });
 it('drops exceptional scratch capacity without changing large cave answers or the next empty chunk',()=>{
  const W=32,H=32,heights=new Uint8Array(W*H).fill(20),tile=Int32Array.from({length:10000},(_,i)=>i%1024);
  const view:WaterView={count:tile.length,tile,floor:new Float32Array(tile.length).fill(1),depth:new Float32Array(tile.length).fill(0.5),contamination:new Float32Array(tile.length).fill(0.4)};
  const sw=surfaceWater(W,H,view),lower=lowerByTile(sw,view);
  const before=original(W,H,heights,sw,view,lower,0,0),after=proposed(W,H,heights,sw,view,lower,0,0);equal(after,before);
  const empty={count:0,tile:new Int32Array(),floor:new Float32Array(),depth:new Float32Array(),contamination:new Float32Array()};const e=surfaceWater(W,H,empty);
  equal(proposed(W,H,heights,e,empty,null,0,0),original(W,H,heights,e,empty,null,0,0));equal(after,before);
 });
});
