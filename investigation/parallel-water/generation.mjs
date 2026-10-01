import {resolve} from 'node:path';
import {readFileSync,writeFileSync,existsSync,mkdirSync} from 'node:fs';
import {staticHost,openIsolated,job} from './host.mjs';
import {deps,LOCAL,hash,json} from './common.mjs';
const smoke=process.argv.includes('--runtime'),mode=smoke?'runtime':'generation';
const directory=resolve(LOCAL,mode);mkdirSync(directory,{recursive:true});
const worker=smoke?'runtime-smoke.js':'generation-coordinator.js';
const host=await staticHost(worker),build=hash(readFileSync(resolve(LOCAL,worker))+readFileSync(resolve(LOCAL,'runtime-helper.js')));
const cases=smoke?[{id:'retained-array-contract',size:8,theme:'riverValley'}]:[128,256].flatMap(size=>['riverValley','lakeBasin','islands'].map(theme=>({id:`m9b-${theme}-${size}-1`,size,theme,seed:1})));
if(process.env.DGM_FILTER)cases.splice(0,cases.length,...cases.filter(c=>new RegExp(process.env.DGM_FILTER).test(c.id)));
const evidence={mode,build,complete:0,total:cases.length,engines:{},comparisons:[],crossEngine:[],errors:[]},browsers=[],contexts={};
try{
  for(const name of(process.env.DGM_ENGINE?[process.env.DGM_ENGINE]:['chromium','firefox','webkit'])){
    const browser=await deps('playwright')[name].launch({headless:true});browsers.push(browser);contexts[name]=await openIsolated(browser,host.url);evidence.engines[name]={version:browser.version(),counts:contexts[name].counts};
  }
  for(const c of cases){
    const file=resolve(directory,c.id+'.json');
    if(existsSync(file)){const row=JSON.parse(readFileSync(file));if(row.build===build&&JSON.stringify(row.engines)===JSON.stringify(evidence.engines)){evidence.comparisons.push(...row.comparisons);evidence.crossEngine.push(...row.crossEngine);evidence.complete++;continue;}}
    const row={id:c.id,build,engines:evidence.engines,comparisons:[],crossEngine:[]};let reference;
    for(const [engine,{page,counts}]of Object.entries(contexts))for(const threads of counts){
      const output=await job(page,{...c,model:{W:1,H:1,floor:new Float64Array(1),dam:null,emitters:[]}},threads);
      if(output.error){evidence.errors.push({engine,...output});throw Error(output.error);}
      if(output.threads!==threads)throw Error('Unexpected scalar fallback');
      const identity={hash:output.hash,bytes:output.bytes,passed:output.passed};
      if(!reference)reference=identity;else if(JSON.stringify(reference)!==JSON.stringify(identity))row.crossEngine.push({id:c.id,engine,threads});
      row.comparisons.push({engine,...output});
      console.log(mode,c.id,engine,threads,output.candidate??output);
    }
    writeFileSync(file,JSON.stringify(row)+'\n');evidence.comparisons.push(...row.comparisons);evidence.crossEngine.push(...row.crossEngine);evidence.complete++;json(mode+'-progress.json',{complete:evidence.complete,total:evidence.total,crossEngine:evidence.crossEngine,errors:evidence.errors});
  }
}finally{await Promise.all(browsers.map(b=>b.close()));host.close();json(mode+'-summary.json',evidence);}
console.log(mode+' COMPLETE',evidence.complete,'cross-engine differences',evidence.crossEngine.length);
if(evidence.errors.length)process.exitCode=1;
