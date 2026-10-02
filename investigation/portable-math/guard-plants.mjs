import {writeFileSync,readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {HERE,LOCAL,json} from './common.mjs';
import {violations} from './guard.mjs';
import {assertClean} from './rust-guard.mjs';
import {outputViolations} from './output-guard.mjs';
const rustc=process.env.DGM_RUSTC??(process.platform==='win32'?'C:/Users/Kyler/Documents/ChatGPT/dam-good-maps/investigation/rust-water/local/toolchain/rustup/toolchains/1.90.0-x86_64-pc-windows-gnu/bin/rustc.exe':'rustc');
const rows=[];
function rejected(name,fn){let reason;try{fn();}catch(e){reason=String(e);}if(!reason)throw Error('Planted call escaped '+name);rows.push({guard:name,status:'expected rejection',reason});}
rejected('Minified product output native call',()=>{const {bad}=outputViolations('const n=e=>Math.exp(e);','planted.min.js');if(bad.length)throw Error(JSON.stringify(bad));});
for(const file of ['src/core/planted.ts','src/editor/planted.tsx','src/worker/planted.ts','tools/planted.ts'])rejected('JavaScript '+file,()=>{const bad=violations('export const planted=(x:number)=>Math.exp(x);',file);if(bad.length)throw Error(JSON.stringify(bad));});
for(const [name,source,file]of [
 ['Evaluated script native maths','const js = `x => Math.exp(x)`;','tools/planted.ts'],
 ['Evaluated script native power','const js = `x => x ** 0.5`;','tools/planted.ts'],
 ['Tool dependency native call','import {exp} from "unreviewed-numerics"; export const f=(x)=>exp(x);','tools/planted.ts'],
 ['Editor dependency native call','import {hypot} from "unreviewed-numerics"; export const f=(x)=>hypot(x,1);','src/editor/planted.tsx'],
 ['Re-exported native dependency','export {exp} from "unreviewed-numerics";','tools/planted.ts'],
 ['Dynamic native dependency','const f=async x=>(await import("unreviewed-numerics")).exp(x);','tools/planted.ts'],
 ['Unaudited Wasm maths binding','const native=new WebAssembly.Module(bytes);','src/core/planted.ts'],
 ['CommonJS native dependency','const {exp}=require("unreviewed-numerics"); export const f=x=>exp(x);','tools/planted.ts'],
 ['Indirect eval native escape','const f=eval; f(code);','tools/planted.ts'],
 ])rejected(name,()=>{const bad=violations(source,file);if(bad.length)throw Error(JSON.stringify(bad));});
rejected('Three dependency native call',()=>{const bad=violations('export const camera=(x)=>Math.sqrt(x);','dependency/three/planted.js');if(bad.length)throw Error(JSON.stringify(bad));});
for(const call of ['gzipSync','zipSync','zlibSync'])rejected('dependency '+call,()=>{const bad=violations(`import {${call}} from 'fflate';`,'tools/planted.ts');if(bad.length)throw Error(JSON.stringify(bad));});
for(const method of ['sin_cos','exp_m1','ln_1p'])rejected('Rust source '+method,()=>assertClean('source',`fn plant(x:f64){let _=x.${method}();}`));
rejected('Rust source floating remainder',()=>assertClean('source','fn planted(x:f64)->f64{x % 12.0}'));
for(const plant of ['sin','fma','fmod']){
 const source=`#[no_mangle]pub extern "C" fn planted(x:f64,y:f64,z:f64)->f64{${plant==='sin'?'x.sin()':plant==='fma'?'x.mul_add(y,z)':'x % y'}}`;
 const path=resolve(LOCAL,'planted-'+plant+'.rs');writeFileSync(path,source);
 if(plant!=='fmod')rejected('Rust source '+plant,()=>assertClean('source',source));
 for(const target of ['wasm','native']){
  const stem=resolve(LOCAL,'planted-'+plant+'-'+target),base=[path,'--edition=2021','--crate-type','cdylib','-O','-C','panic=abort'];
  if(target==='wasm')base.push('--target','wasm32-unknown-unknown');else base.push('-C','target-feature=-fma','-C','target-cpu=x86-64-v2');
  for(const [emit,out]of [['llvm-ir',stem+'.ll'],['asm',stem+'.s'],...(target==='wasm'?[['link',stem+'.wasm']]:[])])execFileSync(rustc,[...base,'--emit='+emit,'-o',out],{cwd:LOCAL,windowsHide:true,stdio:['ignore','ignore','ignore']});
  rejected('LLVM '+target+' '+plant,()=>assertClean('ir',readFileSync(stem+'.ll','utf8')));
  if(target==='native')rejected('native assembly '+plant,()=>assertClean('assembly',readFileSync(stem+'.s','utf8')));
  else rejected('Wasm imports '+plant,()=>assertClean('wasm',readFileSync(stem+'.wasm')));
 }
}
rejected('native fused instruction',()=>assertClean('assembly','vfmadd213sd %xmm1, %xmm2, %xmm0'));
rejected('native ARM fused instruction',()=>assertClean('assembly','fmadd d0, d1, d2, d3'));
rejected('Wasm relaxed FMA intrinsic',()=>assertClean('ir','call @llvm.wasm.relaxed.madd.f64x2()'));
rejected('relaxed LLVM arithmetic',()=>assertClean('ir','%z = fadd reassoc double %x, %y'));
json('guard-plants.json',{rows});console.log(rows.length,'planted guard failures observed');
