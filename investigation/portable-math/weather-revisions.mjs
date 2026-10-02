import {readFileSync,existsSync} from 'node:fs';
import {resolve,relative,dirname,extname} from 'node:path';
import {deps,ROOT,HERE,LOCAL,json} from './common.mjs';
import {host} from './host.mjs';
const dev=resolve(LOCAL,'dev'),snapshot={name:'dev-weather-source',setup(b){b.onResolve({filter:/^\./},a=>{
 const file=resolve(a.resolveDir,a.path),rel=relative(ROOT,file).replaceAll('\\','/');
 if(rel.startsWith('src/')){const target=resolve(dev,rel);return {path:extname(target)?target:existsSync(target+'.ts')?target+'.ts':resolve(target,'index.ts')};}
})}};
await deps('esbuild').build({entryPoints:[resolve(HERE,'curve-probe.ts')],outfile:resolve(LOCAL,'curve-dev.js'),bundle:true,format:'esm',platform:'browser',plugins:[snapshot]});
const h=await host(),output={},browsers=[],summary={m9b:'e292cefe30469033a922650f0455f87297c051d5',dev:'4aab909e23016902cbbe6ffaeddeece786176ab3',engines:{},revisions:{}};
try{
 for(const name of ['chromium','firefox','webkit']){const b=await deps('playwright')[name].launch({headless:true});browsers.push(b);summary.engines[name]=b.version();output[name]={};
  for(const [revision,file]of [['m9b','curve-baseline.js'],['dev','curve-dev.js']]){const p=await b.newPage();await p.goto(h.url);await p.addScriptTag({url:h.url+file,type:'module'});await p.waitForFunction(()=>window.probe);output[name][revision]=await p.evaluate(()=>window.probe());await p.close();}
 }
 for(const revision of ['m9b','dev']){const ref=output.chromium[revision].fractionalNative,r={};
  for(const name of ['chromium','firefox','webkit']){const rows=output[name][revision].fractionalNative,forcing=[],water=[];
   rows.forEach((row,i)=>{if(row.forcing!==ref[i].forcing)forcing.push({k:i,day:i/60,tick:i+1,x:17*(i/60-.5),chromium:ref[i].forcing,engine:row.forcing});if(row.contamination!==ref[i].contamination)water.push(i);});
   r[name]={forcingDifferences:forcing.length,firstForcingDifference:forcing[0]??null,waterDifferences:water.length};
  }summary.revisions[revision]=r;
 }
 json('weather-revisions-full.json',output);json('weather-revisions-summary.json',summary);console.log(JSON.stringify(summary,null,2));
}finally{await Promise.all(browsers.map(b=>b.close()));h.close();}
