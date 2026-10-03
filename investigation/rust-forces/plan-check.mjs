import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {makeJobs,jobCounts,simulate,eligible} from './plan-matrix.mjs';
import {REQUIRED_COUNTS,FORCES,SIZES} from './acceptance.mjs';
const costs=JSON.parse(readFileSync(new URL('./pilot-shard-costs.json',import.meta.url))),rates=Object.fromEntries(costs.rows.map(r=>[`${r.target}/${r.verb}/${r.size}`,r.secondsPerCase]));
const jobs=makeJobs(2000,500,25,rates),counts=jobCounts(jobs),seen=new Set();
for(const j of jobs)for(let k=j.start;k<j.start+j.count;k++){const id=`${j.target}/${j.verb}/${j.size}/${k}`;assert.ok(!seen.has(id),'Overlapping shard '+id);seen.add(id);}
assert.equal(seen.size,63000);assert.equal(Object.values(counts).reduce((a,b)=>a+b,0),99000);
for(const [target,n]of Object.entries(REQUIRED_COUNTS))for(const v of FORCES)for(const size of SIZES)assert.equal(counts[`${target}/${v}/${size}`],n);
const model=simulate(jobs);assert.equal(model.completed,2520);assert.equal(model.maxActive,8);assert.equal(model.max512,6);assert.ok(model.seconds*1.2<10*3600);
assert.equal(eligible({size:512,target:'native'},Array(6).fill({size:512,target:'native'})),false);
assert.equal(eligible({size:256,target:'firefox'},Array(2).fill({size:128,target:'firefox'})),false);
assert.equal(eligible({size:128,target:'webkit'},Array(8).fill({size:128,target:'native'})),false);
console.log('Static plan PASS: 90 cells, 99,000 target checks, no overlapping case IDs, 2,520 shards, resource caps. No workers spawned.');
