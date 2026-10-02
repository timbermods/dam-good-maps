import * as fast from './local/reference-water';
import * as shared from './local/shared-water';
import {installParallelWater} from './local/shared-runtime';
import {decodeJob,snapshot,packSnapshots} from './protocol';
function same(a:Uint8Array,b:Uint8Array,label:string){if(a.length!==b.length)throw Error(label+' length');for(let i=0;i<a.length;i++)if(a[i]!==b[i])throw Error(label+' byte '+i);}
async function get(path:string){const r=await fetch(path);if(!r.ok)throw Error('HTTP '+r.status);return new Uint8Array(await r.arrayBuffer());}
function run(api:any,job:ReturnType<typeof decodeJob>){const sim=new api.WaterSim(structuredClone(job.model),job.initial,job.opts);sim.out.set(job.out);const snaps=[];for(const cmd of job.commands){let r=null;if('settle'in cmd)r=api.settle(sim,cmd.settle);else{if(cmd.emitters)for(let i=0;i<sim.emitters.length;i++)Object.assign(sim.emitters[i],cmd.emitters[i]);for(const[i,v]of cmd.floors??[])sim.F[i]=v;sim.run(cmd.ticks,cmd.scale??1);}if(!('capture'in cmd)||cmd.capture!==false)snaps.push(snapshot(sim,r));}return packSnapshots(snaps);}
onmessage=async({data})=>{let pool:any=null;try{const threads=data.threads??2;pool=await installParallelWater(threads,new URL('shared-helper.js',location.href),30000,data.smoke?4096:512*512,data.smoke?0:1024);
 if(pool.threads!==threads)throw Error('Requested '+threads+' threads, got '+pool.threads+': '+pool.fallbackReason);
 if(data.smoke){let checks=0;for(const rules of ['game','port']as const)for(const f of data.fixtures){const m={W:f.W,H:f.H,floor:Float64Array.from(f.floor),dam:f.dam?Float64Array.from(f.dam):null,emitters:f.emitters},a=new fast.WaterSim(structuredClone(m),undefined,{rules}),b=new shared.WaterSim(structuredClone(m),undefined,{rules});for(let t=0;t<100;t++){a.run(1);b.run(1);same(snapshot(a),snapshot(b),rules+'/'+f.name+'/'+t);checks++;}}
   postMessage({ok:true,checks,threads:pool.threads,isolated:crossOriginIsolated,stats:pool.stats,fallbackReason:pool.fallbackReason,startup:pool.startup});}
 else{const input=await get('checks/'+data.id+'.in'),expected=await get('checks/'+data.id+'.expected'),job=decodeJob(input),times=[];
  for(let rep=-1;rep<(data.reps??1);rep++){const t=performance.now(),out=run(shared,job),ms=performance.now()-t;same(out,expected,data.id);if(rep>=0)times.push(ms);}
  postMessage({ok:true,id:data.id,threads:pool.threads,times,stats:pool.stats});}
 }catch(e){postMessage({ok:false,error:String((e as Error).stack)});}finally{pool?.close();}};
