import { createCanvas,ImageData,type Canvas } from '@napi-rs/canvas';
import { GIFEncoder,quantize,applyPalette } from 'gifenc';
import { mkdirSync,writeFileSync } from 'node:fs';
import { CarveRun,DEFAULTS,objects,modelFor,type CarveMap,type Settings,type Intent,type Head } from './engine';
import { fixture,loadMap } from './maps';
import type { Oxbow } from './oxbow';
import { carveWaterSettle } from './water';
import { topDown,isometric,type Picture } from '../workshop/lib/render';
import { snapshot } from './meshes';
mkdirSync('captures',{recursive:true});
interface Frame {map:CarveMap;label:string;cut:number;deposited:number;head:Head|null;oxbow?:Oxbow}
function picture(p:Picture){
 const c=createCanvas(p.w,p.h),ctx=c.getContext('2d'),rgba=new Uint8ClampedArray(p.w*p.h*4);
 for(let i=0;i<p.w*p.h;i++){rgba[i*4]=p.rgb[i*3];rgba[i*4+1]=p.rgb[i*3+1];rgba[i*4+2]=p.rgb[i*3+2];rgba[i*4+3]=255;}
 ctx.putImageData(new ImageData(rgba,p.w,p.h),0,0);return c;
}
function panel(title:string,f:Frame,mainPlan=false):Canvas{
 const c=createCanvas(640,520),ctx=c.getContext('2d'),m=f.map;
 ctx.fillStyle='#f4f2e9';ctx.fillRect(0,0,640,520);ctx.fillStyle='#263e38';ctx.font='bold 20px sans-serif';ctx.fillText(title,18,29);
 ctx.font='15px sans-serif';ctx.fillText(f.label,18,55);
 ctx.font='12px sans-serif';ctx.fillStyle='#62766c';ctx.fillText(f.cut.toLocaleString()+' blocks cut · '+f.deposited+' deposited',18,77);
 const iso=picture(isometric(m.heights,m.W,m.H,m.water.depth,m.water.contamination,objects(m.entities),800));
 if(mainPlan){
  const plan=picture(topDown(m.heights,m.W,m.H,m.water.depth,m.water.contamination,objects(m.entities),420));
  ctx.imageSmoothingEnabled=false;ctx.drawImage(plan,20,100,350,350);ctx.drawImage(iso,382,124,250,175);
  const point=(p:{x:number;y:number})=>({x:20+(p.x+.5)/m.W*350,y:100+(m.H-p.y-.5)/m.H*350});
  if(f.head){const p=point(f.head);ctx.strokeStyle='#fff';ctx.lineWidth=2;ctx.beginPath();ctx.arc(p.x,p.y,4,0,Math.PI*2);ctx.stroke();}
  if(f.oxbow){
   for(const [text,p,y]of [
    ['Shortcut',f.oxbow.neck[Math.floor(f.oxbow.neck.length/2)],330],
    ['Old bend · oxbow lake',f.oxbow.pool[Math.floor(f.oxbow.pool.length/2)],374],
   ] as const){
    const at=point(p);ctx.strokeStyle='#b26935';ctx.fillStyle='#263e38';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(385,y-4);ctx.lineTo(at.x,at.y);ctx.stroke();ctx.beginPath();ctx.arc(at.x,at.y,3,0,Math.PI*2);ctx.stroke();
    ctx.font='14px sans-serif';ctx.fillText(text,386,y);
   }
   for(const b of f.oxbow.bars){const p=point(b);ctx.fillStyle='#f5d49b';ctx.strokeStyle='#864d2f';ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(p.x,p.y,4,0,Math.PI*2);ctx.fill();ctx.stroke();}
   ctx.fillStyle='#62766c';ctx.font='12px sans-serif';ctx.fillText(f.head?'The shortcut is opening.':'Two silt bars hold the crescent lake.',386,409);
   ctx.fillText('Gold markers: deposited mouth bars',386,429);
  }else{ctx.font='14px sans-serif';ctx.fillText('A broad swing, then a shortcut.',382,336);}
 }else{
 ctx.drawImage(iso,10,91,620,365);
 const plan=picture(topDown(m.heights,m.W,m.H,m.water.depth,m.water.contamination,objects(m.entities),170));
 ctx.fillStyle='#f4f2e9';ctx.fillRect(457,326,176,180);ctx.imageSmoothingEnabled=false;ctx.drawImage(plan,465,334,160,160);
 if(f.head){
  const x=465+(f.head.x+.5)/m.W*160,y=334+(m.H-f.head.y-.5)/m.H*160;
  ctx.strokeStyle='#fff';ctx.lineWidth=2;ctx.beginPath();ctx.arc(x,y,Math.max(3,f.head.width*160/m.W),0,Math.PI*2);ctx.stroke();
 }

 }
 ctx.fillStyle='#62766c';ctx.font='11px sans-serif';ctx.fillText('CPU capture of actual terrain states · inset: front in white',18,476);
 ctx.fillText('Final water: repository simulation. Visual effects and FPS: try the 3D demo.',18,501);
 return c;
}
function gif(file:string,canvases:Canvas[]){
 const enc=GIFEncoder();canvases.forEach((c,k)=>{
  const data=c.getContext('2d').getImageData(0,0,c.width,c.height).data,palette=quantize(data,128);
  enc.writeFrame(applyPalette(data,palette),c.width,c.height,{palette,delay:k===0?1200:k===canvases.length-1?2200:340,repeat:0});
 });enc.finish();writeFileSync('captures/'+file+'.gif',enc.bytes());
}
function sheet(file:string,title:string,frames:Frame[],mainPlan=false){
 const chosen=[frames[0],frames[Math.floor(frames.length/2)],frames[frames.length-1]],c=createCanvas(1260,342),ctx=c.getContext('2d');
 chosen.forEach((f,k)=>ctx.drawImage(panel(title,f,mainPlan),k*420,0,420,342));writeFileSync('captures/'+file+'.png',c.toBuffer('image/png'));
}
const results:Record<string,unknown>={};
function sequence(id:string,title:string,m:CarveMap,s:Partial<Settings>,intent:Intent,publish=true){
 const run=new CarveRun(m,{...DEFAULTS,...s},intent),frames:Frame[]=[{map:snapshot(m),label:'Before',cut:0,deposited:0,head:null}];
 for(let k=1;k<=900&&!run.metrics.stable;k++){
  run.step();
  if(k%8===0&&!run.metrics.stable)frames.push({map:snapshot(run.map),label:(k/10).toFixed(1)+(run.metrics.oxbows?' s · neck shortcut + oxbow':' s · carving'),cut:run.metrics.cut,deposited:run.metrics.deposited,head:{...run.head},oxbow:run.oxbows.at(-1)});
 }
 const w=carveWaterSettle(run.map,run),last=snapshot(run.map);last.water={depth:w.depth,contamination:w.contamination};
 frames.push({map:last,label:'After · '+run.metrics.reason+' · '+(run.metrics.steps/10).toFixed(1)+' s',cut:run.metrics.cut,deposited:run.metrics.deposited,head:null,oxbow:run.oxbows.at(-1)});
 results[id]={intent,settings:run.settings,metrics:run.metrics,oxbows:run.oxbows.map(o=>({start:o.start,end:o.end,step:o.step,floor:o.floor,bars:o.bars})),water:{settled:w.settled,ticks:w.ticks,method:w.method??'canonical',preClosure:w.preClosure}};
 const n=Math.min(18,frames.length),selected=Array.from({length:n},(_,i)=>frames[Math.round(i*(frames.length-1)/(n-1))]);
 if(publish){const plan=id==='maximum-wander-oxbow';gif(id,selected.map(f=>panel(title,f,plan)));sheet(id,title,selected,plan);}
 console.log(id,run.metrics.cut,run.metrics.reason);return selected;
}
const mountain=fixture('mountain',64),intent={origin:54*64+32};
const high=sequence('unleashed-mountain','Unleash · a river bursts down a mountain',mountain,{power:95},intent);
sequence('aimed-ridge','Aim · split a ridge, open new land',fixture('ridge',64),{mode:'aim',power:95,walls:'wide'},{...intent,end:10*64+32});
sequence('defy-uphill','Defy gravity · lower the land ahead',fixture('uphill',64),{mode:'aim',power:95,defyGravity:true},{...intent,end:10*64+32});
const low=sequence('creek-mountain','Low power · the mountain keeps its shape',mountain,{power:15},intent,false);
const paired:Canvas[]=[];
for(let k=0;k<Math.max(low.length,high.length);k++){
 const c=createCanvas(960,390),ctx=c.getContext('2d');
 ctx.drawImage(panel('Power 15 · Creek',low[Math.min(k,low.length-1)]),0,0,480,390);
 ctx.drawImage(panel('Power 95 · Catastrophe',high[Math.min(k,high.length-1)]),480,0,480,390);paired.push(c);
}
gif('low-high-power',paired);writeFileSync('captures/low-high-power.png',paired[paired.length-1].toBuffer('image/png'));
function compare(id:string,leftTitle:string,rightTitle:string,left:Frame[],right:Frame[]){
 const frames:Canvas[]=[];
 for(let k=0;k<Math.max(left.length,right.length);k++){
  const c=createCanvas(960,390),ctx=c.getContext('2d');
  ctx.drawImage(panel(leftTitle,left[Math.min(k,left.length-1)]),0,0,480,390);
  ctx.drawImage(panel(rightTitle,right[Math.min(k,right.length-1)]),480,0,480,390);frames.push(c);
 }
 gif(id,frames);writeFileSync('captures/'+id+'.png',frames[frames.length-1].toBuffer('image/png'));
}
const ridge96=fixture('ridge',96),aim96={origin:80*96+48,end:14*96+48};
const fixed={mode:'aim' as const,power:85,width:6,seed:1};
compare('straight-winding','Wander 0 · charges ahead','Wander 100 · overshoots bends',
 sequence('straight','',ridge96,{...fixed,wander:0},aim96,false),
 sequence('winding','',ridge96,{...fixed,wander:100},aim96,false));
compare('slot-wide','Slot · Power 95 · Width 2','Lazy · Power 15 · Width 24',
 sequence('slot','',ridge96,{...fixed,power:95,width:2,wander:15},aim96,false),
 sequence('wide-lazy','',ridge96,{...fixed,power:15,width:24,wander:15},aim96,false));
compare('rerolled-paths','Same carve · Personality 1','Same carve · Personality 2',
 sequence('personality-1','',ridge96,{...fixed,wander:65,seed:1},aim96,false),
 sequence('personality-2','',ridge96,{...fixed,wander:65,seed:2},aim96,false));
sequence('split-reach','Two channels · around hard rock, then together',fixture('uphill',96),
 {mode:'aim',defyGravity:true,power:85,wander:35,seed:1},aim96);
sequence('maximum-wander-oxbow','Wander 100 · cut the neck, leave an oxbow',fixture('oxbow',96),
 {mode:'aim',power:85,width:6,wander:100,seed:1},{origin:80*96+48,end:1*96+48});
const m=await loadMap('seed:highlands:18:128');let origin=0,best=-Infinity;
for(let y=16;y<112;y++)for(let x=16;x<112;x++){const i=y*128+x;if(m.water.depth[i]>.05)continue;
 const score=m.heights[i]-.01*Math.hypot(x-64,y-80);if(score>best){best=score;origin=i;}
}
sequence('generated-force','Unleash · M9 Highlands seed 18 · 128²',m,{power:90,walls:'wide'},{origin});
writeFileSync('captures/scenarios.json',JSON.stringify(results,null,2)+'\n');
