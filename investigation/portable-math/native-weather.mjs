// Original forcing/prefill and scalar WaterSim oracle, for before/after state changes.
import {readFileSync,writeFileSync,readdirSync,mkdirSync,existsSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {deserialize,serialize} from 'node:v8';
import {deps,HERE,LOCAL,hash,json} from './common.mjs';
import {host} from './host.mjs';
const build=await deps('esbuild').build({bundle:true,format:'esm',platform:'browser',target:'es2022',nodePaths:[resolve(dirname(deps.resolve('fflate/package.json')),'..')],entryPoints:[resolve(HERE,'weather-coordinator.ts')],outfile:resolve(LOCAL,'native-weather.js'),metafile:true});
const inputs=Object.fromEntries(Object.keys(build.metafile.inputs).map(f=>[f,hash(readFileSync(resolve(f)))])),fingerprint=hash(JSON.stringify(inputs));
const directory=resolve(LOCAL,'native-weather');mkdirSync(directory,{recursive:true});
const cases=[];
for(const name of readdirSync(resolve(LOCAL,'generation')).filter(n=>/^m9b-(riverValley|lakeBasin|islands)-(96|128|256)-1\.bin$/.test(n))){
 const input=deserialize(readFileSync(resolve(LOCAL,'generation',name)));
 for(const difficulty of ['easy','normal','hard'])cases.push({id:name.slice(0,-4)+'-'+difficulty,model:input.model,inputProvenance:input.provenance,difficulty});
}
if(cases.length!==27)throw Error('Need all 27 original Weather scenarios');
const server=await host(),browsers=[],engines={},summary={total:27,complete:0,errors:[],fingerprint,engines:{}};
try{
 for(const name of ['chromium','firefox','webkit']){const b=await deps('playwright')[name].launch({headless:true});browsers.push(b);engines[name]=b;summary.engines[name]={version:b.version()};}
 for(const c of cases){const path=resolve(directory,c.id+'.json'),inputHash=hash(serialize(c));let row;
  if(existsSync(path)){const old=JSON.parse(readFileSync(path));if(old.fingerprint===fingerprint&&old.inputHash===inputHash&&JSON.stringify(old.engines)===JSON.stringify(summary.engines))row=old;}
  if(!row){row={id:c.id,inputHash,fingerprint,engines:summary.engines,results:[]};
   await Promise.all(Object.entries(engines).map(async([name,b])=>{const p=await b.newPage();try{
    await p.goto(server.url,{waitUntil:'domcontentloaded',timeout:120000});
    let timer;const r=await Promise.race([p.evaluate(c=>window.job('native-weather.js',{...c,threads:1}),c),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(c.id+' '+name+' timed out')),1200000);})]).finally(()=>clearTimeout(timer));
    if(r.error||r.threads!==1)throw Error(c.id+' '+name+': '+(r.error??'unexpected helper'));
    row.results.push({engine:name,hash:r.hash,ticks:r.ticks,volume:r.volume,result:r.result,rows:r.rows,checks:r.checks,directChecks:r.directChecks});
   }finally{await p.close();}}));
   row.results.sort((a,b)=>a.engine<b.engine?-1:1);writeFileSync(path,JSON.stringify(row)+'\n');
  }
  summary.complete++;json('native-weather-progress.json',summary);console.log('NATIVE-WEATHER '+summary.complete+'/27 '+c.id);
 }
}catch(e){summary.errors.push(String(e));throw e;}finally{await Promise.all(browsers.map(b=>b.close()));server.close();json('native-weather-summary.json',summary);}
if(summary.complete!==27||summary.errors.length)process.exitCode=1;
