// Read the merged dev test correction; product files stay unchanged.
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {ROOT,LOCAL,hash,json} from './common.mjs';
export const testPath='tests/contract/carveBornAsItCuts.test.ts';
export const commit='f1a87b54c933540b9dd20179216ba09ec734122b';
const merged=execFileSync('git',['show',commit+':'+testPath],{cwd:ROOT,windowsHide:true,encoding:'utf8'});
// Group 1 removed this setter: worker/session.ts opened() already selects defer.
export const code=merged.replace('  ed.setEditorWaterMode("defer");\n','');
export const provenance={commit,path:testPath,baselineSha256:hash(readFileSync(resolve(ROOT,testPath))),mergedTestSha256:hash(Buffer.from(merged)),testSha256:hash(Buffer.from(code)),scope:'Merged dev test-only fix: cancel leftover force and measure half the cut. Omit removed setEditorWaterMode API: group 1 opened() already selects defer. Assertions unchanged from merged dev. No force code changes.'};
json('upstream-test.json',provenance);
if(process.argv.includes('--quick-config')){
 const config={root:ROOT,cacheDir:resolve(LOCAL,'quick-vite-cache')};
 const plugin={name:'merged-dev-carve-test',enforce:'pre'};
 writeFileSync(resolve(LOCAL,'quick.config.mjs'),`import base from ${JSON.stringify(pathToFileURL(resolve(ROOT,'vitest.config.ts')).href)};
export default {...base,...${JSON.stringify(config)},plugins:[{...${JSON.stringify(plugin)},transform(code,id){if(id.endsWith('/${testPath}'))return ${JSON.stringify(code)};}}]};
`);
 console.log('CI quick suite with merged dev Carve assertions and group-1 water API:',commit);
}
