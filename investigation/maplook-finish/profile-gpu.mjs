import {openDemo} from './browser.mjs';
import {writeFileSync} from 'node:fs';
const {browser,page,errors}=await openDemo();
const report={gpu:await page.evaluate(()=>window.finish.gpu),batch:16,maps:[],errors};
const median=a=>a.filter(v=>v!==null).sort((x,y)=>x-y)[Math.floor(a.filter(v=>v!==null).length/2)]??null;
try{
 for(const index of [2,3]){
  await page.evaluate(i=>window.finish.load(i,4242,true),index);await page.evaluate(()=>{document.getElementById('adaptive').checked=false;window.finish.setPose('overview');window.finish.freeze();});
  const records=[];
  for(let stage=0;stage<4;stage++){
   if(stage===3){await page.evaluate(()=>window.finish.weather('drought'));await page.waitForFunction(()=>window.finish.weatherDays.length===9);await page.evaluate(()=>{const day=document.getElementById('day');day.value='9';day.dispatchEvent(new Event('input'));});}
   const off=[],on=[];
   for(let pass=0;pass<7;pass++)for(const enabled of pass%2?[true,false]:[false,true]){
    await page.evaluate(({stage,enabled})=>window.finish.setStages([0,1,2,3].map(i=>i===stage?enabled:stage===3)),{stage,enabled});
    (enabled?on:off).push(await page.evaluate(()=>window.finish.gpuBatch(16)));
   }
   records.push({stage:stage+1,off,on,offMedian:median(off),onMedian:median(on),delta:median(on)-median(off)});
  }
  report.maps.push({index,label:await page.evaluate(()=>window.finish.label),records});writeFileSync('captures/gpu-cost.json',JSON.stringify(report,null,2));console.log(report.maps.at(-1));
 }
 if(errors.length)throw Error(errors.join('\n'));
}finally{await browser.close();}
