import {readFileSync,readdirSync,writeFileSync,existsSync,mkdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {execFileSync} from 'node:child_process';
import {HERE,LOCAL,json,hash} from './common.mjs';
import {assertClean} from './rust-guard.mjs';
const home=process.env.DGM_RUST_TOOLCHAIN??'C:/Users/Kyler/Documents/ChatGPT/dam-good-maps/investigation/rust-water/local/toolchain';
const compiler=process.env.DGM_RUST_BIN??(process.platform==='win32'?resolve(home,'rustup/toolchains/1.90.0-x86_64-pc-windows-gnu/bin'):dirname(execFileSync('rustup',['which','rustc'],{encoding:'utf8'}).trim()));
const rustc=resolve(compiler,process.platform==='win32'?'rustc.exe':'rustc'),cargo=resolve(compiler,process.platform==='win32'?'cargo.exe':'cargo');
const nativeTarget=process.platform==='win32'?'x86_64-pc-windows-gnu':'x86_64-unknown-linux-gnu';
const rows=[];
const recursive=dir=>readdirSync(dir,{withFileTypes:true}).flatMap(d=>d.isDirectory()?recursive(resolve(dir,d.name)):[resolve(dir,d.name)]);
for(const study of ['rust-water','rust-analysis','rust-forces','dam-sketch']){
 const source=resolve(LOCAL,'studies',study);
 if(process.argv.includes('--ci')&&!existsSync(source)){continue;}
 for(const file of recursive(source).filter(f=>f.endsWith('.rs')))assertClean('source',readFileSync(file,'utf8'));
 for(const target of ['wasm32-unknown-unknown',nativeTarget]){
  const output=resolve(LOCAL,'rust-build',study,target);mkdirSync(output,{recursive:true});
  const flags=target.startsWith('wasm')?[]:['-C','target-feature=-fma','-C','target-cpu=x86-64-v2',...(process.platform==='win32'?['-C','link-self-contained=yes']:[])];
  let artifacts;
  if(study==='rust-analysis'){
   const src=resolve(source,'analysis.rs'),base=[src,'--edition=2021','--crate-type','cdylib','-O','-C','panic=abort','--target',target,...flags];
   const paths={ir:resolve(output,'analysis.ll'),assembly:resolve(output,'analysis.s'),wasm:resolve(output,'analysis.wasm')};
   for(const [emit,out]of [['llvm-ir',paths.ir],['asm',paths.assembly],['link',target.startsWith('wasm')?paths.wasm:resolve(output,process.platform==='win32'?'analysis.dll':'analysis.so')]])execFileSync(rustc,[...base,'--emit='+emit,'-o',out],{cwd:source,windowsHide:true,stdio:['ignore','inherit','inherit']});
   artifacts=Object.entries(paths).filter(([kind,file])=>existsSync(file)).map(([kind,file])=>({kind,file}));
  }else{
   const env={...process.env,CARGO_HOME:resolve(LOCAL,'cargo'),RUSTC:rustc,RUSTUP_HOME:resolve(home,'rustup'),RUSTFLAGS:[...flags,'--emit=dep-info,link,llvm-ir,asm'].join(' ')};
   if(process.platform!=='win32')delete env.RUSTUP_HOME;
   if(process.argv.includes('--ci'))execFileSync(cargo,['fetch','--locked'],{cwd:source,env,windowsHide:true,stdio:'inherit'});
   execFileSync(cargo,['build','--release','--offline','--lib','--target',target,'--target-dir',output],{cwd:source,env,windowsHide:true,stdio:['ignore','inherit','inherit']});
   artifacts=recursive(output).filter(f=>/\.(ll|s|wasm)$/.test(f)).map(file=>({kind:file.endsWith('.ll')?'ir':file.endsWith('.s')?'assembly':'wasm',file}));
  }
  if(!artifacts.some(a=>a.kind==='ir')||!artifacts.some(a=>a.kind==='assembly')||(target.startsWith('wasm')&&!artifacts.some(a=>a.kind==='wasm')))throw Error('Missing compiled evidence '+study+' '+target);
  for(const a of artifacts)assertClean(a.kind,readFileSync(a.file,a.kind==='wasm'?undefined:'utf8'));
  const linked=recursive(output).filter(f=>/\.(dll|so|wasm)$/.test(f)).map(file=>({file,sha256:hash(readFileSync(file))}));
  rows.push({study,target,status:'pass',linked,artifacts:artifacts.map(a=>({...a,sha256:hash(readFileSync(a.file))}))});json('rust-build-summary.json',{compiler:execFileSync(rustc,['--version'],{encoding:'utf8'}).trim(),rows});console.log('Rust strict build PASS',study,target,artifacts.length,'artifacts');
 }
}
