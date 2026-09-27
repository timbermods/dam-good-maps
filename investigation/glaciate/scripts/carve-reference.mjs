// Read-only, pinned comparison oracle. Glaciate/demo never import this bundle.
import {build} from 'esbuild';
import {execFileSync} from 'node:child_process';
import {mkdirSync} from 'node:fs';
import {posix,resolve} from 'node:path';
const ref='cd9225cea5cdff18318b7d57c4ef2e3a70628dc2';
const files=new Set(execFileSync('git',['ls-tree','-r','--full-tree','--name-only',ref],{encoding:'utf8'}).trim().split('\n'));
const modulePath=p=>[p,p+'.ts',p+'/index.ts',p+'.json'].find(q=>files.has(q))??p;
mkdirSync('local/reference',{recursive:true});
await build({stdin:{contents:"export {CarveRun,DEFAULTS} from 'reference:src/core/forces/carve/run.ts'",resolveDir:process.cwd(),loader:'ts'},outfile:'local/reference/carve.mjs',bundle:true,format:'esm',platform:'node',nodePaths:[resolve('node_modules')],plugins:[{name:'pinned-git-reference',setup(b){
 b.onResolve({filter:/^reference:/},a=>({path:a.path.slice(10),namespace:'reference'}));
 b.onResolve({filter:/.*/,namespace:'reference'},a=>a.path.startsWith('.')?{path:modulePath(posix.normalize(posix.join(posix.dirname(a.importer),a.path))),namespace:'reference'}:{path:a.path,external:true});
 b.onLoad({filter:/.*/,namespace:'reference'},a=>({contents:execFileSync('git',['show',ref+':'+a.path],{encoding:'utf8',maxBuffer:16*1024*1024}),loader:a.path.endsWith('.json')?'json':'ts'}));
}}]});
console.log('Prepared pinned Round 2 Carve reference '+ref);
