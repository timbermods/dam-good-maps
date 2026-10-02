import {resolve} from 'node:path';
import {readFileSync} from 'node:fs';
import {deps,LOCAL,json,hash} from './common.mjs';
import {host} from './host.mjs';
const server=await host(),browsers=[],output={},summary={engines:{},fingerprint:hash(readFileSync(resolve(LOCAL,'build.json'))),adoptedMismatches:[],baselineMismatches:[],changes:{}};
try{
  for(const name of ['chromium','firefox','webkit']){const b=await deps('playwright')[name].launch({headless:true});browsers.push(b);summary.engines[name]={version:b.version()};output[name]={};
    for(const mode of ['baseline','adopted']){const page=await b.newPage();await page.goto(server.url);await page.addScriptTag({url:server.url+'curve-'+mode+'.js',type:'module'});await page.waitForFunction(()=>window.probe);output[name][mode]=await page.evaluate(()=>window.probe());await page.close();}
  }
  for(const name of ['chromium','firefox','webkit'])for(const key of ['native','fractionalNative']){
    const current=JSON.stringify(output[name].baseline[key]),after=JSON.stringify(output[name].adopted[key]),ref=JSON.stringify(output.chromium.adopted[key]);
    if(after!==ref)summary.adoptedMismatches.push({engine:name,key});
    if(current!==JSON.stringify(output.chromium.baseline[key]))summary.baselineMismatches.push({engine:name,key});
    summary.changes[name+'/'+key]=output[name].baseline[key].filter((r,i)=>JSON.stringify(r)!==JSON.stringify(output[name].adopted[key][i])).length;
  }
  json('curves-full.json',output);json('curves-summary.json',summary);console.log(JSON.stringify(summary,null,2));
  if(summary.adoptedMismatches.length)process.exitCode=1;
}finally{await Promise.all(browsers.map(b=>b.close()));server.close();}
