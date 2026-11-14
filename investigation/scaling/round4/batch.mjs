import {spawn} from 'node:child_process';
for(const size of ['256','512']){const child=spawn(process.execPath,['--expose-gc','investigation/scaling/round4/measure.mjs','run',size,'0'],{stdio:'inherit',windowsHide:true});const code=await new Promise((ok,no)=>{child.on('error',no);child.on('exit',ok);});if(code!==0)throw Error('session '+size+' failed '+code);}
