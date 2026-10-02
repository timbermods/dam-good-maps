type Workspace={memory:WebAssembly.Memory;module:WebAssembly.Module|null;bytes:Uint8Array;shared:Record<string,any>;indices:Int32Array;descriptor:Uint32Array;stackBase:number};
let instance:WebAssembly.Instance|null=null,workspace:Workspace|null=null;
const keys=['F','D','C','Dold','out','f','Cnew','mod','wall','n0','n1','n2','n3','dam'];
export async function allocateWorkspace(maxTiles:number,threads:number):Promise<Workspace>{
 const shapes:Record<string,any>={F:Float64Array,dam:Float64Array,D:Float64Array,Dold:Float64Array,C:Float64Array,out:Float64Array,f:Float64Array,Cnew:Float64Array,mod:Float64Array,wall:Uint8Array,n0:Int32Array,n1:Int32Array,n2:Int32Array,n3:Int32Array};
 let at=2*1024*1024;const offsets:Record<string,number>={};for(const [key,Ctor] of Object.entries(shapes)){at=Math.ceil(at/8)*8;offsets[key]=at;at+=maxTiles*(key==='out'||key==='f'?4:1)*Ctor.BYTES_PER_ELEMENT;}
 at=Math.ceil(at/8)*8;const indexAt=at;at+=maxTiles*4;const descAt=at;at+=keys.length*4;const stackBase=Math.ceil(at/65536)*65536,pages=Math.ceil((stackBase+threads*65536)/65536);
 const memory=new WebAssembly.Memory({initial:pages,maximum:pages,shared:true});const response=await fetch('shared-water.wasm');if(!response.ok)throw Error('Shared kernel unavailable');const bytes=new Uint8Array(await response.arrayBuffer()),module=await WebAssembly.compile(bytes);const shared:Record<string,any>={};
 for(const [key,Ctor] of Object.entries(shapes))shared[key]=new Ctor(memory.buffer,offsets[key],maxTiles*(key==='out'||key==='f'?4:1));
 const descriptor=new Uint32Array(memory.buffer,descAt,keys.length);descriptor.set(keys.map(k=>offsets[k]));return {memory,module,bytes,shared,indices:new Int32Array(memory.buffer,indexAt,maxTiles),descriptor,stackBase};
}
export function bindKernel(w:Workspace,id:number){workspace=w;instance=new WebAssembly.Instance(w.module??new WebAssembly.Module(w.bytes as Uint8Array<ArrayBuffer>),{env:{memory:w.memory}});const stack=instance.exports.__stack_pointer as WebAssembly.Global;stack.value=w.stackBase+(id+1)*65536;}
export function rustKernel(sim:any,phase:number,list:Int32Array,lo:number,hi:number):boolean {if(!instance||!workspace||!sim.rustShared)return false;if(!(list.buffer instanceof SharedArrayBuffer)||list.byteOffset!==workspace.indices.byteOffset){workspace.indices.set(list.subarray(0,hi));list=workspace.indices;}const fn=instance.exports.water_kernel as Function;fn(phase,+sim.game,+sim.edgeSpill,+!!sim.dam,workspace.descriptor.byteOffset,list.byteOffset,lo,hi);return true;}
