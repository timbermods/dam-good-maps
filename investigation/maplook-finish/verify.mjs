import {openDemo} from './browser.mjs';
import {writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const {browser,page,errors}=await openDemo();
const report={browser:browser.version(),gpu:await page.evaluate(()=>window.finish.gpu),parity:null,toggles:[],maps:[],camera:[],weather:null,errors};
async function toggle(key,pose){
 if(pose)await page.evaluate(p=>window.finish.setPose(p),pose);
 const result=await page.evaluate(key=>{
  const a=window.finish;
  function pixels(r){r.renderNow();const gl=r.canvas.getContext('webgl2'),p=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,p);return p;}
  function diff(x,y){let count=0,max=0;for(let i=0;i<x.length;i++)if(x[i]!==y[i]){count++;max=Math.max(max,Math.abs(x[i]-y[i]));}return {count,max,channels:x.length};}
  a.freeze();const before={standard:pixels(a.standard),high:pixels(a.high)};
  const neutral={standard:pixels(a.standard),high:pixels(a.high)};
  a.setEffects({[key]:false});a.freeze();const off={standard:pixels(a.standard),high:pixels(a.high)};
  a.setEffects({[key]:true});a.freeze();const restored={standard:pixels(a.standard),high:pixels(a.high)};
  return {key,standardNeutral:diff(before.standard,neutral.standard),highNeutral:diff(before.high,neutral.high),standard:diff(before.standard,off.standard),restored:diff(before.high,restored.high),effect:diff(before.high,off.high)};
 },key);
 report.toggles.push(result);
 // ANGLE can round a few multisample edge channels differently even between
 // consecutive unchanged renders (observed 35/1.56M channels at 1/255).
 // Allow at most 0.01% of channels and two code values, and record neutral drift.
 for(const [name,d]of Object.entries({standard:result.standard,restored:result.restored,standardNeutral:result.standardNeutral,highNeutral:result.highNeutral})){
   assert.ok(d.max<=2&&d.count<=d.channels*.0001,key+' '+name+' exceeded GPU rounding tolerance: '+JSON.stringify(d));
 }
 assert.ok(result.effect.count>result.effect.channels*.0001,key+' has no visible effect beyond GPU rounding');
}
try{
 report.parity=await page.evaluate(()=>{
  const a=window.finish,original=a.flags;a.setStages([false,false,false,false]);a.setEffects(Object.fromEntries(Object.keys(original).map(k=>[k,false])));a.freeze();
  function pixels(r){r.renderNow();const gl=r.canvas.getContext('webgl2'),p=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,p);return p;}
  const left=pixels(a.standard),right=pixels(a.high);let different=0,max=0;for(let i=0;i<left.length;i++){different+=+(left[i]!==right[i]);max=Math.max(max,Math.abs(left[i]-right[i]));}
  a.setEffects(original);a.setStages([true,true,true,true]);a.freeze();return {channels:left.length,rightChannels:right.length,different,max};
 });
 console.log('Standard parity',report.parity);assert.equal(report.parity.different,0);
 for(const k of ['geology','soil','section'])await toggle(k,'edge');
 await page.evaluate(()=>window.finish.load(0));
 for(const k of ['crown','landing','bubbles','mist','rings','riverfoam'])await toggle(k,k==='riverfoam'?'river':'pool');
 await page.evaluate(()=>window.finish.load(1));
 for(const [i,k]of [[0,'ruins'],[1,'mine'],[2,'relics'],[5,'start'],[6,'geothermal'],[7,'thorns'],[8,'slopes'],[9,'dams'],[10,'blocks'],[11,'sources']]){
  await page.evaluate(i=>window.finish.selectObject(i),i);await toggle(k);
 }
 await toggle('objectdetail');
 // Check real input in each direction, not just the programmatic camera setter.
 for(const side of ['standard','high']){
  const box=await page.locator('#'+side).boundingBox();
  await page.mouse.move(box.x+box.width*.5,box.y+box.height*.5);await page.mouse.down();await page.mouse.move(box.x+box.width*.5+43,box.y+box.height*.5+20,{steps:4});await page.mouse.up();await page.mouse.move(2,2);
  const views=await page.evaluate(()=>[window.finish.standard.getView(),window.finish.high.getView()]);assert.deepEqual(views[0],views[1]);report.camera.push({side,synced:true});
 }
 // Exercise all generator themes at both sizes plus the three real-place fixtures.
 const options=await page.evaluate(()=>window.finish.options);
 for(let i=2;i<options.length;i++){
  await page.evaluate(i=>window.finish.load(i,4242,true),i);await page.evaluate(()=>{window.finish.setPose('overview');window.finish.freeze();});
  report.maps.push(await page.evaluate(()=>({label:window.finish.label,W:window.finish.map.W,H:window.finish.map.H,entities:window.finish.map.entities.count,counts:window.finish.counts})));
  if(i===2||i===3||options[i].kind==='place')await page.locator('#comparison').screenshot({path:'captures/'+(options[i].kind==='place'?'real-'+options[i].name:'overview-'+options[i].size)+'.jpg',type:'jpeg',quality:84});
  console.log('Loaded',report.maps.at(-1).label);
 }
 await page.evaluate(()=>window.finish.load(2));
 const original=await page.evaluate(()=>{const a=window.finish;const h=x=>Array.from(x).reduce((s,v)=>s+v,0);return {depth:h(a.map.water.depth),bad:h(a.map.water.contamination),soil:h(a.map.soil.moisture)};});
 await page.evaluate(()=>window.finish.weather('drought'));await page.waitForFunction(()=>window.finish.weatherDays.length===9);
 await page.evaluate(()=>{const day=document.getElementById('day');day.value='9';day.dispatchEvent(new Event('input'));window.finish.setPose('river');window.finish.freeze();});
 await toggle('dry');await toggle('heat');
 await page.evaluate(()=>window.finish.weather('badtide'));await page.waitForFunction(()=>window.finish.weatherDays.length===8);
 await toggle('sickly','overview');
 await page.evaluate(()=>{window.finish.weather('normal');window.finish.freeze();});
 const restored=await page.evaluate(()=>{const a=window.finish;const h=x=>Array.from(x).reduce((s,v)=>s+v,0);return {depth:h(a.map.water.depth),bad:h(a.map.water.contamination),soil:h(a.map.soil.moisture)};});
 assert.deepEqual(original,restored);report.weather={original,restored};
 await page.screenshot({path:'captures/demo.jpg',type:'jpeg',quality:82,fullPage:true});
 assert.equal(errors.length,0);
}finally{writeFileSync('captures/verification.json',JSON.stringify(report,null,2));await browser.close();}
