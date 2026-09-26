// Carve's CPU capture pipeline, recording real Quake fronts and repository water.
import { createCanvas,ImageData,type Canvas } from '@napi-rs/canvas';
import { GIFEncoder,quantize,applyPalette } from 'gifenc';
import { mkdirSync,writeFileSync,readFileSync } from 'node:fs';
import { topDown,isometric,type Picture } from '../workshop/lib/render';
import { canonicalSettle } from '../../src/core/sim/prefill';
import { WaterSim } from '../../src/core/sim/water';
import { fixture } from './maps';
import { quake,paintWater,snapshot,modelFor,DEFAULTS,type QuakePlan,type QuakeMap,type Settings,type Intent } from './engine';
import { operation } from './operation';
interface Frame {map:QuakeMap;label:string}
const objects=(m:QuakeMap)=>m.entities.map(e=>({...e,components:{...e.before,...e.components}}));
function picture(p:Picture){const c=createCanvas(p.w,p.h),ctx=c.getContext('2d'),rgba=new Uint8ClampedArray(p.w*p.h*4);for(let i=0;i<p.w*p.h;i++){rgba.set(p.rgb.subarray(i*3,i*3+3),i*4);rgba[i*4+3]=255;}ctx.putImageData(new ImageData(rgba,p.w,p.h),0,0);return c;}
function panel(title:string,f:Frame):Canvas{
 const c=createCanvas(600,450),ctx=c.getContext('2d'),m=f.map;ctx.fillStyle='#f4f2e9';ctx.fillRect(0,0,c.width,c.height);ctx.fillStyle='#263e38';ctx.font='bold 21px sans-serif';ctx.fillText(title,18,30);ctx.font='14px sans-serif';ctx.fillText(f.label,18,53);
 const iso=picture(isometric(m.heights,m.W,m.H,m.water.depth,m.water.contamination,objects(m),740));ctx.drawImage(iso,8,63,584,336);
 const plan=picture(topDown(m.heights,m.W,m.H,m.water.depth,m.water.contamination,objects(m),144));ctx.fillStyle='#f4f2e9';ctx.fillRect(441,258,154,154);ctx.drawImage(plan,446,263,144,144);
 ctx.fillStyle='#62766c';ctx.font='11px sans-serif';ctx.fillText('Actual model states · live water, then the repository’s canonical result',18,432);return c;
}
function gif(name:string,canvases:Canvas[]){const enc=GIFEncoder();canvases.forEach((c,k)=>{const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data,palette=quantize(d,128);enc.writeFrame(applyPalette(d,palette),c.width,c.height,{palette,repeat:0,delay:k===0?850:k===canvases.length-1?1700:180});});enc.finish();writeFileSync('captures/'+name+'.gif',enc.bytes());}
function save(name:string,title:string,frames:Frame[]){gif(name,frames.map(f=>panel(title,f)));const c=createCanvas(1200,300),ctx=c.getContext('2d');[frames[0],frames[4],frames.at(-1)!].forEach((f,k)=>ctx.drawImage(panel(title,f),k*400,0,400,300));writeFileSync('captures/'+name+'.png',c.toBuffer('image/png'));}
const slideOnly=process.argv.includes('--slide-only');
const scenarios:Record<string,unknown>=slideOnly?JSON.parse(readFileSync('captures/scenarios.json','utf8')):{};
function sequence(id:string,m:QuakeMap,s:Settings,intent:Intent){
 const plan=quake(m,s,intent),frames:Frame[]=[{map:snapshot(m),label:'Before · personality '+s.seed}];let state=snapshot(m),previous:QuakePlan|null=null;
 // The stroke grows under the pen now; don't replay the retired release-then-race interaction.
 const distances=intent.path.slice(1).map((p,k)=>Math.hypot(p.x-intent.path[k].x,p.y-intent.path[k].y)),length=distances.reduce((a,b)=>a+b,0);
 for(let step=1;step<=8;step++){
  const path=[intent.path[0]];let remaining=length*step/8;
  for(let k=0;k<distances.length;k++){const a=intent.path[k],b=intent.path[k+1],f=Math.min(1,remaining/distances[k]);path.push({x:a.x+(b.x-a.x)*f,y:a.y+(b.y-a.y)*f});remaining-=distances[k];if(remaining<=0)break;}
  const p=step===8?plan:quake(m,s,{...intent,path}),water=paintWater(state,p,previous);state=snapshot(p.map);state.water=water;
  const sim=new WaterSim(modelFor(state),state.water).run(12);state.water={depth:sim.D,contamination:sim.C};previous=p;
  frames.push({map:snapshot(state),label:'Painting · '+Math.round(step/8*100)+'% · ground follows the pen'});
 }
 const live=new WaterSim(modelFor(state),state.water);for(let k=0;k<3;k++){live.run(48);state.water={depth:live.D.slice(),contamination:live.C.slice()};frames.push({map:snapshot(state),label:'Water moving across the new land'});}
 const w=canonicalSettle(modelFor(state));state.water={depth:w.depth,contamination:w.contamination};frames.push({map:snapshot(state),label:'After · canonical water · personality '+s.seed});
 scenarios[id]={settings:s,intent,stats:plan.stats,water:{settled:w.settled,ticks:w.ticks}};console.log('Captured '+id);return frames;
}
mkdirSync('captures',{recursive:true});mkdirSync('samples',{recursive:true});
const line=(y=64,side:1|-1=1):Intent=>({side,path:[{x:0,y},{x:127,y}]}),s={...DEFAULTS,seed:18,power:65};
save('river-slide','Slide · 20 tiles of ridge and river offset',sequence('river-slide',fixture('slide'),{...s,mode:'slide',power:100},line()));
if(!slideOnly){
save('river-lift','Lift · a river becomes a waterfall',sequence('river-lift',fixture('river'),s,line()));
const first=sequence('rift-first',fixture('plain'),{...s,seed:2},line(43,-1)),second=sequence('rift-second',first.at(-1)!.map,{...s,seed:5},line(80,1));
save('rift-valley','Two faults · a new rift valley',[...first.slice(0,9),...second]);
save('lake-spill','Lift & tilt · a lake spills',sequence('lake-spill',fixture('lake'),{...s,seed:29,power:85},line(55)));
const sheer=sequence('sheer',fixture('river'),s,line()),stepped=sequence('stepped',fixture('river'),{...s,scarp:'stepped'},line());
const comparison=sheer.map((f,k)=>{const c=createCanvas(960,360),ctx=c.getContext('2d');ctx.drawImage(panel('Sheer · one cliff',f),0,0,480,360);ctx.drawImage(panel('Stepped · parallel benches',stepped[k]),480,0,480,360);return c;});gif('scarps',comparison);writeFileSync('captures/scarps.png',comparison.at(-1)!.toBuffer('image/png'));
const small=fixture('plain',32),intent:Intent={side:1,path:[{x:0,y:24},{x:31,y:24}]},after=quake(small,s,intent).map,w=canonicalSettle(modelFor(after));after.water={depth:w.depth,contamination:w.contamination};
writeFileSync('samples/tiny-quake.json',JSON.stringify({format:1,base:small,quakeBase:small,operation:operation(small,after,s,intent,w)},(_k,v)=>ArrayBuffer.isView(v)?Array.from(v as unknown as number[]):v)+'\n');
}
writeFileSync('captures/scenarios.json',JSON.stringify(scenarios,null,2)+'\n');
