import {resolve} from 'node:path';
import {existsSync,readFileSync,writeFileSync,readdirSync,mkdirSync} from 'node:fs';
import {deserialize,serialize} from 'node:v8';
import os from 'node:os';
import {staticHost,openIsolated,job} from './host.mjs';
import {ROOT,LOCAL,deps,json,hash} from './common.mjs';
const bench=process.argv.includes('--bench'),weather=process.argv.includes('--weather'),forced=process.argv.includes('--forced'),slow=process.argv.includes('--slow');
if(slow&&!bench)throw Error('--slow requires --bench');
const fixtures=JSON.parse(deps('fflate').strFromU8(deps('fflate').gunzipSync(readFileSync(resolve(ROOT,'tests/golden/water.json.gz'))))).fixtures;
const cases=[];
if(!bench&&!weather)for(const f of fixtures)for(const rules of ['game','port'])cases.push({id:'golden-'+f.name+'-'+rules,model:{W:f.W,H:f.H,floor:Float64Array.from(f.floor),dam:f.dam?Float64Array.from(f.dam):null,emitters:structuredClone(f.emitters)},rules,initial:{depth:new Float64Array(f.W*f.H),contamination:new Float64Array(f.W*f.H)},tickLimit:forced?200:975,everyTick:true,forceParallel:forced});
if(!bench&&!weather&&!forced){
  const prior=process.env.DGM_INPUTS;if(!prior)throw Error('DGM_INPUTS must name water-speed archived official inputs');
  const official=readdirSync(prior).filter(n=>n.startsWith('official-')&&n.endsWith('.bin'));if(official.length!==19)throw Error('Expected all 19 official inputs');
  for(const file of official)cases.push({id:file.slice(0,-4),model:deserialize(readFileSync(resolve(prior,file))).model,provenance:'Archived official water model from water-speed'});
}
if(!forced)for(const size of [128,256])for(const theme of ['riverValley','lakeBasin','islands']) {
  const id=`m9b-${theme}-${size}-1`,latest=resolve(LOCAL,'m9b-inputs',id+'.bin'),input=deserialize(readFileSync(existsSync(latest)?latest:resolve(LOCAL,id+'.bin')));
  cases.push({id,model:input.model,weather,live:weather,benchmark:bench,provenance:input.provenance});
}
if(!forced)for(const theme of ['riverValley','lakeBasin','islands']) {
  const source=cases.find(c=>c.id===`m9b-${theme}-256-1`).model;
  const m={W:512,H:512,floor:new Float64Array(512*512),dam:source.dam?new Float64Array(512*512):null,emitters:[]};
  for(let y=0;y<512;y++)for(let x=0;x<512;x++){const i=y*512+x,j=(y%256)*256+x%256;m.floor[i]=source.floor[j];if(m.dam)m.dam[i]=source.dam[j];}
  for(let yy=0;yy<2;yy++)for(let xx=0;xx<2;xx++)for(const e of source.emitters)m.emitters.push({...structuredClone(e),cells:e.cells.map(i=>(Math.floor(i/256)+yy*256)*512+i%256+xx*256),...(e.depthLimit?{depthLimit:{...e.depthLimit,anchor:(Math.floor(e.depthLimit.anchor/256)+yy*256)*512+e.depthLimit.anchor%256+xx*256}}:{})});
  cases.push({id:`tiled-${theme}-512`,model:m,weather,live:weather,benchmark:bench,provenance:'Tiled water stress model; not generated/exported 512 map'});
}
if(slow){
  const matrix=JSON.parse(readFileSync(resolve(LOCAL,'batch-summary.json')));if(matrix.complete!==1050||matrix.errors.length||matrix.mismatches.length)throw Error('Select slow lake tails only after the complete seed proof');
  cases.splice(0);
  for(const size of[128,256]){
    const candidates=Array.from({length:size===128?100:50},(_,i)=>{const id=`m9b-lakeBasin-${size}-${i+1}`,proof=JSON.parse(readFileSync(resolve(LOCAL,'batch',id+'.json')));return{id,seed:i+1,ticks:proof.comparisons[0].ticks,result:proof.comparisons[0].result,proofHash:hash(readFileSync(resolve(LOCAL,'batch',id+'.json')))};}).sort((a,b)=>b.ticks-a.ticks||a.seed-b.seed);
    const selection=candidates[0],input=deserialize(readFileSync(resolve(LOCAL,'m9b-inputs',selection.id+'.bin')));
    cases.push({id:selection.id,model:input.model,benchmark:true,selection,provenance:input.provenance});
  }
  json('slow-selection.json',cases.map(c=>({id:c.id,selection:c.selection,provenance:c.provenance})));
}
if(process.env.DGM_FILTER)cases.splice(0,cases.length,...cases.filter(c=>new RegExp(process.env.DGM_FILTER).test(c.id)));
const mode=process.env.DGM_LABEL??(slow?'slow-benchmark':bench?'benchmark':weather?'weather':forced?'forced':'survey'),directory=resolve(LOCAL,mode);mkdirSync(directory,{recursive:true});
const worker=weather?'weather-coordinator.js':'coordinator.js';
const host=await staticHost(worker,!weather),build=hash(readFileSync(resolve(LOCAL,worker))+readFileSync(resolve(LOCAL,'helper.js')));
const evidence={mode,build,complete:0,total:cases.reduce((s,c)=>s+(bench&&c.model.W<512?3:1),0),engines:{},comparisons:[],crossEngine:[],errors:[]};
const browsers=[],contexts={};
try{
  for(const name of (process.env.DGM_ENGINE?[process.env.DGM_ENGINE]:['chromium','firefox','webkit'])){
    const browser=await deps('playwright')[name].launch({headless:true});browsers.push(browser);contexts[name]=await openIsolated(browser,host.url);evidence.engines[name]={version:browser.version(),counts:contexts[name].counts};
  }
  for(let rep=0;rep<(bench?3:1);rep++)for(const c of cases){
    if(bench&&c.model.W===512&&rep>0)continue;
    const file=resolve(directory,c.id+'-'+rep+'.json'),inputHash=hash(serialize(c));
    if((!bench||process.argv.includes('--resume'))&&existsSync(file)){const cached=JSON.parse(readFileSync(file));if(cached.build===build&&cached.inputHash===inputHash&&JSON.stringify(cached.engines)===JSON.stringify(evidence.engines)){evidence.comparisons.push(...cached.comparisons);evidence.complete++;continue;}}
    const row={id:c.id,rep,build,inputHash,engines:evidence.engines,comparisons:[]};let reference;
    async function check(engine,threads){
      const {page}=contexts[engine];
      const output=await job(page,{...c,rep},threads,false);if(output.error){evidence.errors.push({engine,...output});throw Error(output.error);}
      if(output.threads!==threads)throw Error('Unexpected scalar fallback');
      if(weather&&threads===1&&output.directChecks!==output.rows?.length)throw Error('Weather scalar oracle did not check every frame');
      const identity={hash:output.hash,ticks:output.ticks,result:output.result,rows:output.rows};
      if(!reference)reference=identity;else if(JSON.stringify(reference)!==JSON.stringify(identity))evidence.crossEngine.push({id:c.id,engine,threads});
      row.comparisons.push({engine,rep,...output});
      if(!bench)json(mode+'-running.json',{id:c.id,complete:row.comparisons.length,total:Object.values(contexts).reduce((n,c)=>n+c.counts.length,0),last:{engine,threads,ticks:output.ticks,checks:output.checks,frames:output.rows?.length??0}});
      console.log(mode,c.id,engine,threads,output.ticks,Math.round(output.parallelMs),output.dispatch??{});
    }
    if(bench){
      for(const [engine,{counts}]of Object.entries(contexts))for(const threads of(rep%2?[...counts].reverse():counts))await check(engine,threads);
    }else{
      // Identity checks share independent engines within the machine's thread budget.
      // Timing pairs above are sequential, and never overlap this verification stage.
      for(const threads of [...new Set(Object.values(contexts).flatMap(c=>c.counts))]){
        const names=Object.keys(contexts).filter(name=>contexts[name].counts.includes(threads));
        const width=Math.max(1,Math.min(names.length,Math.floor(os.cpus().length/threads)));
        for(let first=0;first<names.length;first+=width)await Promise.all(names.slice(first,first+width).map(name=>check(name,threads)));
      }
      const order=Object.keys(contexts);
      row.comparisons.sort((a,b)=>order.indexOf(a.engine)-order.indexOf(b.engine)||contexts[a.engine].counts.indexOf(a.requested)-contexts[b.engine].counts.indexOf(b.requested));
    }
    writeFileSync(file,JSON.stringify(row)+'\n');evidence.comparisons.push(...row.comparisons);evidence.complete++;json(mode+'-progress.json',{complete:evidence.complete,total:evidence.total,errors:evidence.errors,crossEngine:evidence.crossEngine});
  }
}finally{for(const {page}of Object.values(contexts))await page.evaluate(()=>window.closeWorkers());await Promise.all(browsers.map(b=>b.close()));host.close();json(mode+'-summary.json',evidence);}
console.log(mode.toUpperCase()+' COMPLETE',evidence.complete,'mismatches',evidence.crossEngine.length);
if(evidence.crossEngine.length||evidence.errors.length)process.exitCode=1;
