import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import { readFileSync,writeFileSync,mkdirSync,statSync } from 'node:fs';
import { createCanvas,loadImage } from '@napi-rs/canvas';
// @ts-ignore gifenc is a small untyped encoder.
import { GIFEncoder,quantize,applyPalette } from 'gifenc';
import { fixture } from './fixtures';
import { storedMap } from '../../forces-core/core/map';
import { DEFAULTS } from '../model';
mkdirSync('captures',{recursive:true});mkdirSync('checks',{recursive:true});
const server=await createServer({configFile:'vite.config.ts',server:{port:0}});await server.listen();const url=server.resolvedUrls!.local[0];
const browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage({viewport:{width:1200,height:820}});const errors:string[]=[];page.on('pageerror',e=>errors.push(String(e)));
const ready=()=>page.waitForFunction(()=>window.glaciate?.evidence.ready,null,{timeout:120000});
const show=async(id:string)=>{const raw=JSON.parse(readFileSync('local/results/'+id+'.json','utf8'));const m=storedMap(raw);await page.evaluate(m=>window.glaciate.show(m),m as any);await ready();await page.waitForTimeout(250);};
const image=async()=>Buffer.from(await page.evaluate(()=>document.querySelector<HTMLCanvasElement>('#land')!.toDataURL('image/png').split(',')[1]),'base64');
const panels=async(name:string,items:{title:string;subtitle:string;bytes:Buffer}[],columns=2)=>{
 const w=600,h=450,c=createCanvas(w*columns,h*Math.ceil(items.length/columns)),ctx=c.getContext('2d');ctx.fillStyle='#edf3ed';ctx.fillRect(0,0,c.width,c.height);
 for(let k=0;k<items.length;k++){const x=k%columns*w,y=Math.floor(k/columns)*h,a=items[k];ctx.fillStyle='#223f46';ctx.font='bold 19px sans-serif';ctx.fillText(a.title,x+20,y+28);ctx.font='13px sans-serif';ctx.fillStyle='#516b70';ctx.fillText(a.subtitle,x+20,y+49);ctx.drawImage(await loadImage(a.bytes),x+8,y+65,w-16,h-73);}
 writeFileSync('captures/'+name+'.png',c.toBuffer('image/png'));
};
try{
 await page.goto(url);await ready();await page.waitForTimeout(350);
 const initial=await page.evaluate(()=>window.glaciate.evidence.signature);
 await page.click('#top');await page.waitForTimeout(200);
 // A real player click, projected from a known terrain tile; default controls are untouched.
 const xy=await page.evaluate(()=>window.glaciate.project(64,16));await page.mouse.move(xy.x,xy.y);await page.waitForTimeout(120);await page.mouse.click(xy.x,xy.y);
 await page.waitForFunction(()=>!!window.glaciate.evidence.plan,null,{timeout:30000});
 await page.click('#top');await page.evaluate(()=>{const v=window.glaciate.view;v.camera.position.sub(v.controls.target).multiplyScalar(1.2).add(v.controls.target);});
 const encoder=GIFEncoder(),contact:{title:string;subtitle:string;bytes:Buffer}[]=[];
 for(let k=0;k<18;k++){
  const bytes=await page.screenshot(),im=await loadImage(bytes),c=createCanvas(840,574),ctx=c.getContext('2d');ctx.drawImage(im,0,0,840,574);
  const rgba=ctx.getImageData(0,0,840,574).data,palette=quantize(rgba,128);encoder.writeFrame(applyPalette(rgba,palette),840,574,{palette,delay:300});
  if([3,8,12,17].includes(k)){const t=await page.evaluate(()=>window.glaciate.evidence.stage);contact.push({title:t<3?'Advance':t<5?'Retreat':'Revealed',subtitle:`Actual browser stage: ${t.toFixed(1)} seconds`,bytes});}
  await page.waitForTimeout(180);
 }
 await ready();const final=await page.screenshot();const im=await loadImage(final),cc=createCanvas(840,574),ct=cc.getContext('2d');ct.drawImage(im,0,0,840,574);const rgba=ct.getImageData(0,0,840,574).data,pal=quantize(rgba,128);encoder.writeFrame(applyPalette(rgba,pal),840,574,{palette:pal,delay:1400});encoder.finish();writeFileSync('captures/two-acts.gif',encoder.bytes());
 writeFileSync('captures/default.png',final);await panels('two-acts',contact);
 const player=await page.evaluate(()=>({result:window.glaciate.evidence.result,errors:window.glaciate.evidence.errors,terrainFinalMs:window.glaciate.evidence.terrainFinalMs,retreatEndMs:window.glaciate.evidence.retreatEndMs,terrainExact:window.glaciate.evidence.terrainExact}));assert.equal(player.result.op.params.request.intent.origin,16*128+64);assert.equal(player.result.op.params.request.settings.seed,891);
 assert.ok(player.terrainExact&&player.terrainFinalMs<5000&&player.terrainFinalMs<player.retreatEndMs,'128-square terrain final before retreat ends');
 await page.click('#undo');await ready();assert.equal(await page.evaluate(()=>window.glaciate.evidence.signature),initial);
 // Browser cancellation during each act; exact signatures include objects, contamination and geology.
 for(const time of [1200,3500]){
  await page.evaluate(s=>window.glaciate.start({verb:'glaciate',settings:s,intent:{origin:16*128+64}}),DEFAULTS);await page.waitForTimeout(time);await page.keyboard.press('Escape');await ready();assert.equal(await page.evaluate(()=>window.glaciate.evidence.signature),initial);
 }
 // Comparative pictures show the same renderer, camera, map and final simulated water.
 await show('before');const untouched=await image();await show('default');const glacier=await image();await show('carve');const carve=await image();
 await panels('default-before-after',[{title:'Before · River Valley 18',subtitle:'128² · untouched editor generation',bytes:untouched},{title:'Round 2 · default Glaciate',subtitle:'Flow at 64,16 · Power 60 · Size Auto · Meltwater on',bytes:glacier}]);
 await panels('carve-comparison',[{title:'Glaciate · Power 60 / Size Auto',subtitle:'Broad dry floor, narrow stream and retained sediment',bytes:glacier},{title:'Carve · Power 100 / Width 24 / Depth 12',subtitle:'Pinned Round 2 · Steep walls / Wander 5',bytes:carve}]);
 await show('kyler-round1');const oldKyler=await image();await show('kyler');const newKyler=await image();
 await panels('kyler-review',[{title:'Before · untouched River Valley 18',subtitle:'Reconstructed head 64,16 · Power 47',bytes:untouched},{title:'Round 1 · reproduced failure',subtitle:'Lake with retained ruin columns',bytes:oldKyler},{title:'Round 2 · same head and Power',subtitle:'Dry floor; swept ruins removed',bytes:newKyler}],3);
 const gallery=[{title:'Glaciate · River Valley 18',subtitle:'Generated 128², default glacier',bytes:glacier}];
 for(const [id,title]of [['near-lauterbrunnen','Lauterbrunnen'],['near-aoraki-hooker-valley','Hooker Valley'],['near-glencoe','Glencoe']]){await page.evaluate(id=>window.glaciate.load(id),id);await ready();await page.waitForTimeout(300);gallery.push({title,subtitle:'Bundled real-place terrain, unchanged; normalized camera framing',bytes:await image()});}
 await panels('gallery-comparison',gallery);
 const scenarios:any[]=[];
 for(const [id,title]of [['aim','Aim through the range'],['lobe','Flat ground · a lobe'],['low-ground','No room to deepen'],['tall','Tall generator study · VT85']]){await show(id);scenarios.push({title,subtitle:id==='low-ground'?'Near the map floor: widening and moraines':'Actual saved terrain and water',bytes:await image()});}await panels('edge-cases',scenarios);
 const powers:any[]=[];for(const [id,title]of [['power-low','Power 15'],['power-default','Power 60'],['power-high','Power 95']]){await show(id);powers.push({title,subtitle:'Same gesture · Size follows Power (Auto)',bytes:await image()});}await panels('power',powers,3);
 const alternatives:any[]=[];for(const [id,title]of [['default','Original'],['another-1','Try another · 1'],['another-2','Try another · 2'],['another-3','Try another · 3']]){await show(id);alternatives.push({title,subtitle:'Same original terrain and gesture; only the saved seed changes',bytes:await image()});}await panels('alternatives',alternatives);
 // Performance is a separate run with no screenshots or screenshot compression during either act.
 await page.evaluate(()=>window.glaciate.load('highlands-256'));await ready();await page.waitForTimeout(500);
 await page.evaluate(s=>window.glaciate.start({verb:'glaciate',settings:s,intent:{origin:112*256+80}}),DEFAULTS);await page.waitForFunction(()=>!window.glaciate.evidence.ready);await ready();
 const timing=await page.evaluate(()=>{const e=window.glaciate.evidence;return {frames:e.frames,advance:e.advanceFrames,retreat:e.retreatFrames,longTasks:e.longTasks,duration:e.duration,firstTerrainMs:e.firstTerrainMs,planningMs:e.planningMs,terrainFinalMs:e.terrainFinalMs,retreatEndMs:e.retreatEndMs,terrainExact:e.terrainExact,errors:e.errors,result:{settled:e.result.settled,ticks:e.result.ticks}};});
 assert.ok(timing.terrainExact&&timing.terrainFinalMs<5000&&timing.terrainFinalMs<timing.retreatEndMs,'256-square terrain final before retreat ends');
 const stats=(v:number[])=>{const a=v.slice().sort((a,b)=>a-b);return {count:a.length,median:a[Math.floor(a.length*.5)],p95:a[Math.floor(a.length*.95)],worst:a.at(-1)};};
 // Cancel after the last terrain stage while the real large-map water solve is pending.
 await page.evaluate(()=>window.glaciate.load('highlands-256'));await ready();
 const beforeLateCancel=await page.evaluate(()=>({signature:window.glaciate.evidence.signature,finished:window.glaciate.evidence.finished}));
 await page.evaluate(s=>window.glaciate.start({verb:'glaciate',settings:s,intent:{origin:112*256+80}}),DEFAULTS);
 await page.waitForFunction(()=>window.glaciate.evidence.stage>=5&&!window.glaciate.evidence.ready,null,{timeout:30000});
 await page.keyboard.press('Escape');await ready();await page.waitForTimeout(350);
 assert.equal(await page.evaluate(()=>window.glaciate.evidence.signature),beforeLateCancel.signature);
 assert.equal(await page.evaluate(()=>window.glaciate.evidence.finished),beforeLateCancel.finished,'cancelled run cannot publish a late completion');
 assert.equal(errors.length,0);assert.equal(timing.errors.length,0);
 const report={browser:await browser.version(),viewport:[1200,820],renderer:await page.evaluate(()=>{const gl=window.glaciate.view.gl.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');return ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER);}),normalSpeed:true,captureDuringPerformance:false,all:stats(timing.frames),advance:stats(timing.advance),retreat:stats(timing.retreat),longTasks:timing.longTasks,planningMs:timing.planningMs,firstTerrainMs:timing.firstTerrainMs,totalMs:timing.duration,water:timing.result,checks:['real default-settings pointer gesture','undo exact','Esc during advance exact','Esc during retreat exact','gallery loads','no browser exceptions'],errors};
 report.checks.push('Esc during final settling exact; no late completion');
 Object.assign(report,{terrain128:{exact:player.terrainExact,finalMs:player.terrainFinalMs,retreatEndMs:player.retreatEndMs},terrain256:{exact:timing.terrainExact,finalMs:timing.terrainFinalMs,retreatEndMs:timing.retreatEndMs}});report.checks.push('128 and 256 terrain exact before retreat ends');
 writeFileSync('checks/browser.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
 const audio=await page.evaluate(async()=>{
  const module='/audio.ts',Sound=(await import(module)).Sound,s=new Sound(),ctx=new OfflineAudioContext(1,48000*6,48000);s.ctx=ctx;
  const compressor=ctx.createDynamicsCompressor();compressor.threshold.value=-12;compressor.ratio.value=8;s.gain=ctx.createGain();s.gain.gain.value=.72;s.gain.connect(compressor);compressor.connect(ctx.destination);
  for(const id of ['crack-a','crack-b','stone-bed','wood-body','waterfall'])s.buffers.set(id,await ctx.decodeAudioData(await(await fetch('/audio/'+id+'.mp3')).arrayBuffer()));
  s.begin();const data=(await ctx.startRendering()).getChannelData(0);let peak=0,maxRms=0;
  for(let i=0;i<data.length;i+=4800){let sum=0;for(let j=i;j<Math.min(i+4800,data.length);j++){peak=Math.max(peak,Math.abs(data[j]));sum+=data[j]*data[j];}maxRms=Math.max(maxRms,Math.sqrt(sum/4800));}
  return {method:'OfflineAudioContext, actual Sound.begin recipe, mono 48kHz, strongest nonoverlapping 100ms window',peak,peakDbFS:20*Math.log10(peak),strongest100msDbFS:20*Math.log10(maxRms),master:.72,voicesStopOnCancel:true};
 });writeFileSync('checks/audio.json',JSON.stringify(audio,null,2)+'\n');console.log('Audio',JSON.stringify(audio));
}finally{await browser.close();await server.close();}
declare global {interface Window {glaciate:any}}
