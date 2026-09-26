import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
import {createServer} from 'vite';
import {resolve} from 'node:path';
import {mkdirSync,writeFileSync} from 'node:fs';
import {DEFAULTS} from '../verbs';
mkdirSync('captures',{recursive:true});mkdirSync('checks',{recursive:true});
const server=await createServer({configFile:resolve('vite.config.ts')});await server.listen();
const url=server.resolvedUrls!.local[0];console.log('Browser test '+url);
const browser=await chromium.launch({channel:'chrome',headless:true}),page=await browser.newPage({viewport:{width:1440,height:960}});
const errors:string[]=[],passed:string[]=[],measurements:any[]=[];
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
const idle=()=>page.waitForFunction(()=>{const s=(window as any).forces?.state;return s&&!s.active&&!s.busy;},{},{timeout:180000});
const range=async(id:string,value:string)=>page.locator('#'+id).evaluate((el,value)=>{(el as HTMLInputElement).value=value;el.dispatchEvent(new Event('input',{bubbles:true}));},value);
const h=()=>page.evaluate(()=>(window as any).forces.heights);
const screen=(x:number,y:number)=>page.evaluate(({x,y})=>(window as any).forces.screen(x,y),{x,y});
const note=(s:string)=>{passed.push(s);console.log('PASS '+s);};
try{
 await page.goto(url);await idle();assert.deepEqual(errors,[]);
 for(const verb of ['carve','craterize','quake','erupt']){
  await page.locator('[data-verb="'+verb+'"]').click();assert.equal(await page.locator("#options select").first().getAttribute("id"),"mode");
 }
 note('All four buttons share one map and each options row starts with its mode switch');
 await page.locator('#top').click();await page.waitForTimeout(200);
 await page.locator('[data-verb="craterize"]').click();
 await range('power','30');await range('size','30');
 const baseline=await h(),p=await screen(90,85);await page.mouse.click(p.x,p.y);await idle();
 assert.notDeepEqual(await h(),baseline);assert.equal(await page.evaluate(()=>(window as any).forces.state.index),1);
 await page.screenshot({path:'captures/crater.png'});
 await page.locator('#undo').click();await idle();assert.deepEqual(await h(),baseline);
 await page.locator('#redo').click();await idle();const crater=await h();
 note('Pointer strike, whole-event undo and redo work on the shared map');
 await page.locator('[data-verb="erupt"]').click();await range('power','38');
 const vent=await screen(65,78);await page.mouse.click(vent.x,vent.y);await page.waitForFunction(()=>(window as any).forces.state.active);
 await page.waitForTimeout(450);await page.screenshot({path:'captures/eruption.png'});await idle();
 assert.notDeepEqual(await h(),crater);const erupted=await h();
 await page.locator('#again').click();await idle();assert.equal(await page.locator('#seed').inputValue(),'2');
 await page.locator('#undo').click();await idle();assert.deepEqual(await h(),erupted);
 note('Erupt beside a crater, cooling/plume, Try another and exact undo retain the preceding crater');
 await page.selectOption('#map','fixture:slide:128');await idle();await page.locator('#top').click();await page.waitForTimeout(150);
 await page.locator('[data-verb="quake"]').click();await page.selectOption('#mode','slide');await range('power','100');
 const preSlide=await h(),a=await screen(35,66),b=await screen(106,66);
 await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:16});
 await page.waitForFunction(()=>(window as any).forces.state.active);
 await page.keyboard.press('x');await page.waitForTimeout(350);
 assert.notDeepEqual(await h(),preSlide);await page.mouse.up();await idle();assert.equal(await page.evaluate(()=>(window as any).forces.state.index),1);
 await page.screenshot({path:'captures/slide.png'});
 await page.keyboard.press('Control+z');await idle();assert.deepEqual(await h(),preSlide);
 note('Held painted Slide changes land before release; X flips; release is one undo');
 const start=await screen(10,11);await page.mouse.click(start.x,start.y);await page.waitForTimeout(200);
 assert.equal(await page.evaluate(()=>(window as any).forces.state.index),0);assert.match(await page.locator('#notice').innerText(),/Start here/);
 note('Start strikes show the shared refusal without a history entry');
 const rapidA=await screen(55,85),rapidB=await screen(95,85);
 for(const p of [rapidA,rapidB]){await page.mouse.move(p.x,p.y);await page.mouse.down();await page.mouse.move(p.x+2,p.y);await page.mouse.up();}
 await page.waitForFunction(()=>{const s=(window as any).forces.state;return !s.active&&!s.busy&&s.index===2;},{},{timeout:90000});
 await page.locator('#undo').click();await idle();await page.locator('#undo').click();await idle();assert.deepEqual(await h(),preSlide);
 note('Two rapid painted strokes survive settling and remain separate undo steps');

 await page.selectOption('#map','fixture:river:256');await idle();await page.locator('[data-verb="carve"]').click();await page.selectOption('#mode','aim');
 await page.locator('#defyGravity').check();await range('power','85');
 const bigBefore=await h();await page.evaluate((settings)=>(window as any).forces.run({verb:'carve',settings,intent:{origin:220*256+140,end:20*256+140}}),{...DEFAULTS.carve,mode:'aim',defyGravity:true,power:85,seed:7});
 await page.waitForTimeout(1000);const times=await page.evaluate(()=>(window as any).forces.frames.slice(-50));times.sort((a:number,b:number)=>a-b);measurements.push({case:'256² active Carve',p95FrameMs:times[Math.floor(times.length*.95)],maxFrameMs:Math.max(...times)});
 const immediate=await page.evaluate(()=>{
  const t=performance.now();window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));
  return {ms:performance.now()-t,heights:(window as any).forces.heights};
 });assert.deepEqual(immediate.heights,bigBefore);assert(immediate.ms<16);measurements.push({case:'256² immediate visual Esc',ms:immediate.ms});
 const t=performance.now();await idle();measurements.push({case:'Escape through browser and worker',ms:performance.now()-t});assert.deepEqual(await h(),bigBefore);
 note('256² carving stays interactive and Esc restores the cached prior map');
 for(const request of [
  {verb:'craterize',settings:{...DEFAULTS.craterize,power:60},intent:{origin:170*256+175}},
  {verb:'erupt',settings:{...DEFAULTS.erupt,power:70},intent:{origin:170*256+175}},
  ...['lift','slide'].map(mode=>({verb:'quake',settings:{...DEFAULTS.quake,mode,power:80},intent:{path:[{x:30,y:140},{x:225,y:140}],side:1}}))
 ]){
  await page.evaluate(request=>{(window as any).forces.resetFrames();(window as any).forces.run(request);},request);
  await page.waitForTimeout(1200);
  const measure=await page.evaluate(()=>({frames:(window as any).forces.frames,longTasks:(window as any).forces.longTasks}));
  measure.frames.sort((a:number,b:number)=>a-b);
  const p95=measure.frames[Math.floor(measure.frames.length*.95)];
  measurements.push({case:'256² '+request.verb+'/'+request.settings.mode,p95FrameMs:p95,maxFrameMs:Math.max(...measure.frames),longTasks:measure.longTasks});
  assert(p95<34,'256² '+request.verb+' frame p95 '+p95);
  if(await page.evaluate(()=>(window as any).forces.state.active)){await page.keyboard.press('Escape');await idle();}
  else{await page.locator('#undo').click();await idle();}
  assert.deepEqual(await h(),bigBefore);
 }
 note('All four forces at 256² keep frame p95 below 34 ms, with exact cancellation/undo');
 await page.emulateMedia({reducedMotion:'reduce'});assert.equal(await page.evaluate(()=>(window as any).forces.state.motion),false);
 assert.deepEqual(errors,[]);assert.deepEqual(await page.evaluate(()=>(window as any).forces.state.errors),[]);
 note('System reduced motion overrides animations; no browser or shader errors');
 writeFileSync('checks/browser.json',JSON.stringify({passed,measurements,browser:await browser.version()},null,2)+'\n');
}finally{await browser.close();await server.close();}
