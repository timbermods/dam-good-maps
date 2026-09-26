import assert from 'node:assert/strict';
import { mkdirSync,writeFileSync } from 'node:fs';
import { fixture,loadMap } from './maps';
import { DEFAULTS,quake,reveal,modelFor,snapshot,entityTiles,geology,QuakePlan,startProblem,type Settings,type Intent } from './engine';
import { canonicalSettle } from '../../src/core/sim/prefill';
import { WaterSim } from '../../src/core/sim/water';
import { operation,applyOperation } from './operation';
import { waterSource,blockObject } from '../../src/core/format/entities';
const passed:string[]=[],measurements:Record<string,unknown>[]=[];
const test=(name:string,fn:()=>void)=>{fn();passed.push(name);console.log('PASS '+name);};
const line=(W=128,y=W/2,side:1|-1=1):Intent=>({path:[{x:0,y},{x:W-1,y}],side});
const base=fixture('river'),settings={...DEFAULTS,seed:18},plan=quake(base,settings,line()),result=plan.map;
test('same seed and sliced preparation produce identical complete maps',()=>{
 const other=new QuakePlan(base,settings,line());while(!other.advance(1)){}assert.deepEqual(other.map,result);assert.deepEqual(quake(base,settings,line()).map,result);
});
test('seed changes the terrain, while hidden geology stays fixed',()=>{
 const keys=new Set<string>();for(let seed=0;seed<12;seed++){const p=quake(base,{...settings,seed},line());keys.add(Buffer.from(p.map.heights).toString('base64'));assert.deepEqual(p.map.rockLayers,base.rockLayers);}assert.equal(keys.size,12);
});
test('whole levels, 0–22, input immutability, changed buildable blocks',()=>{
 assert.deepEqual(base,fixture('river'));assert.ok(result.heights.every(h=>Number.isInteger(h)&&h>=0&&h<=22));assert.ok(plan.stats.changed>2500);
 let flat=0;for(let y=2;y<126;y++)for(let x=2;x<126;x++){const i=y*128+x;if(result.heights[i]===result.heights[i+1]&&result.heights[i]===result.heights[i+128])flat++;}assert.ok(flat>12000);
});
test('fault through the start refuses before any mutation; nearby bent paths also refuse',()=>{
 assert.throws(()=>quake(base,settings,line(128,11)),/Start here/);
 assert.throws(()=>quake(base,settings,{side:1,path:[{x:60,y:90},{x:10,y:11},{x:90,y:10}]}),/Start here/);assert.deepEqual(base,fixture('river'));
});
test('start moves vertically and sideways with a flat footprint and entrance',()=>{
 for(const mode of ['lift','slide'] as const){const m=quake(base,{...settings,mode},line(128,30,-1)).map,a=m.entities.find(e=>e.template==='StartingLocation')!,b=base.entities.find(e=>e.id===a.id)!;
  assert.ok(mode==='lift'?a.z!==b.z:a.x!==b.x||a.y!==b.y);for(const i of entityTiles(m,a,1))assert.equal(m.heights[i],a.z);assert.equal(entityTiles(m,a,1).length,25);
 }
});
test('start remains supported at every front and flooding is identified',()=>{
 const p=quake(base,settings,line(128,30,-1));let m=snapshot(base);for(let k=1;k<=8;k++){m=reveal(p,m,k);assert.equal(startProblem(m),null);}
 const e=m.entities.find(e=>e.template==='StartingLocation')!;m.water.depth[e.y*m.W+e.x]=1;assert.equal(startProblem(m),'Water would cover the start');
});
test('trees topple at the fault, all object identities and sources ride intact',()=>{
 const ids=result.entities.map(e=>e.id);assert.deepEqual(ids,base.entities.map(e=>e.id));assert.ok(result.fallen.length>0);assert.ok(result.entities.some((e,i)=>e.z!==base.entities[i].z));
 for(const e of base.entities.filter(e=>e.template==='WaterSource'))assert.deepEqual(result.entities.find(a=>a.id===e.id)?.components,e.components);
});
test('Slide offsets the river and fills map-edge gaps by ground continuation',()=>{
 const m=quake(base,{...settings,mode:'slide',power:85},line()).map;
 const bed=(y:number)=>{let min=Infinity,at=0;for(let x=0;x<128;x++)if(m.heights[y*128+x]<min){min=m.heights[y*128+x];at=x;}return at;};
 assert.ok(Math.abs(bed(76)-bed(52))>=9);assert.ok(m.heights.every(h=>h>=6&&h<=9));assert.ok(m.heights.slice(0,128).every(h=>h>=6));
});
test('two parallel faults form a rift valley or a ridge',()=>{
 const b=fixture('plain');for(const ridge of [false,true]){const a=quake(b,{...settings,seed:2},line(128,43,ridge?1:-1)).map,m=quake(a,{...settings,seed:5},line(128,80,ridge?-1:1)).map;
 const middle=m.heights[61*128+65],outer=(m.heights[30*128+65]+m.heights[94*128+65])/2;assert.ok(ridge?middle>outer+3:middle<outer-3);}
});
test('stepped scarps distribute displacement into separate benches',()=>{
 const a=quake(fixture('plain'),settings,line()).map,b=quake(fixture('plain'),{...settings,scarp:'stepped'},line()).map;
 assert.notDeepEqual(a.heights,b.heights);let count=0;for(let y=64;y<76;y++)if(b.heights[y*128+64]!==b.heights[(y+1)*128+64])count++;assert.ok(count>=2);
});
test('Slide transports water at each front without adding water volume',()=>{
 const p=quake(base,{...settings,mode:'slide'},line()),sum=(v:Float64Array)=>v.reduce((a,b)=>a+b,0);let state=snapshot(base);
 for(let step=1;step<=8;step++){const next=reveal(p,state,step);assert.ok(Math.abs(sum(next.water.depth)-sum(state.water.depth))<1e-8);state=next;}assert.deepEqual(state.heights,p.map.heights);
});
test('live river pours over a new lifted fault and final water is canonical',()=>{
 let m=snapshot(base);for(let step=1;step<=8;step++){m=reveal(plan,m,step);const sim=new WaterSim(modelFor(m),m.water).run(12);m.water={depth:sim.D,contamination:sim.C};}
 assert.notDeepEqual(m.water.depth,base.water.depth);
 const water=canonicalSettle(modelFor(m));m.water={depth:water.depth,contamination:water.contamination};
 const x=70;assert.ok(m.heights[67*128+x]-m.heights[61*128+x]>=5);assert.ok(m.water.depth[62*128+x]>.02);assert.ok(m.water.depth[67*128+x]>.02);
 const op=operation(base,m,settings,line(),water),json=JSON.parse(JSON.stringify(op));assert.deepEqual(applyOperation(base,json),m);assert.deepEqual(applyOperation(m,json,true),base);assert.deepEqual(applyOperation(applyOperation(m,json,true),json),m);
 assert.throws(()=>applyOperation(m,json),/Stale/);measurements.push({case:'river',settled:water.settled,ticks:water.ticks,operationBytes:JSON.stringify(op).length});
});
test('tilted lake spills during live simulation; no new source',()=>{
 const b=fixture('lake'),p=quake(b,{...settings,seed:29,power:85},line(128,55));let m=snapshot(b);
 for(let step=1;step<=8;step++){m=reveal(p,m,step);const sim=new WaterSim(modelFor(m),m.water).run(16);m.water={depth:sim.D,contamination:sim.C};}
 const sim=new WaterSim(modelFor(m),m.water).run(120);let newWet=0;for(let i=0;i<b.heights.length;i++)if(b.water.depth[i]<.01&&sim.D[i]>.05)newWet++;
 assert.ok(newWet>10,'lake must wet previously dry ground');assert.equal(m.entities.filter(e=>e.template==='WaterSource').length,1);measurements.push({case:'lake',newWet});
});
test('dry fault never invents water or sources',()=>{const b=fixture('plain'),p=quake(b,settings,line()),w=canonicalSettle(modelFor(p.map));assert.ok(w.depth.every(v=>v===0));assert.equal(p.map.entities.length,b.entities.length);});
test('replay rejects stale untouched terrain, changed geology and invalid saved objects',()=>{
 const b=fixture('plain'),a=quake(b,settings,line()).map,op=operation(b,a,settings,line(),{settled:true,ticks:0}),stale=snapshot(b);stale.heights[0]--;assert.throws(()=>applyOperation(stale,op),/Stale/);
 stale.heights[0]++;stale.rockLayers[0]=1-stale.rockLayers[0];assert.throws(()=>applyOperation(stale,op),/Stale/);
 const malformed=structuredClone(op);malformed.params.entitiesAfter[0].x=-1;assert.throws(()=>applyOperation(b,malformed),/Invalid saved object/);assert.deepEqual(b,fixture('plain'));
});
test('height caps, bent lines, high-power edge slides and 256² stay valid',()=>{
 for(const size of [128,256])for(const mode of ['lift','slide'] as const){const b=fixture('river',size),t=performance.now();const p=quake(b,{...settings,mode,power:100},{side:1,path:[{x:0,y:size*.4},{x:size*.4,y:size*.6},{x:size-1,y:size*.5}]});
  assert.ok(p.map.heights.every(h=>h>=0&&h<=22));assert.equal(p.map.entities.length,b.entities.length);for(const e of p.map.entities)assert.ok(e.x>=0&&e.x<size&&e.y>=0&&e.y<size);measurements.push({case:'plan',size,mode,ms:performance.now()-t});
 }
 const b=fixture('plain');b.maxHeight=16;b.heights.fill(16);b.rockLayers=geology(b.heights);assert.ok(quake(b,settings,line()).map.heights.every(h=>h<=16));
});
mkdirSync('captures',{recursive:true});writeFileSync('captures/checks.json',JSON.stringify({passed,measurements},null,2)+'\n');console.log(JSON.stringify(measurements,null,2));
