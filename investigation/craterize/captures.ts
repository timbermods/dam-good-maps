import { createCanvas,loadImage,type Canvas } from '@napi-rs/canvas';
import { GIFEncoder,quantize,applyPalette } from 'gifenc';
import { mkdirSync,readFileSync,writeFileSync } from 'node:fs';
import { browserHarness } from './browser-harness';
import { DEFAULTS,type Settings,type Intent } from './engine';
const {page,idle,close,errors}=await browserHarness(1000,800);
mkdirSync('captures',{recursive:true});mkdirSync('local',{recursive:true});
const raysOnly=process.argv.includes('--rays');
const scenarios:Record<string,unknown>=raysOnly?JSON.parse(readFileSync('captures/scenarios.json','utf8')):{},stills:{title:string;canvas:Canvas}[]=[];
interface Shot{png:string;label:string;age:number|null}
async function shot(label:string):Promise<Shot>{return page.evaluate(label=>({png:(window as any).craterize.image(),label,age:(window as any).craterize.state.age}),label);}
async function sequence(id:string,title:string,map:string,s:Partial<Settings>,intent:Intent,span:number,overlap=false,publish=true){
 await page.evaluate(map=>(window as any).craterize.load(map),map);await idle();
 const settings={...DEFAULTS,...s};await page.evaluate(({settings,intent,span})=>{
  const c=(window as any).craterize;c.setSettings(settings);c.focus(intent.origin%c.state.W,Math.floor(intent.origin/c.state.W),span);
 },{settings,intent,span});await page.waitForTimeout(120);
 if(overlap){await page.evaluate(()=>(window as any).craterize.strike({origin:62*128+51}));await idle();}
 const frames:Shot[]=[await shot(overlap?'Older crater':'Before')];
 await page.evaluate(intent=>(window as any).craterize.strike(intent),intent);
 await page.waitForFunction(()=>(window as any).craterize.state.age!==null,undefined,{timeout:60000});
 for(const time of [.16,.27,.50,.78,1.07,1.39]){
  await page.waitForFunction(time=>{const age=(window as any).craterize.state.age;return age===null||age>=time;},time);
  frames.push(await shot('Impact'));
 }
 await idle();frames.push(await shot('After · water settled'));
 const op=await page.evaluate(()=>(window as any).craterize.operation);
 scenarios[id]={title,map,settings:op.params.settings,intent:op.params.intent,settled:op.params.settled,waterTicks:op.params.settleTicks,frameTimes:frames.map(f=>f.age),changed:op.params.terrain.length};
 const panels:Canvas[]=[];
 for(const f of frames){
  const c=createCanvas(560,450),ctx=c.getContext('2d');ctx.fillStyle='#1c2924';ctx.fillRect(0,0,560,450);
  ctx.fillStyle='#f1dfbf';ctx.font='bold 18px sans-serif';ctx.fillText(title,15,25);
  ctx.font='11px sans-serif';ctx.fillStyle='#aab9ac';ctx.fillText('CRATERIZE  /  '+f.label+(f.age!==null?' · '+f.age.toFixed(2)+' s':''),15,45);
  const image=await loadImage(Buffer.from(f.png.split(',')[1],'base64'));ctx.drawImage(image,0,58,560,365);
  ctx.fillStyle='#b8c4b7';ctx.font='11px sans-serif';ctx.fillText('Power '+op.params.settings.power+' · '+(op.params.settings.size??'Auto')+' tiles · '+op.params.settings.centre+' · seed '+op.params.settings.seed,15,441);
  panels.push(c);
 }
 if(publish){gif(id,panels);stills.push({title,canvas:panels.at(-1)!});}
 console.log('CAPTURED '+id);return panels;
}
function gif(id:string,frames:Canvas[]){
 const encoder=GIFEncoder();
 frames.forEach((c,i)=>{const rgba=c.getContext('2d').getImageData(0,0,c.width,c.height).data,palette=quantize(rgba,96);
  encoder.writeFrame(applyPalette(rgba,palette),c.width,c.height,{palette,delay:i===0?650:i===frames.length-1?1600:190,repeat:0});});
 encoder.finish();writeFileSync('captures/'+id+'.gif',encoder.bytes());
}
try{
 if(!raysOnly){
  await sequence('small-bowl','A small bowl','fixture:plain:128',{power:22,size:22,centre:'bowl',walls:'steep',debris:'light',seed:2},{origin:64*128+64},53);
  await sequence('peak','A mountain rebounds','fixture:plain:128',{power:62,size:52,centre:'peak',seed:5},{origin:64*128+64},104);
 }
 const ring=await sequence('ring-rays','A ring crater with a debris starburst','fixture:plain:256',{power:97,size:104,centre:'ring',rays:true,seed:7},{origin:128*256+128},230);
 writeFileSync('captures/ring-rays.png',ring.at(-1)!.toBuffer('image/png'));
 await sequence('glancing','A glancing strike throws downrange','fixture:plain:128',{power:66,size:38,mode:'aim',centre:'bowl',rays:true,seed:11},{origin:64*128+56,end:77*128+110},127);
 if(!raysOnly){
 await sequence('river-dam','Debris dams the river','fixture:river:128',{power:75,size:34,centre:'bowl',seed:17},{origin:64*128+62},122);
 await sequence('overlap','The newest rim cuts through the old','fixture:plain:128',{power:58,size:42,centre:'peak',seed:9},{origin:67*128+78},112,true);
 const steep=await sequence('walls-steep','Steep walls','fixture:plain:128',{power:74,size:54,centre:'flat',walls:'steep',seed:6},{origin:64*128+64},98,false,false);
 const terraced=await sequence('walls-terraced','Terraced walls','fixture:plain:128',{power:74,size:54,centre:'flat',walls:'terraced',seed:6},{origin:64*128+64},98,false,false);
 const pair=steep.map((c,i)=>{const p=createCanvas(784,315),ctx=p.getContext('2d');ctx.drawImage(c,0,0,392,315);ctx.drawImage(terraced[i],392,0,392,315);return p;});
 gif('walls',pair);stills.push({title:'Steep',canvas:steep.at(-1)!},{title:'Terraced',canvas:terraced.at(-1)!});
 const walls=createCanvas(1120,450),wallsContext=walls.getContext('2d');
 wallsContext.drawImage(steep.at(-1)!,0,0);wallsContext.drawImage(terraced.at(-1)!,560,0);
 writeFileSync('captures/walls.png',walls.toBuffer('image/png'));
 const contact=createCanvas(1120,1800),ctx=contact.getContext('2d');ctx.fillStyle='#1c2924';ctx.fillRect(0,0,1120,1800);
 stills.forEach((s,i)=>ctx.drawImage(s.canvas,(i%2)*560,Math.floor(i/2)*450,560,450));
 writeFileSync('captures/contact-sheet.jpg',contact.toBuffer('image/jpeg',82));
 }else{
  const contact=createCanvas(1120,1800),ctx=contact.getContext('2d');
  ctx.drawImage(await loadImage('captures/contact-sheet.jpg'),0,0);
  stills.forEach((s,i)=>ctx.drawImage(s.canvas,i*560,450));
  writeFileSync('captures/contact-sheet.jpg',contact.toBuffer('image/jpeg',82));
 }
 writeFileSync('captures/scenarios.json',JSON.stringify(scenarios,null,2)+'\n');
 if(errors.length)throw Error(errors.join('\n'));
}finally{await close();}
