import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { fixture } from './maps';
import { DEFAULTS,quake,faultReason,snapshot,hash,slideTiles,paintWater,type Intent } from './engine';
import { blockObject } from '../../src/core/format/entities';
import { slideMotion,makeChunk,frameContext } from './meshes';

const base=fixture('plain',64),cases=1600;
// Spatially varying ground: detecting any changed height cannot prove a slide.
// Instead follow source tiles to their actual destinations and compare heights.
for(let y=0;y<64;y++)for(let x=0;x<64;x++)base.heights[y*64+x]=3+(x*7+y*11+x*y)%17;
base.entities=base.entities.filter(e=>e.template==='StartingLocation');
for(let y=9;y<14;y++)for(let x=8;x<13;x++)base.heights[y*64+x]=9;
let accepted=0,refused=0,minFull=Infinity,minActual=Infinity;
const start=performance.now();
for(let seed=0;seed<cases;seed++){
 const x=hash(seed,1)*63,y=hash(seed,2)*63,points=[];
 for(let k=0;k<seed%5+2;k++)points.push(seed%4===0?{x:Math.min(63,x+k*(seed%8===0?0:.013)),y}:{x:hash(seed,k*2+10)*63,y:hash(seed,k*2+11)*63});
 const intent:Intent={side:seed%2?1:-1,path:points};
 const settings={...DEFAULTS,mode:'slide' as const,seed,power:seed%101,scarp:seed%3?'sheer' as const:'stepped' as const};
 if(faultReason(base,intent)){refused++;assert.throws(()=>quake(base,settings,intent),/Start here/);continue;}
 const p=quake(base,settings,intent),expected=slideTiles(settings.power);let witnesses=0,best=0;
 for(let j=0;j<p.source.length;j++){
  const i=p.source[j],dx=j%64-i%64,dy=Math.floor(j/64)-Math.floor(i/64),distance=Math.hypot(dx,dy);
  // A witness must be real forward-transported terrain (not gap filling),
  // preserve the original height, and travel at least the UI's Power label.
  if(dx!==p.dx[i]||dy!==p.dy[i]||p.map.heights[j]!==base.heights[i])continue;
  best=Math.max(best,distance);if(distance>=expected)witnesses++;
 }
 assert.ok(witnesses>=3,`Slide ${seed}/${settings.power}/${settings.scarp}: only ${witnesses} full-offset tiles, expected ${expected}, best ${best}`);
 minFull=Math.min(minFull,witnesses);minActual=Math.min(minActual,best/expected);accepted++;
 assert.ok(p.map.heights.every(h=>h>=0&&h<=22));
}
console.log(`PASS ${cases} random Slide strokes: ${accepted} actual full-offset transports, ${refused} start refusals; minimum ${minFull} source-matched tiles`);

// Recognisable features and object IDs cross a straight fault by exactly Power.
for(const power of [0,10,25,50,75,100])for(const scarp of ['sheer','stepped'] as const)for(const side of [1,-1] as const){
 const m=fixture('river',128),y=side===1?86:38,x=30;
 for(let yy=y;yy<y+4;yy++)for(let xx=x;xx<x+5;xx++)m.heights[yy*128+xx]=14+(xx-x)%3;
 m.entities=m.entities.filter(e=>e.template==='StartingLocation'||e.template==='WaterSource');
 m.entities.push(blockObject({id:'ridge-ruin',template:'RuinColumnH3',x:x+2,y,z:16,orientation:'Cw0',flipped:false,owner:'quake-test'}));
 const intent:Intent={side,path:[{x:0,y:64},{x:127,y:64}]},s={...DEFAULTS,mode:'slide' as const,power,scarp,seed:18};
 const p=quake(m,s,intent),ruin=p.map.entities.find(e=>e.id==='ridge-ruin')!,expected=slideTiles(power);
 assert.equal(ruin.x-x-2,expected);assert.equal(ruin.y,y);
 for(let xx=0;xx<5;xx++)assert.equal(p.map.heights[(y+2)*128+x+xx+expected],m.heights[(y+2)*128+x+xx]);
 const shifted=paintWater(m,p,null),flipped=quake(m,s,{...intent,side:side===1?-1:1}),again=paintWater({...p.map,water:shifted},flipped,p);
 const sum=(a:Float64Array)=>a.reduce((a,b)=>a+b,0);assert.ok(Math.abs(sum(again.depth)-sum(m.water.depth))<1e-8);
 assert.deepEqual(quake(m,s,intent).map,p.map);
}
console.log('PASS ridge profiles and named ruins move 3–20 tiles at all six Powers, both sides and scarp styles; X conserves water');
const viewBase=fixture('slide',128),viewPlan=quake(viewBase,{...DEFAULTS,mode:'slide',power:100,seed:18},{side:1,path:[{x:0,y:64},{x:127,y:64}]}),motion=slideMotion(viewPlan,null,viewBase);
const chunk=makeChunk(viewPlan.map,1,2,frameContext(viewPlan.map),true,motion);
let movingQuads=0;
for(let v=0;v<chunk.terrain.positions.length;v+=12){
 const delta=Array.from(chunk.terrain.glide!.slice(v,v+3));
 for(let k=1;k<4;k++)assert.deepEqual(Array.from(chunk.terrain.glide!.slice(v+k*3,v+k*3+3)),delta,'a whole face glides rigidly');
 if(Math.hypot(delta[0],delta[2])>=20)movingQuads++;
}
assert.ok(movingQuads>100);assert.ok(chunk.objects!.some(o=>o.glide?.some(v=>Math.abs(v)>=20)));
assert.ok(chunk.floor,'moving land has solid continuation underneath');
console.log('PASS transferred terrain quads and object instances carry real 20-tile glide vectors');
writeFileSync('captures/slide-checks.json',JSON.stringify({cases,accepted,refused,minFullOffsetTiles:minFull,minActualToExpected:minActual,powerRange:[slideTiles(0),slideTiles(100)],ms:performance.now()-start},null,2)+'\n');
