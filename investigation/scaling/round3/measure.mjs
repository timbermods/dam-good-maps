import {spawn} from 'node:child_process';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {mkdirSync,writeFileSync} from 'node:fs';
const dir=fileURLToPath(new URL('.',import.meta.url)),out=resolve(dir,'../local/round3');mkdirSync(out,{recursive:true});
const [mode,...args]=process.argv.slice(2),stop=resolve(out,'stop-measure-'+Date.now());
if(!['browser','actions','modern','policy'].includes(mode))throw Error('Choose browser, actions, modern or policy');
const load=spawn('powershell.exe',['-NoProfile','-File',resolve(dir,'../load.ps1'),'-Output',resolve(out,'load.jsonl'),'-Stop',stop],{windowsHide:true});
const run=async(file,arguments_,env={})=>{const job=spawn(process.execPath,['--expose-gc',resolve(dir,file),...arguments_],{stdio:'inherit',windowsHide:true,env:{...process.env,...env}});const code=await new Promise((yes,no)=>{job.once('error',no);job.once('exit',yes);});if(code!==0)throw Error(file+' failed: '+code);};
try{
 if(mode==='policy')for(const spacing of ['8','32','128'])await run('run.mjs',['256',spacing],{SCALING_R3_STEPS:'64',SCALING_R3_OUT:'policy'});
 else await run(mode+'.mjs',args);
}finally{writeFileSync(stop,'done');await new Promise(r=>load.exitCode!==null?r():load.once('exit',r));}
