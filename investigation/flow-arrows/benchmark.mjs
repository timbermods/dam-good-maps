import {chromium} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-gpu','--use-angle=d3d11','--ignore-gpu-blocklist']});
const page=await browser.newPage({viewport:{width:1440,height:960},deviceScaleFactor:1});const errors=[];
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
await page.addInitScript(()=>window.dgmLookTest={gpu:true});
await page.goto('http://127.0.0.1:5184/');await page.waitForFunction(()=>window.flowDemo?.ready&&window.flowDemo.renderer.highSettled);
await page.locator('#map').selectOption('performance-map');await page.waitForFunction(()=>window.flowDemo.current.W===256&&window.flowDemo.renderer.highSettled);
await page.waitForTimeout(2000);
const hardware=await page.evaluate(()=>{const gl=window.flowDemo.renderer.gl.getContext(),d=gl.getExtension('WEBGL_debug_renderer_info');return {renderer:d?gl.getParameter(d.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),vendor:d?gl.getParameter(d.UNMASKED_VENDOR_WEBGL):gl.getParameter(gl.VENDOR),dpr:devicePixelRatio,userAgent:navigator.userAgent};});
const geometry=await page.evaluate(()=>({streaks:window.flowDemo.flecks.count,lanes:window.flowDemo.flecks.lanes,cues:window.flowDemo.cues.stats,pathBuildMs:window.flowDemo.paths.buildMs}));
const rows=[];
for(const look of ['high','standard']) {
 await page.locator('#look').selectOption(look);await page.waitForFunction(look=>window.flowDemo.renderer.look===look&&window.flowDemo.renderer.highSettled,look);
 const view=await page.evaluate(()=>window.flowDemo.renderer.getView());
 await page.evaluate(()=>window.flowDemo.bench(true,1500));
 for(const both of [false,true,true,false]) {
  await page.evaluate(v=>window.flowDemo.renderer.setView(v),view);
  const result=await page.evaluate(both=>window.flowDemo.bench(both,4000),both);
  const row={look,both,...result};rows.push(row);console.log(JSON.stringify(row));
 }
}
await writeFile('local/performance.json',JSON.stringify({hardware,geometry,viewport:{width:1440,height:960},map:'River Valley 4242 256²',rows,errors},null,2));
await browser.close();if(errors.length)throw Error(errors.join('\n'));
