import {spawn} from 'node:child_process';
import {writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {dir,root} from './proposal.mjs';
const stop=resolve(dir,'local/water-stop-'+Date.now());
const load=spawn('powershell.exe',['-NoProfile','-File',resolve(dir,'load.ps1'),'-Output',resolve(dir,'local/water-load.jsonl'),'-Stop',stop],{windowsHide:true});
try{const child=spawn(process.execPath,['--expose-gc','--import','tsx',resolve(dir,'bench-water.ts')],{cwd:root,windowsHide:true,stdio:'inherit'});const code=await new Promise(r=>child.once('exit',r));if(code!==0)throw Error('Water benchmark failed '+code);}
finally{writeFileSync(stop,'done');await new Promise(r=>load.exitCode!==null?r():load.once('exit',r));}
