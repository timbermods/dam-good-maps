/** The editor's typed Rust ABI. No physics lives in this binding. */
export type WaterObject = readonly [kind:number,x:number,y:number,z:number,rotation:number,flipped:number,delayed:number,strength:number];
interface ABI {
 memory: WebAssembly.Memory;
 stack_create(w:number,h:number,objects:number,retained:number):number;
 stack_free(handle:number):number;
 stack_ptr(handle:number,field:number):number;
 stack_len(handle:number,field:number):number;
 stack_op(handle:number,op:number,a:number,b:number):number;
 stack_info(handle:number,field:number):number;
 stack_error_ptr():number;
 stack_error_len():number;
}
export interface State {
 count: Uint8Array; floor: Int16Array; ceiling: Int16Array;
 depth: Float64Array; overflow: Float64Array; contamination: Float64Array;
 oldDepth: Float64Array; momentum: Float64Array;
 start: Uint32Array; target: Int32Array; direction: Uint8Array; reverse: Int32Array;
}
export function loadKernel(bytes: BufferSource) {
 const abi=new WebAssembly.Instance(new WebAssembly.Module(bytes),{}).exports as unknown as ABI;
 if(typeof abi.stack_create!=='function') throw Error('The stacked Rust water ABI is required');
 return { create(w:number,h:number,masks:Uint32Array,objects:readonly WaterObject[]) {return new RustWater(abi,w,h,masks,objects);} };
}
export type Kernel = ReturnType<typeof loadKernel>;
type Vector = Uint8Array | Uint32Array | Int16Array | Int32Array | Float64Array;
export class RustWater {
 private handle:number;
 private abi:ABI; readonly W:number; readonly H:number;
 constructor(abi:ABI,W:number,H:number,masks:Uint32Array,objects:readonly WaterObject[]) {
  this.abi=abi;this.W=W;this.H=H;
  this.handle=abi.stack_create(W,H,objects.length,0);
  if(!this.handle)throw this.error();
  try {
   this.write(0,masks);this.write(1,Float64Array.from(objects.flat()));this.op(0,0,0);
  } catch(e){this.dispose();throw e;}
 }
 private error(){return Error(new TextDecoder().decode(new Uint8Array(this.abi.memory.buffer,this.abi.stack_error_ptr(),this.abi.stack_error_len())));}
 private live(){if(!this.handle)throw Error('Water simulation disposed');}
 private view(field:number):Vector {
  this.live(); const a=this.abi, length=a.stack_len(this.handle,field),ptr=a.stack_ptr(this.handle,field);
  const ctor=[0,11].includes(field)?Uint32Array:[3,13,16,17,20].includes(field)?Uint8Array:[4,5,18,19].includes(field)?Int16Array:[12,14].includes(field)?Int32Array:Float64Array;
  return new ctor(a.memory.buffer,ptr,length);
 }
 write(field:number,data:ArrayLike<number>){const v=this.view(field);if(v.length!==data.length)throw Error(`Water field ${field} length differs`);v.set(Array.from(data));}
 read(field:number){return this.view(field).slice();}
 op(op:number,a=0,b=0){this.live();if(this.abi.stack_op(this.handle,op,a,b))throw this.error();}
 info(field:number){this.live();return this.abi.stack_info(this.handle,field);}
 run(ticks:number,scale=1){this.op(1,ticks,scale);}
 state():State {
  return {count:this.read(3) as Uint8Array,floor:this.read(4) as Int16Array,ceiling:this.read(5) as Int16Array,
   depth:this.read(6) as Float64Array,overflow:this.read(7) as Float64Array,contamination:this.read(8) as Float64Array,
   oldDepth:this.read(9) as Float64Array,momentum:this.read(10) as Float64Array,
   start:this.read(11) as Uint32Array,target:this.read(12) as Int32Array,direction:this.read(13) as Uint8Array,reverse:this.read(14) as Int32Array};
 }
 setState(state:Pick<State,'depth'|'overflow'|'contamination'|'oldDepth'|'momentum'>){
  this.write(6,state.depth);this.write(7,state.overflow);this.write(8,state.contamination);this.write(9,state.oldDepth);this.write(10,state.momentum);this.op(5);
  // sync rebuilds active lists and resets old depth; restore the supplied temporal state.
  this.write(9,state.oldDepth);
 }
 force(strengths:readonly number[],contamination:readonly number[]){
  const p=this.read(15);if(p.length!==strengths.length*4||contamination.length!==strengths.length)throw Error('Weather emitter count differs');
  strengths.forEach((v,i)=>{p[i*4]=v;p[i*4+1]=contamination[i];});this.write(15,p);
 }
 dispose(){if(this.handle){this.abi.stack_free(this.handle);this.handle=0;}}
}
