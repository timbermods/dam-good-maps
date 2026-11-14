import {spawn} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {dir} from './overlay.mjs';
const output=resolve(dir,'../local/round2',process.env.SCALING_R2_BROWSER_OUT??'browser');mkdirSync(output,{recursive:true});
const stop=resolve(output,`stop-${Date.now()}`),load=spawn('powershell.exe',['-NoProfile','-File',resolve(dir,'../load.ps1'),'-Output',resolve(output,'load.jsonl'),'-Stop',stop],{windowsHide:true});
try{const child=spawn(process.execPath,[resolve(dir,'browser.mjs'),...process.argv.slice(2)],{stdio:'inherit',windowsHide:true});const code=await new Promise(r=>child.once('exit',r));if(code!==0)throw Error(`browser verification failed: ${code}`);}finally{writeFileSync(stop,'done');await new Promise(r=>load.exitCode!==null?r():load.once('exit',r));}
