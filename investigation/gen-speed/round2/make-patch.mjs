import {readFileSync,writeFileSync,mkdirSync,unlinkSync,existsSync} from 'node:fs';
import {resolve,dirname,relative} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {dir,root} from '../build.mjs';
const sha=x=>createHash('sha256').update(x).digest('hex');
const norm=x=>x.replaceAll('\r\n','\n');
const r1=readFileSync(resolve(dir,'adoption.patch'));
const manifest={base:'e292cefe30469033a922650f0455f87297c051d5',predecessor:'Round 1 adoption.patch',predecessorSha256:sha(r1),files:{}};
const scratch=resolve(dir,'local/round2-apply');
// This one generated scratch file must be absent for a repeatable new-file patch check.
try{unlinkSync(resolve(scratch,'src/core/math/portable.ts'));}catch(e){if(e.code!=='ENOENT')throw e;}
for(const f of Object.keys(JSON.parse(readFileSync(resolve(dir,'BASE.json'))).files).concat('land/delta.ts','land/levels.ts')){
 const dest=resolve(scratch,'src/core',f);mkdirSync(dirname(dest),{recursive:true});writeFileSync(dest,readFileSync(resolve(root,'src/core',f)));
}
execFileSync('git',['apply','--check',resolve(dir,'adoption.patch')],{cwd:root});
const scratchRel=relative(root,scratch).replaceAll('\\','/');
execFileSync('git',['apply',`--directory=${scratchRel}`,resolve(dir,'adoption.patch')],{cwd:root});
let patch='';
for(const f of ['gen/generate.ts','land/delta.ts','land/levels.ts','math/portable.ts'].filter(f=>existsSync(resolve(dir,'round2/candidate',f)))){
 const before=resolve(dir,'candidate',f),product=resolve(root,'src/core',f),after=resolve(dir,'round2/candidate',f);
 let original=null;try{original=norm(readFileSync(before,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;try{original=norm(readFileSync(product,'utf8'));}catch(x){if(x.code!=='ENOENT')throw x;}}
 const old=resolve(dir,'local/round2-patch-before',f);mkdirSync(dirname(old),{recursive:true});writeFileSync(old,original??'');
 let diff;try{diff=execFileSync('git',['diff','--no-index','--no-ext-diff','--',old,after],{encoding:'utf8',maxBuffer:10e6});}catch(e){if(e.status!==1)throw e;diff=e.stdout;}
 patch+=`diff --git a/src/core/${f} b/src/core/${f}\n`+(original===null?'new file mode 100644\n':'')+`--- ${original===null?'/dev/null':`a/src/core/${f}`}\n+++ b/src/core/${f}\n`+diff.slice(diff.indexOf('@@'));
 manifest.files[f]={before:original===null?null:sha(original),after:sha(norm(readFileSync(after,'utf8')))};
}
patch=patch.replace(/^ $/gm,'');const target=resolve(dir,'round2/adoption.patch');writeFileSync(target,patch);
execFileSync('git',['apply','--check',`--directory=${scratchRel}`,target],{cwd:root});
execFileSync('git',['apply',`--directory=${scratchRel}`,target],{cwd:root});
for(const[f,hash]of Object.entries(manifest.files))if(sha(norm(readFileSync(resolve(scratch,'src/core',f),'utf8')))!==hash.after)throw Error('scratch application differs '+f);
if(sha(readFileSync(resolve(dir,'adoption.patch')))!==manifest.predecessorSha256)throw Error('Round 1 patch modified');
manifest.round2PatchSha256=sha(readFileSync(target));manifest.portableOrigin='investigation/determinism/portable.ts (only import path adapted)';manifest.scratchApplyPassed=true;
writeFileSync(resolve(dir,'round2/BASE.json'),JSON.stringify(manifest,null,2)+'\n');
console.log('Both patches apply in sequence in investigation scratch; candidate source hashes match. Product untouched.');
