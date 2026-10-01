import {resolve,dirname} from 'node:path';
import {mkdirSync,copyFileSync,readFileSync,writeFileSync,existsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {HERE,ROOT,LOCAL,hash,json} from './common.mjs';
// Build a reviewable adoption patch without editing a product file or the Git index.
const files={
  'src/core/sim/water.ts':'water.ts',
  'src/core/sim/parallel.ts':'runtime.ts',
  'src/core/sim/water-parallel.worker.ts':'helper.ts',
  'public/isolation-sw.js':'isolation-sw.js',
  'public/isolation-register.js':'isolation-register.js',
};
const before=resolve(LOCAL,'patch-before'),after=resolve(LOCAL,'patch-after');
for(const [destination,source]of Object.entries(files)){
  for(const directory of [before,after])mkdirSync(dirname(resolve(directory,destination)),{recursive:true});
  if(existsSync(resolve(ROOT,destination)))copyFileSync(resolve(ROOT,destination),resolve(before,destination));
  copyFileSync(resolve(HERE,source),resolve(after,destination));
}
const result=spawnSync('git',['diff','--no-index','--no-ext-diff','--src-prefix=a/','--dst-prefix=b/','local/patch-before','local/patch-after'],{cwd:HERE,encoding:'utf8'});
if(result.status!==1)throw Error('Patch generation failed: '+result.stderr);
// Git apply accepts an empty context line without its space prefix. This keeps the
// patch container itself free of trailing whitespace without changing any source line.
const patch=result.stdout.replaceAll('a/local/patch-before/','a/').replaceAll('a/local/patch-after/','a/').replaceAll('b/local/patch-after/','b/').replaceAll('b/local/patch-before/','b/').replace(/^ \r?$/gm,'');
writeFileSync(resolve(HERE,'adoption.patch'),patch);
const check=spawnSync('git',['apply','--check','--whitespace=error',resolve(HERE,'adoption.patch')],{cwd:ROOT,encoding:'utf8'});
if(check.status!==0)throw Error('Patch does not apply to pinned base: '+check.stderr);
json('patch-check.json',{base:'6c29b7e5',patch:hash(patch),files,applyCheck:true});
console.log('Adoption patch applies cleanly; product files untouched');
