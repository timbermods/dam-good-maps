// Adoption adapter: callers keep synchronous WaterSim / SettleRun interfaces.
import { WaterSim as TypeScriptSim, type WaterModel, type WaterState, type WaterSimOptions } from "./local/reference-water";
import { encodeModel } from "./protocol";
export * from "./local/reference-water";
interface Exports { memory:WebAssembly.Memory;water_alloc(n:number):number;water_dealloc(p:number,n:number):void;water_new(p:number,n:number):number;water_free(s:number):void;water_run(s:number,t:number,scale:number):void;water_ptr(s:number,k:number):number;water_emitter(s:number,i:number,strength:number,c:number,anchor:number,off:number,on:number):void;water_sat(s:number,p:number):void;water_seep(s:number,i:number):number; }
let module:WebAssembly.Module|null=null;
let arena:Exports|null=null;
const finalizer=typeof FinalizationRegistry==='undefined'?null:new FinalizationRegistry<{rust:Exports;handle:number;sat:number;n:number}>(s=>{s.rust.water_free(s.handle);s.rust.water_dealloc(s.sat,s.n);});
export function installRustWaterSync(bytes:BufferSource):boolean {try{if(!finalizer)return false;module=new WebAssembly.Module(bytes);arena=null;return true;}catch{return false;}}
export async function installRustWater(source:BufferSource|URL|string):Promise<boolean> {
  try {if(typeof WebAssembly==="undefined"||!finalizer)return false;const bytes=typeof source==="string"||source instanceof URL?await (async()=>{const r=await fetch(source);if(!r.ok)throw Error(`Wasm HTTP ${r.status}`);return r.arrayBuffer();})():source;
    const candidate=await WebAssembly.compile(bytes);const probe=new WebAssembly.Instance(candidate).exports as unknown as Exports;
    if(!probe.memory||typeof probe.water_new!=="function"||typeof probe.water_run!=="function")throw Error("Rust water ABI missing");module=candidate;arena=probe;return true;
  }catch {return false;}
}
export function uninstallRustWater(){module=null;arena=null;}
export class WaterSim extends TypeScriptSim {
  readonly backend:"wasm"|"typescript";
  readonly fallbackReason?:string;
  private rust:Exports|null=null;
  private handle=0;
  private satPtr=0;
  private disposed=false;
  constructor(model:WaterModel,initial?:WaterState,opts:WaterSimOptions={}) {
    super(model,initial,opts);this.backend="typescript";
    if(!module||!finalizer)return;
    // One allocator arena per worker, independent Sim handles per map. Public arrays remain
    // ordinary JS arrays; every temporary linear-memory view is rebuilt after Rust calls.
    // No view survives across a call that can grow memory, including another map's run.
    let pending:Exports|null=null;
    try {
    const rust=arena??(arena=new WebAssembly.Instance(module).exports as unknown as Exports);
    pending=rust;
    const input=encodeModel(model,initial,opts),p=rust.water_alloc(input.length);
    try {new Uint8Array(rust.memory.buffer,p,input.length).set(input);this.handle=rust.water_new(p,input.length);}
    finally {rust.water_dealloc(p,input.length);}
    this.satPtr=rust.water_alloc(this.N);this.rust=rust;this.backend="wasm";
    finalizer.register(this,{rust,handle:this.handle,sat:this.satPtr,n:this.N},this);
    } catch(error) {this.fallbackReason=String(error);
      try{if(pending&&this.handle)pending.water_free(this.handle);}catch{/* Discard failed task. */}
      this.rust=null;this.handle=0; /* No tick advanced: scalar fallback. */ }
  }
  override run(ticks:number,strengthScale=1):this {
    if(this.disposed)throw Error("WaterSim disposed");if(!this.rust)return super.run(ticks,strengthScale);
    if(!(ticks>0))return this;
    const r=this.rust,h=this.handle;
    new Float64Array(r.memory.buffer,r.water_ptr(h,0),this.N).set(this.F);
    if(this.dam)new Float64Array(r.memory.buffer,r.water_ptr(h,5),this.N).set(this.dam);
    new Float64Array(r.memory.buffer,r.water_ptr(h,4),4*this.N).set(this.out);
    for(let i=0;i<this.emitters.length;i++){const e=this.emitters[i];r.water_emitter(h,i,e.strength,e.contamination,e.depthLimit?.anchor??0xffffffff,e.depthLimit?.off??0,e.depthLimit?.on??0);}
    // JS run(ticks) executes ceil(ticks) loop iterations for positive fractional ticks.
    r.water_run(h,Math.max(0,Math.ceil(ticks)),strengthScale);
    for(const [k,array] of [[1,this.D],[2,this.C],[3,this.Dold],[4,this.out]] as const)array.set(new Float64Array(r.memory.buffer,r.water_ptr(h,k),array.length));
    this.ticks+=Math.max(0,Math.ceil(ticks));
    const seep=(this as unknown as {seepOn:Uint8Array}).seepOn;for(let i=0;i<seep.length;i++)seep[i]=r.water_seep(h,i);
    return this;
  }
  override saturation():Uint8Array {if(this.disposed)throw Error("WaterSim disposed");if(!this.rust)return super.saturation();this.rust.water_sat(this.handle,this.satPtr);return new Uint8Array(this.rust.memory.buffer,this.satPtr,this.N).slice();}
  dispose(){if(this.disposed)return;this.disposed=true;
    finalizer?.unregister(this);
    // Free this map; the worker keeps its allocator arena for subsequent maps.
    if(this.rust){this.rust.water_free(this.handle);this.rust.water_dealloc(this.satPtr,this.N);}
    this.rust=null;this.handle=0;this.satPtr=0;
  }
}
