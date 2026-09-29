import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';import {execFileSync} from 'node:child_process';import {join,resolve} from 'node:path';import {changes,transform} from './proposal.mjs';
const dir=resolve('investigation/high-soul');let patch='';
for(const f of changes.keys()){
 const before=join(dir,'local/site',f),after=join(dir,'local/proposed',f);mkdirSync(join(after,'..'),{recursive:true});writeFileSync(after,transform(f,readFileSync(before,'utf8')));
 let out;try{out=execFileSync('git',['diff','--no-index','--no-ext-diff','--',before,after],{encoding:'utf8'});}catch(e){if(e.status!==1)throw e;out=e.stdout;}
 const lines=out.split('\n');let hunks=lines.slice(lines.findIndex(l=>l.startsWith('@@'))).join('\n');patch+=`diff --git a/${f} b/${f}\n--- a/${f}\n+++ b/${f}\n`+hunks;
}
writeFileSync(join(dir,'adoption.patch'),patch.replace(/^ $/gm,''));console.log('Emitted proposal copies under local/proposed and adoption.patch; no product file changed.');
