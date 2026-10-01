import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {resolve,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {root,dir,require} from './build.mjs';
const files=['analysis/ridge.ts','land/minePads.ts','gen/settler.ts','gen/intentions.ts','gen/generate.ts'];
const sha=b=>createHash('sha256').update(b).digest('hex');
const base='e292cefe30469033a922650f0455f87297c051d5';
const manifest={base,files:{},waterSha256:sha(readFileSync(resolve(root,'src/core/sim/water.ts'))),dependencies:{}};
let patch='';
for(const f of files){const old=resolve(dir,'local/patch-before',f),next=resolve(dir,'candidate',f);mkdirSync(dirname(old),{recursive:true});
  const original=readFileSync(resolve(root,'src/core',f),'utf8').replaceAll('\r\n','\n');
  const pinned=execFileSync('git',['show',`${base}:src/core/${f}`],{cwd:root,encoding:'utf8'}).replaceAll('\r\n','\n');
  if(original!==pinned)throw Error('product drift '+f);
  writeFileSync(old,original);let diff='';try{diff=execFileSync('git',['diff','--no-index','--no-ext-diff','--',old,next],{encoding:'utf8',maxBuffer:10e6});}catch(e){if(e.status!==1)throw e;diff=e.stdout;}
  patch+=`diff --git a/src/core/${f} b/src/core/${f}\n--- a/src/core/${f}\n+++ b/src/core/${f}\n`+diff.slice(diff.indexOf('@@'));
  manifest.files[f]={before:sha(original),after:sha(readFileSync(next))};
}
const deps=process.env.DGM_DEPS??resolve(root,'../../../startup/local/checkout');
for(const p of ['fflate','three','preact','esbuild','vite','typescript','vitest','playwright'])manifest.dependencies[p]=JSON.parse(readFileSync(resolve(deps,'node_modules',p,'package.json'))).version;
// Git accepts empty context lines without the optional space prefix. Avoid trailing-space
// warnings when the patch itself is committed as an investigation artifact.
patch=patch.replace(/^ $/gm,'');
writeFileSync(resolve(dir,'adoption.patch'),patch);writeFileSync(resolve(dir,'BASE.json'),JSON.stringify(manifest,null,2)+'\n');
execFileSync('git',['apply','--check',resolve(dir,'adoption.patch')],{cwd:root,stdio:'inherit'});
console.log('Adoption patch applies cleanly; five read-only source hashes bound to M9b.');
