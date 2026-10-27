import { readFileSync, writeFileSync } from 'node:fs';
const root='investigation/deposit-pillars', files=['rust/forces/src/deposit.rs','tools/rust/forces-pins.json','tests/contract/depositFan.test.ts'];
import {spawnSync} from 'node:child_process';
let patch='';
for(const file of files){
 const before=`${root}/local/patch-before`,after=`${root}/overlay/${file}`;
 const existed=file!=='tests/contract/depositFan.test.ts';
 writeFileSync(before,existed?readFileSync(file,'utf8').replaceAll('\r\n','\n'):'');
 // Normalize snapshots so the adoption patch has no platform line-ending noise.
 writeFileSync(after,readFileSync(after,'utf8').replaceAll('\r\n','\n'));
 const diff=spawnSync('git',['diff','--no-index','--no-prefix','--unified=1','--',before,after],{encoding:'utf8',windowsHide:true});
 if(diff.status!==0&&diff.status!==1)throw Error(diff.stderr);
 let text=diff.stdout;if(!text)continue;
 text=text.replace(/^diff --git .+$/m,`diff --git a/${file} b/${file}`).replace(/^--- .+$/m,existed?`--- a/${file}`:'--- /dev/null').replace(/^\+\+\+ .+$/m,`+++ b/${file}`);
 if(!existed)text=text.replace(/^index .+$/m,'new file mode 100644');
 patch+=text;
}
writeFileSync(`${root}/adoption.patch`,patch);
