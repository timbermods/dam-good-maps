import fs from 'node:fs';
import crypto from 'node:crypto';
const median=a=>[...a].sort((a,b)=>a-b)[Math.floor(a.length/2)];
const inputs=['local/native-direct-gate.json','local/browser-direct-gate.json'];
const evidence=inputs.map(path=>({path,sha256:crypto.createHash('sha256').update(fs.readFileSync(path)).digest('hex'),data:JSON.parse(fs.readFileSync(path))}));
const rows=evidence.flatMap(({path,sha256,data})=>data.rows.filter(r=>(r.verb??r.id.split('/')[0])!=='footprint').map(r=>{
 const target=r.engine??'native',verb=r.verb??r.id.split('/')[0],size=r.size??+r.id.split('/')[1],k=r.k??+r.id.split('/')[2],rust=r.times.native??r.times.wasmPlan;
 const tsMedian=median(r.times.ts),rustMedian=median(rust);
 return {target,verb,size,k,tsMedian,rustMedian,tsWorst:Math.max(...r.times.ts),rustWorst:Math.max(...rust),pass:rustMedian<=tsMedian&&(size<256||rustMedian<tsMedian),load:r.load,input:path,inputSha256:sha256};
}));
if(rows.length!==72||rows.some(r=>!r.pass))throw Error('Three-planner speed gate failed or incomplete');
const result={pass:true,cells:rows.length,repetitions:3,rows,limitations:'Shared PC, paired warmed medians. Worst values and CPU load retained; earlier WebKit miss is preserved in browser-round2-bench.json. This is the three-planner gate, not adoption approval.'};
fs.writeFileSync('direct-gate.json',JSON.stringify(result,null,2)+'\n');console.log('Three-planner gate PASS:',rows.length,'cells');
// Keep this gate independent of adoption: Carve, Glaciate and the complete identity
// suite must still pass before the investigation can be adopted.
