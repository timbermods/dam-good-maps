import {readFileSync,createReadStream,writeFileSync} from 'node:fs';
import {createInterface} from 'node:readline';
import {resolve} from 'node:path';
import {dir} from './overlay.mjs';
const folder=resolve(dir,'../local/round2/browser-large');
const owned=JSON.parse(readFileSync(resolve(folder,'firefox-owned-processes.json'),'utf8').replace(/^\uFEFF/,''));
const ids=new Map(owned.map(p=>[p.pid,Date.parse(p.createdUtc)]));
const run=JSON.parse(readFileSync(resolve(folder,'results.json'))).find(r=>r.engine==='firefox'&&r.repeat===3);
if(!run)throw Error('third Firefox repeat required');
let workingSetPeak=0,privateBytesPeak=0,samples=0;
for await(const line of createInterface({input:createReadStream(resolve(folder,'load.jsonl'))})) {
  if(!line)continue;const row=JSON.parse(line),at=Date.parse(row.at);
  if(at<run.at||at>run.at+run.openMs+run.saveMs+run.reopenMs)continue;
  const processes=row.processMemory.filter(p=>ids.has(p.pid)&&at>=ids.get(p.pid));
  workingSetPeak=Math.max(workingSetPeak,processes.reduce((n,p)=>n+p.workingSet,0));
  privateBytesPeak=Math.max(privateBytesPeak,processes.reduce((n,p)=>n+p.privateBytes,0));samples++;
}
if(!samples||!workingSetPeak)throw Error('owned browser memory samples required');
const result={scope:'Diagnostic lower bound: summed OS working sets/private bytes of owned Firefox descendants alive near the end of the third repeat. Page and worker share a process; not isolated JS heap or final steady state.',samples,workingSetPeak,privateBytesPeak};
writeFileSync(resolve(folder,'memory-diagnostic.json'),JSON.stringify(result,null,2)+'\n');console.log(result);
