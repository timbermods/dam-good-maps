import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync,existsSync,symlinkSync} from 'node:fs';
import {resolve} from 'node:path';
import {dir,root,base} from './overlay.mjs';
const repository=resolve(dir,'../../..'),archive=resolve(dir,'../local/round2/base.tar'),pin=resolve(root,'.scaling-source-pin');
mkdirSync(root,{recursive:true});
if(existsSync(pin)){if(readFileSync(pin,'utf8')!==base)throw Error('snapshot pin differs; use a fresh ignored local directory');}
else{execFileSync('git',['archive','--format=tar','-o',archive,base],{cwd:repository});execFileSync('tar',['-xf',archive,'-C',root]);writeFileSync(pin,base);}
if(!existsSync(resolve(root,'node_modules')))symlinkSync(resolve(repository,'node_modules'),resolve(root,'node_modules'),'junction');
console.log('Pinned source snapshot prepared under ignored local/.');
