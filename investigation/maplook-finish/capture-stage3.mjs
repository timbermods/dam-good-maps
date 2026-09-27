import {openDemo} from './browser.mjs';
import {mkdirSync,writeFileSync} from 'node:fs';
mkdirSync('captures',{recursive:true});
const {browser,page,errors}=await openDemo();
try{
 await page.evaluate(()=>window.finish.load(1));
 await page.evaluate(()=>window.finish.setStages([true,true,true,false]));
 const names=['ruins','mine','small-relic','medium-relic','large-relic','district-centre','geothermal','thorns','slope','natural-dam','blockage','water-source','badwater-source'];
 for(let i=0;i<names.length;i++)for(const top of [false,true]){
  await page.evaluate(({i,top})=>{window.finish.selectObject(i,top);window.finish.freeze();},{i,top});
  await page.locator('#comparison').screenshot({path:`captures/stage3-${names[i]}-${top?'top':'side'}.jpg`,type:'jpeg',quality:83});
 }
 writeFileSync('captures/stage3-check.json',JSON.stringify({errors},null,2));
 if(errors.length)throw Error(errors.join('\n'));
}finally{await browser.close();}
