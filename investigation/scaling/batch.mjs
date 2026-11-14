import {spawn} from 'node:child_process';
import {resolve} from 'node:path';
import {dir,root} from './proposal.mjs';
const jobs=process.argv.slice(2);
for(const job of jobs){
 const [phase,suite,repeats='3',sizes]=job.split(':');
 const env={...process.env,SCALING_SUITE:suite,SCALING_REPEATS:repeats};if(sizes)env.SCALING_SIZES=sizes;
 const child=spawn(process.execPath,[resolve(dir,'run.mjs'),phase],{cwd:root,env,windowsHide:true,stdio:'inherit'});
 const code=await new Promise(r=>child.once('exit',r));if(code!==0)throw Error(job+' exited '+code);
}
