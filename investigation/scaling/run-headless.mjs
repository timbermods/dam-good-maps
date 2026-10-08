import {spawn} from 'node:child_process';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {mkdirSync,writeFileSync} from 'node:fs';
const dir=fileURLToPath(new URL('.',import.meta.url)),root=resolve(dir,'../..'),local=resolve(dir,'local');
const output=resolve(local,'headless-'+(process.env.SCALING_HEADLESS_PHASE??'before'));mkdirSync(output,{recursive:true});const stop=resolve(output,`stop-${Date.now()}`);
const load=spawn('powershell.exe',['-NoProfile','-File',resolve(dir,'load.ps1'),'-Output',resolve(output,'load.jsonl'),'-Stop',stop],{windowsHide:true});
async function run(args){const child=spawn(process.execPath,args,{cwd:root,windowsHide:true,stdio:'inherit'});const code=await new Promise(r=>child.once('exit',r));if(code!==0)throw Error('Child benchmark failed: '+code);}
try{for(const size of (process.env.SCALING_SIZES??'128x128,256x256,512x512,128x512,512x256,64x512').split(','))for(let n=1;n<=Number(process.env.SCALING_REPEATS??3);n++)await run(process.env.SCALING_HEADLESS_PHASE?['--expose-gc',resolve(dir,'local',`headless-${process.env.SCALING_HEADLESS_PHASE}.mjs`),size,String(n)]:['--expose-gc','--import','tsx',resolve(dir,'headless.ts'),size,String(n)]);}
finally{writeFileSync(stop,'done');await new Promise(r=>load.exitCode!==null?r():load.once('exit',r));}
