import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { build } from 'esbuild';

const dir=fileURLToPath(new URL('.',import.meta.url));
const root=resolve(dir,'../..');
const mode=process.argv[2]??'prototype';
mkdirSync(resolve(dir,'local'),{recursive:true});
const changes=new Map();
function edit(path,fn){const before=readFileSync(resolve(root,path),'utf8');changes.set(path,{before,after:fn(before)});}
function replace(s,a,b){if(s.split(a).length!==2)throw Error('Anchor is not unique: '+a.slice(0,80));return s.replace(a,b);}
function add(path,source){changes.set(path,{before:'',after:readFileSync(resolve(dir,source),'utf8')});}
if(mode!=='baseline') {
  if(mode!=='lakes') {
    add('src/core/land/verticality.ts','prototype/verticality.ts');
    edit('src/core/land/genome.ts',s=>replace(replace(s,'import { stream, type Rng }','import { verticalityRange } from "./verticality";\nimport { stream, type Rng }'),'  // terracing: the benched share','  verticalityRange(g, s);\n  // terracing: the benched share'));
  }
  if(mode!=='verticality') {
    add('src/core/land/lakes.ts','prototype/lakes.ts');
    const prev=changes.get('src/core/land/genome.ts');
    const before=prev?.before??readFileSync(resolve(root,'src/core/land/genome.ts'),'utf8');
    let after=prev?.after??before;
    after=replace(after,'import { stream, type Rng }','import { lakeRange } from "./lakes";\nimport { stream, type Rng }');
    after=replace(after,'  lakeSpringMax?: number;','  lakeAmount?: number;\n  lakeSpringMax?: number;');
    const start=after.indexOf('  // lakes and basins\n'); const end=after.indexOf('  // waterfalls\n',start);
    if(start<0||end<0)throw Error('Missing lakes block');
    after=after.slice(0,start)+'  // The setting is an absolute additional-water budget, above signature water.\n  lakeRange(g, s);\n'+after.slice(end);
    changes.set('src/core/land/genome.ts',{before,after});
    edit('src/core/land/hydro.ts',s=>replace(replace(s,'import { featureId }','import { connectedLakes } from "./lakes";\nimport { featureId }'),'  return { rivers, water, lakes, falls, arms, flowTotal };','  const result = { rivers, water, lakes, falls, arms, flowTotal };\n  connectedLakes(h, W, H, g, seed, attempt, result, protect);\n  return result;'));
    edit('src/core/spec/mapspec.ts',s=>replace(s,'    lakes: "none" | "few" | "some" | "many";','    lakes: "none" | "few" | "some" | "many";\n    /** Continuous prototype budget; when absent, None/Few/Some/Many map to 0/25/50/100. */\n    lakeAmount?: number; // 0–100'));
    edit('src/core/spec/mapspec.schema.json',s=>replace(s,'"lakes": { "enum": ["none", "few", "some", "many"] },','"lakes": { "enum": ["none", "few", "some", "many"] },\n              "lakeAmount": { "type": "integer", "minimum": 0, "maximum": 100 },'));
    edit('src/core/spec/codec.ts',s=>replace(s,'  { key: "wf",','  { key: "la", path: ["water", "lakeAmount"], kind: "int" },\n  { key: "wf",'));
  }
}
const plugin={name:'settings-overlay',setup(b){b.onLoad({filter:/\.(ts|json)$/},args=>{
  const path=relative(root,args.path).replaceAll('\\','/');const entry=changes.get(path);
  if(entry)return {contents:entry.after,loader:path.endsWith('.json')?'json':'ts',resolveDir:resolve(args.path,'..')};
}); b.onResolve({filter:/\/(lakes|verticality)$/},args=>{
  const path=resolve(args.resolveDir,args.path+'.ts'); if(changes.has(relative(root,path).replaceAll('\\','/')))return {path};
});}};
writeFileSync(resolve(dir,`local/${mode}-overlay.json`),JSON.stringify(Object.fromEntries(changes)));
await build({entryPoints:[resolve(dir,'run.ts')],outfile:resolve(dir,`local/${mode}.mjs`),bundle:true,platform:'node',format:'esm',target:'node24',plugins:[plugin],logLevel:'warning'});
await build({entryPoints:[resolve(dir,'render.ts')],outfile:resolve(dir,'local/render.mjs'),bundle:true,platform:'node',format:'esm',target:'node24',logLevel:'warning'});
if(mode==='prototype')await build({entryPoints:[resolve(dir,'guards.ts')],outfile:resolve(dir,'local/guards.mjs'),bundle:true,platform:'node',format:'esm',target:'node24',plugins:[plugin],logLevel:'warning'});
if(mode!=='baseline'){
  const patch=[];
  for(const [path,{before,after}]of changes){
    const old=resolve(dir,'local/old.txt'), next=resolve(dir,'local/new.txt');writeFileSync(old,before);writeFileSync(next,after);
    let diff;try{diff=execFileSync('git',['diff','--no-index','--no-ext-diff','--',old,next],{encoding:'utf8'});}catch(e){if(e.status!==1)throw e;diff=e.stdout;}
    const lines=diff.split('\n'); const hunk=lines.findIndex(l=>l.startsWith('@@'));
    patch.push(`diff --git a/${path} b/${path}\n${before?'':'new file mode 100644\n'}--- ${before?'a/'+path:'/dev/null'}\n+++ b/${path}\n`+lines.slice(hunk).join('\n'));
  }
  writeFileSync(resolve(dir,`${mode}.patch`),patch.join(''));
}
console.log(`Built ${mode} without writing product source.`);
