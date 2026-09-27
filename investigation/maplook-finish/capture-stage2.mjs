import {openDemo} from './browser.mjs';
import {mkdirSync,writeFileSync} from 'node:fs';
mkdirSync('captures',{recursive:true});
const {browser,page,errors}=await openDemo();
try{
 await page.evaluate(()=>window.finish.load(0));
 for(const [name,pose]of [['tall-fall','fall'],['pool','pool'],['river-rocks','river']]){
   for(const enabled of [false,true]){
     await page.evaluate(({pose,enabled})=>{window.finish.setStages([true,enabled,false,false]);window.finish.setPose(pose);window.finish.freeze();},{pose,enabled});
     await page.locator('#comparison').screenshot({path:`captures/stage2-${name}-${enabled?'new':'old'}.jpg`,type:'jpeg',quality:86});
   }
 }
 writeFileSync('captures/stage2-check.json',JSON.stringify({errors},null,2));
 if(errors.length)throw Error(errors.join('\n'));
}finally{await browser.close();}

