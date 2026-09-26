import fs from 'node:fs';
import path from 'node:path';
import {execFileSync,spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),repo=path.resolve(root,'../..');
const pins=JSON.parse(fs.readFileSync(path.join(root,'SOURCES.json'),'utf8'));
const ported=process.argv.includes('--ported'),only=process.argv.find(v=>v.startsWith('--verb='))?.slice(7);
const prepareOnly=process.argv.includes('--prepare');const executed=[];
const tests={carve:['test.ts','test-course.ts','test-worker.ts'],craterize:['test.ts','test-worker.ts'],erupt:['test.ts','test-morphology.ts','test-water-rock.ts','test-worker.ts'],quake:['test.ts','test-brush.ts','test-slide.ts','test-worker.ts','test-maps.ts']};
const dir=path.join(root,'local',ported?'ported':'baseline');
for(const [verb,pin] of Object.entries(pins.prototypes)){
 if(only&&only!==verb)continue;
 try{execFileSync('git',['cat-file','-e',pin+'^{commit}'],{cwd:repo,stdio:'ignore'});}catch{execFileSync('git',['fetch','origin',pin],{cwd:repo,stdio:'inherit'});}
 const cwd=path.join(dir,verb);fs.mkdirSync(path.join(cwd,'captures'),{recursive:true});fs.mkdirSync(path.join(cwd,'.cache'),{recursive:true});
 const names=execFileSync('git',['ls-tree','-r','--name-only',pin,'investigation/'+verb],{cwd:repo,encoding:'utf8'}).trim().split('\n');
 for(const file of names){
  if(!/\.(ts|mjs|html|css|json)$/.test(file)||file.includes('/captures/')||file.endsWith('package-lock.json'))continue;
  const rel=file.slice(('investigation/'+verb+'/').length),dest=path.join(cwd,rel);
  fs.mkdirSync(path.dirname(dest),{recursive:true});
  let s=execFileSync('git',['show',pin+':'+file],{cwd:repo,encoding:'utf8',maxBuffer:8e6});
  const to=(p)=>path.relative(path.dirname(dest),path.join(repo,p)).replaceAll('\\','/');
  s=s.replace(/(?:\.\.\/)+src\//g,to('src')+'/')
    .replaceAll('../generative/proto/',to('investigation/generative/proto')+'/')
    .replaceAll('../../public',to('public'));
  // dev D164 changed the start-resource API from trees to wood.
  if(rel==='consequences.ts')s=s.replaceAll('treesWithin20:40','woodWithin20:160').replaceAll('trees:c.trees','trees:c.wood');
  if(rel==='run.mjs')s=s.replace("resolve('node_modules')","resolve('../../../node_modules')");
  if(rel.startsWith('test-worker'))s=s.replaceAll("resolve('node_modules')","resolve('../../../node_modules')");
  if(ported&&fs.existsSync(path.join(root,'verbs',verb,rel))){
   const target=path.relative(path.dirname(dest),path.join(root,'verbs',verb,rel)).replaceAll('\\','/');
   s="export * from '"+target+"';\n";
  }
  if(ported&&verb==='erupt'&&rel==='carve/engine.ts'){
   s="export * from '"+path.relative(path.dirname(dest),path.join(root,'verbs/carve/engine.ts')).replaceAll('\\','/')+"';\n";
  }
  fs.writeFileSync(dest,s);
 }
 if(prepareOnly)continue;
 for(const test of tests[verb]){
  console.log('\n'+(ported?'PORTED ':'BASELINE ')+verb+'/'+test);
  const r=spawnSync(process.execPath,['run.mjs',test],{cwd,stdio:'inherit'});if(r.status)process.exit(r.status);executed.push(verb+'/'+test);
 }
}

if(!prepareOnly){fs.mkdirSync(path.join(root,'checks'),{recursive:true});fs.writeFileSync(path.join(root,'checks',ported?'legacy-ported.json':'legacy-baseline.json'),JSON.stringify({sources:pins.prototypes,passed:executed,bridge:'D164: starting trees API renamed to wood; zero-resource assertions unchanged.'},null,2)+'\n');}
