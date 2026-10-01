import { execFileSync } from 'node:child_process';
import { readFileSync,writeFileSync,mkdirSync } from 'node:fs';
import { dirname,join } from 'node:path';
import { fileURLToPath } from 'node:url';
const here=dirname(fileURLToPath(import.meta.url));
const source=process.argv[2]??join(here,'isolation-reference.js');
const old=readFileSync(source,'utf8').replaceAll('\r\n','\n');
const candidate=readFileSync(join(here,'cache-selection.js'),'utf8')+'\n'+old.replace("const POLICY_VERSION = 'parallel-water-v1';","const POLICY_VERSION = 'parallel-water-startup-v1';").replace('event.respondWith(fetch(request).then(isolate));','event.respondWith(startupResponse(request).then(isolate));');
if(candidate===old || !old.includes('event.respondWith(fetch(request).then(isolate));'))throw Error('Isolation seam changed; adapt instead of replacing it');
const dir=join(here,'local/cache-patch');mkdirSync(join(dir,'public'),{recursive:true});
writeFileSync(join(dir,'public/isolation-sw.js'),old);writeFileSync(join(dir,'next.js'),candidate);
let patch;try{patch=execFileSync('git',['diff','--no-index','--no-prefix',join(dir,'public/isolation-sw.js'),join(dir,'next.js')],{encoding:'utf8'});}catch(e){if(e.status!==1)throw e;patch=e.stdout.toString();}
patch=patch.replaceAll('\r\n','\n').split('\n').map((line,i)=>i===0?'diff --git a/public/isolation-sw.js b/public/isolation-sw.js':line.startsWith('--- ')?'--- a/public/isolation-sw.js':line.startsWith('+++ ')?'+++ b/public/isolation-sw.js':line).join('\n');
writeFileSync(join(here,'cache-adoption.patch'),patch);
execFileSync('git',['apply','--no-index','--check',join(here,'cache-adoption.patch')],{cwd:dir});
console.log('Created cache-adoption.patch: one existing fetch handler, isolation after cache and network');
