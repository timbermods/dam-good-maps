import {openDemo} from './browser.mjs';
import {mkdirSync,writeFileSync} from 'node:fs';
mkdirSync('captures',{recursive:true});
const {browser,page,errors}=await openDemo();
try{
 console.log(await page.evaluate(()=>({gpu:window.finish.gpu,counts:window.finish.counts})));
 await page.evaluate(()=>{window.finish.setStages([true,false,false,false]);window.finish.setPose('edge');window.finish.freeze();});
 await page.locator('#comparison').screenshot({path:'captures/stage1-edge.jpg',type:'jpeg',quality:86});
 await page.evaluate(()=>window.finish.load(0));
 await page.evaluate(()=>{window.finish.setPose('badedge');window.finish.freeze();});
 await page.locator('#comparison').screenshot({path:'captures/stage1-badwater-edge.jpg',type:'jpeg',quality:86});
 writeFileSync('captures/stage1-check.json',JSON.stringify({errors},null,2));
 if(errors.length)throw Error(errors.join('\n'));
}finally{await browser.close();}

