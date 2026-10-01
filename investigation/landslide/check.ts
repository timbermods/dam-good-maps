import assert from "node:assert/strict";
import { readFileSync,writeFileSync,mkdirSync } from "node:fs";
import {createHash} from "node:crypto";
import {snapshotMap,type FullForceMap} from "../../src/core/forces/force";
import {footprint,startProblem} from "../../src/core/forces/objects";
import {drainage} from "../../src/core/forces/drainage";
import {hash} from "../../src/core/forces/random";
import {CASES,decode} from "./maps";
import {DEFAULTS,plan,reveal,replay,settle,waterSim,validate,type Settings,type Intent} from "./landslide";
const digest=(m:FullForceMap)=>{const h=createHash('sha256');for(const a of [m.heights,m.lava,m.water.depth,m.water.contamination])h.update(Buffer.from(a.buffer,a.byteOffset,a.byteLength));h.update(JSON.stringify([m.entities,m.fallen,m.rockLayers]));return h.digest('hex');};
const cases=CASES.map(c=>({c,m:decode(new Uint8Array(readFileSync(`maps/${c.map}.json.gz`)))}));
const configs:Settings[]=[];
for(const style of ['auto','rockfall','slump','flow'] as const)for(const power of [0,1,35,70,100])for(const size of [null,4,22,64])for(const floor of [1,3,12,22])configs.push({...DEFAULTS,style,power,size,floor});
const waterOnly=process.argv.includes('--water-only');
const previous=waterOnly?JSON.parse(readFileSync('checks/core.json','utf8')):null;
const t0=performance.now();let count=0,worstMs=0,arrivalChecks=0,carriedStarts=0,activeGestures=0,carriedObjects=0;
if(!waterOnly) for(const {c,m} of cases){const original=digest(m);
 for(let k=0;k<configs.length;k++)for(const kind of ['click','path'] as const){
  const seed=CASES.indexOf(c)*104729+k*2+(kind==='click'?1:2),s={...configs[k],seed};
  const intent:Intent=kind==='click'?{click:{x:hash(seed,1)*127,y:hash(seed,2)*127}}:{path:Array.from({length:4},(_,j)=>({x:hash(seed,j+10)*127,y:hash(seed,j+30)*127}))};
  const t=performance.now(),p=plan(m,s,intent);worstMs=Math.max(worstMs,performance.now()-t);
  let removed=0,deposited=0;
  for(let i=0;i<m.heights.length;i++){assert(p.map.heights[i]>=Math.min(m.heights[i],s.floor)&&p.map.heights[i]<=m.maxHeight,'Floor and bounds');const delta=p.map.heights[i]-m.heights[i];if(delta<0)removed-=delta;else deposited+=delta;}
  assert.equal(removed,deposited+p.stats.edgeLoss,'material conserved');assert.equal(removed,p.stats.removed);assert.equal(deposited,p.stats.deposited);
  for(let j=1;j<p.route.length;j++){const a=p.route[j-1],b=p.route[j];assert(m.heights[b.y*m.W+b.x]<=m.heights[a.y*m.W+a.x],'route never climbs');}
  for(let i=0;i<p.transport.length;i++)if(p.transport[i]>=0)assert(m.heights[p.transport[i]]<=m.heights[i],'material moves downhill');
  assert.equal(digest(m),original,'immutable input');const second=plan(m,s,intent);assert.equal(digest(second.map),digest(p.map),'deterministic result');assert.deepEqual(second.operation,p.operation);assert.deepEqual(second.arrival,p.arrival);
  assert.equal(digest(replay(m,p.operation)),digest(p.map),'literal replay');
  const saved=snapshotMap(m);
  for(const progress of [0,.2,.6,.95,1]){const shown=reveal(p,progress);assert.equal(digest(snapshotMap(saved)),original,'undo restores every map byte');if(progress<1){assert.deepEqual(shown.water,m.water,'water waits for final land');for(let i=0;i<m.heights.length;i++)if(p.arrival[i]>progress)assert.equal(shown.heights[i],m.heights[i],'land waits for arrival');const entities=new Map(shown.entities.map(e=>[e.id,e]));for(const e of m.entities)if(footprint(m,e).every(i=>p.arrival[i]>progress))assert.deepEqual(entities.get(e.id),e,'objects wait for arrival');arrivalChecks++;}}
  const entities=new Map(p.map.entities.map(e=>[e.id,e]));for(const old of m.entities){const e=entities.get(old.id)!;assert(e,'objects survive');assert.equal(e.orientation,old.orientation,'upright');if(e.template!=='StartingLocation'){const src=old.y*m.W+old.x,dest=e.y*m.W+e.x;assert.equal(e.z-old.z,p.map.heights[dest]-m.heights[src],'objects and sources ride their ground');if(dest!==src)carriedObjects++;}}
  assert.equal(startProblem(p.map),null,'valid start');if(p.stats.startCarried)carriedStarts++;if(removed)activeGestures++;count++;
 }
 console.log(c.id,count,'gestures');
}
const waterCases=[];const failedLakes=[];
// Broad land sweep above, lean deep water check over all three presets and every style.
for(const {c,m} of cases)for(const style of ['auto','rockfall','slump','flow'] as const){const p=plan(m,{...DEFAULTS,power:c.power,size:c.size,style},c.intent),t=performance.now(),r=settle(p.map);
 const flood=drainage(p.map.heights,m.W,m.H);
 // A running dammed lake reaches its spill elevation. Separate retained pockets and diverted channels.
 const lake=Array.from(p.map.water.depth,(d,i)=>d>m.water.depth[i]+.5 && p.map.heights[i]<=m.heights[i] && flood.filled[i]>p.map.heights[i] && d+p.map.heights[i]>=flood.filled[i]-.12 ? i:-1).filter(i=>i>=0);
 const average=(depth:ArrayLike<number>)=>lake.reduce((a,i)=>a+depth[i]+p.map.heights[i],0)/Math.max(1,lake.length);
 const level=average(p.map.water.depth),sim=waterSim(p.map);sim.run(1024);const drift=average(sim.D)-level;
 const wetSpills=new Set<number>();
 for(const i of lake) {
  const level=flood.filled[i];
  for(const j of [i-m.W,i+m.W,i-1,i+1]) if(j>=0&&j<sim.N&&Math.abs(j%m.W-i%m.W)+Math.abs(Math.floor(j/m.W)-Math.floor(i/m.W))===1 && p.map.heights[j]===level && sim.D[j]>.05)wetSpills.add(j);
 }
 const spilling=wetSpills.size;
 const row={case:c.id,style,chosen:p.stats.style,changed:p.stats.changed,removed:p.stats.removed,saddleTiles:p.stats.saddleTiles.length,wetSpillTiles:spilling,lakeTiles:lake.length,level:+level.toFixed(4),levelDrift1024:+drift.toFixed(4),...r,settleMs:+(performance.now()-t).toFixed(1)};
 waterCases.push(row);if(lake.length && (!r.settled || Math.abs(drift)>.05 || !spilling))failedLakes.push(row);
 for(const d of sim.D)assert(Number.isFinite(d)&&d>=0,'water finite');
}
for(const invalid of [{power:NaN},{power:101},{floor:0},{floor:23},{size:2},{seed:-1},{style:'bad'}])assert.throws(()=>validate(cases[0].m,{...DEFAULTS,...invalid} as Settings,CASES[0].intent));
mkdirSync('checks',{recursive:true});const result={randomGestures:count,settingsPerCase:configs.length,activeGestures,deterministicPairs:count,literalReplays:count,undoSnapshots:count*5,arrivalSnapshots:arrivalChecks,carriedStarts,carriedObjects,worstPlanMs:+worstMs.toFixed(1),waterCases,failedLakes,totalSeconds:+((performance.now()-t0)/1000).toFixed(2)};if(previous)Object.assign(result,previous,{waterCases,failedLakes,waterRechecked:true});
writeFileSync('checks/core.json',JSON.stringify(result,null,2)+'\n');console.log(result);
const primary=waterCases.find(row=>row.case==='flow'&&row.style==='auto')!;
assert(primary.settled&&Math.abs(primary.levelDrift1024)<.05&&primary.wetSpillTiles>0,'Flow demonstration settles and spills');
if(failedLakes.length)console.log('Water exceptions are recorded in checks/core.json; REPORT.md must name them.');
assert.equal(failedLakes.length,0,'dammed lakes settle and spill');
