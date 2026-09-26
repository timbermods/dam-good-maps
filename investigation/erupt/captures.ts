import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { GIFEncoder, quantize, applyPalette } from 'gifenc';
import { mkdirSync,writeFileSync,readFileSync } from 'node:fs';
import { SCENARIOS } from './scenarios';
import { DEFAULTS } from './engine';
const server=await createServer();await server.listen();const url=server.resolvedUrls!.local[0];
const browser=await chromium.launch({channel:'chrome',headless:true}),page=await browser.newPage({viewport:{width:1280,height:900},deviceScaleFactor:1});
const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
const idle=()=>page.waitForFunction(()=>{const s=(window as any).erupt?.state;return s&&!s.busy&&!s.active&&!s.queued;},{},{timeout:180000});
const frames:Buffer[]=[];const shot=async()=>{frames.push(await page.screenshot());};
const results:unknown[]=[];
const selectedIds=process.env.ERUPT_CAPTURE_IDS?.split(',');
const cooled=()=>page.waitForFunction(()=>(window as any).erupt.state.age===null,{},{timeout:30000});
async function sequence(){for(const t of [.15,.45,.8,1.2,1.7,2.2,2.8,3.5,4.4,5.4,6.6,7.8,9.4]){await page.waitForFunction(t=>{const age=(window as any).erupt.state.age;return age===null||age>=t;},t);await shot();}await idle();await cooled();await shot();}
try{
 await page.goto(url);await idle();mkdirSync('captures',{recursive:true});
 for(const scene of SCENARIOS.filter(s=>!selectedIds||selectedIds.includes(s.id))){
  frames.length=0;
  await page.evaluate(id=>(window as any).erupt.load(id),scene.map);await idle();await shot();
  await page.evaluate(s=>{const a=(window as any).erupt;a.setSettings(s.settings);a.erupt(s.intent);},scene);
  await sequence();
  if(scene.id==='steep-crater'){
    const strip=createCanvas(1280,936),draw=strip.getContext('2d');draw.fillStyle='#192722';draw.fillRect(0,0,1280,936);
    const labels=['Ground swelling · glowing lava','Plume rolling upward and outward','Lava cooling through red and stone','Cooled terrain · ash dispersed'];
    for(const [k,index] of [5,8,11,frames.length-1].entries()){const x=k%2*640,y=Math.floor(k/2)*468;draw.drawImage(await loadImage(frames[index]),x,y+28,640,440);draw.fillStyle='#f3dfbe';draw.font='17px sans-serif';draw.fillText(labels[k],x+14,y+21);}
    writeFileSync('captures/eruption-cooling.png',strip.toBuffer('image/png'));
    await page.locator('#top').click();await page.waitForTimeout(200);writeFileSync('captures/heavy-lobes.png',await page.screenshot());await page.locator('#home').click();
  }
  if(scene.second){await page.evaluate(s=>{const a=(window as any).erupt;a.setSettings(s.settings);a.erupt(s.intent);},scene.second);await sequence();}
  if(scene.carve){await page.evaluate(i=>(window as any).erupt.carve(i),scene.carve);for(let k=0;k<8;k++){await page.waitForTimeout(230);await shot();}await idle();await shot();}
  const encoder=GIFEncoder(),canvas=createCanvas(512,360),ctx=canvas.getContext('2d'),selected=frames;
  for(let k=0;k<selected.length;k++){const im=await loadImage(selected[k]);ctx.drawImage(im,0,0,512,360);const rgba=ctx.getImageData(0,0,512,360).data,palette=quantize(rgba,80);encoder.writeFrame(applyPalette(rgba,palette),512,360,{palette,delay:k===selected.length-1?1700:650});}
  encoder.finish();writeFileSync('captures/'+scene.id+'.gif',encoder.bytes());
  if(scene.id==='huge-caldera')writeFileSync('captures/hero.png',frames.at(-1)!);
  const state=await page.evaluate(()=>{const a=(window as any).erupt;return {seed:a.state.seed,operation:a.operation?.params.terrain.length,renderer:a.renderer};});results.push({id:scene.id,...state});console.log(scene.id,state);
 }
 if(!selectedIds){const compare=createCanvas(1280,492),draw=compare.getContext('2d');draw.fillStyle='#192722';draw.fillRect(0,0,1280,492);
 for(const [k,shape] of (['steep','broad'] as const).entries()){
   await page.evaluate(()=>(window as any).erupt.load('fixture:plain:128'));await idle();
   await page.evaluate(({s,shape})=>{const a=(window as any).erupt;a.setSettings({...s,shape,power:62,summit:'peak',flows:'light',ridges:false,seed:890});a.erupt({origin:64*128+64});},{s:DEFAULTS,shape});await idle();await cooled();
   draw.drawImage(await loadImage(await page.screenshot()),k*640,42,640,450);draw.fillStyle='#f3dfbe';draw.font='20px sans-serif';draw.fillText((k===0?'Steep':'Broad')+' · Power 62 · same seed and settings',k*640+14,28);
 }
 writeFileSync('captures/steep-broad.png',compare.toBuffer('image/png'));
 }
 if(errors.length)throw Error(errors.join('\n'));
 const all=selectedIds?JSON.parse(readFileSync('captures/scenarios.json','utf8')).map((r:{id:string})=>results.find((v:any)=>v.id===r.id)??r):results;
 writeFileSync('captures/scenarios.json',JSON.stringify(all,null,2)+'\n');
}finally{await browser.close();await server.close();}
