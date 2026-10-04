import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,relative,dirname,posix} from 'node:path';
import {execFileSync,spawnSync} from 'node:child_process';
import {ROOT,HERE,LOCAL,files} from './common.mjs';
import {transform} from './transform.mjs';
import {operationTool} from './scope.mjs';
const dev=process.argv.includes('--dev'),source=dev?execFileSync('git',['rev-parse',process.env.DGM_DEV_REF??'4aab909e23016902cbbe6ffaeddeece786176ab3'],{cwd:ROOT,encoding:'utf8'}).trim():execFileSync('git',['rev-parse','HEAD'],{cwd:ROOT,encoding:'utf8'}).trim();
const paths=dev?execFileSync('git',['ls-tree','-r','--name-only',source,'src','tools'],{cwd:ROOT,encoding:'utf8'}).trim().split('\n').filter(f=>/\.[jt]sx?$/.test(f)&&(f.startsWith('src/')||operationTool(f))):[...files(resolve(ROOT,'src')),...files(resolve(ROOT,'tools')).filter(f=>operationTool(relative(ROOT,f).replaceAll('\\','/')))].map(f=>relative(ROOT,f).replaceAll('\\','/'));
let patch='',changed=[];
function diff(file,before,after){
  if(before===after)return;
  const a=resolve(LOCAL,'patch-before',file),b=resolve(LOCAL,'patch-after',file);for(const f of[a,b])mkdirSync(dirname(f),{recursive:true});writeFileSync(a,before);writeFileSync(b,after);
  const r=spawnSync('git',['diff','--no-index','--no-ext-diff','--no-prefix','--',a,b],{cwd:ROOT,encoding:'utf8',maxBuffer:32*1024*1024});if(r.status!==1)throw Error(r.stderr||'Expected diff');
  const lines=r.stdout.split('\n');lines[0]=`diff --git a/${file} b/${file}`;
  const ai=lines.findIndex(l=>l.startsWith('--- ')),bi=lines.findIndex(l=>l.startsWith('+++ '));lines[ai]=`--- a/${file}`;lines[bi]=`+++ b/${file}`;patch+=lines.join('\n');changed.push(file);
}
for(const file of paths){const before=(dev?execFileSync('git',['show',source+':'+file],{cwd:ROOT,encoding:'utf8',maxBuffer:16*1024*1024}):readFileSync(resolve(ROOT,file),'utf8')).replaceAll('\r\n','\n');
  if(file==='src/core/math/portable.ts')continue;
  let module=posix.relative(posix.dirname(file),'src/core/math/portable');if(!module.startsWith('.'))module='./'+module;
  diff(file,before,transform(before,file,module));
}
const portable=readFileSync(resolve(HERE,'portable.ts'),'utf8').replace("'../../src/core/math/detmath'","'./detmath'").replaceAll('\r\n','\n');
const compressor=readFileSync(resolve(HERE,'compression.ts'),'utf8').replaceAll('\r\n','\n').replace("'./portable'","'../math/portable'").trimEnd().split('\n');
const pageHelper=readFileSync(resolve(HERE,'portable-page.ts'),'utf8').replaceAll('\r\n','\n').trimEnd().split('\n');
patch+=`diff --git a/tools/portable-page.ts b/tools/portable-page.ts\nnew file mode 100644\n--- /dev/null\n+++ b/tools/portable-page.ts\n@@ -0,0 +1,${pageHelper.length} @@\n`+pageHelper.map(l=>'+'+l).join('\n')+'\n';changed.push('tools/portable-page.ts');
patch+=`diff --git a/src/core/format/compression.ts b/src/core/format/compression.ts\nnew file mode 100644\n--- /dev/null\n+++ b/src/core/format/compression.ts\n@@ -0,0 +1,${compressor.length} @@\n`+compressor.map(l=>'+'+l).join('\n')+'\n';changed.push('src/core/format/compression.ts');
if(paths.includes('src/core/math/portable.ts'))diff('src/core/math/portable.ts',execFileSync('git',['show',source+':src/core/math/portable.ts'],{cwd:ROOT,encoding:'utf8'}),portable);
else{const lines=portable.trimEnd().split('\n');patch+=`diff --git a/src/core/math/portable.ts b/src/core/math/portable.ts\nnew file mode 100644\n--- /dev/null\n+++ b/src/core/math/portable.ts\n@@ -0,0 +1,${lines.length} @@\n`+lines.map(l=>'+'+l).join('\n')+'\n';changed.push('src/core/math/portable.ts');}
const vite=execFileSync('git',['show',source+':vite.config.ts'],{cwd:ROOT,encoding:'utf8'}).replaceAll('\r\n','\n');
if(!vite.includes('plugins: [preact()]'))throw Error('Vite plugin configuration changed; audit it');
diff('vite.config.ts',vite,"import {portableThree} from './investigation/portable-math/three-plugin.mjs';\n"+vite.replace('plugins: [preact()]','plugins: [portableThree(fileURLToPath(new URL(".", import.meta.url))), preact()]'));
// Ship the existing guard's replacement and the CI gate as adoption content, not product edits.
const oldGuard=execFileSync('git',['show',source+':investigation/determinism/guard.mjs'],{cwd:ROOT,encoding:'utf8'}).replaceAll('\r\n','\n');
diff('investigation/determinism/guard.mjs',oldGuard,"// The whole-src guard also rejects aliases and namespace escapes.\nimport {runGuard} from '../portable-math/guard.mjs';\nrunGuard();\n");
const ci=readFileSync(resolve(HERE,'ci.yml'),'utf8').replaceAll('\r\n','\n'),ciLines=ci.trimEnd().split('\n');
patch+=`diff --git a/.github/workflows/portable-math.yml b/.github/workflows/portable-math.yml\nnew file mode 100644\n--- /dev/null\n+++ b/.github/workflows/portable-math.yml\n@@ -0,0 +1,${ciLines.length} @@\n`+ciLines.map(l=>'+'+l).join('\n')+'\n';changed.push('.github/workflows/portable-math.yml');
patch=patch.replace(/^ $/gm,'');const name=dev?'dev-adoption':'adoption';writeFileSync(resolve(HERE,name+'.patch'),patch);writeFileSync(resolve(HERE,name+'-files.json'),JSON.stringify({source,files:changed},null,2)+'\n');
console.log(name,changed.length,'files',patch.length,'bytes; product files untouched');
