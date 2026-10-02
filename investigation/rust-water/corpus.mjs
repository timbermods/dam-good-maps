import {Worker,isMainThread,parentPort,workerData} from 'node:worker_threads';
import {readFileSync,writeFileSync,mkdirSync,readdirSync,existsSync} from 'node:fs';
import {serialize,deserialize} from 'node:v8';
import {resolve} from 'node:path';
import {HERE,ROOT,LOCAL,api,arg,json,hash} from './common.mjs';
const dir=resolve(LOCAL,'models');mkdirSync(dir,{recursive:true});
const fingerprint=hash(readFileSync(resolve(LOCAL,'fast.cjs')));
if(!isMainThread){const a=api();parentPort.on('message',c=>{try{const g=a.generate(a.makeSpec({seed:c.seed,theme:c.theme,size:{x:c.size,y:c.size}}));const row={...c,base:'e292cefe',fingerprint,accepted:g.report.passed,attempts:g.attempts,exportHash:hash(g.bytes)};writeFileSync(resolve(dir,c.id+'.bin'),serialize({model:g.built.waterModel,row}));writeFileSync(resolve(dir,c.id+'.json'),JSON.stringify(row));parentPort.postMessage(row);}catch(e){parentPort.postMessage({error:String(e.stack),id:c.id});}});}
else{const a=api(),cases=[];for(const size of [96,128,256])for(const theme of a.AVAILABLE_THEMES)for(let seed=1;seed<=Number(arg('seeds','40'));seed++)cases.push({id:`m9b-${theme}-${size}-${seed}`,theme,size,seed});
 const pending=cases.filter(c=>{const f=resolve(dir,c.id+'.json');return !existsSync(f)||JSON.parse(readFileSync(f)).fingerprint!==fingerprint;});let index=0,done=cases.length-pending.length;
 await Promise.all(Array.from({length:Math.min(Number(arg('jobs','4')),pending.length)},()=>new Promise((res,rej)=>{const w=new Worker(new URL(import.meta.url));const next=()=>index<pending.length?w.postMessage(pending[index++]):w.terminate().then(res);w.on('message',r=>{if(r.error){w.terminate();rej(Error(r.id+r.error));return;}done++;json('corpus-progress.json',{done,total:cases.length});if(done%10===0)console.log(done+'/'+cases.length,r.id);next();});w.on('error',rej);next();})));
 const official=process.env.DGM_OFFICIAL;if(!official)throw Error('Set DGM_OFFICIAL; all 19 official maps required');const names=readdirSync(official).filter(n=>n.endsWith('.timber')&&!n.startsWith('_')).sort();if(names.length!==19)throw Error('Expected 19 official maps');
 for(const name of names){const raw=readFileSync(resolve(official,name)),world=a.readTimber(raw).world,model=a.waterModelFromWorld(world,a.surfaceOf(world)),row={id:'official-'+name.slice(0,-7),base:'e292cefe',raw:hash(raw),size:model.W};writeFileSync(resolve(dir,row.id+'.bin'),serialize({model,row}));}
 // The product schema caps generated maps at 256. 512 stress models tile real 256 inputs;
 // do not describe these as accepted/generated 512 maps.
 for(const theme of ['riverValley','lakeBasin','islands']){const source=deserialize(readFileSync(resolve(dir,`m9b-${theme}-256-1.bin`))),m=source.model,W=512,H=512,N=W*H;const floor=new Float64Array(N),dam=m.dam?new Float64Array(N):null,emitters=[];
  for(let ty=0;ty<2;ty++)for(let tx=0;tx<2;tx++){const idx=i=>(Math.floor(i/m.W)+ty*m.H)*W+i%m.W+tx*m.W;for(let i=0;i<m.W*m.H;i++){floor[idx(i)]=m.floor[i];if(dam)dam[idx(i)]=m.dam[i];}for(const e of m.emitters)emitters.push({...e,cells:e.cells.map(idx),depthLimit:e.depthLimit?{...e.depthLimit,anchor:idx(e.depthLimit.anchor)}:undefined});}
  const row={id:`stress-${theme}-512`,size:512,source:source.row};writeFileSync(resolve(dir,row.id+'.bin'),serialize({model:{W,H,floor,dam,emitters},row}));
 }
 json('corpus.json',{fingerprint,total:cases.length,official:19,stress512:3,cases:cases.map(c=>JSON.parse(readFileSync(resolve(dir,c.id+'.json'))))});console.log('Corpus complete');
}
