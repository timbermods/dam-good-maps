import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fixture } from './maps';
import { DEFAULTS, impact, ImpactPlan, snapshot, protectedGround, autoCentre, naturalSize, modelFor, settleImpact, type Settings } from './engine';
import { operation, applyOperation } from './operation';
import { WaterSim } from '../../src/core/sim/water';
const passed:string[]=[];
function check(name:string,fn:()=>void){fn();passed.push(name);console.log('PASS '+name);}
const base=fixture(),intent={origin:64*128+64},settings={...DEFAULTS,power:62,seed:17};
const p=impact(base,settings,intent),after=p.map;
check('Same seed is byte identical; input stays untouched',()=>{
 assert.deepEqual(impact(base,settings,intent).map,after);assert.ok(base.heights.every(h=>h===11));
});
check('Row slicing does not change the result',()=>{
 const q=new ImpactPlan(base,settings,intent);while(!q.advance(1)){}assert.deepEqual(q.map,after);
});
check('Every setting combination remains whole levels 0–22',()=>{
 for(const centre of ['auto','bowl','peak','ring','flat'] as const)for(const walls of ['steep','terraced'] as const)for(const debris of ['light','heavy'] as const){
  const q=impact(base,{...settings,centre,walls,debris,rays:true},intent);
  assert.ok(q.map.heights.every(h=>Number.isInteger(h)&&h>=0&&h<=22));
 }
});
check('Auto centre follows diameter; manual size decouples depth',()=>{
 assert.equal(autoCentre(15),'bowl');assert.equal(autoCentre(40),'peak');assert.equal(autoCentre(90),'ring');
 const pit=impact(base,{...settings,size:14},intent),scar=impact(base,{...settings,size:100},intent);
 assert.ok(pit.anatomy.depth>scar.anatomy.depth);
 assert.equal(naturalSize(0),6);assert.equal(naturalSize(100),118);
});
check('Start rejects the strike and protects footprint plus entrance from nearby impacts',()=>{
 assert.throws(()=>impact(base,settings,{origin:8*128+7}),/Start here/);
 const q=impact(base,{...settings,power:100},{origin:20*128+20}),keep=protectedGround(base);
 keep.forEach((v,i)=>{if(v)assert.equal(q.map.heights[i],base.heights[i]);});
 assert.deepEqual(q.map.entities.find(e=>e.id==='start'),base.entities.find(e=>e.id==='start'));
});
check('Map edges clip a partial crater without wrapping',()=>{
 const q=impact(base,{...settings,size:30,rays:false},{origin:64*128});
 assert.notEqual(q.map.heights[64*128],11);assert.equal(q.map.heights[64*128+127],11);
});
check('Changing personality changes the rim while geology stays fixed',()=>{
 const q=impact(base,{...settings,seed:18},intent);assert.notDeepEqual(q.map.heights,after.heights);
 assert.deepEqual(q.map.rockLayers,base.rockLayers);
});
check('Bowl, peak, ring and flat have distinct interiors',()=>{
 const maps=['bowl','peak','ring','flat'].map(centre=>impact(base,{...settings,size:72,centre:centre as Settings['centre']},intent).map);
 assert.ok(maps[1].heights[intent.origin]>maps[3].heights[intent.origin]+3);
 assert.ok(maps[2].heights[intent.origin+14]>maps[2].heights[intent.origin]+2);
 assert.ok(maps[0].heights[intent.origin+12]>maps[0].heights[intent.origin]);
 assert.equal(maps[3].heights[intent.origin+12],maps[3].heights[intent.origin]);
});
check('Heavy ejecta raises a broader area several levels high',()=>{
 const light=impact(base,{...settings,size:40,debris:'light'},intent),heavy=impact(base,{...settings,size:40,debris:'heavy'},intent);
 const exterior=(q:ImpactPlan)=>Array.from(q.map.heights).reduce((sum,h,i)=>sum+(Math.hypot(i%128-64,Math.floor(i/128)-64)>22?Math.max(0,h-11):0),0);
 assert.ok(exterior(heavy)>exterior(light)*2);assert.ok(Math.max(...heavy.map.heights)>=15);
});
check('Aim elongates the crater and biases ejecta downrange',()=>{
 const q=impact(base,{...settings,size:40,mode:'aim'},{origin:intent.origin,end:intent.origin+50});
 assert.ok(q.anatomy.a>q.anatomy.b*1.5);
 let left=0,right=0;for(let y=0;y<128;y++)for(let x=0;x<128;x++){
   const d=q.map.heights[y*128+x]-11;if(d>0){if(x<64)left+=d;else right+=d;}
 }assert.ok(right>left*1.15);
});
check('Steep walls form cliffs; Terraced walls have broad benches',()=>{
 for(const centre of ['flat','bowl'] as const)for(const seed of [2,6,17]){
  const profiles=['steep','terraced'].map(walls=>{
   const q=impact(base,{...settings,power:74,size:54,centre,seed,walls:walls as Settings['walls']},intent);
   return Array.from({length:28},(_,x)=>q.map.heights[intent.origin+x]);
  });
  const jumps=profiles.map(p=>p.slice(1).map((h,i)=>h-p[i]));
  assert.ok(Math.max(...jumps[0])>=7,'Steep must contain a tall cliff face');
  assert.ok(jumps[1].filter(d=>d>=2).length>=4,'Terraced must have separate scarps');
  let benches=0;
  for(let x=12;x<24;x++)if(profiles[1][x]>profiles[1][0]&&profiles[1][x]===profiles[1][x+1]&&profiles[1][x]===profiles[1][x+2])benches++;
  assert.ok(benches>=3,'Terraced must leave several benches at least three tiles wide');
 }
});
check('Rays leave broken, broad, curved streaks and scattered secondary pits',()=>{
 const q=impact(base,{...settings,size:32,rays:true},intent),no=impact(base,{...settings,size:32,rays:false},intent);
 let ridges=0,pits=0;for(let i=0;i<base.heights.length;i++)if(Math.hypot(i%128-64,Math.floor(i/128)-64)>22){
   if(q.map.heights[i]===no.map.heights[i]+1)ridges++;if(q.map.heights[i]<11)pits++;
 }assert.ok(ridges>40);assert.ok(pits>15);
 let broad=0,broken=0,curved=0,near=0,far=0;
 for(const ray of q.anatomy.rays){
  const sections:{width:number;centre:number;t:number}[]=[];
  for(let d=Math.ceil(ray.start)+2;d<ray.length-1;d++){
   const offsets:number[]=[];
   for(let c=-18;c<=18;c++){
    const x=Math.round(64+ray.dx*d-ray.dy*c),y=Math.round(64+ray.dy*d+ray.dx*c),i=y*128+x;
    if(x>=0&&y>=0&&x<128&&y<128&&q.map.heights[i]>no.map.heights[i])offsets.push(c);
   }
   const t=(d-ray.start)/(ray.length-ray.start);
   sections.push({width:offsets.length,centre:offsets.length?offsets.reduce((a,b)=>a+b,0)/offsets.length:0,t});
   if(t<.5)near+=offsets.length;else far+=offsets.length;
  }
  if(sections.some(s=>s.width>=4))broad++;
  if(sections.some(s=>s.t>.2&&s.t<.65&&s.width===0))broken++;
  const centres=sections.filter(s=>s.width>=2).map(s=>s.centre);
  if(Math.max(...centres)-Math.min(...centres)>2)curved++;
 }
 assert.ok(broad>=5&&broken>=5&&curved>=5,'Most streaks must vary across their length');
 assert.ok(near>far*2,'The outer half must fade in coverage');
});
check('Ordinary rays fade before map edges; huge impacts may reach them',()=>{
 const ringBase=fixture('plain',256),origin=128*256+128;
 const rayMap=impact(ringBase,{...settings,power:97,size:104,centre:'ring',rays:true,seed:7},{origin}).map;
 const noRayMap=impact(ringBase,{...settings,power:97,size:104,centre:'ring',rays:false,seed:7},{origin}).map;
 for(let y=0;y<256;y++)for(let x=0;x<256;x++)if(x<16||y<16||x>=240||y>=240)assert.equal(rayMap.heights[y*256+x],noRayMap.heights[y*256+x]);
 const huge=impact(base,{...settings,size:100,rays:true},intent),noHuge=impact(base,{...settings,size:100,rays:false},intent);
 assert.ok(huge.map.heights.some((h,i)=>(i%128===0||i%128===127||i<128||i>=127*128)&&h!==noHuge.map.heights[i]));
});
let rayEvidence:Record<string,unknown>={};
check('Heavy rays make a raised starburst and pit chains; Light rays stay subtle',()=>{
 const ground=fixture('plain',256),hit={origin:128*256+128},s={...settings,power:97,size:104,centre:'ring' as const,seed:7};
 const strength=['heavy','light'].map(debris=>{
  const rays=impact(ground,{...s,debris:debris as Settings['debris'],rays:true},hit);
  const no=impact(ground,{...s,debris:debris as Settings['debris'],rays:false},hit);
  let raised=0,volume=0,multiLevel=0,pits=0,outerRaised=0;const sectors=new Array<number>(10).fill(0);
  for(let y=0;y<256;y++)for(let x=0;x<256;x++){
   const i=y*256+x,delta=rays.map.heights[i]-no.map.heights[i],d=Math.hypot(x-128,y-128);
   if(d<55){assert.equal(delta,0,'Rays must leave the accepted crater walls and centre untouched');continue;}
   if(delta>0){
    raised++;volume+=delta;if(delta>=2)multiLevel++;if(d>80)outerRaised++;
    const theta=(Math.atan2(y-128,x-128)+Math.PI*2+.1*Math.PI)%(Math.PI*2);
    sectors[Math.floor(theta/(Math.PI*.2))]++;
   }
   if(rays.map.heights[i]<ground.heights[i])pits++;
  }
  const op=operation(ground,rays.map,rays.settings,hit,{settled:true,ticks:0});
  assert.deepEqual(applyOperation(ground,JSON.parse(JSON.stringify(op))),rays.map);
  assert.deepEqual(applyOperation(rays.map,op,true),ground);
  return {raised,volume,multiLevel,pits,outerRaised,sectors};
 });
 const [heavy,light]=strength;
 assert.ok(heavy.raised>light.raised*3&&heavy.volume>light.volume*4);
 assert.ok(heavy.multiLevel>150&&heavy.outerRaised>300,'Heavy rays must retain visible relief far outside the rim');
 assert.ok(heavy.pits>light.pits*2&&heavy.pits>200,'Heavy must expose visible chains of secondary pits');
 assert.ok(heavy.sectors.every(n=>n>60),'Every arm must contribute to the starburst');
 assert.equal(light.multiLevel,0,'Light rays keep one-level relief');
 rayEvidence={heavy,light};
});
check('Blast erases central trees and flattens dead trees radially',()=>{
 assert.ok(p.stats.erased>0&&p.stats.flattened>0);
 for(const f of after.fallen){const e=after.entities.find(e=>e.id===f.id)!;assert.deepEqual(e.components.LivingNaturalResource,{IsDead:true});
 assert.ok((f.x-64)*f.dx+(f.y-64)*f.dy>0);}
});
check('Newer impacts overprint old rims; they are not constrained to a minimum height',()=>{
 const second=impact(after,{...settings,size:40},{origin:intent.origin+21});
 assert.ok(second.stats.cut>0&&second.stats.raised>0);assert.notDeepEqual(second.map.heights,after.heights);
 const op=operation(after,second.map,settings,{origin:intent.origin+21},{settled:true,ticks:0});
 assert.deepEqual(applyOperation(second.map,op,true),after);
});
check('Exact JSON result replays, undoes and redoes terrain, trees and water',()=>{
 const op=JSON.parse(JSON.stringify(operation(base,after,settings,intent,{settled:true,ticks:0})));
 assert.deepEqual(applyOperation(base,op),after);assert.deepEqual(applyOperation(after,op,true),base);
 assert.deepEqual(applyOperation(applyOperation(after,op,true),op),after);
 const stale=snapshot(base);stale.heights[op.params.terrain[0][0]]=22;assert.throws(()=>applyOperation(stale,op),/Stale/);
 op.params.terrain[0][2]=23;assert.throws(()=>applyOperation(base,op),/invalid/);
});
check('No source and no water are introduced on dry land',()=>{
 const q=impact(base,settings,intent);settleImpact(q.map);
 assert.ok(q.map.water.depth.every(v=>v===0));assert.equal(modelFor(q.map).emitters.length,0);
});
let riverEvidence:Record<string,unknown>={};
check('Heavy debris dams an existing river; upstream water rises from unchanged sources',()=>{
 const river=fixture('river'),originalSources=river.entities.filter(e=>e.template==='WaterSource');
 settleImpact(river);
 const q=impact(river,{...settings,power:75,size:34,centre:'bowl',debris:'heavy',rays:false},{origin:64*128+62});
 const x=84,sillBefore=river.heights[64*128+x],sillAfter=q.map.heights[64*128+x];
 const upstream=95*128+x,oldDepth=river.water.depth[upstream];
 const result=settleImpact(q.map);
 assert.ok(sillAfter>sillBefore);assert.ok(q.map.water.depth[upstream]>oldDepth+.4);
 assert.deepEqual(q.map.entities.filter(e=>e.template==='WaterSource'),originalSources);
 const flooded=q.map.water.depth.reduce((sum,d,i)=>sum+(i>70*128&&d>.1&&river.water.depth[i]<.01?1:0),0);
 assert.ok(flooded>100);
 riverEvidence={sillBefore,sillAfter,upstreamBefore:oldDepth,upstreamAfter:q.map.water.depth[upstream],newlyFloodedUpstream:flooded,...result};
});
check('Existing isolated water is conserved apart from simulation drainage/evaporation',()=>{
 const wet=snapshot(base);wet.water.depth[64*128+64]=10;
 const q=impact(wet,{...settings,size:24},intent);const before=q.map.water.depth.reduce((a,b)=>a+b,0);
 const sim=new WaterSim(modelFor(q.map),q.map.water);sim.run(100);
 assert.ok(sim.volume()<=before+1e-9&&sim.volume()>0);
});
const big=fixture('plain',256),times:number[]=[];
for(let k=0;k<8;k++){const t=performance.now();impact(big,{...settings,power:95,rays:true},{origin:128*256+128});times.push(performance.now()-t);}
mkdirSync('captures',{recursive:true});
writeFileSync('captures/checks.json',JSON.stringify({passed,river:riverEvidence,rays:rayEvidence,model256Ms:times},null,2)+'\n');
console.log(JSON.stringify({river:riverEvidence,rays:rayEvidence,model256Ms:times}));
