import {spawn} from 'node:child_process';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {mkdirSync,writeFileSync} from 'node:fs';
const dir=fileURLToPath(new URL('.',import.meta.url)),out=resolve(dir,'../local/round3');mkdirSync(out,{recursive:true});
const stop=resolve(out,'stop-'+Date.now()),load=spawn('powershell.exe',['-NoProfile','-File',resolve(dir,'../load.ps1'),'-Output',resolve(out,'load.jsonl'),'-Stop',stop],{windowsHide:true});
try{for(const item of process.argv.slice(2).length?process.argv.slice(2):['256:32','512:32']){const [size,spacing]=item.split(':'),job=spawn(process.execPath,['--expose-gc',resolve(dir,'run.mjs'),size,spacing],{windowsHide:true,stdio:'inherit'});const code=await new Promise(r=>job.once('exit',r));if(code)throw Error('case failed '+item);}}
finally{writeFileSync(stop,'done');await new Promise(r=>load.exitCode!==null?r():load.once('exit',r));}
