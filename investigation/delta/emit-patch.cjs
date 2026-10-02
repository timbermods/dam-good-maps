// Produce the exact tested overlay as an adoption patch. Originals are only read.
const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const {overlay}=require('./run.cjs');
const base=path.resolve(__dirname,'../../src/core/gen/generate.ts');
const old=fs.readFileSync(base,'utf8').replaceAll('\r\n','\n');
const next=overlay(old).replace('"../../../investigation/delta/prototype"','"../land/delta"');
const before=path.join(__dirname,'local/patch-before.ts'),after=path.join(__dirname,'local/patch-after.ts');
fs.writeFileSync(before,old);fs.writeFileSync(after,next);
let diff;try{diff=execFileSync('git',['diff','--no-index','--no-prefix','--',before,after],{encoding:'utf8'});}catch(e){if(e.status!==1)throw e;diff=String(e.stdout);}
diff=diff.replace(/^diff --git .*$/m,'diff --git a/src/core/gen/generate.ts b/src/core/gen/generate.ts').replace(/^--- .*$/m,'--- a/src/core/gen/generate.ts').replace(/^\+\+\+ .*$/m,'+++ b/src/core/gen/generate.ts');
const code=fs.readFileSync(path.join(__dirname,'prototype.ts'),'utf8').replaceAll('\r\n','\n').trimEnd().replaceAll('../../src/core/','../');
const lines=code.split('\n');
diff+='diff --git a/src/core/land/delta.ts b/src/core/land/delta.ts\nnew file mode 100644\n--- /dev/null\n+++ b/src/core/land/delta.ts\n@@ -0,0 +1,'+lines.length+' @@\n'+lines.map(l=>'+'+l).join('\n')+'\n';
fs.writeFileSync(path.join(__dirname,'adoption.patch'),diff);
console.log('adoption.patch: exact loader overlay, imports relocated for src/core/land/delta.ts');
