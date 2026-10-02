// Binary64 values never cross a decimal serialization boundary. Objects have canonical key order;
// arrays retain their exact order. Typed arrays are represented by their entries in this protocol.
export function encode(value:any):Uint8Array {
 let data=new Uint8Array(1024),at=0;
 const reserve=(n:number)=>{if(at+n>data.length){const next=new Uint8Array(Math.max(at+n,data.length*2));next.set(data);data=next;}};
 const byte=(v:number)=>{reserve(1);data[at++]=v;};
 const u32=(v:number)=>{reserve(4);new DataView(data.buffer).setUint32(at,v,true);at+=4;};
 const str=(v:string)=>{const bytes=new TextEncoder().encode(v);u32(bytes.length);reserve(bytes.length);data.set(bytes,at);at+=bytes.length;};
 function write(v:any){if(v===null){byte(0);}else if(typeof v==='boolean'){byte(v?2:1);}else if(typeof v==='number'){if(!Number.isFinite(v))throw Error('Nonfinite protocol value');byte(3);reserve(8);new DataView(data.buffer).setFloat64(at,v,true);at+=8;}else if(typeof v==='string'){byte(4);str(v);}else if(Array.isArray(v)||ArrayBuffer.isView(v)){byte(5);u32(v.length);for(const x of v)write(x);}else if(v&&typeof v==='object'){const keys=Object.keys(v).filter(k=>v[k]!==undefined).sort();byte(6);u32(keys.length);for(const k of keys){str(k);write(v[k]);}}else throw Error('Unsupported protocol type '+typeof v);}
 write(value);return data.slice(0,at);
}
export function decode(bytes:Uint8Array):any {let at=0;const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),u32=()=>{const n=v.getUint32(at,true);at+=4;return n;},str=()=>{const n=u32(),s=new TextDecoder().decode(bytes.subarray(at,at+n));at+=n;return s;};function read():any {switch(bytes[at++]){case 0:return null;case 1:return false;case 2:return true;case 3:{const n=v.getFloat64(at,true);at+=8;return n;}case 4:return str();case 5:return Array.from({length:u32()},read);case 6:{const o:any={};for(let n=u32();n--;){const k=str();o[k]=read();}return o;}default:throw Error('Protocol tag');}}const out=read();if(at!==bytes.length)throw Error('Trailing output');return out;}
export async function bridge(wasm:BufferSource){
 const {instance}=await WebAssembly.instantiate(wasm,{}),e=instance.exports as any;
 const take=(call:(len:number)=>number)=>{const len=e.water_alloc(4);let out=0,n=0;try{out=call(len);n=new DataView(e.memory.buffer).getUint32(len,true);return new Uint8Array(e.memory.buffer,out,n).slice();}finally{if(out)e.water_dealloc(out,n);e.water_dealloc(len,4);}};
 const transfer=(input:Uint8Array,call:(p:number)=>any)=>{const p=e.water_alloc(input.length);new Uint8Array(e.memory.buffer,p,input.length).set(input);try{return call(p);}finally{e.water_dealloc(p,input.length);}};
 const run:any=(input:Uint8Array)=>transfer(input,p=>take(len=>e.forces_execute(p,input.length,len)));
 run.prepare=(input:Uint8Array)=>{const ptr=transfer(input,p=>e.forces_prepare(p,input.length));let live=true;const check=()=>{if(!live)throw Error('Disposed force plan');};return {plan:()=>{check();e.forces_plan(ptr);},pack:()=>{check();return take(len=>e.forces_pack(ptr,len));},dispose:()=>{if(live){e.forces_free(ptr);live=false;}}};};
 return run;
}
