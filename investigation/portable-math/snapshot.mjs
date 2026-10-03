import {execFileSync} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {ROOT,LOCAL,json,hash} from './common.mjs';
const ref=execFileSync('git',['rev-parse',process.env.DGM_DEV_REF??'4aab909e23016902cbbe6ffaeddeece786176ab3'],{cwd:ROOT,encoding:'utf8'}).trim(),directory=resolve(LOCAL,'dev');
const names=execFileSync('git',['ls-tree','-r','--name-only',ref,'src','tools','tests/contract/randomOps.ts'],{cwd:ROOT,encoding:'utf8'}).trim().split('\n'),inputs={};
for(const name of names){const bytes=execFileSync('git',['show',ref+':'+name],{cwd:ROOT,maxBuffer:32*1024*1024}),path=resolve(directory,name);mkdirSync(dirname(path),{recursive:true});writeFileSync(path,bytes);inputs[name]=hash(bytes);}
json('dev-snapshot.json',{ref,inputs});console.log('Read-only dev snapshot',ref,names.length,'files');
