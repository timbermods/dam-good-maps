import {chromium} from '@playwright/test';
import sharp from 'sharp';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import gifenc from 'gifenc';
const {GIFEncoder,quantize,applyPalette}=gifenc;
await mkdir('captures',{recursive:true});await mkdir('local/frames',{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-gpu','--use-angle=d3d11','--ignore-gpu-blocklist']});
const page=await browser.newPage({viewport:{width:1280,height:900},deviceScaleFactor:1});const errors=[];
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
await page.addInitScript(()=>window.dgmLookTest={gpu:true});
const settled=async()=>{await page.waitForFunction(()=>window.flowDemo?.ready&&window.flowDemo.renderer.highSettled,null,{timeout:120000});await page.waitForTimeout(100);};
const load=async(map)=>{const rev=await page.evaluate(()=>window.flowDemo.revision);await page.locator('#map').selectOption(map);await page.waitForFunction(r=>window.flowDemo.revision>r,rev);await settled();};
const caption=(text,w=1280)=>Buffer.from(`<svg width="${w}" height="42"><rect width="100%" height="100%" fill="#222d2c"/><text x="18" y="27" font-family="sans-serif" font-size="17" fill="#e5eadd">${text}</text></svg>`);
const width=1280,height=426,panelW=640,panelH=384;
try {
 await page.goto('http://127.0.0.1:5184/');await settled();
 assert.equal(await page.locator('#toggle').isChecked(),false);
 const fields=await page.evaluate(async()=>{
  const {settledVelocity}=await import('/flow.ts');const W=8,N=64,depth=new Float64Array(N).fill(1),out=new Float64Array(N*4),field={source:'canonical-settle.out',depth,out};
  const still=settledVelocity(W,W,field).every(n=>n===0);for(let i=0;i<N;i++)out[i*4+3]=2;const east=settledVelocity(W,W,field)[54];out.fill(0);for(let i=0;i<N;i++)out[i*4+1]=2;
  return {still,east,west:settledVelocity(W,W,field)[54],missing:settledVelocity(W,W)===null};
 });assert.deepEqual(fields,{still:true,east:2,west:-2,missing:true});
 const rows=[];
 for(const item of [
  {name:'river-overview',map:'riverValley',flow:false,title:'River Valley · surface motion'},
  {name:'delta-split',map:'delta',flow:true,title:'Delta · Flow view'},
  {name:'wrong-way',map:'wrongWay',flow:false,title:'Source edit · same bed, independently settled water'},
  {name:'badwater',map:'badwater',flow:true,title:'Badwater · surface motion and Flow'}
 ].filter(item=>!process.env.CAPTURE||item.name===process.env.CAPTURE)) {
  const wrong=item.map==='wrongWay',frames=wrong?96:48,panels=[[],[]];
  for(let li=0;li<2;li++) {
   const look=['high','standard'][li];await load(item.map);await page.locator('#look').selectOption(look);await settled();
   await page.locator('#toggle').setChecked(item.flow);await page.locator('#overview').click();
   if(item.map==='delta')await page.evaluate(()=>window.flowDemo.renderer.setView({target:[74,3,-24],distance:100,pitch:1.05}));
   // All other records use the unmodified default overview camera.
   for(let f=0;f<frames;f++) {
    if(wrong&&[24,48,72].includes(f)){await page.locator('#edit').click();await settled();if(f===48)await page.locator('#toggle').check();}
    await page.evaluate(t=>window.flowDemo.freeze(t),f/12);
    const png=await page.locator('#mapCanvas').screenshot();
    const panel=await sharp(png).resize(panelW,panelH,{fit:'fill'}).png().toBuffer();
    panels[li].push(panel);
    if(f===12)await writeFile(`local/${item.name}-${look}.png`,png);
   }
   rows.push(await page.evaluate(()=>({look:window.flowDemo.renderer.look,count:window.flowDemo.flecks.count,buildMs:window.flowDemo.flecks.buildMs,view:window.flowDemo.renderer.getView()})));
   console.log(`Recorded ${item.name} ${look}`);
  }
  const rgba=[];
  for(let f=0;f<frames;f++) {
   const state=wrong?`${f<48?'Surface only':'Surface + Flow'} · source ${f%48<24?'WEST / runs EAST':'EAST / runs WEST'}`:item.title;
   const img=sharp({create:{width,height,channels:4,background:'#222d2c'}}).composite([{input:caption(`${state}     |     High (left) / Standard (right)`),left:0,top:0},{input:panels[0][f],left:0,top:42},{input:panels[1][f],left:640,top:42}]);
   const png=await img.png().toBuffer();await writeFile(`local/frames/${item.name}-${String(f).padStart(3,'0')}.png`,png);
   if(f===(wrong?84:12))await sharp(png).jpeg({quality:91}).toFile(`captures/${item.name}.jpg`);
   rgba.push(await sharp(png).ensureAlpha().raw().toBuffer());
  }
  // One shared palette; transparent unchanged pixels preserve the previous frame.
  // Full-resolution frames and maps stay in ignored local/.
  const samples=Buffer.concat([rgba[0],rgba[Math.floor(frames/2)],rgba[frames-1]]);
  const palette=quantize(samples,255);while(palette.length<256)palette.push([0,0,0]);
  const gif=GIFEncoder();let previous;
  for(let f=0;f<frames;f++) {
   const index=applyPalette(rgba[f],palette.slice(0,255));const diff=index.slice();
   if(previous)for(let i=0;i<diff.length;i++)if(index[i]===previous[i])diff[i]=255;
   gif.writeFrame(diff,width,height,{palette:f===0?palette:undefined,delay:f%3===0?90:80,repeat:0,transparent:f>0,transparentIndex:255,dispose:1});previous=index;
  }
  gif.finish();await writeFile(`captures/${item.name}.gif`,gif.bytes());console.log(`Encoded ${item.name}: ${gif.bytes().length} bytes`);
 }
 // Focused checks: actual edit updates both fields atomically and holds the camera.
 await load('riverValley');await page.locator('#toggle').check();
 const state=()=>page.evaluate(()=>({depth:Array.from(window.flowDemo.current.water.depth),flow:Array.from(window.flowDemo.current.flow.out),view:window.flowDemo.renderer.getView(),revision:window.flowDemo.revision}));
 const before=await state();await page.locator('#edit').click();await settled();const after=await state();
 assert.notDeepEqual(after.depth,before.depth);assert.notDeepEqual(after.flow,before.flow);assert.deepEqual(after.view,before.view);assert.equal(after.revision,before.revision+1);
 await page.locator('#edit').click();await settled();assert.deepEqual((await state()).flow,before.flow);
 await page.locator('#close').click();await page.evaluate(()=>window.flowDemo.freeze(2));await page.screenshot({path:'local/close.png'});
 await page.emulateMedia({reducedMotion:'reduce'});await page.evaluate(()=>window.flowDemo.freeze(null));await page.waitForTimeout(200);
 const t0=await page.evaluate(()=>window.flowDemo.times);await page.waitForTimeout(800);const t1=await page.evaluate(()=>window.flowDemo.times);
 assert.equal(t1.flecks,t0.flecks);assert.ok(t1.surface>t0.surface&&t1.surface-t0.surface<.04);
 assert.deepEqual(errors,[]);
 await writeFile('local/smoke.json',JSON.stringify({fields,rows,editUpdate:true,undo:true,defaultOff:true,reducedMotion:{t0,t1},errors},null,2));
} finally {await browser.close();}
