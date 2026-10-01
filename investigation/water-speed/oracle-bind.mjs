// Bind the completed Python run to the final candidate by its exact exported bytes.
// This avoids repeating costly Python validation after a private index-order ablation.
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {api,LOCAL,json,hash} from './common.mjs';
const proof=JSON.parse(readFileSync(resolve(LOCAL,'proof.json'),'utf8'));
assert.equal(proof.cases.length,1073,'Complete final matrix required');
const buildId=hash(readFileSync(resolve(LOCAL,'baseline.cjs'))+readFileSync(resolve(LOCAL,'fast.cjs')));
assert.equal(proof.buildId,buildId);
const byId=new Map(proof.cases.map(c=>[c.id,c])),fileMap=new Map();
const prefixes=['oracle','oracle-sea'];
for(const prefix of prefixes) for(const size of [128,256]) {
  const dir=resolve(LOCAL,prefix+'-generated',String(size));
  for(const name of readdirSync(dir).filter(n=>n.endsWith('.timber')&&!n.includes('-unmigrated'))) {
    const raw=readFileSync(resolve(dir,name));
    const spec=api().decodeProject(readFileSync(resolve(dir,name.replace('.timber','.damgoodmaps.json')))).spec;
    const id=`generated-${spec.theme}-${size}-${spec.seed}`,p=byId.get(id);
    assert.ok(p,id);assert.equal(hash(raw),p.exportHash,id+' Python-tested export');
    fileMap.set(id,{id,sha256:hash(raw)});
  }
}
const files=[...fileMap.values()];assert.equal(files.length,40);
assert.equal(byId.get('generated-any-128-3').generated.passed,false);
assert.equal(byId.get('generated-islands-128-20').generated.passed,false);
const log=readFileSync(resolve(LOCAL,'oracle-report.txt'),'utf8');
assert.match(log,/1 generation failures, 0 load failures, 0 round-trip failures/);
assert.match(log,/official maps: 19 validated in the import profile, 0 disagreements/);
assert.match(log,/918 checks compared, 0 disagreements/);
const sea=readFileSync(resolve(LOCAL,'oracle-sea-report.txt'),'utf8');
assert.match(sea,/1 generation failures, 0 load failures, 0 round-trip failures/);assert.match(sea,/204 checks compared, 0 disagreements/);
assert.equal(JSON.parse(readFileSync(resolve(LOCAL,'oracle-sea-build.json'),'utf8')).buildId,buildId);
json(resolve(LOCAL,'oracle-binding.json'),{buildId,status:'pass',files,pythonLoadPass:40,pythonRoundtripPass:40,generatedParityChecks:1122,officialMaps:19,disagreements:0,upstreamRefusals:['generated-any-128-3','generated-islands-128-20'],reportSha256:hash(log),seaReportSha256:hash(sea)});
console.log('Python evidence bound to final candidate:',files.length,'byte-identical exports; unchanged refusal');
