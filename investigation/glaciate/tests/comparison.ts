import {readFileSync,writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import {fixture} from './fixtures';
import {canonicalSettle,spillLevels} from '../../../src/core/sim/prefill';
import {json,modelFor,storedMap} from '../../forces-core/core/map';
import {buildable} from '../morphology';
const {CarveRun,DEFAULTS}=await import(pathToFileURL(resolve('local/reference/carve.mjs')).href);
const m=fixture('river-128'),settings={...DEFAULTS,power:100,width:24,depth:12,wander:5,walls:'steep',seed:891},run=new CarveRun(m,settings,{origin:16*128+64});
for(let k=0;!run.done&&k<5000;k++)run.step();assert.ok(run.done);const out={...m,...run.map};
// The isolated reference has its own JsonFloat class; cross the boundary as plain entities.
out.entities=JSON.parse(JSON.stringify(out.entities,(_k,v)=>v?.constructor?.name==='JsonFloat'?v.value:v));
const water=canonicalSettle(modelFor(out));out.water={depth:water.depth,contamination:water.contamination};
assert.ok(out.heights.every((h:number,i:number)=>h>=m.heights[i]-12));
const glacier=storedMap(JSON.parse(readFileSync('local/results/default.json','utf8')));
function measured(map:typeof m){const spill=spillLevels(modelFor(map)),a=buildable(m),b=buildable(map);return {buildableGain:b.reduce((s,v,i)=>s+v-a[i],0),cut:m.heights.reduce((s,h,i)=>s+Math.max(0,h-map.heights[i]),0),deposited:m.heights.reduce((s,h,i)=>s+Math.max(0,map.heights[i]-h),0),changed:map.heights.reduce((s,h,i)=>s+Number(h!==m.heights[i]),0),excavatedBelowOutlet:map.heights.reduce((s,h,i)=>s+Number(h<m.heights[i]&&h<spill[i]),0)};}
writeFileSync('local/results/carve.json',JSON.stringify(json(out)));
writeFileSync('checks/comparison.json',JSON.stringify({source:'feature/forces at cd9225cea5cdff18318b7d57c4ef2e3a70628dc2, read-only comparison oracle; not a demo dependency',settings,intent:{origin:2112},carve:{...measured(out),run:run.metrics,settled:water.settled},glaciate:measured(glacier)},null,2)+'\n');
console.log(JSON.stringify({settings,carve:measured(out),glaciate:measured(glacier)}));
