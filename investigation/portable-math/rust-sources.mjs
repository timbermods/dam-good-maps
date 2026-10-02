// Snapshot existing investigations; only these local copies receive the adoption overlay.
import {readFileSync,writeFileSync,mkdirSync,existsSync,cpSync} from 'node:fs';
import {resolve,dirname,relative} from 'node:path';
import {execFileSync,spawnSync} from 'node:child_process';
import {HERE,ROOT,LOCAL,json,hash} from './common.mjs';
import {sourceViolations} from './rust-guard.mjs';
const studies=process.env.DGM_STUDIES??resolve(ROOT,'../../../../investigation');
const actual=process.argv.includes('--actual'),ci=process.argv.includes('--ci'),frozen=process.argv.includes('--frozen');
function studyRead(name,root,file){const prior=resolve(LOCAL,'rust-before/investigation',name,file);return readFileSync(frozen&&existsSync(prior)?prior:resolve(root,file));}
const paths={
 'rust-water':resolve(studies,'rust-water/local/checkout/investigation/rust-water'),
 'rust-analysis':resolve(studies,'rust-analysis/local/checkout/investigation/rust-analysis'),
 'rust-forces':resolve(studies,'rust-forces'),
 'dam-sketch':resolve(studies,'dam-sketch/local/checkout/investigation/dam-sketch'),
};
let patch='',manifest={portable:hash(readFileSync(resolve(HERE,'portable.rs'))),studies:{}};
const portableDirectory=resolve(LOCAL,'studies/portable-math');mkdirSync(portableDirectory,{recursive:true});
cpSync(resolve(HERE,'portable.rs'),resolve(portableDirectory,'portable.rs'));
function put(path,data){mkdirSync(dirname(path),{recursive:true});writeFileSync(path,data);}
function diff(file,before,after){before=before.replaceAll('\r\n','\n');after=after.replaceAll('\r\n','\n');if(before===after)return;const a=resolve(LOCAL,'rust-before',file),b=resolve(LOCAL,'rust-after',file);put(a,before);put(b,after);const r=spawnSync('git',['diff','--no-index','--no-prefix','--',a,b],{encoding:'utf8',maxBuffer:16*1024*1024,windowsHide:true});if(r.status!==1)throw Error(r.stderr);const lines=r.stdout.split('\n');lines[0]=`diff --git a/${file} b/${file}`;lines[lines.findIndex(l=>l.startsWith('--- '))]='--- a/'+file;lines[lines.findIndex(l=>l.startsWith('+++ '))]='+++ b/'+file;patch+=lines.join('\n');}
function removeFunction(source,name){const start=source.indexOf('fn '+name+'(');if(start<0)throw Error('Missing '+name);let at=source.indexOf('{',start),depth=1;for(at++;depth;at++){if(source[at]==='{')depth++;if(source[at]==='}')depth--;}return source.slice(0,start)+source.slice(at);}
for(const [name,sourceRoot]of Object.entries(paths)){
 if(actual){paths[name]=resolve(studies,name);}
 const actualRoot=actual?paths[name]:sourceRoot;
 if(ci&&!existsSync(actualRoot)){console.log('Study not present in this revision:',name);continue;}
 const target=resolve(LOCAL,'studies',name),row={sourceRoot:actualRoot,inputs:{},native:[],remaining:[]};
 const names=name==='rust-analysis'?['analysis.rs','local/rust-water.rs']:['Cargo.toml','Cargo.lock','src/lib.rs','rust/main.rs'];
 for(const file of names){let bytes;
  if(name==='dam-sketch')bytes=execFileSync('git',['show','2ebeea87c55d5f728c735d79a6d24bde78999db7:investigation/rust-water/'+file],{cwd:ROOT,windowsHide:true});
  else if(existsSync(resolve(actualRoot,file)))bytes=studyRead(name,actualRoot,file);
  else if(name==='rust-analysis'&&file==='local/rust-water.rs')bytes=execFileSync('git',['show','d18a6f4d890d3f2e3f7b480e308242375c100e10:investigation/rust-water/src/lib.rs'],{cwd:ROOT,windowsHide:true});else continue;
  row.inputs[file]=hash(bytes);let before=bytes.toString().replaceAll('\r\n','\n'),after=before;
  if(file.endsWith('.rs')){
   row.native.push(...sourceViolations(before).map(x=>({file,...x})));
   if(!actual&&(file==='src/lib.rs'||file==='analysis.rs')){
    const module=file==='analysis.rs'?'../portable-math/portable.rs':'../../portable-math/portable.rs';
    // Insert after any crate-level inner documentation/attributes, before the first use.
    const position=name==='rust-forces'?after.indexOf('mod water {'):after.indexOf('use ');if(position<0)throw Error('No module insertion point');
    after=after.slice(0,position)+`#[path="${module}"] pub mod portable_math;\n`+after.slice(position);
   }
   if(!actual&&name==='rust-forces'&&file==='src/lib.rs'){
    for(const f of ['sin','cos','exp','log','pow','hypot','atan','atan2'])after=removeFunction(after,f);
    after=after.replace('use serde_json', 'use portable_math::{sin,cos,exp,log,pow,atan,atan2};\nfn hypot(x:f64,y:f64)->f64{portable_math::hypot(&[x,y])}\nuse serde_json');
    for(const receiver of ['(natural / size)','(crater_size(power) / diameter)','(s.natural_width() / width)','k','(pow(b.x - a.x, 2.0) + pow(b.y - a.y, 2.0))'])after=after.replaceAll(receiver+'.sqrt()','portable_math::sqrt('+receiver+')');
    after=after.replace('(level + self.seed as f64 % 4.0) % 4.0','portable_math::rem(level + portable_math::rem(self.seed as f64, 4.0), 4.0)');
    after=after.replace(/force_hash\(\&\[seed\.to_string\(\), q\.to_string\(\), sd\.to_string\(\)\]\) as f64\s*% 1000\.0/,'portable_math::rem(force_hash(&[seed.to_string(), q.to_string(), sd.to_string()]) as f64, 1000.0)');
    after=after.replace('(((atan2(dy as f64, dx as f64) + PI) / (PI * 2.0)) * 12.0).floor() % 12.0','portable_math::rem((((atan2(dy as f64, dx as f64) + PI) / (PI * 2.0)) * 12.0).floor(), 12.0)');
   }
   row.remaining.push(...sourceViolations(after).map(x=>({file,...x})));
  }
  put(resolve(target,file),after);
  if(!actual&&name!=='dam-sketch')diff('investigation/'+name+'/'+file,before,after);
 }
 if(name==='dam-sketch'){
  row.rustPin='2ebeea87c55d5f728c735d79a6d24bde78999db7';
  const file='prepare.mjs',before=studyRead(name,actualRoot,file).toString();
  const after=before.replace("writeFileSync(target, gitFile('investigation/rust-water/' + name));","let source = gitFile('investigation/rust-water/' + name);\n    if (name === 'src/lib.rs') source = Buffer.from('pub mod portable_math;\\n' + source);\n    writeFileSync(target, source);\n    if (name === 'src/lib.rs') copyFileSync(resolve(here, '../portable-math/portable.rs'), resolve(local, 'crate/src/portable_math.rs'));" );
  if(!actual){if(after===before)throw Error('Dam-sketch generator changed');diff('investigation/dam-sketch/prepare.mjs',before,after);}
 }else if(!actual){
  const file='verify-ir.mjs',before=studyRead(name,actualRoot,file).toString();
  let after="import {assertClean} from '../portable-math/rust-guard.mjs';\n"+before.replace("const ir=readFileSync(path,'utf8');","const ir=readFileSync(path,'utf8');assertClean('ir',ir);").replace("const ir=readFileSync(resolve(LOCAL,name),'utf8');","const ir=readFileSync(resolve(LOCAL,name),'utf8');assertClean('ir',ir);");
  if(!after.includes("assertClean('ir',ir)"))throw Error('IR guard changed '+name);diff('investigation/'+name+'/'+file,before,after);
  if(name!=='rust-analysis'){
   const config='.cargo/config.toml',original=studyRead(name,actualRoot,config).toString();
   diff('investigation/'+name+'/'+config,original,original.replaceAll('"target-feature=-fma"','"target-feature=-fma", "-C", "target-cpu=x86-64-v2"'));
  }
 }
 manifest.studies[name]=row;console.log(name,row.native.length,'native references',row.remaining.length,'remaining');
}
if(!actual)writeFileSync(resolve(HERE,'rust-adoption.patch'),patch.replace(/^ $/gm,''));json(actual?'rust-actual-sources.json':'rust-sources.json',manifest);
if(Object.values(manifest.studies).some(s=>s.remaining.length))process.exitCode=1;
if(process.argv.includes('--cache')){const cargo=resolve(LOCAL,'cargo');mkdirSync(cargo,{recursive:true});cpSync(resolve(studies,'rust-forces/local/cargo/registry'),resolve(cargo,'registry'),{recursive:true});console.log('Offline Cargo registry copied under local/');}
