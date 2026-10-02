import {installParallelWater as rustPool} from './local/shared-runtime';
import {installParallelWater as tsPool} from './local/ts-runtime';
import * as rust from './local/shared-water';
import * as ts from './local/ts-water';
import * as reference from './local/reference-water';
import {snapshot} from './protocol';
function same(a:Uint8Array,b:Uint8Array){if(a.length!==b.length)throw Error('length');for(let i=0;i<a.length;i++)if(a[i]!==b[i])throw Error('byte '+i);}
onmessage=async({data})=>{let pool:any;try{
 const isRust=data.backend==='rust',install=isRust?rustPool:tsPool,api=isRust?rust:ts;
 const model={W:13,H:11,floor:Float64Array.from({length:143},(_,i)=>(i%13)/10),dam:null,emitters:[{cells:[27,28],strength:1,contamination:.5}]};
 const initial={depth:new Float64Array(143).fill(1),contamination:new Float64Array(143).fill(.25)};
 const helper=new URL(data.kind==='startup'?'missing-helper.js':data.kind==='failure'?(isRust?'fault-rust-helper.js':'fault-ts-helper.js'):(isRust?'shared-helper.js':'ts-helper.js'),location.href);
 pool=await install(4,helper,data.kind==='failure'?1000:500,143,0);
 if(data.kind==='startup'||data.kind==='unisolated'){
  if(pool.threads!==1)throw Error('Fallback not selected');
  const a=new api.WaterSim(structuredClone(model),structuredClone(initial)),b=new reference.WaterSim(structuredClone(model),structuredClone(initial));a.run(20);b.run(20);same(snapshot(a),snapshot(b));
  postMessage({ok:true,kind:data.kind,backend:data.backend,ticks:a.ticks});return;
 }
 if(pool.threads!==4)throw Error('Unexpected fallback');
 if(data.kind==='failure'){
  const partial=new api.WaterSim(structuredClone(model),structuredClone(initial));let failed=false;
  try{partial.run(10);}catch(e){if(!String(e).includes('Water phase timeout'))throw e;failed=true;}
  if(!failed)throw Error('Incomplete phase accepted');
  const fresh=new api.WaterSim(structuredClone(model),structuredClone(initial)),ref=new reference.WaterSim(structuredClone(model),structuredClone(initial));
  if(fresh.executor||fresh.runScope)throw Error('Failed pool still attached');fresh.run(20);ref.run(20);same(snapshot(fresh),snapshot(ref));
  postMessage({ok:true,kind:data.kind,backend:data.backend,discarded:true,ticks:fresh.ticks,partialTicks:partial.ticks});return;
 }
 const sims=[0,1].map(()=>new api.WaterSim(structuredClone(model),structuredClone(initial))),refs=[0,1].map(()=>new reference.WaterSim(structuredClone(model),structuredClone(initial)));
 const owned=sims.map(s=>[s.D,s.Dold,s.C,s.out]);let checks=0;
 for(let tick=0;tick<100;tick++)for(let map=0;map<2;map++){
  if(tick===30){sims[map].F[70]=refs[map].F[70]=.25;sims[map].emitters[0].strength=refs[map].emitters[0].strength=.375;}
  sims[map].run(1);refs[map].run(1);same(snapshot(sims[map]),snapshot(refs[map]));checks++;
  for(let j=0;j<4;j++)if(owned[map][j]!==[sims[map].D,sims[map].Dold,sims[map].C,sims[map].out][j]||owned[map][j].buffer instanceof SharedArrayBuffer)throw Error('Output ownership changed');
 }
 postMessage({ok:true,kind:data.kind,backend:data.backend,checks,stats:pool.stats});
 }catch(e){postMessage({ok:false,error:String((e as Error).stack)});}finally{pool?.close();}};
