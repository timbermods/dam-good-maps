import {spawn} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {dir} from './overlay.mjs';
const folder=process.argv[2]??'accepted',output=resolve(dir,'../local/round2',folder);
mkdirSync(output,{recursive:true});
const stop=resolve(output,`recent-stop-${Date.now()}`);
const load=spawn('powershell.exe',['-NoProfile','-File',resolve(dir,'../load.ps1'),'-Output',resolve(output,'recent-load.jsonl'),'-Stop',stop],{windowsHide:true});
try {
  for(const stem of ['before-256-1-128','before-512-1-128','after-256-1-128','after-512-1-128']) {
    const child=spawn(process.execPath,['--expose-gc',resolve(dir,'recent.mjs'),folder,stem],{stdio:'inherit',windowsHide:true});
    const code=await new Promise(r=>child.once('exit',r));
    if(code!==0)throw Error(`recent actions failed: ${stem}/${code}`);
  }
} finally {
  writeFileSync(stop,'done');
  await new Promise(r=>load.exitCode!==null?r():load.once('exit',r));
}
