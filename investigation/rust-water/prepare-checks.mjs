import {Worker,isMainThread,parentPort} from 'node:worker_threads';
import {readFileSync,writeFileSync,readdirSync,mkdirSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {deserialize} from 'node:v8';
import {gunzipSync} from 'node:zlib';
import {HERE,ROOT,LOCAL,api,deps,arg,json,hash} from './common.mjs';
const checksDir=resolve(LOCAL,'checks');mkdirSync(checksDir,{recursive:true});
const a=api(),p=deps(resolve(LOCAL,'protocol.cjs'));
const fingerprint=hash(Buffer.concat(['fast.cjs','protocol.cjs'].map(n=>readFileSync(resolve(LOCAL,n))).concat([readFileSync(new URL(import.meta.url))])));
const prepared=resolve(LOCAL,'prepared');mkdirSync(prepared,{recursive:true});
function execute(m,init,opts,commands,out){const sim=new a.WaterSim(structuredClone(m),init,opts);if(out)sim.out.set(out);const parts=[];for(const cmd of commands){let result=null;if(cmd.settle)result=a.settle(sim,cmd.settle);else{if(cmd.emitters)for(let i=0;i<sim.emitters.length;i++)Object.assign(sim.emitters[i],structuredClone(cmd.emitters[i]));for(const [i,v] of cmd.floors??[])sim.F[i]=v;sim.run(cmd.ticks,cmd.scale??1);}if(cmd.capture!==false)parts.push(p.snapshot(sim,result));}return {sim,bytes:p.packSnapshots(parts)};}
function save(id,m,init,opts,commands,out){const input=p.encodeJob(m,init,opts,commands,out),expected=execute(m,init,opts,commands,out),meta={id,W:m.W,H:m.H,commands:commands.length,captures:new DataView(expected.bytes.buffer).getUint32(0,true),input:hash(input),expected:hash(expected.bytes),ticks:expected.sim.ticks,fingerprint};writeFileSync(resolve(checksDir,id+'.in'),input);writeFileSync(resolve(checksDir,id+'.expected'),expected.bytes);writeFileSync(resolve(checksDir,id+'.json'),JSON.stringify(meta));return expected.sim;}
if(!isMainThread){parentPort.on('message',name=>{try{const {model:m,row}=deserialize(readFileSync(resolve(LOCAL,'models',name)));const id=row.id;const marker=resolve(prepared,id+'.json');if(existsSync(marker)&&JSON.parse(readFileSync(marker)).fingerprint===fingerprint){parentPort.postMessage({id,cached:true});return;}const init=a.prefill(m),sim=save(id,m,init,{},[{settle:{sealed:a.sealedTiles(m)}}]);
 // Actual preview warm-start and cap, across every official and batch model.
 const next=structuredClone(m),center=Math.floor(m.H/2)*m.W+Math.floor(m.W/2);next.floor[center]=Math.max(0,next.floor[center]-2);
 const water={depth:sim.D,contamination:sim.C,out:sim.out,sat:sim.saturation(),ticks:sim.ticks,settled:true};const warm=a.warmStart({model:m,water},next);
 save(id+'-live',next,warm.state,{},[{settle:{maxDays:1,checkEvery:a.PREVIEW_CHECK,tol:a.PREVIEW_TOL,movedShare:a.PREVIEW_MOVED,untilSteady:true,sealed:a.sealedTiles(next)}}],warm.out??undefined);
 // Full normal drought and badtide at the actual 12-tick Weather cadence on seed 1,
 // every official and stress model. Canonical arrays are the exact forcing boundary.
 if(id.startsWith('official-')||id.startsWith('stress-')||/-1$/.test(id))for(const hazard of ['drought','badtide']){const days=hazard==='drought'?9:8,weather=[];for(let t=0;t<days*768;t+=12){const emitters=structuredClone(m.emitters);if(hazard==='badtide')for(const e of emitters)if(e.contamination===0)e.contamination=a.badtideContamination(t/768,days);weather.push({ticks:12,scale:hazard==='drought'?0:1,emitters,capture:(t+12)%768===0});}weather.push({ticks:768,emitters:m.emitters});save(id+'-'+hazard,m,{depth:sim.D,contamination:sim.C},{},weather);}
 writeFileSync(marker,JSON.stringify({fingerprint}));parentPort.postMessage({id});}catch(e){parentPort.postMessage({error:String(e.stack)});}});}
else{const fixtures=JSON.parse(gunzipSync(readFileSync(resolve(ROOT,'tests/golden/water.json.gz')))).fixtures;
 for(const rules of ['game','port'])for(const f of fixtures){const id='golden-'+rules+'-'+f.name,meta=resolve(checksDir,id+'.json');if(existsSync(meta)&&JSON.parse(readFileSync(meta)).fingerprint===fingerprint)continue;const m={W:f.W,H:f.H,floor:Float64Array.from(f.floor),dam:f.dam?Float64Array.from(f.dam):null,emitters:structuredClone(f.emitters)};save(id,m,undefined,{rules},Array.from({length:975},()=>({ticks:1})));}
 const names=readdirSync(resolve(LOCAL,'models')).filter(n=>n.endsWith('.bin')).sort();let index=0,done=0;
 await Promise.all(Array.from({length:Math.min(Number(arg('jobs','4')),names.length)},()=>new Promise((res,rej)=>{const w=new Worker(new URL(import.meta.url));const next=()=>index<names.length?w.postMessage(names[index++]):w.terminate().then(res);w.on('message',r=>{if(r.error){w.terminate();rej(Error(r.error));return;}done++;json('checks-progress.json',{done,total:names.length});if(done%10===0)console.log(done+'/'+names.length,r.id);next();});w.on('error',rej);next();})));
 const cases=readdirSync(checksDir).filter(n=>n.endsWith('.json')).sort().map(n=>JSON.parse(readFileSync(resolve(checksDir,n))));json('checks.json',{cases});writeFileSync(resolve(LOCAL,'native-manifest.tsv'),cases.map(c=>`${resolve(checksDir,c.id+'.in')}\t${resolve(checksDir,c.id+'.native')}`).join('\n'));console.log('Prepared',cases.length,'checks');
}
