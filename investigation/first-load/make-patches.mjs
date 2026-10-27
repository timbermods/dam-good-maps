import {readFileSync,writeFileSync,existsSync,mkdirSync,copyFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const here='investigation/first-load';
const groups={milestone:{label:'dev',files:['src/worker/generator.worker.ts','src/worker/checks.worker.ts','src/worker/checksReplica.ts','public/sw.js','src/platform/isolation.ts']},page:{label:'page',files:['src/ui/App.tsx','src/editor/paint/usePaint.ts']}};
for(const [owner,{label,files}] of Object.entries(groups)){
 let patch='';
 for(const file of files){
  const before=`${here}/local/${label}-original/${file}`,after=`${here}/local/${label}-adopted/${file}`;
  if(!existsSync(before)){
   const lines=readFileSync(after,'utf8').replaceAll('\r\n','\n').trimEnd().split('\n');
   patch+=`diff --git a/${file} b/${file}\nnew file mode 100644\n--- /dev/null\n+++ b/${file}\n@@ -0,0 +1,${lines.length} @@\n`+lines.map(l=>'+'+l+'\n').join('');
  }else{
   const diff=spawnSync('git',['diff','--no-index','--no-ext-diff',before,after],{encoding:'utf8',maxBuffer:1000000});
   if(diff.status!==1)throw Error(file+': '+diff.stderr);
   patch+=diff.stdout.replaceAll('a/'+before,'a/'+file).replaceAll('b/'+after,'b/'+file);
  }
 }
 writeFileSync(`${here}/${owner}.patch`,patch.replace(/^ $/gm, ""));
}
