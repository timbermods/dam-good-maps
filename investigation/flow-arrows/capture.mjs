import { chromium } from '@playwright/test';
import sharp from 'sharp';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
await mkdir('captures', { recursive: true });
await mkdir('local', { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--enable-gpu', '--use-angle=d3d11', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
await page.addInitScript(() => { window.dgmLookTest = { gpu: true }; });
const settle = async () => {
  await page.waitForFunction(() => window.flowDemo?.ready && window.flowDemo.renderer.highSettled, null, { timeout: 120000 });
  await page.waitForTimeout(200);
  await page.evaluate(() => { const d=window.flowDemo;d.renderer.renderNow();d.arrows.refresh();d.renderer.renderNow(); });
};
try {
  await page.goto('http://127.0.0.1:5184/');
  await settle();
  assert.equal(await page.locator('#toggle').isChecked(),false,'default off');
  const fields = await page.evaluate(async () => {
    const { settledVelocity } = await import('/flow.ts');
    const W=8, N=W*W, depth=new Float64Array(N).fill(1), out=new Float64Array(N*4);
    const field={source:'canonical-settle.out',depth,out};
    const still=settledVelocity(W,W,field);
    // Level water with retained directional outflow must move: a slope-based solution fails.
    for(let i=0;i<N;i++) out[i*4+3]=2;
    const east=settledVelocity(W,W,field);
    out.fill(0);for(let i=0;i<N;i++) out[i*4+1]=2;
    const west=settledVelocity(W,W,field);
    out.fill(0);for(let i=0;i<N;i++) out[i*4+2]=1;
    const north=settledVelocity(W,W,field);
    return {still:still.every(n=>n===0),east:east[54],west:west[54],north:north[55],missing:settledVelocity(W,W)===null,invalid:settledVelocity(W,W,{...field,out:[]})===null};
  });
  assert.deepEqual(fields,{still:true,east:2,west:-2,north:1,missing:true,invalid:true});
  await page.locator('#toggle').check();
  const unavailable = await page.evaluate(() => {
    const d=window.flowDemo;d.arrows.setMap({...d.current,flow:undefined});d.arrows.refresh();
    const result={count:d.arrows.stats.count,available:d.arrows.stats.available};
    d.arrows.setMap(d.current);d.arrows.refresh();return result;
  });
  assert.deepEqual(unavailable,{count:0,available:false});
  await page.evaluate(()=>window.flowDemo.arrows.freeze(0));
  const rows=[];
  for(const [name,map,close] of [['river-overview','riverValley',false],['delta-split','delta',false],['close-view','riverValley',true]]) {
    if(await page.locator('#map').inputValue()!==map) {
      const rev=await page.evaluate(()=>window.flowDemo.revision);
      await page.locator('#map').selectOption(map);
      await page.waitForFunction(r=>window.flowDemo.revision>r,rev);
    }
    await page.locator(close?'#close':'#overview').click();
    if(map==='delta') await page.evaluate(()=>window.flowDemo.renderer.setView({target:[105,7,-53],distance:100}));
    const panels=[];
    for(const look of ['high','standard']) {
      await page.locator('#look').selectOption(look);await settle();
      await page.evaluate(()=>{window.flowDemo.renderer.setClock(12.5);window.flowDemo.renderer.renderNow();});
      const state=await page.evaluate(()=>({ ...window.flowDemo.arrows.stats,look:window.flowDemo.renderer.look }));
      assert.equal(state.look,look);assert.ok(state.count>3);assert.ok(state.minPixels>=22&&state.maxPixels<=27.01);assert.ok(state.minGap>=53.99);
      rows.push({name,...state});
      const file=`local/${name}-${look}.png`;await page.screenshot({path:file});
      panels.push(await sharp(file).resize(864,600).png().toBuffer());
    }
    await sharp({create:{width:1728,height:600,channels:3,background:'#26312f'}}).composite(panels.map((input,i)=>({input,left:i*864,top:0}))).jpeg({quality:90}).toFile(`captures/${name}.jpg`);
  }
  // The solver's out field and rendered water must both be replaced after a real bed edit.
  const state=()=>page.evaluate(()=>({depth:Array.from(window.flowDemo.current.water.depth),flow:Array.from(window.flowDemo.current.flow.out),view:window.flowDemo.renderer.getView(),revision:window.flowDemo.revision,visible:window.flowDemo.arrows.enabled}));
  const before=await state();await page.locator('#edit').click();await settle();const after=await state();
  assert.notDeepEqual(after.depth,before.depth);assert.notDeepEqual(after.flow,before.flow);assert.deepEqual(after.view,before.view);assert.equal(after.revision,before.revision+1);assert.equal(after.visible,true);
  await page.locator('#edit').click();await settle();assert.deepEqual((await state()).flow,before.flow);
  // Visual checks of the generated fixture's shallowest/deepest moving clean and bad water.
  const waterCases=await page.evaluate(async()=>{
    const {settledVelocity}=await import('/flow.ts');const m=window.flowDemo.current,v=settledVelocity(m.W,m.H,m.flow),w=m.water;
    const cases=[];
    for(const bad of [false,true]) {
      const tiles=[];for(let k=0;k<w.count;k++){const i=w.tile[k];if((w.contamination[k]>.5)===bad&&Math.hypot(v[i*2],v[i*2+1])>.1)tiles.push({i,depth:w.depth[k],height:w.floor[k]+w.depth[k]});}
      tiles.sort((a,b)=>a.depth-b.depth);
      for(const deep of [false,true]){const at=tiles[deep?tiles.length-1:0];cases.push({...at,name:`${bad?'bad':'clean'}-${deep?'deep':'shallow'}`,target:[at.i%m.W+.5,at.height,-Math.floor(at.i/m.W)-.5]});}
    }return cases;
  });
  const waterPanels=[];
  for(const waterCase of waterCases)for(const look of ['high','standard']){
    await page.locator('#look').selectOption(look);
    await page.evaluate(target=>window.flowDemo.renderer.setView({target,distance:45,pitch:1.22}),waterCase.target);await settle();
    const file=`local/${waterCase.name}-${look}.png`;await page.screenshot({path:file});
    waterPanels.push(await sharp(file).resize(720,500).png().toBuffer());
  }
  await sharp({create:{width:1440,height:2000,channels:3,background:'#26312f'}}).composite(waterPanels.map((input,i)=>({input,left:i%2*720,top:Math.floor(i/2)*500}))).jpeg({quality:88}).toFile('local/water-contrast.jpg');
  await page.locator('#close').click();await settle();
  // Verify screen metrics at the full supported distance range; retain diagnostic captures locally.
  const zoom=[];
  for(const distance of [6,18,35,100,204.8,384]) {
    await page.evaluate(distance=>window.flowDemo.renderer.setView({distance}),distance);await settle();
    const s=await page.evaluate(()=>window.flowDemo.arrows.stats);zoom.push({distance,...s});
    if(s.count){assert.ok(s.minPixels>=22&&s.maxPixels<=27.01);assert.ok(s.minGap>=53.99);}
    if(distance===6||distance===384) await page.screenshot({path:`local/zoom-${distance}.png`});
  }
  await page.locator('#overview').click();await settle();
  await page.evaluate(()=>window.flowDemo.arrows.freeze(null));
  await page.waitForTimeout(200);
  const a=await page.evaluate(async()=>{
    const {settledVelocity}=await import('/flow.ts'),d=window.flowDemo,m=d.current,v=settledVelocity(m.W,m.H,m.flow);
    return d.arrows.snapshot().map(p=>({...p,vx:v[(Math.floor(p.y)*m.W+Math.floor(p.x))*2],vy:v[(Math.floor(p.y)*m.W+Math.floor(p.x))*2+1]}));
  });await page.waitForTimeout(1100);const b=await page.evaluate(()=>window.flowDemo.arrows.snapshot());
  assert.ok(a.some(p=>b.some(q=>q.id===p.id&&Math.hypot(q.x-p.x,q.y-p.y)>.01)),'drift must move existing arrows');
  const trajectories=a.flatMap(p=>b.filter(q=>q.id===p.id).map(q=>(q.x-p.x)*p.vx+(q.y-p.y)*p.vy));
  assert.ok(trajectories.length>3&&trajectories.every(dot=>dot>=-1e-4),'drift follows retained outflow');
  await page.emulateMedia({reducedMotion:'reduce'});await page.waitForTimeout(200);
  const still=await page.evaluate(()=>window.flowDemo.arrows.snapshot());await page.waitForTimeout(800);
  assert.deepEqual(await page.evaluate(()=>window.flowDemo.arrows.snapshot()),still,'reduced motion must stand still');
  assert.equal(await page.evaluate(()=>window.flowDemo.arrows.stats.reducedMotion),true);
  await page.locator('#toggle').uncheck();assert.equal(await page.evaluate(()=>window.flowDemo.arrows.enabled),false);
  assert.deepEqual(errors,[]);
  await writeFile('local/smoke.json',JSON.stringify({fields,unavailable,rows,waterCases,zoom,editUpdate:true,undo:true,drift:true,reducedMotion:true,defaultOff:true,errors},null,2));
  console.log(JSON.stringify({fields,rows,zoom},null,2));
} finally { await browser.close(); }
