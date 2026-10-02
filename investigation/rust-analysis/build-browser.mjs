import {resolve} from 'node:path';
import {dirname} from 'node:path';
import {execFileSync} from 'node:child_process';
import {HERE,LOCAL,deps} from './common.mjs';
const executable=deps.resolve(process.platform==='win32'?'@esbuild/win32-x64/esbuild.exe':'@esbuild/linux-x64/bin/esbuild');
execFileSync(executable,[resolve(HERE,'browser-worker.mjs'),'--bundle','--platform=browser','--format=esm','--target=es2022','--outfile='+resolve(LOCAL,'worker.js')],{stdio:'inherit',windowsHide:true});
console.log('Browser worker built');
