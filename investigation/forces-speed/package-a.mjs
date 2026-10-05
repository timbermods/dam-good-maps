import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {resolve,join,dirname} from 'node:path';
const root=resolve(import.meta.dirname,'../..'),dir=join(root,'investigation/forces-speed'),tree=join(dir,'local/a-source');
const files=['src/core/features/geometry.ts','src/core/forces/carve/play.ts','src/core/forces/rift.ts','src/core/forces/runs.ts','src/core/forces/erupt.ts','src/core/forces/glaciate/run.ts'];
for(const f of files){const p=join(tree,f);mkdirSync(dirname(p),{recursive:true});writeFileSync(p,readFileSync(join(root,f)));}
execFileSync(process.execPath,[join(dir,'change-a.mjs'),'local/a-source'],{stdio:'inherit',windowsHide:true});
let patch='';
for(const f of files){
 let diff='';try{diff=execFileSync('git',['diff','--no-index','--no-ext-diff','--',join(root,f),join(tree,f)],{encoding:'utf8',windowsHide:true});}catch(e){if(e.status!==1)throw e;diff=e.stdout;}
 patch+=diff.replace(/^diff --git .*$/m,'diff --git a/'+f+' b/'+f).replace(/^--- .*$/m,'--- a/'+f).replace(/^\+\+\+ .*$/m,'+++ b/'+f).replace(/^ $/gm,'');
}
writeFileSync(join(dir,'adoption-a.patch'),patch);
execFileSync('git',['apply','--check','--whitespace=error-all',join(dir,'adoption-a.patch')],{cwd:root,stdio:'inherit',windowsHide:true});
console.log('A-only adoption patch applies to untouched base');