import assert from 'node:assert/strict';
import { drawGenome, leanGenome, BED_FLOOR } from '../../src/core/land/genome';
import { lakeRange, connectedLakes } from '../../src/core/land/lakes';
import { makeSpec, THEMES, highestTerrainDefault } from '../../src/core/spec/mapspec';
import { validateSpec } from '../../src/core/spec/schema';
import { encodeSpecFragment, decodeSpecFragment } from '../../src/core/spec/codec';
import { sinDet } from '../../src/core/math/detmath';
import type { Hydro } from '../../src/core/land/hydro';
let checked=0;
for (const theme of THEMES) for (let vt=0;vt<=100;vt++) {
 const s=makeSpec({seed:3,theme,size:{x:128,y:128}});
 s.settings.terrain.verticality=vt;s.settings.terrain.highestTerrain=highestTerrainDefault(vt);
 const g=drawGenome(theme,3,128,128,0,{vt});leanGenome(g,s.settings,128,128,3,0);
 assert.ok(g.top<=s.settings.terrain.highestTerrain && g.base>=BED_FLOOR+1);
 checked++;
}
for(const theme of ['lakeBasin','islands'] as const){
 const s=makeSpec({theme,seed:1});s.settings.water.lakeAmount=0;
 const g=drawGenome(theme,1,128,128,0),before=structuredClone(g);
 lakeRange(g,s.settings);delete g.lakeAmount;
 assert.deepEqual(g,before,'Zero optional lakes changed signature water');
}
for(let amount=0;amount<=100;amount++){
 const s=makeSpec({seed:1});s.settings.water.lakeAmount=amount;
 assert.deepEqual(validateSpec(s),[]);
 const decoded=decodeSpecFragment(encodeSpecFragment(s));
 assert.ok(decoded);assert.equal(decoded.spec.settings.water.lakeAmount,amount);assert.deepEqual(decoded.problems,[]);
 for(const seed of [1,2,3]){
  const g=drawGenome('riverValley',seed,64,64,0);g.lakeAmount=amount;
  const h=new Uint8Array(4096).fill(10),water=new Uint8Array(4096),protect=new Uint8Array(4096);
  const path:[number,number][]=[];
  for(let x=0;x<64;x++){const y=32+Math.floor(4*sinDet(x*.12));path.push([x,y]);water[y*64+x]=1;h[y*64+x]=8;}
  for(let y=30;y<34;y++)for(let x=30;x<34;x++)protect[y*64+x]=1;
  const before=h.slice(),waterBefore=water.slice();
  const hy={rivers:[{id:'river/main',params:{path}}],water,lakes:[],falls:[],arms:[],flowTotal:8} as unknown as Hydro;
  const second=structuredClone(hy),h2=h.slice();
  connectedLakes(h,64,64,g,seed,0,hy,protect);connectedLakes(h2,64,64,g,seed,0,second,protect);
  assert.deepEqual(h,h2);assert.deepEqual(hy,second);
  for(let i=0;i<h.length;i++){
   assert.ok(h[i]<=before[i] && h[i]>=BED_FLOOR);
   if(protect[i]||waterBefore[i]===1)assert.equal(h[i],before[i]);
  }
  if(amount===0)assert.deepEqual(h,before);
  checked++;
 }
}
for(const amount of [-1,101,12.5]){const s=makeSpec({seed:1});s.settings.water.lakeAmount=amount;assert.ok(validateSpec(s).length);}
console.log(`Passed ${checked} height/connected-lake cases, signature preservation, codec range and invalid-value checks.`);
