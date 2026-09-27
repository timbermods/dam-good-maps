import {openDemo} from './browser.mjs';
import {writeFileSync} from 'node:fs';
import os from 'node:os';
const {browser,page,errors}=await openDemo();
const result={date:new Date().toISOString(),browser:browser.version(),cpu:os.cpus()[0].model,gpu:await page.evaluate(()=>window.finish.gpu),viewport:page.viewportSize(),maps:[],errors};
try{
 await page.evaluate(()=>{document.getElementById('adaptive').checked=false;});
 for(const index of [2,3]){
  await page.evaluate(i=>window.finish.load(i,4242,true),index);
  await page.evaluate(()=>{window.finish.setPose('overview');window.finish.freeze();});
  const entry={index,label:await page.evaluate(()=>window.finish.label),costs:await page.evaluate(()=>window.finish.counts),runs:[]};
  for(let pass=0;pass<2;pass++){
   await page.evaluate(()=>window.finish.setStages([false,false,false,false]));
   entry.runs.push({name:'foundation',pass,...await page.evaluate(()=>window.finish.measure('high'))});
   for(let stage=0;stage<4;stage++){
    await page.evaluate(i=>window.finish.setStages([0,1,2,3].map(j=>j===i)),stage);
    entry.runs.push({name:'stage'+(stage+1),pass,...await page.evaluate(()=>window.finish.measure('high'))});
   }
   await page.evaluate(()=>window.finish.setStages([true,true,true,true]));
   for(const mode of ['standard','high','both'])entry.runs.push({name:'all',pass,...await page.evaluate(m=>window.finish.measure(m),mode)});
   console.log(entry.label+' · pass '+pass+' · '+entry.runs.at(-1).fps.toFixed(1)+' fps paired');
  }
  // Stage 4 is dormant in Normal; measure an actual full drought too.
  await page.evaluate(()=>window.finish.weather('drought'));
  await page.waitForFunction(()=>window.finish.weatherDays.length===9);
  await page.evaluate(()=>{const day=document.getElementById('day');day.value='9';day.dispatchEvent(new Event('input'));window.finish.freeze();});
  for(const enabled of [false,true]){
    await page.evaluate(enabled=>window.finish.setStages([true,true,true,enabled]),enabled);
    entry.runs.push({name:enabled?'drought-finish':'drought-baseline',...await page.evaluate(()=>window.finish.measure('high'))});
  }
  await page.evaluate(()=>{window.finish.weather('normal');document.getElementById('low').checked=true;document.getElementById('low').dispatchEvent(new Event('change'));window.finish.setStages([true,true,true,true]);});
  entry.runs.push({name:'lower-cost',...await page.evaluate(()=>window.finish.measure('high'))});
  await page.evaluate(()=>{document.getElementById('low').checked=false;document.getElementById('low').dispatchEvent(new Event('change'));});
  result.maps.push(entry);writeFileSync('captures/performance.json',JSON.stringify(result,null,2));
 }
 if(errors.length)throw Error(errors.join('\n'));
}finally{await browser.close();}
