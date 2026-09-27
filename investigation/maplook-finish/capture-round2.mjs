import {openDemo} from './browser.mjs';
import {mkdirSync,writeFileSync,readFileSync,existsSync} from 'node:fs';
import assert from 'node:assert/strict';
const phase=process.argv.includes('--before')?'before':'after',folder='captures/round2';
mkdirSync(folder,{recursive:true});
const {browser,page,errors}=await openDemo();
const views={},plants={};
async function snap(name){
 await page.evaluate(()=>window.finish.freeze());
 const view=await page.evaluate(()=>window.finish.standard.getView());views[name]=view;
 if(phase==='after'){
  const previous=JSON.parse(readFileSync(folder+'/before.json','utf8')).views[name];
  assert.deepEqual(view,previous,name+' camera changed');
 }
 await page.locator('#comparison').screenshot({path:folder+'/'+name+'-'+phase+'.jpg',type:'jpeg',quality:86});
}
try{
 await page.evaluate(()=>{window.finish.setStages([true,true,true,true]);window.finish.setPose('overview');});
 await snap('overview-128');
 await page.evaluate(()=>{window.finish.setStages([true,false,false,false]);window.finish.setPose('edge');});await snap('stage1-edge');
 await page.evaluate(()=>window.finish.load(0));
 await page.evaluate(()=>window.finish.setPose('badedge'));await snap('stage1-badwater-edge');
 for(const [name,pose]of [['tall-fall','fall'],['pool','pool'],['river-rocks','river']]){
  await page.evaluate(p=>{window.finish.setStages([true,true,false,false]);window.finish.setPose(p);},pose);await snap('stage2-'+name);
 }
 await page.evaluate(()=>window.finish.load(1));
 await page.evaluate(()=>window.finish.setStages([true,true,true,false]));
 for(const [i,name]of [[2,'small-relic'],[3,'medium-relic'],[4,'large-relic'],[12,'badwater-source'],[8,'slope']])for(const top of [false,true]){
  await page.evaluate(({i,top})=>window.finish.selectObject(i,top),{i,top});await snap('stage3-'+name+'-'+(top?'top':'side'));
 }
 await page.evaluate(()=>window.finish.load(2,4242,true));await page.evaluate(()=>{window.finish.setStages([true,true,true,true]);window.finish.setPose('river');window.finish.freeze();});
 const river=await page.evaluate(()=>window.finish.standard.getView());
 await snap('stage4-normal');
 for(const hazard of ['drought','badtide']){
  await page.evaluate(h=>window.finish.weather(h),hazard);
  await page.waitForFunction(()=>window.finish.weatherReady);
  await page.evaluate(({h,v})=>{const day=document.getElementById('day');day.value=h==='drought'?'9':'4';day.dispatchEvent(new Event('input'));window.finish.camera(v);}, {h:hazard,v:river});
  await snap('stage4-'+hazard);
  plants[hazard]=await page.evaluate(()=>window.finish.counts);
 }
 assert.equal(errors.length,0);
}finally{writeFileSync(folder+'/'+phase+'.json',JSON.stringify({views,plants,errors},null,2));await browser.close();}
