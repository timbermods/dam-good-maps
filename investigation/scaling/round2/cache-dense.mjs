import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {dir} from './overlay.mjs';
import {FileResults} from './node-store.mjs';
const L=await import(pathToFileURL(resolve(dir,'../local/round2/after.mjs')).href),side=Number(process.argv[2]??512),N=side*side,count=Number(process.env.SCALING_R2_DENSE??1024),cold=new FileResults(resolve(dir,`../local/round2/dense-${side}.cache`)),store=new L.ResultStore(cold),refs=[],samples=[];
async function sample(n){await new Promise(r=>setImmediate(r));global.gc?.();await new Promise(r=>setImmediate(r));global.gc?.();samples.push({n,memory:process.memoryUsage(),cache:store.stats,metadata:L.retainedBytes(refs),disk:cold.end});console.log(side,n,samples.at(-1));}
try{await sample(0);for(let i=1;i<=count;i++){
 const params={verb:'craterize',settings:{...L.CRATER_DEFAULTS,power:100,size:48,seed:i},where:{origin:[0,0]},cut:null,steps:1,reason:'done',tiles:Array.from({length:N},(_,j)=>j),heights:Array(N).fill(10+i%2),removed:[]};
 refs.push(store.keep(i,params));if([64,256,512,1024].includes(i)||i===count)await sample(i);
}
store.clearHot();for(const i of [0,Math.floor(count/2),count-1]){assert.equal(refs[i].tiles.length,N);assert.equal(refs[i].tiles[N-1],N-1);assert.equal(refs[i].heights[N-1],10+(i+1)%2);}
assert(store.stats.bytes<=store.budget);writeFileSync(resolve(dir,`../local/round2/dense-${side}.json`),JSON.stringify({side,count,samples,readback:true,scope:'result cache only; valid dense vectors, not simulated UI forces'},null,2));
}finally{cold.close();}
