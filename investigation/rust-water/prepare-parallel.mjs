// Reuse the parallel-water study's coordinator and barriers, with its numerical loops
// replaced by kernels extracted from the SAME Rust source as the scalar/native port.
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {HERE,ROOT,LOCAL,json,hash} from './common.mjs';
const source=readFileSync(resolve(HERE,'src/lib.rs'),'utf8');
function block(text,start){const open=text.indexOf('{',start);let depth=1,end=open+1;for(;depth&&end<text.length;end++){if(text[end]==='{')depth++;else if(text[end]==='}')depth--;}if(depth)throw Error('Rust source block');return {open,end,body:text.slice(open+1,end-1)};}
const sub=source.indexOf('fn flow_phase('),flow=block(source,source.indexOf('for &i in wet',sub)),depth=block(source,source.indexOf('for &i in active',flow.end));
if(sub<0)throw Error('Common numeric frame shape');
let dam=source.slice(source.indexOf('    fn dam_flow('),source.lastIndexOf('    #[inline(always)]',sub));
const replace=s=>s.replaceAll('self.nb[i]','self.neighbors(i)').replaceAll('hc.ceil()','ceil(hc)');
const maths=source.slice(source.indexOf('fn clamp('),source.indexOf('impl Sim'));
const kernel=`#![no_std]
use core::ops::{Index,IndexMut,Range};
pub const DT:f64=0.3; pub const K:f64=2.25*DT; const KEEP:f64=0.999; const BAL:f64=0.8;
${maths}
// Exactly rounded ceil, expressed with IEEE bits because no_std has no f64::ceil.
fn ceil(v:f64)->f64 {let bits=v.to_bits();let exponent=((bits>>52)&2047) as i32-1023;
 if exponent>=52{return v;}if exponent<0 {return if v==0.0{v}else if bits>>63!=0{-0.0}else{1.0};}
 let mask=(1u64<<(52-exponent))-1;if bits&mask==0{return v;}
 let truncated=f64::from_bits(bits&!mask);if bits>>63==0{truncated+1.0}else{truncated}}
// No full-array &mut aliases are created. Each IndexMut reference owns only the element
// or tile-range this worker's fixed partition writes; phase barriers exclude conflicting reads.
struct Buffer<T>(*mut T);
impl<T> Index<usize> for Buffer<T>{type Output=T;fn index(&self,i:usize)->&T{unsafe{&*self.0.add(i)}}}
impl<T> IndexMut<usize> for Buffer<T>{fn index_mut(&mut self,i:usize)->&mut T{unsafe{&mut *self.0.add(i)}}}
impl<T> Index<Range<usize>> for Buffer<T>{type Output=[T];fn index(&self,r:Range<usize>)->&[T]{unsafe{core::slice::from_raw_parts(self.0.add(r.start),r.end-r.start)}}}
impl<T> IndexMut<Range<usize>> for Buffer<T>{fn index_mut(&mut self,r:Range<usize>)->&mut [T]{unsafe{core::slice::from_raw_parts_mut(self.0.add(r.start),r.end-r.start)}}}
struct Kernel {floor:Buffer<f64>,d:Buffer<f64>,c:Buffer<f64>,old:Buffer<f64>,out:Buffer<f64>,f:Buffer<f64>,next_c:Buffer<f64>,modifiers:Buffer<f64>,wall:Buffer<u8>,nb0:Buffer<i32>,nb1:Buffer<i32>,nb2:Buffer<i32>,nb3:Buffer<i32>,dam:Option<Buffer<f64>>,game:bool,edge:bool}
impl Kernel {
 fn neighbors(&self,i:usize)->[isize;4]{[self.nb0[i] as isize,self.nb1[i] as isize,self.nb2[i] as isize,self.nb3[i] as isize]}
 ${replace(dam)}
 fn flow_tile(&mut self,i:usize){${replace(flow.body)}}
 fn depth_tile(&mut self,i:usize){${replace(depth.body).replace('continue;','return;')}}
}
#[no_mangle] pub unsafe extern "C" fn water_kernel(phase:u32,game:u32,edge:u32,has_dam:u32,desc:*const u32,indices:*const i32,lo:u32,hi:u32){
 let p=core::slice::from_raw_parts(desc,14);
 let mut k=Kernel{floor:Buffer(p[0] as *mut f64),d:Buffer(p[1] as *mut f64),c:Buffer(p[2] as *mut f64),old:Buffer(p[3] as *mut f64),out:Buffer(p[4] as *mut f64),f:Buffer(p[5] as *mut f64),next_c:Buffer(p[6] as *mut f64),modifiers:Buffer(p[7] as *mut f64),wall:Buffer(p[8] as *mut u8),nb0:Buffer(p[9] as *mut i32),nb1:Buffer(p[10] as *mut i32),nb2:Buffer(p[11] as *mut i32),nb3:Buffer(p[12] as *mut i32),dam:if has_dam!=0{Some(Buffer(p[13] as *mut f64))}else{None},game:game!=0,edge:edge!=0};
 for at in lo..hi{let i=*indices.add(at as usize) as usize;if phase==1{k.flow_tile(i);}else{k.depth_tile(i);}}
}
#[panic_handler] fn panic(_: &core::panic::PanicInfo)->!{core::arch::wasm32::unreachable()}
`;
writeFileSync(resolve(LOCAL,'shared-kernel.rs'),kernel);
// Exact current bookkeeping; replace only the two numerical passes.
let water=readFileSync(resolve(ROOT,'src/core/sim/water.ts'),'utf8');
const start=water.indexOf('    for (let w = 0; w < this.wetCount; w++) {',water.indexOf('private substep'));
const mid=water.indexOf('    // 2. depth',start),second=water.indexOf('    for (let a = 0; a < this.activeCount; a++) {',mid),end=water.indexOf('    for (let a = 0; a < this.activeCount; a++) {',second+10);
if([start,mid,second,end].some(i=>i<0))throw Error('Pinned TypeScript shape');
const tsFlow=water.slice(start,mid).replace('let w = 0; w < this.wetCount','let w = lo; w < hi').replace('this.wet[w]','list[w]');
const tsDepth=water.slice(second,end).replace('let a = 0; a < this.activeCount','let a = lo; a < hi').replace('this.active[a]','list[a]');
water=water.slice(0,start)+'    this.execute(1,this.wet,this.wetCount);\n'+water.slice(mid,second)+'    this.execute(2,this.active,this.activeCount);\n'+water.slice(end);
water=water.replace('export class WaterSim {',`import {rustKernel} from './shared-kernel';
let hook:((sim:WaterSim)=>void)|null=null;
export function installWaterConstructionHook(h:typeof hook){hook=h;}
export class WaterSim {`);
water=water.replace('    for (const i of this.sourceCells) this.refActive(i, 1);','    for (const i of this.sourceCells) this.refActive(i, 1);\n    hook?.(this);');
water=water.replace('  private substep(scale: number): void {',`  executor:((phase:number,list:Int32Array,count:number)=>void)|null=null;
  runScope:((body:()=>void)=>void)|null=null;
  kernel(phase:number,list:Int32Array,lo:number,hi:number){if(rustKernel(this,phase,list,lo,hi))return;
    const {F,D,C,out,f,wall,mod,dam,game,edgeSpill,n0:nb0,n1:nb1,n2:nb2,n3:nb3}=this;
    if(phase===1){${tsFlow}}else{const Cnew=this.Cnew;${tsDepth}}
  }
  private execute(phase:number,list:Int32Array,count:number){if(this.executor)this.executor(phase,list,count);else this.kernel(phase,list,0,count);}
  private substep(scale: number): void {`);
water=water.replace('  run(ticks: number, strengthScale = 1): this {',`  run(ticks: number, strengthScale = 1): this {
    if(this.runScope){const scope=this.runScope;this.runScope=null;try{scope(()=>this.run(ticks,strengthScale));}finally{this.runScope=scope;}return this;}`);
writeFileSync(resolve(LOCAL,'shared-water.ts'),water);
const study='68d68313';
let runtime=execFileSync('git',['show',`${study}:investigation/parallel-water/runtime.ts`],{encoding:'utf8'});
let helper=execFileSync('git',['show',`${study}:investigation/parallel-water/helper.ts`],{encoding:'utf8'});
runtime=runtime.replace("from './water'","from './shared-water'");
runtime="import {bindKernel,allocateWorkspace} from './shared-kernel';\n"+runtime;
runtime=runtime.replace("if(threads===1||!globalThis.crossOriginIsolated||typeof SharedArrayBuffer==='undefined')", "if(!globalThis.crossOriginIsolated||typeof SharedArrayBuffer==='undefined')");
runtime=runtime.replace('  const indices=new Int32Array(new SharedArrayBuffer(maxTiles*4));','  const workspace=await allocateWorkspace(maxTiles,threads);\n  const indices=workspace.indices;');
const allocation="  for(const [key,Ctor] of Object.entries(constructors))shared[key]=new Ctor(new SharedArrayBuffer(maxTiles*(key==='out'||key==='f'?4:1)*Ctor.BYTES_PER_ELEMENT));";
if(!runtime.includes(allocation))throw Error('Parallel workspace shape changed');
runtime=runtime.replace(allocation,'  Object.assign(shared,workspace.shared);\n  bindKernel(workspace,0);\n  const {memory,...workspaceWithoutMemory}=workspace;');
// Firefox <149 loses the message when Memory precedes multiple views of its buffer
// (Mozilla bug 1821582). Keep the Memory at the end of the clone graph.
runtime=runtime.replace('dynamicKernel:true});','dynamicKernel:true,workspace:{...workspaceWithoutMemory,module:null,memory}});');
runtime=runtime.replace('  const stats={parallelPhases:0,scalarPhases:0};','  const startup:unknown[]=[];\n  const stats={parallelPhases:0,scalarPhases:0};');
runtime=runtime.replace('w.onmessage=e=>{if(e.data?.ready)', 'w.onmessage=e=>{startup.push({id:i+1,...e.data});if(e.data?.ready)');
runtime=runtime.replace("w.onerror=()=>{clearTimeout(timer);reject(Error('Water helper startup failed'));};","w.onerror=event=>{clearTimeout(timer);reject(Error('Water helper startup failed: '+event.message));};");
runtime=runtime.replace("  }catch{close();return {threads:1,close:()=>{}};}","  }catch(error){close();return {threads:1,close:()=>{},fallbackReason:String(error),startup};}");
runtime=runtime.replace('      try{body();}finally{','      object.rustShared=true;\n      try{body();}finally{\n        object.rustShared=false;');
helper=helper.replace("from './water'","from './shared-water'");helper="import {bindKernel} from './shared-kernel';\n"+helper;
helper=helper.replace('  const sim = Object.assign','  bindKernel(data.workspace,id);\n  const sim = Object.assign');
helper=helper.replace('  bindKernel(data.workspace,id);','  postMessage({stage:"received"});\n  bindKernel(data.workspace,id);\n  postMessage({stage:"bound"});');
helper=helper.replace('snapshot) as WaterSim','{...snapshot,rustShared:true}) as WaterSim');
writeFileSync(resolve(LOCAL,'shared-runtime.ts'),runtime);writeFileSync(resolve(LOCAL,'shared-helper.ts'),helper);
json('shared-provenance.json',{study,source:hash(source),mathMethod:'extract Rust flow/depth/dam expressions verbatim; integer topology access and exact ceil intrinsic replaced',runtime:hash(runtime),helper:hash(helper)});
console.log('Prepared common-source kernels and reused parallel-water barriers');
