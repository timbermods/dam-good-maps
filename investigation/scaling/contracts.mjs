import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {build} from 'esbuild';
import {adopt,dir,root} from './proposal.mjs';
const entry=`
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {MapSession} from '../../src/core/doc/session';
import {checkSchema} from '../../src/core/spec/schema';
import ops from '../../src/core/doc/ops.schema.json';
import features from '../../src/core/features/features.schema.json';
const phase=process.argv[2],rows=[];
for(const size of ['128x128','256x256','512x512','128x512','512x256','64x512']){
 const [W,H]=size.split('x').map(Number),s=MapSession.importMap(readFileSync('investigation/scaling/local/probe/sizes-'+size+'.timber'),size+'.timber');s.setWaterMode('defer');
 const before=s.exportTimber().bytes;
 const cases=[['corner',{op:'sculpt',params:{mode:'raise',cells:[[H-1,W-1,W-1]],amount:1,exact:true}}],['whole-map',{op:'sculpt',params:{mode:'raise',cells:Array.from({length:H},(_,y)=>[y,0,W-1]),amount:1,exact:true}}],['large-brush',{op:'brush',params:{tool:'raise',size:Math.max(W,H)/2,strength:1,dabs:[4*(W-2),4*(H-2)]}}],['force-result',{op:'forceResult',params:{version:1,verb:'craterize',settings:{mode:'strike',power:100,seed:4242,walls:'steep',centre:'auto',debris:'light',rays:false,size:null},where:{origin:[W-2,H-2]},steps:1,reason:'contract',tiles:[W*H-1],heights:[11],removed:[]}}]];
 for(const [name,op] of cases){const old=Uint8Array.from(s.built.heights);const result=s.apply(op);const expected=phase==='after'||(W<=256&&H<=256);assert.equal(result.ok,expected,size+' '+name+' '+JSON.stringify(result));if(result.ok){
   const h=s.built.heights;
   if(name==='whole-map')for(let i=0;i<old.length;i++)assert.equal(h[i],Math.min(22,old[i]+1),size+' tile '+i);
   if(name==='corner')assert.equal(h[W*H-1],Math.min(22,old[W*H-1]+1),size+' far corner');
   if(name==='force-result')assert.equal(h[W*H-1],11,size+' far force tile');
   if(name==='large-brush')assert(h.some((v,i)=>v!==old[i]),size+' brush changes ground');
   s.undo();assert.deepEqual(s.exportTimber().bytes,before,size+' '+name+' undo export');}rows.push({size,name,ok:result.ok,errors:result.errors});}
 const out=s.apply({op:'sculpt',params:{mode:'raise',cells:[[H,0,0]],amount:1,exact:true}});assert.equal(out.ok,false);
 // A fresh session gives both variants the same accepted history and operation IDs.
 const golden=MapSession.importMap(readFileSync('investigation/scaling/local/probe/sizes-'+size+'.timber'),size+'.timber');golden.setWaterMode('defer');
 for(let n=0;n<8;n++)assert(golden.apply({op:'sculpt',params:{mode:'raise',cells:[[10+n,10,11]],amount:1,exact:true}}).ok);
 golden.settleCanonical();const hash=b=>createHash('sha256').update(b).digest('hex');rows.push({size,name:'edited-goldens',project:hash(golden.project()),timber:hash(golden.exportTimber().bytes)});
}
assert.equal(ops.$defs.brush.properties.pressure.items.maximum,255);
assert.equal(ops.$defs.forceResult.properties.heights.items.maximum,255);
const forest={id:'f-aaaaaaaaaaaaa',kind:'forest',origin:'user',locked:false,params:{area:[[511,511,511]],density:0,speciesMix:{Pine:1},life:'alive',youngShare:0}};
assert.equal(checkSchema(features,[forest]).length===0,phase==='after');
console.log(JSON.stringify({phase,rows}));
`;
const input=resolve(dir,'local/contracts.ts');writeFileSync(input,entry.replaceAll("'../../src/","'../../../src/"));
for(const phase of ['before','after']){
 await build({entryPoints:[input],bundle:true,platform:'node',format:'esm',target:'node24',outfile:resolve(dir,'local/contracts-'+phase+'.mjs'),plugins:[{name:'overlay',setup(b){b.onLoad({filter:/\.(ts|json)$/},args=>{const file=args.path.replaceAll('\\','/').slice(root.replaceAll('\\','/').length+1),code=readFileSync(args.path,'utf8');return {contents:phase==='after'?adopt(file,code):code,loader:args.path.endsWith('.json')?'json':'ts'};});}}]});
}
