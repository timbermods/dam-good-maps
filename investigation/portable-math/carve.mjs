import {resolve,dirname} from 'node:path';
import {readFileSync} from 'node:fs';
import {deps,HERE,LOCAL,json,hash} from './common.mjs';
import {adoptionPlugin} from './transform.mjs';
import {host} from './host.mjs';
const actual=process.argv.includes('--actual');
const build=deps('esbuild').build,base={bundle:true,format:'esm',platform:'browser',target:'es2022',nodePaths:[resolve(dirname(deps.resolve('fflate/package.json')),'..')]};
for(const mode of['baseline','adopted'])await build({...base,entryPoints:[resolve(HERE,'carve-api.ts')],outfile:resolve(LOCAL,mode+'-carve-api.js'),plugins:mode==='adopted'&&!actual?[adoptionPlugin()]:[]});
await build({...base,entryPoints:[resolve(HERE,'carve-worker.ts')],outfile:resolve(LOCAL,'carve-worker.js'),plugins:[{name:'apis',setup(b){b.onResolve({filter:/^(baseline|adopted)-carve-api$/},a=>({path:'./'+a.path+'.js',external:true}));}}]});
const fingerprint=hash(readFileSync(resolve(LOCAL,'adopted-carve-api.js'))),summary={fingerprint,total:54,complete:0,engines:{},mismatches:[],changes:{}};
const server=await host(),browsers=[],pages={},rows=[];
try{
  for(const name of['chromium','firefox','webkit']){const b=await deps('playwright')[name].launch({headless:true});browsers.push(b);pages[name]=await b.newPage();pages[name].setDefaultTimeout(900000);await pages[name].goto(server.url);summary.engines[name]={version:b.version()};}
  for(const size of[128,256])for(const power of[10,55,100])for(const width of[null,3,12])for(const mode of[0,1,2]){
    const c={id:`carve-${size}-${power}-${width}-${mode}`,size,power,width,mode},results={};
    await Promise.all(Object.entries(pages).map(async([name,p])=>{const r=await p.evaluate(c=>window.job('carve-worker.js',c),c);if(r.error)throw Error(r.error);results[name]=r;}));
    const ref=results.chromium.adopted;for(const[name,r]of Object.entries(results)){if(r.adopted.hash!==ref.hash)summary.mismatches.push({id:c.id,engine:name});for(const k of Object.keys(ref.components))if(r.baseline.components[k]!==r.adopted.components[k]){summary.changes[name]??={};summary.changes[name][k]=(summary.changes[name][k]??0)+1;}}
    rows.push({id:c.id,results});summary.complete++;json('carve-progress.json',summary);if(summary.complete%10===0)console.log('M9b CARVE',summary.complete+'/54');
  }
}finally{await Promise.all(browsers.map(b=>b.close()));server.close();json('carve-summary.json',summary);json('carve-manifest.json',rows);}
if(summary.complete!==54||summary.mismatches.length)process.exitCode=1;
console.log('M9b Carve',summary.complete,'mismatches',summary.mismatches.length,'changes',JSON.stringify(summary.changes));
