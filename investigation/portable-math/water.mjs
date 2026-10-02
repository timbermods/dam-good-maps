import {readFileSync,writeFileSync,readdirSync,mkdirSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {deserialize,serialize} from 'node:v8';
import os from 'node:os';
import {deps,ROOT,LOCAL,hash,json} from './common.mjs';
import {host} from './host.mjs';
const weather=process.argv.includes('--weather'),forced=process.argv.includes('--forced'),smoke=process.argv.includes('--smoke'),resume=process.argv.includes('--resume'),reuse=process.argv.includes('--reuse')&&!weather;
const officialOnly=process.argv.includes('--official'),mapsOnly=process.argv.includes('--maps'),available=process.argv.includes('--available');
const sizeFilter=process.env.DGM_SIZE?Number(process.env.DGM_SIZE):null;if(sizeFilter!==null&&![96,128,256].includes(sizeFilter))throw Error('Invalid size shard');
const counts=(process.env.DGM_COUNTS??'1,2,3,4,7,8,16').split(',').map(Number),mode=officialOnly?'official':mapsOnly?'map-water':weather?'weather':forced?'forced':smoke?'water-smoke':'water';
if(counts.some(n=>!Number.isInteger(n)||n<1)||!counts.includes(1))throw Error('Counts must include scalar 1');
const cases=[],fixtures=JSON.parse(deps('fflate').strFromU8(deps('fflate').gunzipSync(readFileSync(resolve(ROOT,'tests/golden/water.json.gz'))))).fixtures;
if(!weather&&!officialOnly&&!mapsOnly)for(const f of fixtures)for(const rules of ['game','port'])cases.push({id:'golden-'+f.name+'-'+rules,model:{W:f.W,H:f.H,floor:Float64Array.from(f.floor),dam:f.dam?Float64Array.from(f.dam):null,emitters:structuredClone(f.emitters)},rules,initial:{depth:new Float64Array(f.W*f.H),contamination:new Float64Array(f.W*f.H)},tickLimit:975,everyTick:true,forceParallel:forced});
if(!forced&&!smoke&&!weather&&!mapsOnly){
  if(!process.env.DGM_INPUTS)throw Error('DGM_INPUTS must name archived official inputs');
  const names=readdirSync(process.env.DGM_INPUTS).filter(n=>n.startsWith('official-')&&n.endsWith('.bin'));if(names.length!==19)throw Error('Expected exactly 19 official maps');
  for(const name of names){const b=readFileSync(resolve(process.env.DGM_INPUTS,name));cases.push({id:name.slice(0,-4),model:deserialize(b).model,inputProvenance:{archiveHash:hash(b)}});}
}
if(!forced&&!officialOnly){
  const dir=resolve(LOCAL,smoke?'generation-smoke':'generation');
  const names=readdirSync(dir).filter(n=>n.endsWith('.bin')&&(!sizeFilter||n.includes('-'+sizeFilter+'-')));
  if(!smoke&&!weather&&!available&&names.length!==(sizeFilter?280:840))throw Error('Need all 840 regenerated portable models, got '+names.length);
  for(const name of names){
    if(weather&&!/^m9b-(riverValley|lakeBasin|islands)-(96|128|256)-1\.bin$/.test(name))continue;
    const input=deserialize(readFileSync(resolve(dir,name))),c={id:name.slice(0,-4),model:input.model,inputProvenance:input.provenance};
    if(weather)for(const difficulty of ['easy','normal','hard'])cases.push({...c,id:c.id+'-'+difficulty,difficulty});else cases.push(c);
  }
  if(weather&&cases.length!==(sizeFilter?9:27))throw Error('Weather requires nine regenerated models at all three difficulties');
}
const directory=resolve(LOCAL,mode);mkdirSync(directory,{recursive:true});
const fingerprint=hash(readFileSync(resolve(LOCAL,'build.json'))),summary={mode,partial:available,sizeShard:sizeFilter,fingerprint,counts,total:cases.length,complete:0,engines:{},mismatches:[],errors:[],checks:0,directChecks:0,dispatched:0,comparisons:0};
const server=await host(),browsers=[],engines={};let reusedPages=null,reusedCases=0;
async function retire(){if(reusedPages)await Promise.all(Object.values(reusedPages).map(p=>p.close()));reusedPages=null;reusedCases=0;}
try{
  for(const name of ['chromium','firefox','webkit']){const b=await deps('playwright')[name].launch({headless:true});browsers.push(b);engines[name]=b;summary.engines[name]={version:b.version()};}
  for(const c of cases){const path=resolve(directory,c.id+'.json'),inputHash=hash(serialize(c));let row;
    if(resume&&existsSync(path)){const old=JSON.parse(readFileSync(path));if(old.fingerprint===fingerprint&&old.inputHash===inputHash&&JSON.stringify(old.engines)===JSON.stringify(summary.engines)&&JSON.stringify(old.counts)===JSON.stringify(counts))row=old;}
    if(!row){row={id:c.id,inputHash,fingerprint,engines:summary.engines,counts,results:[]};
      if(reuse&&reusedCases>=20)await retire();
      const pages=reusedPages??{};
      try{
      for(const [name,b]of Object.entries(engines))if(!pages[name]){const page=await b.newPage();pages[name]=page;await page.goto(server.url,{waitUntil:'domcontentloaded',timeout:120000});}
      if(reuse)reusedPages=pages;
      for(const threads of counts){const names=Object.keys(pages),width=Math.max(1,Math.floor(os.cpus().length/threads));
        for(let first=0;first<names.length;first+=width)await Promise.all(names.slice(first,first+width).map(async name=>{
          let timer;const result=await Promise.race([pages[name].evaluate(({c,threads,weather,reuse})=>(reuse?window.reusedJob:window.job)(weather?'weather-coordinator.js':'coordinator.js',{...c,threads,parallelOnly:threads!==1&&!c.tickLimit}),{c,threads,weather,reuse}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(c.id+' '+name+' '+threads+' timed out')),600000);})]).finally(()=>clearTimeout(timer));
          if(result.error)throw Error(c.id+' '+name+' '+threads+': '+result.error);if(result.threads!==threads)throw Error('Unexpected fallback '+c.id+' '+name+' '+threads);
          row.results.push({engine:name,threads,hash:result.hash,ticks:result.ticks,volume:result.volume,result:result.result,rows:result.rows,checks:result.checks,directChecks:result.directChecks??(threads===1?result.checks:0),dispatch:result.dispatch});
        }));
      }
      writeFileSync(path,JSON.stringify(row)+'\n');
      }finally{if(reuse)reusedCases++;else await Promise.all(Object.values(pages).map(p=>p.close()));}
    }
    const identity=r=>JSON.stringify({hash:r.hash,ticks:r.ticks,volume:r.volume,result:r.result,rows:r.rows}),ref=identity(row.results[0]);
    for(const r of row.results){if(identity(r)!==ref)summary.mismatches.push({id:c.id,engine:r.engine,threads:r.threads});summary.checks+=r.checks;summary.directChecks+=r.directChecks;summary.dispatched+=r.dispatch?.parallel??0;summary.comparisons++;}
    summary.complete++;json(mode+'-progress.json',summary);console.log(`${mode.toUpperCase()} ${summary.complete}/${summary.total} ${c.id} mismatches=${summary.mismatches.length}`);
  }
}catch(e){summary.errors.push(String(e));throw e;}finally{await retire();await Promise.all(browsers.map(b=>b.close()));server.close();json(mode+'-summary.json',summary);}
if(summary.complete!==summary.total||summary.mismatches.length||summary.errors.length)process.exitCode=1;
