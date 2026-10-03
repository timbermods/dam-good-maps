import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {HERE,LOCAL,deps,hash,json} from './common.mjs';
const get=(ref,path)=>execFileSync('git',['show',`${ref}:${path}`]);
const reference=get('e292cefe','src/core/sim/water.ts');
writeFileSync(resolve(LOCAL,'reference-water.ts'),reference);
await import('./prepare-parallel.mjs');
// TS control: exactly the same bookkeeping and extracted loops, without the Rust hook.
const rustWater=readFileSync(resolve(LOCAL,'shared-water.ts'),'utf8');
const tsWater=rustWater.replace("import {rustKernel} from './shared-kernel';",'')
 .replace('if(rustKernel(this,phase,list,lo,hi))return;','');
if(tsWater===rustWater||tsWater.includes('rustKernel'))throw Error('TS kernel extraction failed');
writeFileSync(resolve(LOCAL,'ts-water.ts'),tsWater);
let runtime=get('68d68313','investigation/parallel-water/runtime.ts').toString().replace("from './water'","from './ts-water'");
let helper=get('68d68313','investigation/parallel-water/helper.ts').toString().replace("from './water'","from './ts-water'");
writeFileSync(resolve(LOCAL,'ts-runtime.ts'),runtime);
writeFileSync(resolve(LOCAL,'ts-helper.ts'),helper);
writeFileSync(resolve(LOCAL,'shared-kernel.ts'),readFileSync(resolve(HERE,'shared-kernel-template.ts')));
const rustc=process.env.DGM_RUSTC;if(!rustc)throw Error('Set DGM_RUSTC to Rust 1.90 rustc');
const cargo=process.env.DGM_CARGO;if(!cargo)throw Error('Set DGM_CARGO to Rust 1.90 cargo');
if(!/^rustc 1\.90\.0 /.test(execFileSync(rustc,['--version'],{encoding:'utf8'})))throw Error('Pinned stable Rust 1.90.0 required');
if(!/^cargo 1\.90\.0 /.test(execFileSync(cargo,['--version'],{encoding:'utf8'})))throw Error('Pinned Cargo 1.90.0 required');
process.env.RUSTC=rustc;
execFileSync(cargo,['rustc','--release','--lib','--target','wasm32-unknown-unknown','--target-dir',resolve(LOCAL,'target'),'--','--emit=llvm-ir'],{stdio:'inherit'});
writeFileSync(resolve(LOCAL,'water.wasm'),readFileSync(resolve(LOCAL,'target/wasm32-unknown-unknown/release/rust_water.wasm')));
const flags=['--crate-type','cdylib','--target','wasm32-unknown-unknown','-O','-C','panic=abort','-C','target-feature=+atomics,+bulk-memory,+mutable-globals'];
execFileSync(rustc,[resolve(LOCAL,'shared-kernel.rs'),...flags,'-C','link-arg=--import-memory','-C','link-arg=--shared-memory','-C','link-arg=--max-memory=1073741824','-C','link-arg=--export=__stack_pointer','-o',resolve(LOCAL,'shared-water.wasm')],{stdio:'inherit'});
execFileSync(rustc,[resolve(LOCAL,'shared-kernel.rs'),...flags,'--emit=llvm-ir','-o',resolve(LOCAL,'shared-water.ll')],{stdio:'inherit'});
await import('./verify-ir.mjs');
const inputs={};
for(const name of ['shared-helper','ts-helper','coordinator']){
 const result=await deps('esbuild').build({entryPoints:[resolve(name==='coordinator'?HERE:LOCAL,name+'.ts')],outfile:resolve(LOCAL,name+'.js'),bundle:true,format:'esm',platform:'browser',target:'es2022',metafile:true});
 for(const p of Object.keys(result.metafile.inputs))inputs[p]=hash(readFileSync(p));
}
await deps('esbuild').build({entryPoints:[resolve(HERE,'protocol.ts')],outfile:resolve(LOCAL,'protocol.cjs'),bundle:true,platform:'node',format:'cjs'});
for(const name of ['isolation-sw.js','isolation-register.js'])writeFileSync(resolve(LOCAL,name),get('68d68313','investigation/parallel-water/'+name));
json('build.json',{reference:hash(reference),rust:hash(readFileSync(resolve(HERE,'src/lib.rs'))),inputs,toolchain:execFileSync(rustc,['--version'],{encoding:'utf8'}).trim(),esbuild:deps('esbuild').version,scalarWasm:hash(readFileSync(resolve(LOCAL,'water.wasm'))),sharedWasm:hash(readFileSync(resolve(LOCAL,'shared-water.wasm')))});
