import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {strict as assert} from 'node:assert';
import {build,dir} from './build.mjs';
const rows=readFileSync(resolve(dir,'local/browser.jsonl'),'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
assert.equal(rows.length,42,'all browser pairs required');
const sha=b=>createHash('sha256').update(b).digest('hex');
const m=await import(pathToFileURL(await build('before'))),checks=[];
for(const theme of m.AVAILABLE_THEMES){
  let land=null;
  const r=m.generate(m.decodeSpecFragment(`s=1&t=${theme}&z=256&d=n`).spec,{onLand:l=>{land={heights:sha(l.heights.slice()),water:sha(l.water.slice())};}});
  for(const row of rows.filter(row=>row.theme===theme)){assert.equal(row.proof.response.sha256,sha(r.bytes),theme+' browser/Node .timber');assert.deepEqual(row.proof.land,land,theme+' browser/Node first land');}
  checks.push({theme,firstLand:land,timber:sha(r.bytes)});console.log('browser/Node identity',theme);
}
writeFileSync(resolve(dir,'BROWSER-IDENTITY.json'),JSON.stringify({cases:7,browserVisits:42,mismatches:0,checks},null,2)+'\n');
