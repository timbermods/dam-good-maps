import {chromium} from '@playwright/test';
import {createServer} from 'vite';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import sharp from 'sharp';
import gifenc from 'gifenc';
import {summarize} from './local/performance/investigation/performance/metrics.mjs';
const {GIFEncoder,quantize,applyPalette}=gifenc;
const smoke=process.argv.includes('--smoke'),perfOnly=process.argv.includes('--perf');
mkdirSync('local/raw',{recursive:true});mkdirSync('captures',{recursive:true});
const server=await createServer({configFile:'vite.config.ts',server:{port:5186,host:'127.0.0.1'},logLevel:'warn'});await server.listen();
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--use-angle=d3d11','--enable-gpu','--ignore-gpu-blocklist','--disable-background-timer-throttling','--disable-renderer-backgrounding']});
const page=await browser.newPage({viewport:{width:1200,height:750}}),errors=[];
page.on('pageerror',e=>{errors.push(e.message);console.error(e.message);});page.on('console',m=>{if(m.type()==='error'){errors.push(m.text());console.error(m.text().slice(0,1500));}});
const ev=(fn,arg)=>page.evaluate(fn,arg);
const pause=ms=>page.waitForTimeout(ms);
try{
 await page.goto('http://127.0.0.1:5186',{waitUntil:'domcontentloaded',timeout:120000});await page.waitForFunction(()=>document.body.dataset.ready==='1',null,{timeout:120000});await pause(700);
 const gpu=await ev(()=>{const g=window.view.gl.getContext(),e=g.getExtension('WEBGL_debug_renderer_info');return{renderer:e?g.getParameter(e.UNMASKED_RENDERER_WEBGL):g.getParameter(g.RENDERER),browser:navigator.userAgent,width:innerWidth,height:innerHeight,dpr:devicePixelRatio};});console.log(gpu);
 await ev(()=>document.body.classList.add('capture'));
 if(smoke){await page.screenshot({path:'local/raw/smoke.png'});await sharp('local/raw/smoke.png').resize(960).toFile('local/smoke.jpg');writeFileSync('local/smoke-errors.json',JSON.stringify(errors));}
 else if(!perfOnly){
  const index=JSON.parse(readFileSync('local/fixtures/index.json','utf8')).filter(f=>f.id!=='heightfield');
  for(const f of index){
   await ev(id=>window.view.open(id),f.id);const cells=[];
   for(const look of ['high','standard']){
    await ev(v=>window.view.setLook(v),look);
    const views=['outside','detail','inside',...f.levels];
    for(let v=0;v<views.length;v++){
     const view=views[v];if(typeof view==='string'){await ev(()=>window.view.slice(23));await ev(n=>window.view.setPose(n),view);}else{await ev(n=>window.view.slice(n),view);await ev(()=>window.view.setPose(window.view.fixture.poses.slice?'slice':'detail'));}
     await pause(90);const raw=await page.screenshot();const small=await sharp(raw).resize(480,300).jpeg({quality:78}).toBuffer();
     cells.push({input:small,left:(v%3)*480,top:(Math.floor(v/3)+(look==='standard'?2:0))*300});
    }
   }
   await sharp({create:{width:1440,height:1200,channels:3,background:'#bdcbd1'}}).composite(cells).jpeg({quality:78}).toFile(`captures/${f.id}.jpg`);console.log('captured',f.id);
  }
  await ev(()=>window.view.open('canyon-cave'));await ev(()=>window.view.setLook('high'));await ev(()=>window.view.setPose('detail'));
  const gif=GIFEncoder();for(let i=0;i<17;i++){await ev(n=>window.view.frame(n),i);await pause(60);const png=await page.screenshot();const{data,info}=await sharp(png).resize(640,400).ensureAlpha().raw().toBuffer({resolveWithObject:true});const palette=quantize(data,256);gif.writeFrame(applyPalette(data,palette),info.width,info.height,{palette,delay:i===0||i===16?650:110});}gif.finish();writeFileSync('captures/erode-light.gif',gif.bytes());
 }
 if(!smoke){
  await page.addScriptTag({path:'local/performance/investigation/performance/probe.js'});await pause(200);
  const budgets=JSON.parse(readFileSync('local/performance/investigation/performance/budgets.json','utf8')),results=[];
  for(const look of ['standard','high'])for(const id of ['heightfield','many-caves']){
   await ev(id=>window.view.open(id),id);await ev(v=>window.view.setLook(v),look);await pause(800);
   for(let repeat=0;repeat<3;repeat++){
    await ev(()=>window.performanceHarness.begin());await pause(3500);const raw=await ev(()=>window.performanceHarness.end());
    writeFileSync(`local/raw/${id}-${look}-${repeat}.json`,JSON.stringify(raw));const s=summarize(raw,budgets);results.push({id,look,repeat,...s});console.log('perf',id,look,repeat,s.p50,s.p99,s.hitches.length);
   }
  }
  for(const look of ['standard','high'])for(const id of ['canyon-cave','block-tunnel','rift']){
   await ev(id=>window.view.open(id),id);await ev(v=>window.view.setLook(v),look);await pause(300);const start=await ev(()=>window.view.timings.length);await ev(()=>window.performanceHarness.begin());await ev(()=>window.view.play());await pause(300);const raw=await ev(()=>window.performanceHarness.end());const s=summarize(raw,budgets);results.push({id,look,edit:true,...s,timings:await ev(n=>window.view.timings.slice(n),start),revisions:await ev(()=>window.view.revisions)});writeFileSync(`local/raw/edit-${id}-${look}.json`,JSON.stringify(raw));
  }
  writeFileSync('checks.json',JSON.stringify({gpu,errors,results},null,2));
 }
 if(errors.length)throw Error(`${errors.length} browser errors`);
}finally{await browser.close();await server.close();}
