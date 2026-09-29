import assert from "node:assert/strict";
import { readFileSync,writeFileSync,mkdirSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { BlockDocument,deeper,line,replay,water,type Face,type Stamp } from "../core/block";
import { IDS,makeCase,faces,NORMALS } from "../core/cases";
import { checkSupport } from "../../terrain3d/proto/support";
import { Terrain } from "../../erode/core/terrain";
import { support } from "../../erode/core/support";
import { tunnel } from "../demo/samples";
const json=(name:string)=>JSON.parse(gunzipSync(readFileSync(new URL(`../../erode/maps/${name}.json.gz`,import.meta.url))).toString());
let seed=335;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
const hash=(t:Terrain)=>createHash("sha256").update(new Uint8Array(t.cols.buffer)).digest("hex");
const result={seed,gestures:0,steps:0,accepted:0,refused:0,noops:0,dropped:0,ghostMismatches:0,refusalMutations:0,replayMismatches:0,maxPreviewMs:0,coverage:[] as unknown[]};
const recordings:unknown[]=[];
for(const id of IDS){
  const {map,terrain}=makeCase(id,json(id==="flat"?"highlands":"canyon"));
  // Give heightfields a player-built one-block shelf so ceiling gestures can be exercised too.
  if(!faces(terrain).some(f=>f.nz===-1)){
    const setup=new BlockDocument(map,terrain);
    for(const f of faces(terrain).filter(f=>!f.nz&&f.z>2)){
      const p=setup.preview({face:f,size:1,mode:"add",layer:22});
      if(!p.reason&&p.voxels.length&&faces(p.result,[f.x-1,f.y-1,f.x+1,f.y+1]).some(q=>q.nz===-1)){
        terrain.cols.set(p.result.cols);break;
      }
    }
  }
  const pool=faces(terrain);
  for(const n of NORMALS)for(const mode of ["add","remove"] as const)for(let size=1;size<=8;size++)for(const kind of ["click","drag","hold"] as const){
    const choices=pool.filter(f=>f.nx===n[0]&&f.ny===n[1]&&f.nz===n[2]);assert.ok(choices.length,`${id}: face ${n}`);
    const f=choices[Math.floor(random()*choices.length)],doc=new BlockDocument(map,terrain.clone()),start=doc.snapshot();
    const axis=n[0]?"y":"x",end={...f,[axis]:f[axis]+(random()<.5?-1:1)*(2+Math.floor(random()*4))};
    const points=kind==="drag"?[f,...line(f,end)]:kind==="hold"&&mode==="remove"&&!f.nz?[f,deeper(f),deeper(deeper(f)),deeper(deeper(deeper(f)))]:[f];
    doc.begin(kind);let changed=false;
    for(const face of points){
      const before=doc.snapshot(),s:Stamp={face,size,mode,layer:22},at=performance.now(),p=doc.preview(s);
      result.maxPreviewMs=Math.max(result.maxPreviewMs,performance.now()-at);result.steps++;
      const expected:number[]=[];
      for(let i=0;i<terrain.N;i++){let bits=(before.terrain.cols[i]^p.result.cols[i])>>>0;while(bits){const z=31-Math.clz32((bits&-bits)>>>0);expected.push(z*terrain.N+i);bits=(bits&(bits-1))>>>0;}}
      assert.deepEqual([...p.voxels].sort((a,b)=>a-b),expected.sort((a,b)=>a-b),"ghost is exact voxel delta");
      const accepted=doc.apply(p);
      if(accepted){
        changed=true;result.accepted++;
        assert.deepEqual(doc.terrain.cols,p.result.cols);
        assert.equal(checkSupport(terrain.W,terrain.H,doc.terrain.voxels()).unsupported.length,0,"independent game-rule oracle after every accepted step");
      }else{
        p.reason?result.refused++:result.noops++;
        assert.deepEqual(doc.terrain.cols,before.terrain.cols,"refusal terrain atomic");assert.deepEqual(doc.things,before.things,"refusal objects atomic");
        if(p.unsupported.length)assert.deepEqual([...p.unsupported].sort((a,b)=>a-b),checkSupport(terrain.W,terrain.H,p.result.voxels()).unsupported.sort((a,b)=>a-b),"red ghosts cover every unsupported voxel");
      }
    }
    doc.end();assert.equal(doc.undoCount,changed?1:0);const after=doc.snapshot();
    assert.deepEqual(replay(start.terrain,JSON.parse(JSON.stringify(doc.operations))).cols,after.terrain.cols,"byte-identical recorded replay");
    if(changed){doc.undo();assert.deepEqual(doc.terrain.cols,start.terrain.cols);assert.deepEqual(doc.things,start.things);doc.redo();assert.deepEqual(doc.terrain.cols,after.terrain.cols);}
    result.gestures++;recordings.push({id,normal:n,size,mode,kind,operations:doc.operations,sha256:hash(doc.terrain)});
  }
  result.coverage.push({id,dimensions:[terrain.W,terrain.H],gestures:288,faces:pool.length});
  console.log(`${id}: 288 gestures checked`);
}
// Focused guarantees: the fourth cantilever is red/refused; deleting its only support is atomic.
const {map}=makeCase("flat",json("highlands"));
const t=Terrain.fromHeights(128,128,new Uint8Array(128*128).fill(3));
for(let z=3;z<=6;z++)t.set(64*128+64,z,true);
const d=new BlockDocument({...map,things:[],water:new Float32Array(t.N)},t);
for(let x=64;x<67;x++){d.begin();const p=d.preview({face:{x,y:64,z:6,nx:1,ny:0,nz:0},size:1,mode:"add",layer:22});assert.ok(d.apply(p));d.end();}
const bad=d.preview({face:{x:67,y:64,z:6,nx:1,ny:0,nz:0},size:1,mode:"add",layer:22});assert.equal(bad.unsupported.length,1);
const removal=d.preview({face:{x:64,y:64,z:5,nx:1,ny:0,nz:0},size:1,mode:"remove",layer:22});assert.equal(removal.unsupported.length,4);
const before=d.snapshot();d.begin();assert.equal(d.apply(removal),false);d.end();assert.deepEqual(d.snapshot(),before);
d.begin();const good=d.preview({face:{x:67,y:64,z:6,nx:0,ny:0,nz:1},size:1,mode:"add",layer:22});assert.ok(d.apply(good));d.cancel();assert.deepEqual(d.snapshot(),before);
// Stale previews, hidden terrain, bedrock and complete-footprint bounds are refused.
d.begin();const fresh=d.preview(good.stamp);assert.ok(d.apply(fresh));assert.equal(d.apply(fresh),false);d.cancel();
assert.ok(d.preview({...good.stamp,layer:6}).reason);
assert.ok(d.preview({...good.stamp,face:{x:0,y:0,z:0,nx:0,ny:0,nz:1},mode:"remove"}).reason);
assert.ok(d.preview({...good.stamp,face:{x:0,y:0,z:2,nx:0,ny:0,nz:1},size:8}).reason);
// Objects stay removed during later edits; start relocation and undo are literal.
const objects=new BlockDocument({...map,water:new Float32Array(t.N),things:[{id:"tree",template:"Pine",x:30,y:30,z:3},{id:"start",template:"StartingLocation",x:40,y:40,z:3}]},Terrain.fromHeights(128,128,new Uint8Array(t.N).fill(3)));
objects.begin();assert.ok(objects.apply(objects.preview({face:{x:30,y:30,z:2,nx:0,ny:0,nz:1},size:1,mode:"remove",layer:22})));objects.end();assert.equal(objects.things.some(th=>th.id==="tree"),false);
const oldStart=objects.things.find(th=>th.id==="start")!;objects.begin();assert.ok(objects.apply(objects.preview({face:{x:40,y:40,z:2,nx:0,ny:0,nz:1},size:1,mode:"remove",layer:22})));objects.end();assert.notDeepEqual(objects.things.find(th=>th.id==="start"),oldStart);objects.undo();assert.deepEqual(objects.things.find(th=>th.id==="start"),oldStart);
assert.equal(support(objects.terrain).unsupported.length,0);
const wetMap={...map,water:Float32Array.from({length:t.N},(_,i)=>i===10*128+10?2:0),heights:new Uint8Array(t.N).fill(3)};
const wet=Terrain.fromHeights(128,128,wetMap.heights),wetBefore=water(wet,wetMap);wet.set(10*128+10,2,false);assert.equal(water(wet,wetMap).depth[10*128+10],wetBefore.depth[10*128+10]+1);
mkdirSync(new URL("../local/",import.meta.url),{recursive:true});mkdirSync(new URL("../checks/",import.meta.url),{recursive:true});
writeFileSync(new URL("../local/random-operations.json",import.meta.url),JSON.stringify(recordings));
writeFileSync(new URL("../checks/results.json",import.meta.url),JSON.stringify(result,null,2)+"\n");
const pinned=makeCase("cliff",json("canyon")),sample=new BlockDocument(pinned.map,pinned.terrain);
sample.begin("hold");for(const stamp of tunnel)assert.ok(sample.apply(sample.preview(stamp)));sample.end();
assert.deepEqual(replay(pinned.terrain,sample.operations).cols,sample.terrain.cols);
writeFileSync(new URL("../checks/tunnel-operations.json",import.meta.url),JSON.stringify(sample.operations,null,2)+"\n");
console.log(JSON.stringify(result,null,2));
