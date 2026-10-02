import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,existsSync,symlinkSync} from 'node:fs';
import {resolve} from 'node:path';
import {HERE,LOCAL,deps,hash,json} from './round2-common.mjs';
const original=execFileSync('git',['show','bb5723f8:investigation/dam-sketch/engine.ts'],{cwd:HERE}).toString();
writeFileSync(resolve(LOCAL,'before-engine.ts'),original.replaceAll("'./local/runtime'","'./runtime'").replaceAll("'../terrain3d/","'../../terrain3d/").replaceAll("'../../src/","'../../../src/").replaceAll("'./wall'","'../wall'").replaceAll("'./resident'","'../resident'"));
const esbuild=deps('esbuild');
const nodePaths=[resolve(process.env.DGM_DEPS??LOCAL,'node_modules')];
const mapInputs=Object.fromEntries(JSON.parse(readFileSync(resolve(HERE,'benchmarks.json'))).cases.map(c=>{
 const actual=hash(readFileSync(resolve(LOCAL,'maps',c.map+'.timber')));if(actual!==c.inputSha256)throw Error('Round-one map bytes changed: '+c.map);return [c.map,actual];
}));
if(!existsSync(resolve(LOCAL,'node_modules')))symlinkSync(nodePaths[0],resolve(LOCAL,'node_modules'),'junction');
for(const name of ['profile-round2','calibration','round2-contracts'])await esbuild.build({entryPoints:[resolve(HERE,name+'.ts')],outfile:resolve(LOCAL,name+'.cjs'),bundle:true,platform:'node',format:'cjs',target:'es2022',nodePaths});
for(const name of ['worker','browser-client'])await esbuild.build({entryPoints:[resolve(HERE,name+'.ts')],outfile:resolve(LOCAL,name+'.js'),bundle:true,platform:'browser',format:'iife',target:'es2022',nodePaths});
writeFileSync(resolve(LOCAL,'browser.html'),readFileSync(resolve(HERE,'browser.html')));
json('round2-build.json',{baseline:'bb5723f8',rust:'2ebeea87',wasmSha256:hash(readFileSync(resolve(LOCAL,'water.wasm'))),mapInputs,sourceHashes:Object.fromEntries(['engine.ts','resident.ts','worker.ts','browser-client.ts','profile-round2.ts','calibration.ts'].map(n=>[n,hash(readFileSync(resolve(HERE,n)))])),bundleHashes:Object.fromEntries(['worker.js','browser-client.js'].map(n=>[n,hash(readFileSync(resolve(LOCAL,n)))]))});
