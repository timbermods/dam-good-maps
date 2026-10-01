import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {api,fixtures,model,sameSim,sameWater,ROOT,LOCAL,json,hash,bytes,arg} from './common.mjs';
const a=api(), variant=arg('variant','fast'),b=api(variant);
const rows=[];
let liveCheckpoints=0;
for (const rules of ['game','port']) for (const f of fixtures()) {
  const m=model(f), aa=new a.WaterSim(structuredClone(m),undefined,{rules}), bb=new b.WaterSim(structuredClone(m),undefined,{rules});
  for(let t=0;t<975;t++) {
    aa.run(1);bb.run(1);sameSim(aa,bb,`${rules}/${f.name}/${t}`);
    sameSimBuffers(aa,bb);
  }
  const ca=a.canonicalSettle(structuredClone(m),{rules}), cb=b.canonicalSettle(structuredClone(m),{rules});
  sameWater(ca,cb, `${rules}/${f.name}/canonical`);
  // Every golden also traverses the live-edit path, starting with that rule's canonical water.
  const next=structuredClone(m),center=Math.floor(m.H/2)*m.W+Math.floor(m.W/2);
  next.floor[center]=Math.max(0,next.floor[center]-2);
  const from={model:m,water:ca},ja=new a.PreviewJob(structuredClone(from),structuredClone(next)),jb=new b.PreviewJob(structuredClone(from),structuredClone(next));
  let done,n=0;
  do {
    const take=[1,7,12,44][n++%4];done=ja.advance(take);const other=jb.advance(take);
    sameSim(ja.sim,jb.sim,`${rules}/${f.name}/live/${n}`);liveCheckpoints++;
    if(done)sameWater(done,other,`${rules}/${f.name}/live/done`);else assert.equal(other,null);
  }while(!done);
  const digest=hash(Buffer.concat([aa.D,aa.C,aa.out,aa.saturation(),ca.depth,ca.contamination,ca.sat,ca.out].map(bytes))).slice(0,16);
  const source=readFileSync(resolve(ROOT,'tests/unit/water-speedups.test.ts'),'utf8');
  const name=rules==='game'?'GAME_FIXTURES':'FIXTURES';
  const pinned=new RegExp(`const ${name}[^=]*= ([\\s\\S]*?);`).exec(source)[1];
  assert.ok(pinned.includes(`${f.name}: "${digest}"`), `${rules}/${f.name} pinned digest ${digest}`);
  rows.push({rules,name:f.name,digest,ticks:ca.ticks});console.log(rules,f.name,'PASS',digest);
}
function sameSimBuffers(aa,bb) {
  // These scratch buffers must also agree; wet/active list order is intentionally private.
  for(const key of ['f','mod','Cnew']) assert.ok(bytes(aa[key]).equals(bytes(bb[key])),key);
}
for(const rules of ['game','port']) for(const [W,H] of [[1,1],[1,9],[9,1],[2,2],[3,7],[13,11],[24,20]]) {
  const N=W*H;
  const m={W,H,floor:Float64Array.from({length:N},(_,i)=>(i*13+7)%5),dam:Float64Array.from({length:N},(_,i)=>i%7===0?.65:-1),emitters:[
    {cells:[0],strength:2,contamination:0,depthLimit:{anchor:0,off:.8,on:.72}},
    {cells:[N-1],strength:1,contamination:1},
    {cells:[W-1,N-W],strength:.5,contamination:.5},
  ]};
  const initial={depth:Float64Array.from({length:N},(_,i)=>i%3===0?0:.01+(i%9)/3),contamination:Float64Array.from({length:N},(_,i)=>(i%4)/3)};
  const aa=new a.WaterSim(structuredClone(m),initial,{rules}),bb=new b.WaterSim(structuredClone(m),initial,{rules});
  for(let t=0;t<256;t++) {
    aa.emitters[1].contamination=bb.emitters[1].contamination=t<128?1:0;
    const scale=t<64?1:t<128?0:t<192?.35:1;
    aa.run(1,scale);bb.run(1,scale);sameSim(aa,bb,`${rules}/${W}x${H}/${t}`);sameSimBuffers(aa,bb);
  }
  const digest=hash(Buffer.concat([aa.D,aa.C,aa.Dold,aa.out,aa.saturation()].map(bytes))).slice(0,16);
  const source=readFileSync(resolve(ROOT,'tests/unit/water-speedups.test.ts'),'utf8');
  const name=rules==='game'?'GAME_GRIDS':'GRIDS';
  const pinned=new RegExp(`const ${name}[^=]*= ([\\s\\S]*?);`).exec(source)[1];
  assert.ok(pinned.includes(`[${W}, ${H}, "${digest}"]`));
  rows.push({rules,name:`${W}x${H}`,digest});console.log(rules,`${W}x${H}`,'PASS',digest);
}
// Independent deterministic random scenes, including zero signs, fractional floors and tiny flows.
let seed=0xabc123;
const rand=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/2**32);
for(let k=0;k<100;k++) {
  const W=1+Math.floor(rand()*24),H=1+Math.floor(rand()*24),N=W*H;
  const m={W,H,floor:Float64Array.from({length:N},()=>Math.floor(rand()*6)/2),dam:k%2?null:Float64Array.from({length:N},()=>rand()<.2?.65:-1),emitters:[{cells:[Math.floor(rand()*N)],strength:k%7===0?1e-14:rand()*8,contamination:rand()}]};
  const initial={depth:Float64Array.from({length:N},()=>rand()<.4?-0:rand()*2),contamination:Float64Array.from({length:N},()=>rand()<.5?-0:rand())};
  const opts={rules:k%2?'port':'game',edgeSpill:k%3===0};
  const aa=new a.WaterSim(structuredClone(m),initial,opts),bb=new b.WaterSim(structuredClone(m),initial,opts);
  for(let t=0;t<100;t++) {const scale=t<40?1:t<80?0:.35;aa.run(1,scale);bb.run(1,scale);sameSim(aa,bb,`random/${k}/${t}`);sameSimBuffers(aa,bb);}
}
json(resolve(LOCAL,'smoke-'+variant+'.json'),{rows,randomScenes:100,randomTicks:10000,fixtureTicks:23400,gridTicks:3584,liveCheckpoints,status:'pass'});
console.log('100 random scenes PASS');
