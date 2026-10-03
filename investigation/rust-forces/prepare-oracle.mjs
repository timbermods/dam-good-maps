import {mkdirSync,writeFileSync,existsSync,readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
import {HERE,LOCAL,json} from './common.mjs';
const baseline=JSON.parse(readFileSync(resolve(HERE,'baseline-check.json'))).oracle;
const repository=process.env.DGM_REPOSITORY??resolve(HERE,'../..');
const destination=resolve(LOCAL,'oracle');
if(existsSync(destination))throw Error('Oracle already exists; reuse it with DGM_ROOT or choose a fresh investigation checkout.');
// Export product inputs only; never buffer bulk historical investigations in RAM.
mkdirSync(destination,{recursive:true});const file=resolve(LOCAL,'oracle.tar');
execFileSync('git',['archive','--format=tar','--output='+file,baseline,'src','tests','public','index.html','package.json','package-lock.json','tsconfig.json','LICENSE'],{cwd:repository,stdio:'inherit',windowsHide:true});
execFileSync('tar',['-xf',file,'-C',destination],{stdio:'inherit',windowsHide:true});
json('oracle.json',{baseline,path:destination});console.log('Read-only source exported to',destination);
