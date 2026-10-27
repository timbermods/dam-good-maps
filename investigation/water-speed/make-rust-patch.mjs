// Generate an adoption patch from the ignored candidate, retaining product files untouched.
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const here=import.meta.dirname, root=path.resolve(here,'../..');
let patch='';
for(const file of ['rust/water/src/sim.rs','tools/rust/build.ts']) {
 const a='investigation/water-speed/local/control/'+file, b='investigation/water-speed/local/candidate/'+file;
 const r=spawnSync('git',['diff','--no-index','--no-ext-diff','--ignore-space-at-eol','--',a,b],{cwd:root,encoding:'utf8',windowsHide:true});
 if(r.status!==1 && r.status!==0) throw Error(r.stderr);
 patch+=r.stdout.replaceAll('a/investigation/water-speed/local/control/','a/').replaceAll('b/investigation/water-speed/local/candidate/','b/');
}
const test='rust/water/tests/water_speed.rs', source=fs.readFileSync(path.join(here,'strip-sync.rs'),'utf8').replaceAll('\r\n','\n').replace(/^\uFEFF/,'').trimEnd()+'\n', lines=source.trimEnd().split('\n');
patch+=`diff --git a/${test} b/${test}\nnew file mode 100644\n--- /dev/null\n+++ b/${test}\n@@ -0,0 +1,${lines.length} @@\n`+lines.map(l=>'+'+l).join('\n')+'\n';
// Git accepts empty context lines without the otherwise trailing marker space.
patch=patch.replaceAll('\r\n','\n').replace(/^ $/gm,'');
fs.writeFileSync(path.join(here,'adoption.patch'),patch);
const r=spawnSync('git',['apply','--check','investigation/water-speed/adoption.patch'],{cwd:root,encoding:'utf8',windowsHide:true});
if(r.status!==0) throw Error(r.stderr); console.log('adoption patch applies cleanly; only water source, regression and its build');
