import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {HERE,LOCAL,hash} from './common.mjs';
import {REQUIRED_COUNTS,FORCES,SIZES} from './acceptance.mjs';
export const LIMITS=Object.freeze({workers:8,browsers:6,perEngine:2,memoryReserveGiB:10});
export function makeJobs(count=2000,browserCount=500,chunk=25,costs={}) {
 const jobs=[];
 for(const size of SIZES)for(const verb of FORCES)for(const target of ['native','chromium','firefox','webkit']) {
  const total=target==='native'?count:browserCount;
  for(let start=0;start<total;start+=chunk){const n=Math.min(chunk,total-start),name=`matrix-${target}-${verb}-${size}-${start}-${n}`,prefix=target==='native'?'checks':'browser';
   jobs.push({target,verb,size,start,count:n,name,file:prefix+'-'+name+'.json',manifest:name+'-build.json',estimatedSeconds:(costs[`${target}/${verb}/${size}`]??1)*n});}
 }
 return jobs;
}
export function eligible(job,active,limits=LIMITS) {
 if(active.length>=limits.workers)return false;
 if(job.target!=='native'&&(active.filter(j=>j.target!=='native').length>=limits.browsers||active.filter(j=>j.target===job.target).length>=limits.perEngine))return false;
 return true;
}
export function orderJobs(jobs){return jobs.sort((a,b)=>b.estimatedSeconds-a.estimatedSeconds||a.name.localeCompare(b.name,'en'));}
export function simulate(jobs,limits=LIMITS){
 const pending=orderJobs(jobs.map(j=>({...j}))),active=[],lanes=Array(limits.workers).fill(0);let now=0,completed=0,maxActive=0;
 while(pending.length||active.length){
  let i;while((i=pending.findIndex(j=>eligible(j,active,limits)))!==-1){const job=pending.splice(i,1)[0];
   const used=new Set(active.map(j=>j.lane)),slot=lanes.findIndex((_,k)=>!used.has(k));active.push({...job,lane:slot,end:now+job.estimatedSeconds});lanes[slot]=now+job.estimatedSeconds;maxActive=Math.max(maxActive,active.length);}
  if(!active.length)throw Error('Scheduler deadlock');now=Math.min(...active.map(j=>j.end));
  for(let k=active.length-1;k>=0;k--)if(active[k].end<=now){active.splice(k,1);completed++;}
 }
 return {seconds:now,completed,maxActive,laneSeconds:lanes};
}
export function jobCounts(jobs){const counts={};for(const j of jobs)for(const target of j.target==='native'?['native','node-wasm']:[j.target])counts[`${target}/${j.verb}/${j.size}`]=(counts[`${target}/${j.verb}/${j.size}`]??0)+j.count;return counts;}
if(process.argv[1]&&resolve(process.argv[1])===resolve(HERE,'plan-matrix.mjs')) {
 const costFile=resolve(HERE,'pilot-shard-costs.json');
 if(process.argv.includes('--from-pilot')){
  const matrixBytes=readFileSync(resolve(LOCAL,'identity-matrix.json')),machineBytes=readFileSync(resolve(LOCAL,'pilot-machine.json')),matrix=JSON.parse(matrixBytes),machine=JSON.parse(machineBytes);
  if(!matrix.pilot||matrix.shards.length!==24||machine.failed||JSON.stringify(matrix.sizes)!==JSON.stringify(SIZES))throw Error('Requires the completed current 256² 1% pilot');
  const rows=matrix.shards.map(j=>{const seconds=j.elapsedSeconds;if(!(seconds>0))throw Error('Pilot shard duration missing');return {target:j.target,verb:j.verb,size:j.size,cases:j.count,seconds,secondsPerCase:seconds/j.count};});
  writeFileSync(costFile,JSON.stringify({basis:'Observed sequential current-dev 256² identity pilot shard elapsed durations; includes reference computation, exact verification, exports and startup, not planner timings',sizes:SIZES,oracle:matrix.build.base,pilotMatrixSha256:hash(matrixBytes),pilotMachineSha256:hash(machineBytes),fingerprint:matrix.fingerprint,portableSha256:matrix.build.portableSha256,pilotSeconds:machine.elapsedSeconds,pilotCpu:machine.load,rows},null,2)+'\n');
 }
 const costs=JSON.parse(readFileSync(costFile)),rates=Object.fromEntries(costs.rows.map(r=>[`${r.target}/${r.verb}/${r.size}`,r.secondsPerCase]));
 if(costs.rows.length!==24||JSON.stringify(costs.sizes)!==JSON.stringify(SIZES))throw Error('All current 256² pilot target/force costs required');
 const jobs=makeJobs(2000,500,25,rates),counts=jobCounts(jobs);
 for(const [target,n]of Object.entries(REQUIRED_COUNTS))for(const v of FORCES)for(const size of SIZES)if(counts[`${target}/${v}/${size}`]!==n)throw Error('Dropped count '+target+'/'+v+'/'+size);
 if(Object.keys(counts).length!==30)throw Error('Extra/missing cell');
 const model=simulate(jobs),sequential=jobs.reduce((n,j)=>n+j.estimatedSeconds,0),penalty=.20;
 const plan={status:'waiting-for-post-M9b-dev-and-new-window',oracle:costs.oracle,sizes:SIZES,machine:{logicalThreads:16,physicalCores:8},limits:LIMITS,shardCases:25,shards:jobs.length,requiredCounts:REQUIRED_COUNTS,targetChecks:Object.values(counts).reduce((a,b)=>a+b,0),counts,basis:{file:'pilot-shard-costs.json',sha256:hash(readFileSync(costFile)),pilotSeconds:costs.pilotSeconds,method:costs.basis},projection:{sequentialHours:sequential/3600,balancedIdealHours:model.seconds/3600,contentionAllowance:penalty,plannedHours:model.seconds*(1+penalty)/3600,rangeHours:[model.seconds*1.1/3600,model.seconds*1.25/3600],peakCpuPercent:100,peakCpuStatus:'Projected saturation budget, not measured; includes auxiliary browser/JIT/GC threads',scope:'Exactly 33,000 random target checks at 256²; final-arithmetic existing suites/replays additional',uncertainty:'Only a sequential 1% sample exists. Parallel scaling, memory pressure and later seeds are unmeasured. Refresh this projection after the post-M9b port and pilot.'},simulation:model,execution:'Eight independent single-case-at-a-time processes; arithmetic unchanged. Longest estimated remaining shards first. At most six browsers and two per engine. Pause admission below 10 GiB available RAM. Stop at the named window end or the first failure; retain checkpoints/failure payloads, never waive counts.'};
 plan.machineAssignments=[{machine:'Kyler shared PC',logicalThreads:16,workers:8,share:1,targetChecks:plan.targetChecks,shards:plan.shards,status:'Full authorization withdrawn; wait for M9b on dev and a newly named window',projectedHours:plan.projection.plannedHours,projectedPeakCpuPercent:100}];
 plan.parts=['native','chromium','firefox','webkit'].map(target=>{
  const rows=costs.rows.filter(r=>r.target===target),pilotSeconds=rows.reduce((n,r)=>n+r.seconds,0);
  return {machine:'Kyler shared PC',target:target==='native'?'native + Node-Wasm (paired)':target,requiredTargetChecks:target==='native'?24000:3000,pilotCasesPerForceSize:target==='native'?20:5,pilotSeconds,projectedSerialWorkerHours:pilotSeconds*100/3600};
 });
 plan.partsBasis='One sequential identity pilot sample per cell; not repeated planner timings. Native/Node time is combined. Parts run concurrently; serial worker-hours are not overnight wall-clock slots.';
 writeFileSync(resolve(HERE,'parallel-plan.json'),JSON.stringify(plan,null,2)+'\n');console.log(JSON.stringify({shards:plan.shards,targetChecks:plan.targetChecks,projection:plan.projection,parts:plan.parts},null,2));
}
