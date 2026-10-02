// Check the diagnostic verifier against the exact cold protocol, including IEEE edges.
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import vm from 'node:vm';
import {HERE,LOCAL,deps,json,hash} from './common.mjs';
const api=deps(resolve(LOCAL,'api.cjs')),source=readFileSync(resolve(HERE,'suite-adapter.ts'),'utf8');
const part=source.slice(source.indexOf('function encodedSame'),source.indexOf('const same='));
const code=deps('esbuild').transformSync(part,{loader:'ts'}).code;
const context=vm.createContext({api,Buffer,ArrayBuffer,Uint8Array,Object,Number});vm.runInContext(code,context);
const eq=(a,b)=>context.identical(a,b),bytes=(a,b)=>Buffer.from(api.encode(a)).equals(Buffer.from(api.encode(b)));
let comparisons=0;const verify=(a,b)=>{if(eq(a,b)!==bytes(a,b))throw Error('Verifier diverged from exact protocol');comparisons++;};
const makeNan=bits=>new Float64Array(new BigUint64Array([bits]).buffer)[0];
const values=[null,false,true,0,-0,1,-1,0.1,Infinity,-Infinity,makeNan(0x7ff8000000000000n),makeNan(0xfff8000000000000n),'','🌋',[0,-0,0.5],new Float64Array([0,-0,0.5]),{b:api.F(0.3),a:[2,3],unused:undefined},{a:[2,3],b:api.F(0.3)}];
for(const a of values)for(const b of values)verify(a,b);
for(let k=0;k<250;k++){const a={record:[k,new Float64Array([k/7,-0,k%2]),{id:'obj-'+k,components:{Strength:api.F(k/11)}}],extra:undefined},b=api.decode(api.encode(a));verify(a,b);b.record[1][1]=0;verify(a,b);b.record[0]+=1;verify(a,b);}
const wasm=readFileSync(resolve(LOCAL,'forces.wasm')),run=await api.bridge(wasm),q=api.job('quake',48,0);q.map=api.fixture('plain',48);q.settings={...api.QUAKE_DEFAULTS,mode:'lift',power:60,scarp:'sheer',seed:1};q.intent={side:1,path:[{x:25.2,y:25.4},{x:45.2,y:25.4}]};
const task=run.create(q);try{task.plan();const packed=api.decode(task.pack()),actual=api.typedResult(task,q,api.F);verify(actual,packed);for(let i=0;i<actual.fault.segments.length;i++)verify(actual.fault.segments[i],packed.fault.segments[i]);}finally{task.dispose();}
json('verifier.json',{status:'pass',comparisons,adapterSha256:hash(Buffer.from(source)),apiSha256:hash(readFileSync(resolve(LOCAL,'api.cjs'))),wasmSha256:hash(wasm)});
console.log(comparisons,'diagnostic verifier comparisons match exact protocol bytes');
