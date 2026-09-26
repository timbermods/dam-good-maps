import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { FaultBrush } from './brush';
import { fixture } from './maps';
import { DEFAULTS,quake,faultReason,snapshot,hash,modelFor,reveal,type Intent } from './engine';
import { canonicalSettle } from '../../src/core/sim/prefill';
import { WaterSim } from '../../src/core/sim/water';
const passed:string[]=[],pass=(s:string)=>{passed.push(s);console.log('PASS '+s);};

// Reproduce the old failure: the first sampled movement was only two tiles,
// while the cursor's refusal check constructed a Fault requiring three.
const b=fixture('plain',48);
for(const distance of [0,.000001,.01,.2,.9,1.99,2,2.99,3,20]){
 const i:Intent={side:1,path:[{x:25.2,y:25.4},{x:25.2+distance,y:25.4}]};
 assert.equal(faultReason(b,i),null);assert.ok(quake(b,DEFAULTS,i).stats.changed>0);
}
pass('tap, sub-tile and formerly failing short strokes all make a quake');

const pen=new FaultBrush({x:20,y:20},48,48);pen.aim({x:30,y:24});pen.advance(1/144);
assert.ok(pen.intent().path.at(-1)!.x>20&&pen.intent().path.at(-1)!.x<30);
for(let k=0;k<10000;k++){pen.aim({x:24+20*Math.sin(k*.03),y:24+20*Math.cos(k*.03)});pen.advance(1/144);}
pen.aim({x:10.25,y:12.75});pen.advance(0,true);pen.side=-1;
assert.deepEqual(pen.intent().path.at(-1),{x:10.25,y:12.75});assert.equal(pen.intent().side,-1);assert.ok(pen.intent().path.length<=512);
pass('pen smooths sub-tile positions, reaches the release point, flips, and bounds long strokes');

let accepted=0,refused=0;const cases=1200,t0=performance.now();
for(let seed=0;seed<cases;seed++){
 const m=snapshot(b);if(seed%4===0){m.heights.fill(seed%8===0?0:22);for(const e of m.entities)e.z=m.heights[e.y*m.W+e.x];}
 const x=hash(seed,1)*47,y=hash(seed,2)*47,n=seed%5+2,points=[];
 for(let k=0;k<n;k++)points.push(seed%4===1?{x:Math.max(0,Math.min(47,x+k*hash(seed,k+30)*.15)),y}:{x:hash(seed,k*2+10)*47,y:hash(seed,k*2+11)*47});
 const intent:Intent={path:points,side:seed%2?1:-1},settings={...DEFAULTS,power:seed%101,seed,mode:seed%3?'lift' as const:'slide' as const,scarp:seed%2?'sheer' as const:'stepped' as const};
 const reason=faultReason(m,intent);
 if(reason){assert.equal(reason,'Start here');assert.throws(()=>quake(m,settings,intent),/Start here/);refused++;continue;}
 const p=quake(m,settings,intent);assert.ok(settings.mode==='slide'?p.stats.fullOffset>0:p.stats.changed>0,`non-refused stroke ${seed} must change ground`);
 assert.ok(p.map.heights.every(h=>h>=0&&h<=22));assert.deepEqual(p.map.entities.map(e=>e.id),m.entities.map(e=>e.id));accepted++;
}
pass(`${cases} seeded random strokes: ${accepted} quakes, ${refused} explicit start refusals, zero silent failures`);

const riverResults:Record<string,unknown>[]=[];
for(const side of [1,-1] as const)for(const scarp of ['sheer','stepped'] as const)for(const diagonal of [false,true]){
 const base=fixture('river',96),intent:Intent={side,path:diagonal?[{x:0,y:39},{x:95,y:57}]:[{x:0,y:48},{x:95,y:48}]};
 const settings={...DEFAULTS,mode:'slide' as const,power:85,scarp,seed:18},plan=quake(base,settings,intent),m=plan.map;
 assert.ok(plan.stats.channel>0);assert.equal(m.entities.filter(e=>e.template==='WaterSource').length,7);
 let live=snapshot(base);for(let k=1;k<=8;k++){live=reveal(plan,live,k);const sim=new WaterSim(modelFor(live),live.water).run(12);live.water={depth:sim.D,contamination:sim.C};}
 const sim=new WaterSim(modelFor(live),live.water).run(400);const wet=canonicalSettle(modelFor(m));
 // Flood-fill actual WATER from the transported upstream sources to the old
 // downstream reach. A carved but dry path or an upstream pond cannot pass.
 const connected=(depth:Float64Array)=>{
  const q:number[]=m.entities.filter(e=>e.template==='WaterSource').map(e=>e.y*m.W+e.x),seen=new Set(q);
  for(let k=0;k<q.length;k++){const i=q[k],x=i%m.W,y=Math.floor(i/m.W);if(y<8)return true;
   for(const [xx,yy]of [[x-1,y],[x+1,y],[x,y-1],[x,y+1]]){const j=yy*m.W+xx;if(xx<0||yy<0||xx>=m.W||yy>=m.H||seen.has(j)||depth[j]<.02)continue;seen.add(j);q.push(j);}
  }return false;
 };
 assert.ok(connected(sim.D),`live river must flow through ${side}/${scarp}/${diagonal}`);
 assert.ok(connected(wet.depth),`canonical river must flow through ${side}/${scarp}/${diagonal}`);
 const downstream=Array.from({length:20},(_,y)=>Array.from(wet.depth.slice(y*96,(y+1)*96)).filter(v=>v>.02).length);
 assert.ok(downstream.every(n=>n>=3),'old downstream course stays wet');riverResults.push({side,scarp,diagonal,channel:plan.stats.channel,ticks:wet.ticks,settled:wet.settled});
}
pass('Slide rivers stay connected and wet downstream, live and canonical, on both sides and scarp styles');
writeFileSync('captures/brush-checks.json',JSON.stringify({passed,random:{cases,accepted,refused,ms:performance.now()-t0},rivers:riverResults},null,2)+'\n');
