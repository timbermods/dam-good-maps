// Regenerate an unapplied patch against the original spike. Product files are read only.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const here=path.dirname(fileURLToPath(import.meta.url));
await mkdir(path.join(here,'local'),{recursive:true});
const before=path.join(here,'local/patch-before'),after=path.join(here,'local/patch-after');
await mkdir(before,{recursive:true});await mkdir(after,{recursive:true});
let patch='';
for(const file of ['codes.ts','long-codes.ts','app.ts','index.html']) {
  const original=path.join(before,file),updated=path.join(after,file);
  const source=file==='long-codes.ts'?'':await readFile(path.join(here,'../collab-spike',file),'utf8');
  await writeFile(original,source.replaceAll('\r\n','\n'));
  await writeFile(updated,(await readFile(path.join(here,file),'utf8')).replaceAll('\r\n','\n'));
  let diff;
  try {diff=execFileSync('git',['-c','core.autocrlf=false','diff','--no-index','--no-ext-diff','--',original,updated],{encoding:'utf8'});}
  catch(e){if(e.status!==1)throw e;diff=e.stdout;}
  const target='investigation/collab-spike/'+file;
  diff=diff.replace(/^diff --git .+$/m,`diff --git a/${target} b/${target}`)
    .replace(/^--- .+$/m,file==='long-codes.ts'?'--- /dev/null':`--- a/${target}`)
    .replace(/^\+\+\+ .+$/m,`+++ b/${target}`).replace(/^index .+\n/m,'');
  if(file==='long-codes.ts')diff=diff.replace(`diff --git a/${target} b/${target}\n`,`diff --git a/${target} b/${target}\nnew file mode 100644\n`);
  patch+=diff;
}
// Git accepts empty context lines without a space; keep the artifact whitespace-clean.
await writeFile(path.join(here,'adoption.patch'),patch.replace(/^ $/gm,''));
console.log('Wrote adoption.patch. Validate with git apply --check; do not apply during this investigation.');
