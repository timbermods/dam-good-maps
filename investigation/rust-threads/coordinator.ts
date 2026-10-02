import * as reference from './local/reference-water';
import * as scalarRust from './water';
import * as rustShared from './local/shared-water';
import * as tsShared from './local/ts-water';
import {installParallelWater as installRust} from './local/shared-runtime';
import {installParallelWater as installTS} from './local/ts-runtime';
import {decodeJob,snapshot,packSnapshots} from './protocol';
let api:any=reference,pool:any=null;
function same(a:Uint8Array,b:Uint8Array,label:string){if(a.length!==b.length)throw Error(label+' length');for(let i=0;i<a.length;i++)if(a[i]!==b[i])throw Error(label+' byte '+i);}
async function get(path:string){const r=await fetch(path);if(!r.ok)throw Error(path+' HTTP '+r.status);return new Uint8Array(await r.arrayBuffer());}
async function digest(bytes:Uint8Array){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes as Uint8Array<ArrayBuffer>)),v=>v.toString(16).padStart(2,'0')).join('');}
function execute(job:ReturnType<typeof decodeJob>,backend:any){
 const sim=new backend.WaterSim(structuredClone(job.model),structuredClone(job.initial),job.opts);sim.out.set(job.out);
 if(backend===scalarRust&&sim.backend!=='wasm')throw Error('Unexpected scalar Rust fallback');
 const parts:Uint8Array[]=[];let ms=0;
 try{for(const cmd of job.commands){let result=null;if('settle'in cmd){const t=performance.now();result=backend.settle(sim,cmd.settle);ms+=performance.now()-t;}else{
  if(cmd.emitters)for(let i=0;i<sim.emitters.length;i++)Object.assign(sim.emitters[i],cmd.emitters[i]);
  for(const [i,v]of cmd.floors??[])sim.F[i]=v;
  const t=performance.now();sim.run(cmd.ticks,cmd.scale??1);ms+=performance.now()-t;
 }if(!('capture'in cmd)||cmd.capture!==false)parts.push(snapshot(sim,result));}
 return {bytes:packSnapshots(parts),ticks:sim.ticks,captures:parts.length,ms};
 }finally{sim.dispose?.();}
}
onmessage=async({data})=>{try{
 if(data.close){pool?.close();pool=null;postMessage({ok:true,closed:true});return;}
 if(data.init){const t=performance.now();if(data.backend==='rust-scalar'){
  if(!await scalarRust.installRustWater('water.wasm'))throw Error('Scalar Rust unavailable');api=scalarRust;
 }else if(data.backend==='rust'||data.backend==='typescript'){
  const rust=data.backend==='rust';api=rust?rustShared:tsShared;
  pool=await (rust?installRust:installTS)(data.threads,new URL(rust?'shared-helper.js':'ts-helper.js',location.href),30000,512*512,data.forced?0:1024);
  if(pool.threads!==data.threads)throw Error('Thread startup fallback '+pool.fallbackReason);
 }else api=reference;
 postMessage({ok:true,startup:performance.now()-t,isolated:crossOriginIsolated,threads:pool?.threads??1});return;
 }
 if(data.smoke){let checks=0;
  for(const rules of ['game','port'])for(const f of data.fixtures){
   const m={W:f.W,H:f.H,floor:Float64Array.from(f.floor),dam:f.dam?Float64Array.from(f.dam):null,emitters:f.emitters};
   const a=new reference.WaterSim(structuredClone(m),undefined,{rules:rules as 'game'}),b=new api.WaterSim(structuredClone(m),undefined,{rules});
   const arrays=[b.D,b.Dold,b.C,b.out];
   for(let t=0;t<(data.ticks??200);t++){a.run(1);b.run(1);same(snapshot(a),snapshot(b),rules+'/'+f.name+'/'+t);checks++;}
   if(arrays.some((array,i)=>array!==[b.D,b.Dold,b.C,b.out][i]||array.buffer instanceof SharedArrayBuffer))throw Error('Private output ownership');
   b.dispose?.();
  }
  postMessage({ok:true,checks,stats:pool?.stats});return;
 }
 const input=await get('checks/'+data.id+'.in'),expected=await get('checks/'+data.id+'.expected'),job=decodeJob(input);
 const output=execute(job,api);same(output.bytes,expected,data.id);const ms=output.ms;
 // Scalar TS is rerun in each engine, outside timed runs, against archive bytes.
 if(data.oracle){const fresh=execute(job,reference);same(output.bytes,fresh.bytes,data.id+' fresh same-engine TS');}
 postMessage({ok:true,id:data.id,ms,ticks:output.ticks,captures:output.captures,sha256:await digest(output.bytes),input:await digest(input),stats:pool?.stats});
 }catch(error){postMessage({ok:false,error:String((error as Error).stack)});}};
