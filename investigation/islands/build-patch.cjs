const fs=require('node:fs');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'../..');
const local=path.join(__dirname,'local/patch');fs.mkdirSync(local,{recursive:true});
const original=fs.readFileSync(path.join(root,'src/core/gen/generate.ts'),'utf8').replaceAll('\r\n','\n');
const after=require('./overlay.cjs').overlay(original,true);
fs.writeFileSync(path.join(local,'generate.before'),original);
fs.writeFileSync(path.join(local,'generate.after'),after);
// git's diff engine writes a real unified diff without editing a product file.
const d=spawnSync('git',['diff','--no-index','--no-ext-diff','--',path.join(local,'generate.before'),path.join(local,'generate.after')],{encoding:'utf8'});
if(d.status!==1)throw Error(d.stderr||'No generator diff');
let diff=d.stdout;
const lines=diff.split('\n');
lines[0]='diff --git a/src/core/gen/generate.ts b/src/core/gen/generate.ts';
lines[2]='--- a/src/core/gen/generate.ts';lines[3]='+++ b/src/core/gen/generate.ts';
diff=lines.join('\n');
const mod=fs.readFileSync(path.join(__dirname,'archipelago.ts'),'utf8').replaceAll('../../src/core/','../')
  .replace('// Adoption source: imports are rewritten to ../... when installed in src/core/land/.','// Sea-first Islands prototype (investigation/islands/INTEGRATION.md).');
const sourceLines=mod.trimEnd().split('\n');
diff+='diff --git a/src/core/land/archipelago.ts b/src/core/land/archipelago.ts\nnew file mode 100644\n--- /dev/null\n+++ b/src/core/land/archipelago.ts\n';
diff+=`@@ -0,0 +1,${sourceLines.length} @@\n`+sourceLines.map(l=>'+'+l).join('\n')+'\n';
fs.writeFileSync(path.join(__dirname,'adoption.patch'),diff);
console.log('adoption.patch: generator + land module; shared object fix and water cap excluded');
