import {spawn} from 'node:child_process';
import {resolve} from 'node:path';
import {mkdirSync,writeFileSync} from 'node:fs';
import {dir} from './overlay.mjs';
const output=resolve(dir,'../local/round2',process.env.SCALING_R2_OUT??'runs');mkdirSync(output,{recursive:true});
const stop=resolve(output,`stop-${Date.now()}`),load=spawn('powershell.exe',['-NoProfile','-File',resolve(dir,'../load.ps1'),'-Output',resolve(output,'load.jsonl'),'-Stop',stop],{windowsHide:true});
const jobs=process.argv.slice(2).length?process.argv.slice(2):['before:256:128','after:256:128','before:512:128','after:512:128'];
// Session construction is a memory/capacity probe. Measured end-state actions repeat inside run-case.
try{for(const job of jobs)for(let n=1;n<=Number(process.env.SCALING_R2_SESSION_REPEATS??1);n++){
 const [phase,size,cache]=job.split(':'),child=spawn(process.execPath,['--expose-gc',resolve(dir,'run-case.mjs'),phase,size,String(n)],{cwd:resolve(dir,'../../..'),env:{...process.env,SCALING_R2_SNAPSHOT_MIB:cache},stdio:'inherit',windowsHide:true});
 const code=await new Promise(r=>child.once('exit',r));if(code!==0)throw Error(`failed ${job}/${n}: ${code}`);
}}finally{writeFileSync(stop,'done');await new Promise(r=>load.exitCode!==null?r():load.once('exit',r));}
