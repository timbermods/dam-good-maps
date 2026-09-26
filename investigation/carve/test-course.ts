import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { CarveRun,DEFAULTS,modelFor,type Settings } from './engine';
import { fixture } from './maps';
import { HEADING_LIMIT,PROGRESS_WINDOW,angleDelta,segmentsCross } from './course';
import { carveWaterSettle,carveWaterRun,oxbowBasin } from './water';
import { WaterSim } from '../../src/core/sim/water';
import { operation,applyOperation } from './operation';
const endings:Record<string,number>={},passed:string[]=[];
let runs=0,recoveries=0,maxStretch=0;
function routeChecks(r:CarveRun){
 const t=r.course.trace;
 assert.ok(r.metrics.stable);
 assert.ok(['lake','map edge','destination','power spent'].includes(r.metrics.reason));
 for(let i=0;i<t.length;i++){
  assert.ok(Math.abs(angleDelta(t[i].heading,t[i].bearing))<=HEADING_LIMIT+1e-9,'turn escaped its overall heading');
  if(i>=PROGRESS_WINDOW)assert.ok(t[i].cost<t[i-PROGRESS_WINDOW].cost-.049,'rolling reach failed to progress');
  if(t[i].straightening)recoveries++;
  for(let j=0;j<i-2;j++)assert.ok(!segmentsCross(t[i-1],t[i],t[j],t[j+1]),'head crossed its earlier path');
 }
 maxStretch=Math.max(maxStretch,r.metrics.distance/Math.max(r.map.W,r.map.H));
}
for(const [power,width] of [[15,6],[85,6],[65,null]] as const)for(const kind of ['mountain','ridge','uphill'])for(let wander=0;wander<=100;wander++){
 const W=64,m=fixture(kind,W),mode=kind==='mountain'?'unleash':'aim';
 const settings:Settings={...DEFAULTS,mode,power,wander,width,seed:1,defyGravity:true};
 const intent={origin:54*W+32,...(mode==='aim'?{end:8*W+32}:{})},r=new CarveRun(m,settings,intent);
 for(let k=0;k<1200&&!r.metrics.stable;k++)r.step();
 routeChecks(r);runs++;endings[mode+' '+power+' '+r.metrics.reason]=(endings[mode+' '+power+' '+r.metrics.reason]??0)+1;
 if(mode==='aim'&&power>=65)assert.equal(r.metrics.reason,'destination',kind+' Wander '+wander);
}
passed.push('All 101 Wander values at low/high Power and linked-width defaults on Unleash, Aim and uphill Aim: 909 complete runs without circling');
passed.push('Every rolling 16-move reach reduces endpoint distance or M9 downstream potential; stalled reaches straighten');
passed.push('Every heading stays within the same 110-degree guide limit; no head path intersects a non-adjacent segment');
assert.ok(recoveries>0,'the recovery guard must actually be exercised');
const m=fixture('oxbow',96),s={...DEFAULTS,mode:'aim' as const,power:85,width:6,wander:100,seed:1},intent={origin:80*96+48,end:1*96+48};
const r=new CarveRun(m,s,intent),sign=new Int8Array(m.heights.length);
function isolated(h:Uint8Array){
 const out=new Set<number>();for(let y=1;y<95;y++)for(let x=1;x<95;x++){const i=y*96+x,ns=[h[i-1],h[i+1],h[i-96],h[i+96]];if(h[i]<Math.min(...ns)||h[i]>Math.max(...ns))out.add(i);}return out;
}
const existing=isolated(m.heights);
for(let k=0;k<1200&&!r.metrics.stable;k++){
 const old=r.map.heights.slice();r.step();
 for(let i=0;i<old.length;i++){const d=Math.sign(r.map.heights[i]-old[i]);if(d){assert.ok(!sign[i]||sign[i]===d);sign[i]=d;}}
 for(const i of isolated(r.map.heights))assert.ok(existing.has(i),'cutoff left one-tile rubble');
 assert.equal(r.metrics.cut,r.metrics.deposited+r.metrics.exported+r.metrics.suspended);
}
routeChecks(r);assert.equal(r.metrics.reason,'destination');assert.equal(r.oxbows.length,1);
const cut=r.oxbows[0],at=(p:{x:number;y:number})=>Math.round(p.y)*96+Math.round(p.x);
assert.ok((cut.end-cut.start)*1.35>Math.hypot(cut.neck[0].x-cut.neck.at(-1)!.x,cut.neck[0].y-cut.neck.at(-1)!.y)*2.2);
const water=carveWaterSettle(r.map,r);
const wetPool=cut.pool.filter(p=>water.depth[at(p)]>1).length;
assert.ok(wetPool>12,'the abandoned bend must retain a lake under the actual game simulation');
for(const b of cut.bars){
 assert.equal(water.depth[at(b)],0,'both old mouths must be dry sediment barriers');
 assert.ok(r.sediment[at(b)]>0,'both mouths must contain deposited material');
 assert.ok(r.map.heights[at(b)]>=b.level);
}
const basin=oxbowBasin(r);assert.ok(basin.length>70,'a crescent basin must be disconnected from the main river');
assert.ok(cut.pool.every(p=>basin.includes(at(p))));
const follow=new WaterSim(modelFor(r.map),water);follow.run(256);
assert.ok(cut.pool.every(p=>follow.D[at(p)]>2),'the lake must survive further unmodified game simulation');
const sliced=carveWaterRun(r.map,r);let result=null;while(!result)result=sliced.advance(7);
assert.deepEqual(result,water,'both repo solves must be exact with different slice sizes');
const dryRun=new CarveRun(m,{...s,dry:true},intent);while(!dryRun.metrics.stable)dryRun.step();
assert.ok(carveWaterSettle(dryRun.map,dryRun).depth.every(v=>v===0),'dry canyon must never inject trapped water');
assert.ok(cut.neck.every(p=>water.depth[at(p)]>.05),'the new shortcut must carry the river');
const after={...r.map,water:{depth:water.depth,contamination:water.contamination}};
const op=operation(m,after,s,r.metrics.steps,r.metrics.reason,water);
assert.deepEqual(applyOperation(m,JSON.parse(JSON.stringify(op))),after);assert.deepEqual(applyOperation(after,op,true),m);
passed.push('Maximum Wander forms a real narrow-neck bend, cuts a shortcut and leaves a sealed crescent lake with deposited sediment and dry terrain at both old mouths');
passed.push('Retained lake survives 256 further repo ticks; two-stage settling is bit-exact across slice sizes; dry canyon stays dry');
passed.push('Oxbow carving stays monotone, conserves debris, creates no isolated extrema and replays/undoes exactly');
writeFileSync('captures/course-checks.json',JSON.stringify({passed,runs,endings,recoveryMoves:recoveries,maxTravelInMapWidths:maxStretch,headingLimitDegrees:110,progressWindowMoves:PROGRESS_WINDOW,oxbow:{step:cut.step,wetPoolStations:wetPool,basinTiles:basin.length,barSediment:cut.bars.map(b=>r.sediment[at(b)]),minimumLakeDepth:Math.min(...cut.pool.map(p=>water.depth[at(p)])),settled:water.settled}},null,2)+'\n');
console.log(passed.map(p=>'PASS '+p).join('\n'));
