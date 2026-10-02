// `reference-api` is bundled separately so virtual product-water substitution cannot touch it.
// @ts-ignore harness-only module supplied by build-generation.mjs
import * as reference from 'reference-api';
import * as candidate from './api';
import {installParallelWater} from './runtime';
const hex=(a:ArrayBuffer)=>Array.from(new Uint8Array(a)).map(n=>n.toString(16).padStart(2,'0')).join('');
function stateOf(g:any) {
  return {spec:g.spec,features:g.features,field:g.field,report:g.report,attempts:g.attempts,failures:g.failures.map(({ms,...failure}:any)=>failure),intentions:g.intentions,outcomes:g.outcomes,name:g.name,description:g.description,
    heights:Array.from(g.built.heights),water:Array.from(g.built.water),contamination:Array.from(g.built.contamination),settle:{...g.built.settle,depth:Array.from(g.built.settle.depth),contamination:Array.from(g.built.settle.contamination),sat:Array.from(g.built.settle.sat),out:Array.from(g.built.settle.out??[])}};
}
async function digest(g:any) {
  return hex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(stateOf(g)))));
}
function differences(a:any,b:any,path='state',found:string[]=[]):string[] {
  if(found.length>=10||Object.is(a,b))return found;
  if(a&&b&&typeof a==='object'&&typeof b==='object'){
    for(const key of new Set([...Object.keys(a),...Object.keys(b)]))differences(a[key],b[key],path+'.'+key,found);
  }else found.push(path+': '+String(a)+' -> '+String(b));
  return found;
}
async function waterDigest(g:any){
  const s=g.built.settle,arrays=[g.built.water,g.built.contamination,s.depth,s.contamination,s.sat,s.out??new Float64Array(0)];
  const meta=new TextEncoder().encode(JSON.stringify({W:g.built.W,H:g.built.H,settled:s.settled,ticks:s.ticks}));
  const bytes=new Uint8Array(meta.length+arrays.reduce((n,a)=>n+a.byteLength,0));bytes.set(meta);let offset=meta.length;
  for(const a of arrays){bytes.set(new Uint8Array(a.buffer,a.byteOffset,a.byteLength),offset);offset+=a.byteLength;}
  return hex(await crypto.subtle.digest('SHA-256',bytes));
}
onmessage=async({data})=>{
  let pool:any;
  try {
    const spec=reference.makeSpec({seed:data.seed??1,theme:data.theme,size:{x:data.size,y:data.size}});
    const baseline=reference.generate(structuredClone(spec));
    const start=performance.now();
    pool=await installParallelWater(data.threads,new URL('./runtime-helper.js',location.href));
    const startupMs=performance.now()-start;
    const generated=candidate.generate(structuredClone(spec));
    if(baseline.bytes.length!==generated.bytes.length)throw Error('export byte length differs');
    for(let i=0;i<baseline.bytes.length;i++)if(baseline.bytes[i]!==generated.bytes[i])throw Error('export byte differs at '+i);
    const a=await digest(baseline),b=await digest(generated);if(a!==b)throw Error('generation state differs: '+JSON.stringify(differences(stateOf(baseline),stateOf(generated))));
    const waterHash=await waterDigest(generated);
    if(await waterDigest(baseline)!==waterHash)throw Error('generation water/flow bytes differ');
    postMessage({id:data.id,requested:data.threads,threads:pool.threads,hash:b,waterHash,exportHash:hex(await crypto.subtle.digest('SHA-256',Uint8Array.from(generated.bytes))),ticks:generated.built.settle.ticks,settled:generated.built.settle.settled,passed:generated.report.passed,bytes:generated.bytes.length,startupMs,baseline:baseline.timings,candidate:generated.timings,rows:[]});
  }catch(e){postMessage({id:data.id,error:String(e)});}
  finally{pool?.close();}
};
