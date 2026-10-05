import {writeFileSync} from 'node:fs';
export function summarizeAllocation(results){
 const [a,b]=results;
 const added=x=>x.beforeGC.unusedCount-x.initial.unusedCount;
 const peak=x=>Math.max(...[x.initial,...x.iterations.map(i=>i.allocation),x.beforeGC].flatMap(p=>p.wasm.map(m=>m.bytes)))/1048576;
 const equal=JSON.stringify(a.iterations.map(i=>[i.settledBytes,i.settledHash]))===JSON.stringify(b.iterations.map(i=>[i.settledBytes,i.settledHash]));
 if(!equal||added(a)<=0||added(b)!==0)throw new Error('Allocation comparison did not verify');
 const summary={verified:true,seed:4264,size:256,edits:12,method:'E2E editor hook: alternating Raise/Lower, request background checks to completion; compare current worker terrain, water and soil bytes',baselineUnused:added(a),fixedUnused:added(b),baselinePeakWasmMiB:peak(a),fixedPeakWasmMiB:peak(b),settledFingerprintsIdentical:equal,baselineBeforeGC:a.beforeGC,baselineAfterGC:a.final,fixedBeforeGC:b.beforeGC,fixedAfterGC:b.final};
 writeFileSync('investigation/long-session/allocation-summary.json',JSON.stringify(summary,null,2)+'\n');return summary;
}
