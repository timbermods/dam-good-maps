import * as fast from './local/reference-water';
import * as rust from './water';
import * as old from './local/old-water';
import {decodeJob,snapshot,packSnapshots} from './protocol';
import {lifecycle} from './lifecycle';
const sha=async(b:Uint8Array)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',b.slice()))).map(v=>v.toString(16).padStart(2,'0')).join('');
function same(a:Uint8Array,b:Uint8Array,label:string){if(a.length!==b.length)throw Error(label+' length');for(let i=0;i<a.length;i++)if(a[i]!==b[i])throw Error(label+' byte '+i);}
async function get(path:string){const r=await fetch(path);if(!r.ok)throw Error('HTTP '+r.status+' '+path);return new Uint8Array(await r.arrayBuffer());}
function run(api:any,job:ReturnType<typeof decodeJob>,verify?:Uint8Array,sliced=false){const m=structuredClone(job.model),sim=new api.WaterSim(m,job.initial,job.opts);sim.out.set(job.out);const snaps:Uint8Array[]=[];let result:any=null,at=4,captures=0;
 for(const cmd of job.commands){if('settle' in cmd){if(sliced){const sr=new api.SettleRun(sim,cmd.settle);let k=0;do{result=sr.advance([1,7,17,64,128][k++%5]);}while(!result);}else result=api.settle(sim,cmd.settle);}
 else{result=null;if(cmd.emitters)for(let i=0;i<sim.emitters.length;i++)Object.assign(sim.emitters[i],cmd.emitters[i]);for(const [i,v] of cmd.floors??[])sim.F[i]=v;sim.run(cmd.ticks,cmd.scale??1);}
 if(!('capture' in cmd)||cmd.capture!==false){const snap=snapshot(sim,result);if(verify){const size=new DataView(verify.buffer,verify.byteOffset+at,4).getUint32(0,true);at+=4;same(snap,verify.subarray(at,at+size),'checkpoint '+captures);at+=size;}snaps.push(snap);captures++;}}
 const output=packSnapshots(snaps);if(verify)same(output,verify,'complete');if(sim.backend&&sim.backend!=='wasm')throw Error('Unexpected fallback');sim.dispose?.();return output;}
let ready=false;
onmessage=async({data})=>{try{if(!ready){const wasm=await get('water.wasm');if(!await rust.installRustWater(wasm))throw Error('Wasm unavailable');ready=true;}
 if(data.smoke){const lifecycleChecks=lifecycle();let checks=0;for(const rules of ['game','port'] as const)for(const f of data.fixtures){const m={W:f.W,H:f.H,floor:Float64Array.from(f.floor),dam:f.dam?Float64Array.from(f.dam):null,emitters:f.emitters},a=new fast.WaterSim(structuredClone(m),undefined,{rules}),b=new rust.WaterSim(structuredClone(m),undefined,{rules});for(let t=0;t<975;t++){a.run(1);b.run(1);same(snapshot(a),snapshot(b),rules+'/'+f.name+'/'+t);checks++;}b.dispose();}
   // Unavailable/corrupt Wasm selects TS before construction, with the same public state.
   rust.uninstallRustWater();ready=false;if(await rust.installRustWater(new Uint8Array([0])))throw Error('Corrupt Wasm accepted');const m={W:1,H:1,floor:new Float64Array(1),dam:null,emitters:[]},fallback=new rust.WaterSim(m);fallback.run(1);same(snapshot(fallback),snapshot(new fast.WaterSim(m).run(1)),'fallback');postMessage({ok:true,checks,lifecycleChecks});return;}
 const input=await get('checks/'+data.id+'.in'),expected=await get('checks/'+data.id+'.expected'),job=decodeJob(input);
 if(data.bench){const times:Record<string,number[]>={old:[],fast:[],rust:[]};for(let rep=-1;rep<data.reps;rep++){const variants=rep%2?['rust','fast','old']:['old','fast','rust'];for(const variant of variants){const start=performance.now(),out=run({old,fast,rust}[variant as 'rust'],job),ms=performance.now()-start;same(out,expected,variant);if(rep>=0)times[variant].push(ms);}}postMessage({ok:true,id:data.id,times});}
 else{const sliced=data.sliced??/-1-live$/.test(data.id),r=run(rust,job,expected,sliced);if(!data.rustOnly){const f=run(fast,job,expected,sliced);same(r,f,'Rust/TS');}postMessage({ok:true,id:data.id,sha256:await sha(r),bytes:r.length,commands:job.commands.length});}
 }catch(e){postMessage({ok:false,id:data.id,error:String(e)+'\n'+String((e as Error).stack)});}};
