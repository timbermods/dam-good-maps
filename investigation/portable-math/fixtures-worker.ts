// @ts-ignore external baseline bundle
import * as before from 'fixtures-before-api';
// @ts-ignore external adoption bundle
import * as after from 'fixtures-after-api';
const exact=(x:any):any=>{if(typeof x==='number'){const d=new DataView(new ArrayBuffer(8));d.setFloat64(0,x,true);return {f64:d.getBigUint64(0,true).toString(16).padStart(16,'0')};}if(ArrayBuffer.isView(x))return {type:x.constructor.name,bytes:Array.from(new Uint8Array(x.buffer,x.byteOffset,x.byteLength),v=>v.toString(16).padStart(2,'0')).join('')};if(x instanceof Map)return {map:Array.from(x,([k,v])=>[exact(k),exact(v)])};if(x instanceof Set)return {set:Array.from(x,exact)};if(Array.isArray(x))return x.map(exact);if(x&&typeof x==='object')return Object.fromEntries(Object.entries(x).map(([k,v])=>[k,exact(v)]));return x;};
async function digest(value:any){const components:any={};for(const [k,v]of Object.entries(value)){const bytes=k==='export'?v as Uint8Array:new TextEncoder().encode(JSON.stringify(exact(v)));components[k]=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes as BufferSource)),n=>n.toString(16).padStart(2,'0')).join('');}return {components,hash:Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(components)))),n=>n.toString(16).padStart(2,'0')).join('')};}
function run(api:any,data:any){
 if(data.kind==='official'){
  const file=api.readTimber(data.bytes),surface=api.surfaceOf(file.world),model=api.waterModelFromWorld(file.world,surface),water=api.canonicalSettle(model);
  const validation=api.validateMap(file,{profile:'import',external:true,water:{model,settled:water}}),resources=api.measureResources(api.groundOfFile(file));
  return {model,water,validation,resources,export:api.writeTimber(file)};
 }
 const f=data.fixture,model={W:f.W,H:f.H,floor:Float64Array.from(f.floor),dam:f.dam?Float64Array.from(f.dam):null,emitters:structuredClone(f.emitters)},opts={rules:data.rules};
 const sim=new api.WaterSim(model,undefined,opts),snapshots=[];
 for(const s of f.snapshots){sim.run(s.ticks-sim.ticks);snapshots.push({ticks:sim.ticks,depth:sim.D.slice(),contamination:sim.C.slice(),out:sim.out.slice(),sat:sim.saturation(),seepOn:sim.seepOn.slice()});}
 const heights=Uint8Array.from(f.floor),canonical=api.canonicalSettle(model,opts),moisture=api.moisture(heights,sim.D,sim.C,f.W,f.H),soil=api.soilContamination(heights,sim.D,sim.C,f.W,f.H),prefill=api.prefill(model),drought=api.droughtStorage(model,canonical.depth,9);
 const error=(a:ArrayLike<number>,b:ArrayLike<number>)=>Math.max(0,...Array.from(a,(x,i)=>Math.abs(x-b[i])));
 const goldenErrors=data.rules==='game'?{snapshots:Math.max(...snapshots.map((s,i)=>Math.max(error(s.depth,f.snapshots[i].depth),error(s.contamination,f.snapshots[i].contamination)))),moisture:error(moisture,f.moisture),soil:error(soil,f.soilContamination),prefill:Math.max(error(prefill.depth,f.prefill.depth),error(prefill.contamination,f.prefill.contamination)),canonical:error(canonical.depth,f.canonical.depth),drought:error(drought,f.drought9)}:null;
 if(goldenErrors&&(goldenErrors.snapshots>=1e-6||goldenErrors.moisture>=1e-6||goldenErrors.soil>=1e-6||goldenErrors.prefill!==0||goldenErrors.canonical>=1e-6||goldenErrors.drought>=1e-9))throw Error('Archived golden contract differs '+JSON.stringify(goldenErrors));
 return {snapshots,moisture,soil,prefill,canonical,drought,goldenErrors};
}
onmessage=async({data})=>{try{const baseline=await digest(run(before,structuredClone(data)));for(const name of ['sin','cos','tan','asin','acos','atan','atan2','exp','expm1','log','log2','log10','log1p','pow','hypot','sqrt','cbrt','sinh','cosh','tanh','asinh','acosh','atanh'])(Math as any)[name]=()=>{throw Error('Native '+name+' reached fixtures');};postMessage({baseline,adopted:await digest(run(after,structuredClone(data)))});}catch(e){postMessage({error:String(e)});}};
