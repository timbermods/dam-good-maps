import assert from 'node:assert/strict';
import { readFileSync,writeFileSync } from 'node:fs';
import { MAPS,loadMap,placeMap } from './maps';
import { quake,DEFAULTS,entityTiles,modelFor,faultReason,type Intent } from './engine';
import { canonicalSettle } from '../../src/core/sim/prefill';
const results:Record<string,unknown>[]=[];
for(const [id] of MAPS){
 if(id.startsWith('fixture:'))continue;
 const t=performance.now(),m=id.startsWith('place:')?placeMap(readFileSync('../../public/real-places/data/'+id.slice(6)+'.json.gz')):await loadMap(id);
 if(id.startsWith('place:')){const w=canonicalSettle(modelFor(m));m.water={depth:w.depth,contamination:w.contamination};}
 let intent:Intent={path:[{x:0,y:Math.floor(m.H*.5)},{x:m.W-1,y:Math.floor(m.H*.5)}],side:1};
 if(faultReason(m,intent))intent={path:[{x:0,y:Math.floor(m.H*.75)},{x:m.W-1,y:Math.floor(m.H*.75)}],side:1};
 for(const mode of ['lift','slide'] as const){
  const p=quake(m,{...DEFAULTS,mode,seed:41},intent);assert.ok(p.map.heights.every(v=>v<=22));assert.equal(p.map.entities.length,m.entities.length);
  const start=p.map.entities.find(e=>e.template==='StartingLocation')!;assert.ok(start);assert.equal(entityTiles(p.map,start).length,9);assert.ok(entityTiles(p.map,start).every(i=>p.map.heights[i]===start.z));
  assert.deepEqual(p.map.entities.map(e=>e.id),m.entities.map(e=>e.id));
 }
 results.push({id,W:m.W,H:m.H,entities:m.entities.length,ms:performance.now()-t});console.log('PASS '+id);
}
writeFileSync('captures/map-checks.json',JSON.stringify({results},null,2)+'\n');
