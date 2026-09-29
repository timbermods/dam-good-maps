import {readFileSync,writeFileSync,readdirSync,statSync} from 'node:fs';import {resolve,join} from 'node:path';import {createHash} from 'node:crypto';
const dir=resolve('investigation/high-soul'),json=f=>JSON.parse(readFileSync(join(dir,f),'utf8'));
const clean=s=>s.replace(/\u001b\[[0-9;]*m/g,'');
const tests={};
for(const mode of ['baseline','proposal']){const r=json(`local/tests-${mode}.json`);tests[mode]={passed:r.numPassedTests,failed:r.numFailedTests,suites:r.testResults.map(s=>({file:s.name.replaceAll('\\','/').split('/tests/')[1],passed:s.assertionResults.filter(t=>t.status==='passed').length,failures:s.assertionResults.filter(t=>t.status==='failed').map(t=>({name:t.fullName,message:clean(t.failureMessages.join('\n')).split('\n')[0]}))}))};}
const capture=json('local/capture-manifest.json'),fixtures=json('local/fixture-manifest.json');
const signature=createHash('sha256').update(readFileSync(join(dir,'proposal.mjs'))).digest('hex');
if(capture.builds.proposal.signature!==signature||fixtures.build.signature!==signature)throw Error('Stale captures: regenerate before summarizing');
if(capture.errors.length||fixtures.errors.length)throw Error('Capture errors remain');
const evidence={round:2,base:'8c975822c2691edef94ff4f96217167697a91177',reference:'dd7bcbece5ea6e54cf47c0da3fdf86a3a3111849',tests,baselineNote:'Unchanged base; baseline unit result retained from round 1.',browser:{stats:json('local/e2e.json').stats},capture:{gpu:capture.gpu,builds:capture.builds,errors:capture.errors},fixtures:{views:fixtures.views,waterPixels:fixtures.waterPixels,errors:fixtures.errors},typecheck:readFileSync(join(dir,'local/typecheck.log'),'utf8').trim(),sheets:{count:readdirSync(join(dir,'captures')).length,bytes:readdirSync(join(dir,'captures')).reduce((n,f)=>n+statSync(join(dir,'captures',f)).size,0)}};
writeFileSync(join(dir,'checks.json'),JSON.stringify(evidence,null,2)+'\n');console.log('Evidence refreshed; proposal',tests.proposal.passed,'passed,',tests.proposal.failed,'accepted-rule conflicts;',evidence.sheets.bytes,'capture bytes.');
