import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {execFileSync} from 'node:child_process';
import {deps,HERE,LOCAL,json,hash} from './common.mjs';
import {assertClean} from './rust-guard.mjs';
import {host} from './host.mjs';
const home=process.env.DGM_RUST_TOOLCHAIN??'C:/Users/Kyler/Documents/ChatGPT/dam-good-maps/investigation/rust-water/local/toolchain';
const rustc=process.env.DGM_RUSTC??(process.platform==='win32'?resolve(home,'rustup/toolchains/1.90.0-x86_64-pc-windows-gnu/bin/rustc.exe'):'rustc');
const path=resolve(LOCAL,'rust-math.rs'),modulePath=resolve(HERE,'portable.rs').replaceAll('\\','/');
const functions=['sin','cos','tan','exp','log','log2','pow','hypot','sqrt','atan','atan2','tanh','asinh','asin','acos','rem'];
const body=functions.map((f,i)=>`${i}=>portable_math::${f}(${f==='hypot'?'&[x,y,z]':f==='pow'?'x,y':f==='atan2'||f==='rem'?'x,y':'x'}),`).join('\n');
writeFileSync(path,`#[path="${modulePath}"] mod portable_math;\n#[no_mangle]pub extern "C" fn portable_eval(op:u32,x:f64,y:f64,z:f64)->f64{match op{${body}_=>panic!("op")}}\n#[cfg(not(target_arch="wasm32"))]fn main(){use std::io::{BufRead,Write};let mut out=std::io::BufWriter::new(std::io::stdout());for line in std::io::stdin().lock().lines(){let s=line.unwrap();let a:Vec<_>=s.split(' ').collect();let get=|i:usize|f64::from_bits(u64::from_str_radix(a[i],16).unwrap());let v=portable_eval(a[0].parse().unwrap(),get(1),get(2),get(3));writeln!(out,"{:016x}",v.to_bits()).unwrap();}}`);
const artifacts={};
for(const target of ['wasm','native']){
 const output=resolve(LOCAL,'rust-math-'+target+(target==='wasm'?'.wasm':process.platform==='win32'?'.exe':''));
 const args=[path,'--edition=2021','-O','-C','panic=abort','-C','codegen-units=1','-A','dead_code'];
 if(target==='wasm')args.push('--crate-type','cdylib','--target','wasm32-unknown-unknown');else args.push('-C','target-feature=-fma','-C','target-cpu=x86-64-v2',...(process.platform==='win32'?['-C','link-self-contained=yes']:[]));
 const stem=output.replace(/\.(exe|wasm)$/,'');
 for(const [emit,out]of [['link',output],['llvm-ir',stem+'.ll'],['asm',stem+'.s']])execFileSync(rustc,[...args,'--emit='+emit,'-o',out],{cwd:LOCAL,windowsHide:true});
 assertClean('source',readFileSync(resolve(HERE,'portable.rs'),'utf8'));assertClean('ir',readFileSync(stem+'.ll','utf8'));assertClean('assembly',readFileSync(stem+'.s','utf8'));if(target==='wasm')assertClean('wasm',readFileSync(output));
 artifacts[target]={path:output,sha256:hash(readFileSync(output)),ir:hash(readFileSync(stem+'.ll')),assembly:hash(readFileSync(stem+'.s'))};
}
await deps('esbuild').build({entryPoints:[resolve(HERE,'portable.ts')],outfile:resolve(LOCAL,'rust-portable.cjs'),bundle:true,platform:'node',format:'cjs'});
const portable=deps(resolve(LOCAL,'rust-portable.cjs')),vectors=[];
const bitHex=x=>{const b=Buffer.alloc(8);b.writeDoubleBE(x);return b.toString('hex');};
let state=0x94ab305d;const random=()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return (state>>>0)/4294967296;};
for(const [op,f]of functions.entries())for(let i=0;i<2500;i++){
 let x=(random()-.5)*1000,y=(random()-.5)*20,z=(random()-.5)*1000;
 if(['asin','acos'].includes(f))x=random()*2-1;if(['log','log2','sqrt'].includes(f))x=random()*1e6;if(f==='pow'){x=random()*10+.001;y=i%2?(i%41)-20:(random()-.5)*8;}
 const expected=f==='hypot'?portable[f](x,y,z):f==='pow'||f==='atan2'||f==='rem'?portable[f](x,y):portable[f](x);
 vectors.push({op,x,y,z,expected:bitHex(expected)});
}
for(const x of [0,-0,Number.MIN_VALUE,Number.MAX_VALUE,...Array.from({length:2046},(_,i)=>{const b=Buffer.alloc(8);b.writeBigUInt64BE(BigInt(i+1)<<52n);return b.readDoubleBE();})])vectors.push({op:8,x,y:0,z:0,expected:bitHex(portable.sqrt(x))});
for(let i=0;i<5000;i++){
 const number=()=>{const b=Buffer.alloc(8);b.writeBigUInt64BE((BigInt(Math.floor(random()*4294967296))<<32n)|BigInt(Math.floor(random()*4294967296)));let x=b.readDoubleBE();return Number.isFinite(x)?x:1;};
 const x=number(),y=number()||Number.MIN_VALUE;vectors.push({op:15,x,y,z:0,expected:bitHex(portable.rem(x,y))});
}
for(const [x,y]of [[0,4],[-0,4],[1,4],[-1,4],[4,4],[-4,4],[4,-4],[7,4],[-7,4],[Number.MIN_VALUE,1],[Number.MAX_VALUE,Number.MIN_VALUE],[Number.MAX_VALUE,3],[Number.MIN_VALUE*3,Number.MIN_VALUE*2],[1,Number.MIN_VALUE*3],[1e-300,1e-310],[1e300,12],[Number.MAX_SAFE_INTEGER,1000],[20.75,4],[32.25,-12],[-32.25,12],[12,Infinity],[-12,Infinity],[0,-4],[-0,-4]])vectors.push({op:15,x,y,z:0,expected:bitHex(portable.rem(x,y))});
const native=execFileSync(artifacts.native.path,[],{input:vectors.map(v=>[v.op,bitHex(v.x),bitHex(v.y),bitHex(v.z)].join(' ')).join('\n')+'\n',encoding:'utf8',maxBuffer:16*1024*1024,windowsHide:true}).trim().split(/\r?\n/);
if(native.length!==vectors.length)throw Error('Native length');for(let i=0;i<native.length;i++)if(native[i]!==vectors[i].expected)throw Error('Native mismatch '+JSON.stringify(vectors[i])+' '+native[i]);
const h=await host(),engines={};
try{for(const name of ['chromium','firefox','webkit']){const b=await deps('playwright')[name].launch({headless:true});try{const p=await b.newPage();await p.goto(h.url);const bytes=Array.from(readFileSync(artifacts.wasm.path));const result=await p.evaluate(async({bytes,vectors})=>{const {instance}=await WebAssembly.instantiate(Uint8Array.from(bytes));const f=instance.exports.portable_eval;const hex=x=>{const b=new DataView(new ArrayBuffer(8));b.setFloat64(0,x);return b.getBigUint64(0).toString(16).padStart(16,'0');};for(const v of vectors){const actual=hex(f(v.op,v.x,v.y,v.z));if(actual!==v.expected)throw Error(JSON.stringify({v,actual}));}return vectors.length;},{bytes,vectors});engines[name]={version:b.version(),checks:result};}finally{await b.close();}}}finally{h.close();}
json('rust-math-summary.json',{compiler:execFileSync(rustc,['--version'],{encoding:'utf8'}).trim(),source:hash(readFileSync(resolve(HERE,'portable.rs'))),nativeChecks:vectors.length,engines,artifacts});console.log('Rust portable maths PASS',vectors.length,'vectors native and each engine');
