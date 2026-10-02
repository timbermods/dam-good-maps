/** Retained Wasm arena, raw binary64, fresh views after calls that can grow memory.
 * Reuses rust-water's bridge lifecycle; outputs are owned JS arrays. */
let wasm: any;
let native:any;
declare const Buffer:any;
export function installNativeAnalysis(addon:any){native=addon;}
export const OPS: Record<string,number>={distanceFrom:1,walkDistance:2,walkRegions:3,landRegions:4,components:5,levelRegions:6,spillLevels:7,damSites:8,roomMap:9};
/** Fixed adoption policy: small region/label scans keep their TS implementation.
 * All nine Rust kernels remain callable and are covered by the identity matrix. */
export const ADOPTION_KERNELS=new Set(['distanceFrom','walkDistance','landRegions','spillLevels','damSites','roomMap']);
export function replace(name:string,args:any[]):any{if(ADOPTION_KERNELS.has(name))return invoke(name,args);}
export async function installRustAnalysis(bytes: BufferSource){wasm=(await WebAssembly.instantiate(bytes,{})).instance.exports;}
export function encode(name:string,args:any[]):Float64Array{
 let W:number,H:number,p:number[]=[],a:ArrayLike<number>[]=[];
 if(name==='distanceFrom'){[a[0],W,H]=args;}
 else if(name==='walkDistance'){const [h,w,hh,blocked,links,start,limit=64]=args;W=w;H=hh;p=[start.x,start.y,limit];a=[h,blocked??new Uint8Array(W*H),links.flat()];}
 else if(name==='walkRegions'){const [h,w,hh,blocked,links]=args;W=w;H=hh;a=[h,blocked??new Uint8Array(W*H),links.flat()];}
 else if(name==='landRegions'){const [h,w,hh,wet]=args;W=w;H=hh;a=[h,wet];}
 else if(name==='components'){const [mask,w,hh,eight=false]=args;W=w;H=hh;p=[eight?1:0];a=[mask];}
 else if(name==='levelRegions'){const [h,w,hh]=args;W=w;H=hh;a=[h];}
 else if(name==='spillLevels'){const [m]=args;W=m.W;H=m.H;const emitting=new Uint8Array(W*H);for(const e of m.emitters)for(const i of e.cells)emitting[i]=1;a=[m.floor,m.dam??new Float64Array(W*H).fill(-1),emitting];}
 else if(name==='roomMap'){const [h,w,hh,opts]=args;W=w;H=hh;p=[opts.want,opts.lo,opts.firm??0];a=[h,opts.wet,opts.keep];}
 else {const [h,channel,surface,w,hh,sd,maxDist=60,heights=[1,2,3],stride=2,minRatio=30,minDepth=0]=args;W=w;H=hh;p=[maxDist,stride,minRatio,minDepth];a=[h,channel,surface,sd??[],heights];}
 const out=new Float64Array(5+p.length+a.length+a.reduce((s,v)=>s+v.length,0));let i=0;out[i++]=OPS[name];out[i++]=W!;out[i++]=H!;out[i++]=p.length;out.set(p,i);i+=p.length;out[i++]=a.length;for(const v of a){out[i++]=v.length;out.set(v,i);i+=v.length;}return out;
}
export function run(input:Float64Array):Float64Array{if(native){const b=native.execute(Buffer.from(input.buffer,input.byteOffset,input.byteLength));const backing=b.byteOffset%8?new Uint8Array(b).buffer:b.buffer,offset=b.byteOffset%8?0:b.byteOffset;return new Float64Array(backing,offset,b.length/8).slice();}if(!wasm)throw Error('Rust analysis not installed');const ip=wasm.analysis_alloc(input.length),lp=wasm.analysis_alloc(1);let op=0,n=0;try{new Float64Array(wasm.memory.buffer,ip,input.length).set(input);op=wasm.analysis_execute(ip,input.length,lp);n=new Uint32Array(wasm.memory.buffer,lp,1)[0];return new Float64Array(wasm.memory.buffer,op,n).slice();}finally{if(op)wasm.analysis_free(op,n);wasm.analysis_free(ip,input.length);wasm.analysis_free(lp,1);}}
export function decode(name:string,values:Float64Array,N:number):any{if(name==='roomMap')return Uint8Array.from(values);if(name==='walkRegions'||name==='landRegions')return Int32Array.from(values);if(name==='levelRegions'||name==='components'){const n=values[N];return name==='components'?{labels:Int32Array.from(values.slice(0,N)),sizes:Array.from(values.slice(N+1))}:{labels:Int32Array.from(values.slice(0,N)),level:Array.from(values.slice(N+1,N+1+n)),size:Array.from(values.slice(N+1+n))};}if(name==='damSites'){const out=[];for(let i=0;i<values.length;i+=9){const [x,y,dy,dx,height,length,area,volume,ratio]=values.slice(i,i+9);out.push({x,y,dir:[dy,dx],height,length,area,volume,ratio});}return out;}return values;}
export function invoke(name:string,args:any[]):any{const input=encode(name,args);return decode(name,run(input),input[1]*input[2]);}
export function flatten(name:string,r:any):Float64Array{if(name==='components')return Float64Array.from([...r.labels,r.sizes.length,...r.sizes]);if(name==='levelRegions')return Float64Array.from([...r.labels,r.size.length,...r.level,...r.size]);if(name==='damSites')return Float64Array.from(r.flatMap((c:any)=>[c.x,c.y,...c.dir,c.height,c.length,c.area,c.volume,c.ratio]));return Float64Array.from(r);}
