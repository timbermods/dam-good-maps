import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {gunzipSync} from 'node:zlib';
import {cpus} from 'node:os';
import {LOCAL,deps,json,arg} from './common.mjs';
import {exact,unpack} from './codec.mjs';
import {frames,argsOf,higher} from './replay.mjs';
import {loadSampler} from './load.mjs';
const api=deps(resolve(LOCAL,'api.cjs')),bridge=deps(resolve(LOCAL,'native-bridge.cjs'));bridge.installNativeAnalysis(deps(resolve(LOCAL,'analysis.node')));
const names=Object.fromEntries(Object.entries(bridge.OPS).map(([k,v])=>[v,k])),sampler=loadSampler();const rows=[];const reps=Number(arg('reps','3'));
const hook={enter(){},leave(){},replace:(name,args)=>bridge.replace(name,args)};
try{for(const size of [96,128,256])for(const theme of api.AVAILABLE_THEMES){const id=`m9b-${theme}-${size}-1`;const get=s=>{const path=resolve(LOCAL,'cases',id+s);return existsSync(path+'.gz')?gunzipSync(readFileSync(path+'.gz')):readFileSync(path)};
 const input=frames(get('.in'));if(existsSync(resolve(LOCAL,'cases',id+'.room.in.gz')))input.push(...frames(get('.room.in')));
 const picked=new Map();for(let i=0;i<input.length;i++){const op=input[i][0];if(!picked.has(op)||input[i].length>input[picked.get(op)].length)picked.set(op,i);}
 sampler.reset();const kernelTimes=[],analyses=[];
 for(const[op,i]of picked){const name=names[op],args=argsOf(input[i]);globalThis.__ra=null;api[name](...args);bridge.invoke(name,args);const before=[],after=[];for(let rep=0;rep<reps;rep++){let t=performance.now();const reference=api[name](...args);before.push(performance.now()-t);t=performance.now();const actual=bridge.invoke(name,args);after.push(performance.now()-t);if(exact(actual)!==exact(reference))throw Error(name+' timed bytes');}kernelTimes.push({name,before,after});}
 const payload=unpack(JSON.parse(get('.json')));for(const[name,fn,args]of [['checks',api.validateMap,payload.fileBytes?[api.readTimber(payload.fileBytes),payload.opts]:null],['measures',api.measure,[payload.measurable]],['outcomes',api.outcomesOf,[payload.outcomeInput]]]){if(!args)continue;const before=[],after=[];for(let rep=0;rep<reps;rep++){globalThis.__ra=null;let t=performance.now();const b=fn(...args);before.push(performance.now()-t);globalThis.__ra=hook;t=performance.now();const a=fn(...args);after.push(performance.now()-t);globalThis.__ra=null;if(exact(a)!==exact(b))throw Error(name+' timed identity');}analyses.push({name,before,after});}
 rows.push({id,kernelTimes,analyses,load:sampler.summary()});json('native-cases.json',{machine:cpus()[0].model,rows});console.log('native timings',id);
}}finally{sampler.stop();}
