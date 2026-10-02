import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {HERE,LOCAL,json,hash,stats} from './round2-common.mjs';
const browser=JSON.parse(readFileSync(resolve(HERE,'browser-timings.json'))),controls=JSON.parse(readFileSync(resolve(HERE,'browser-controls.json')));
assert.equal(browser.records.length,54);assert.equal(controls.rows.length,18);
const build=JSON.parse(readFileSync(resolve(HERE,'round2-build.json')));
for(const [name,digest] of Object.entries(build.bundleHashes))assert.equal(hash(readFileSync(resolve(LOCAL,name))),digest,'timed bundle changed');
const csv=(name,rows)=>{const keys=Object.keys(rows[0]),cell=v=>'"'+String(v??'').replaceAll('"','""')+'"';writeFileSync(resolve(HERE,name),[keys.map(cell).join(','),...rows.map(r=>keys.map(k=>cell(r[k])).join(','))].join('\n')+'\n');};
const caseOrder=JSON.parse(readFileSync(resolve(HERE,'benchmarks.json'))).cases.filter(c=>c.map.startsWith('riverValley'));
const rawHashes={},firstChanges=[];for(const r of browser.records){
 assert.equal(r.wallChanges.length,12);assert(r.load.samples>0);assert.equal(r.staleDisplayed,0);
 const index=caseOrder.findIndex(c=>c.map===r.map&&c.case===r.case),name='browser-raw-'+r.engine+'-'+r.size+'-'+index+'-'+r.rep+'.json';
 const bytes=readFileSync(resolve(LOCAL,name)),raw=JSON.parse(bytes);rawHashes[name]=hash(bytes);
 assert.equal(raw.frames.length,r.mainFrameWorkMs.count);
 for(const event of r.cancelEvents){const last=raw.messages.filter(m=>m.id===event.id).at(-1);event.lastPhase=last?.phase??'not begun';event.lastSimulatedTick=last?.ticks??0;}
 r.midFillCancellations=r.cancelEvents.filter(e=>e.kind==='cancelled'&&e.lastPhase==='filling').length;
 for(const c of r.wallChanges)firstChanges.push({engine:r.engine,size:r.size,case:r.case,rep:r.rep,change:c.id,first_visible_ms:c.firstVisibleMs,preview_absent:c.firstVisibleMs===null,cpu_mean_percent:r.load.mean,cpu_peak_percent:r.load.max,provisional:r.load.provisional});
}
json('browser-timings.json',{...browser,rawHashes});
csv('wall-change-timings.csv',firstChanges);
csv('browser-timings.csv',browser.records.map(r=>({engine:r.engine,size:r.size,case:r.case,rep:r.rep,main_callback_max_ms:r.mainFrameWorkMs.max,callbacks_over_16_7:r.mainFramesOver16_7,raf_interval_max_ms:r.rafIntervalMs.max,raf_intervals_over_16_7:r.rafIntervalsOver16_7,first_visible_median_ms:r.firstVisibleMs.median,first_visible_max_ms:r.firstVisibleMs.max,changes_without_preview:r.changesWithoutPreview,cadence_median_ms:r.cadenceMs.median,cadence_max_ms:r.cadenceMs.max,cancel_ack_max_ms:r.cancelAckMs.max,cancellations:r.cancellations,stale_displayed:r.staleDisplayed,fill_ms:r.fillMs,drought_ms:r.droughtMs,cpu_mean_percent:r.load.mean,cpu_peak_percent:r.load.max,cpu_samples:r.load.samples,provisional:r.load.provisional})));
const summary=[];
for(const engine of ['chromium','firefox','webkit'])for(const size of [128,256]){
 const rows=browser.records.filter(r=>r.engine===engine&&r.size===size);assert.equal(rows.length,9);
 const ref=controls.rows.filter(r=>r.engine===engine&&r.size===size),changes=rows.flatMap(r=>r.wallChanges);
 summary.push({engine,size,firstVisibleMs:stats(changes.map(c=>c.firstVisibleMs).filter(v=>v!==null)),mainWorkMaxMs:Math.max(...rows.map(r=>r.mainFrameWorkMs.max)),mainWorkOver16_7:rows.reduce((s,r)=>s+r.mainFramesOver16_7,0),cadenceMedianMs:stats(rows.map(r=>r.cadenceMs.median)).median,cadenceMaxMs:Math.max(...rows.map(r=>r.cadenceMs.max)),cancelAckMaxMs:Math.max(...rows.map(r=>r.cancelAckMs.max)),cancellations:rows.reduce((s,r)=>s+r.cancellations,0),midFillCancellations:rows.reduce((s,r)=>s+r.midFillCancellations,0),missedPreviews:changes.filter(c=>c.firstVisibleMs===null).length,changes:changes.length,fillMs:stats(rows.map(r=>r.fillMs)),droughtMs:stats(rows.map(r=>r.droughtMs)),rafIntervalMaxMs:Math.max(...rows.map(r=>r.rafIntervalMs.max)),controlRafMaxMs:Math.max(...ref.map(r=>r.rafIntervalMs.max)),cpuMeanPercent:rows.reduce((s,r)=>s+r.load.mean*r.load.samples,0)/rows.reduce((s,r)=>s+r.load.samples,0),provisional:rows.some(r=>r.load.provisional)});
}
// Cross-browser agreement of the measured compact final fields; full engine identity is separate.
for(const c of [...new Set(browser.records.map(r=>r.map+'|'+r.case))]){
 const rows=browser.records.filter(r=>r.map+'|'+r.case===c);assert.equal(rows.length,9);for(const r of rows)assert.deepEqual(r.final,rows[0].final,c+' browser/repetition result');
}
const identity=JSON.parse(readFileSync(resolve(LOCAL,'identity-all.json')));
const profile=JSON.parse(readFileSync(resolve(HERE,'profile-timings.json'))),cpu=JSON.parse(readFileSync(resolve(LOCAL,'round2.cpuprofile')));
assert.equal(hash(readFileSync(resolve(LOCAL,'round2.cpuprofile'))),profile.rawProfileSha256);
const kernelIds=new Set(cpu.nodes.filter(n=>n.callFrame.functionName.includes('rust_water3Sim7substep')).map(n=>n.id));
profile.cpuSamples=cpu.samples.length;profile.rustSubstepSamples=cpu.samples.filter(id=>kernelIds.has(id)).length;
json('profile-timings.json',profile);
json('round2-identity.json',{baseline:'bb5723f8',rust:'2ebeea87',comparisons:identity.comparisons,allBytesEqual:identity.allBytesEqual,excluded:['runtimeMs'],method:identity.method,cases:identity.rows.filter(r=>r.mode==='after').map(r=>({map:r.map,case:r.case,size:r.size,publications:r.publications,digest:r.digest})),browserCompactFinalAgreement:{cases:6,repetitionsPerCase:9,fields:['fill','drought','totalWaterM3']},additionalContracts:JSON.parse(readFileSync(resolve(HERE,'round2-contracts.json')))});
json('round2-summary.json',{summary,bundleHashes:build.bundleHashes,wasmSha256:build.wasmSha256,allTimingsProvisional:summary.every(r=>r.provisional),noStaleDisplay:true,frameGate:'Sketch JS callbacks fit the budget if mainWorkOver16_7 is zero. Full-frame/compositor/causal 16.7 ms guarantee unproven; headless shared-host references cannot establish it.',visibleWaterGate:'Canvas uploads in rAF only: earliest paint opportunity, not measured compositor presentation.'});
console.log(JSON.stringify(summary,null,2));
