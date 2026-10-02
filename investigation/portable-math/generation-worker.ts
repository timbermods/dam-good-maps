// Two separately compiled copies: no portable overlay can touch the baseline.
// @ts-ignore virtual external browser module
import * as baseline from 'baseline-api';
// @ts-ignore virtual external browser module
import * as adopted from 'adopted-api';
const enc=new TextEncoder();
const hex=(b:Uint8Array)=>Array.from(b,n=>n.toString(16).padStart(2,'0')).join('');
const sha=async(b:Uint8Array)=>hex(new Uint8Array(await crypto.subtle.digest('SHA-256',b as BufferSource)));
function numeric(a:ArrayLike<number>){const b=new Uint8Array(a.length*8),d=new DataView(b.buffer);for(let i=0;i<a.length;i++)d.setFloat64(i*8,a[i],true);return hex(b);}
// Preserve property/array/Map/Set order, binary64 bits and signed zero. Never round numbers.
function exact(x:any):any{
  if(typeof x==='number')return {f64:numeric([x])};
  if(x===undefined)return {undefined:true};
  if(x===null||typeof x!=='object')return x;
  if(ArrayBuffer.isView(x))return {type:x.constructor.name,values:numeric(x as any)};
  if(x instanceof Map)return {map:Array.from(x,([k,v])=>[exact(k),exact(v)])};
  if(x instanceof Set)return {set:Array.from(x,exact)};
  if(Array.isArray(x))return x.map(exact);
  return Object.fromEntries(Object.entries(x).map(([k,v])=>[k,exact(v)]));
}
async function digest(g:any){
  const components:Record<string,string>={};
  for(const [key,v]of Object.entries(g)){
    if(key==='timings')continue;
    const value=key==='failures'?(v as any[]).map(({ms,...rest})=>rest):v;
    components[key]=await sha(key==='bytes'?v as Uint8Array:enc.encode(JSON.stringify(exact(value))));
  }
  return {hash:await sha(enc.encode(JSON.stringify(components))),components,passed:g.report.passed,ticks:g.built.settle.ticks,attempts:g.attempts,byteLength:g.bytes.length};
}
onmessage=async({data})=>{
  try{
    const spec=adopted.makeSpec({seed:data.seed,theme:data.theme,size:{x:data.size,y:data.size}});
    const start=performance.now();
    const current=data.baseline===false?null:await digest(baseline.generate(structuredClone(spec)));
    // Trap dependency escapes too, including fflate's otherwise-native memory heuristic.
    for(const name of ['sin','cos','tan','asin','acos','atan','atan2','exp','expm1','log','log2','log10','log1p','pow','hypot','sqrt','cbrt','sinh','cosh','tanh','asinh','acosh','atanh'])
      (Math as any)[name]=()=>{throw Error('Native '+name+' reached portable generation');};
    const result=adopted.generate(structuredClone(spec)),candidate=await digest(result);
    postMessage({id:data.id,baseline:current,adopted:candidate,ms:performance.now()-start,...(data.model?{model:result.built.waterModel}:{} )});
  }catch(e){postMessage({id:data.id,error:String(e)});}
};
