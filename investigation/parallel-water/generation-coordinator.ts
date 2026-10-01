// `reference-api` is bundled separately so virtual product-water substitution cannot touch it.
// @ts-ignore harness-only module supplied by build-generation.mjs
import * as reference from 'reference-api';
import * as candidate from './api';
import {installParallelWater} from './runtime';
const hex=(a:ArrayBuffer)=>Array.from(new Uint8Array(a)).map(n=>n.toString(16).padStart(2,'0')).join('');
async function digest(g:any) {
  const state={spec:g.spec,features:g.features,field:g.field,report:g.report,attempts:g.attempts,failures:g.failures,intentions:g.intentions,outcomes:g.outcomes,name:g.name,description:g.description,
    heights:Array.from(g.built.heights),water:Array.from(g.built.water),contamination:Array.from(g.built.contamination),settle:{...g.built.settle,depth:Array.from(g.built.settle.depth),contamination:Array.from(g.built.settle.contamination),sat:Array.from(g.built.settle.sat),out:Array.from(g.built.settle.out??[])}};
  return hex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(state))));
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
    const a=await digest(baseline),b=await digest(generated);if(a!==b)throw Error('generation state differs');
    postMessage({id:data.id,requested:data.threads,threads:pool.threads,hash:b,passed:generated.report.passed,bytes:generated.bytes.length,startupMs,baseline:baseline.timings,candidate:generated.timings,rows:[]});
  }catch(e){postMessage({id:data.id,error:String(e)});}
  finally{pool?.close();}
};
