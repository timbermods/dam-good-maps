import {openDemo} from './browser.mjs';
import {writeFileSync} from 'node:fs';
const {browser,page,errors}=await openDemo();
const states=[];
try{
 await page.evaluate(()=>{window.finish.setStages([true,true,true,true]);window.finish.setPose('river');window.finish.freeze();});
 const view=await page.evaluate(()=>window.finish.standard.getView());
 for(const hazard of ['normal','drought','badtide']){
  if(hazard!=='normal'){
    await page.evaluate(h=>window.finish.weather(h),hazard);
    await page.waitForFunction(()=>window.finish.weatherDays.length>= (window.finish.weatherState==='drought'?9:8));
    await page.evaluate(()=>{const day=document.getElementById('day');day.value=String(window.finish.weatherState==='badtide'?4:Math.max(...window.finish.weatherDays));day.dispatchEvent(new Event('input'));});
  }
  await page.evaluate(v=>{window.finish.camera(v);window.finish.freeze();},view);
  await page.locator('#comparison').screenshot({path:`captures/stage4-${hazard}.jpg`,type:'jpeg',quality:86});
  states.push(await page.evaluate(()=>({weather:window.finish.weatherState,stats:window.finish.counts.seasons,day:document.getElementById('day').value})));
 }
 await page.evaluate(()=>{window.finish.weather('normal');window.finish.freeze();});
 states.push(await page.evaluate(()=>({weather:'restored',stats:window.finish.counts.seasons})));
 writeFileSync('captures/stage4-check.json',JSON.stringify({states,errors},null,2));
 if(errors.length)throw Error(errors.join('\n'));
}finally{await browser.close();}
