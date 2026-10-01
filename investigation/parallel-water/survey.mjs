import {resolve} from 'node:path';
import {existsSync,readFileSync,writeFileSync,readdirSync,mkdirSync} from 'node:fs';
import {deserialize,serialize} from 'node:v8';
import {staticHost,openIsolated,job} from './host.mjs';
import {ROOT,LOCAL,deps,json,hash} from './common.mjs';
const bench=process.argv.includes('--bench'),weather=process.argv.includes('--weather'),forced=process.argv.includes('--forced');
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
if(process.env.DGM_FILTER)cases.splice(0,cases.length,...cases.filter(c=>new RegExp(process.env.DGM_FILTER).test(c.id)));
const mode=process.env.DGM_LABEL??(bench?'benchmark':weather?'weather':forced?'forced':'survey'),directory=resolve(LOCAL,mode);mkdirSync(directory,{recursive:true});
const host=await staticHost('coordinator.js',!weather),build=hash(readFileSync(resolve(LOCAL,'coordinator.js'))+readFileSync(resolve(LOCAL,'helper.js')));
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
    for(const [engine,{page,counts}]of Object.entries(contexts))for(const threads of(rep%2?[...counts].reverse():counts)){
      const output=await job(page,{...c,rep},threads,false);if(output.error){evidence.errors.push({engine,...output});throw Error(output.error);}
      if(output.threads!==threads)throw Error('Unexpected scalar fallback');
      const identity={hash:output.hash,ticks:output.ticks,result:output.result,rows:output.rows};
      if(!reference)reference=identity;else if(JSON.stringify(reference)!==JSON.stringify(identity))evidence.crossEngine.push({id:c.id,engine,threads});
      row.comparisons.push({engine,rep,...output});
      console.log(mode,c.id,engine,threads,output.ticks,Math.round(output.parallelMs),output.dispatch??{});
    }
    writeFileSync(file,JSON.stringify(row)+'\n');evidence.comparisons.push(...row.comparisons);evidence.complete++;json(mode+'-progress.json',{complete:evidence.complete,total:evidence.total,errors:evidence.errors,crossEngine:evidence.crossEngine});
  }
}finally{for(const {page}of Object.values(contexts))await page.evaluate(()=>window.closeWorkers());await Promise.all(browsers.map(b=>b.close()));host.close();json(mode+'-summary.json',evidence);}
console.log(mode.toUpperCase()+' COMPLETE',evidence.complete,'mismatches',evidence.crossEngine.length);
if(evidence.crossEngine.length||evidence.errors.length)process.exitCode=1;
