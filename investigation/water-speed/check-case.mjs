import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {api,LOCAL,hash,bytes,sameArray,sameSim,sameWater,json} from './common.mjs';
import {inputHash,storeInput} from './cases.mjs';
const a=api(),b=api('fast');
const compactWater=w=>({settled:w.settled,ticks:w.ticks,steadyTicks:w.steadyTicks,digest:hash(Buffer.concat(['depth','contamination','sat','out'].filter(k=>w[k]).map(k=>bytes(w[k]))))});
const builtDigest=g=>({
  file:hash(g.bytes), passed:g.report.passed, attempt:g.attempts,
  arrays:hash(Buffer.concat(['heights','water','contamination','moisture','soilContamination'].filter(k=>g.built[k]).map(k=>bytes(g.built[k])))),
  settle:compactWater(g.built.settle),
  features:hash(JSON.stringify(g.features)), checks:hash(JSON.stringify(g.report)),
  decisions:hash(JSON.stringify({spec:g.spec,intentions:g.intentions,outcomes:g.outcomes,name:g.name,description:g.description})),
});
export function checkCase(c,buildId) {
  const t0=performance.now();let m,water,exportHash=null,generated=null,checkpoints=0;
  if(c.kind==='generated') {
    const spec=a.makeSpec({seed:c.seed,theme:c.theme,size:{x:c.size,y:c.size}});
    const pa=[],pb=[];
    const ga=a.generate(structuredClone(spec),{onAttempt:({result})=>pa.push(builtDigest(result))});
    const gb=b.generate(structuredClone(spec),{onAttempt:({result})=>pb.push(builtDigest(result))});
    assert.deepEqual(pa,pb,c.id+' every attempted map');assert.deepEqual(builtDigest(ga),builtDigest(gb),c.id+' complete generation');
    if(ga.report.passed) assert.ok(ga.bytes.length>0,c.id+' nonempty export');
    // A refused generation still supplies a real water input; record its refusal explicitly.
    m=ga.built.waterModel;water=ga.built.settle;exportHash=hash(ga.bytes);
    generated={passed:ga.report.passed,attempts:ga.attempts,attemptComparisons:pa.length,bytes:ga.bytes.length};
    if(c.seed<=3 || (c.size===128&&c.seed<=18)) {
      const dir=resolve(LOCAL,'samples');mkdirSync(dir,{recursive:true});
      if(ga.bytes.length) {
        writeFileSync(resolve(dir,c.id+'.timber'),ga.bytes);
        writeFileSync(resolve(dir,c.id+'.damgoodmaps.json'),a.encodeProject(a.generatedDocument(ga)));
      }
    }
  } else if(c.kind==='project') {
    const p=readFileSync(c.path),sa=a.MapSession.open(a.decodeProject(p)),sb=b.MapSession.open(b.decodeProject(p));
    m=sa.built.waterModel;water=sa.built.settle;
    sameWater(water,sb.built.settle,c.id+' pinned project reopen');
    assert.ok(Buffer.from(sa.exportTimber().bytes).equals(Buffer.from(sb.exportTimber().bytes)),c.id+' pinned project export');
  } else {
    const raw=readFileSync(c.path),world=a.readTimber(raw).world;
    m=a.waterModelFromWorld(world,a.surfaceOf(world));water=a.canonicalSettle(structuredClone(m),{rules:c.rules});
    sameWater(water,b.canonicalSettle(structuredClone(m),{rules:c.rules}),c.id+' imported canonical');
    exportHash=hash(raw);
  }
  storeInput(c,m,water);
  // Canonical sliced settle: compare complete public state at every slice, exact stop tick.
  const aa=new a.WaterSim(structuredClone(m),a.prefill(m),{rules:c.rules}),bb=new b.WaterSim(structuredClone(m),b.prefill(m),{rules:c.rules});
  const opts={sealed:a.sealedTiles(m)};
  const ra=new a.SettleRun(aa,opts),rb=new b.SettleRun(bb,opts);
  const slices=[17,31,80];let n=0;
  do {
    const take=slices[n++%slices.length];
    assert.deepEqual(ra.advance(take),rb.advance(take),c.id+' sliced result');
    sameSim(aa,bb,c.id+' canonical slice '+n);checkpoints++;
  } while(!ra.done);
  const canonicalA={...ra.done,depth:aa.D,contamination:aa.C,sat:aa.saturation(),out:aa.out.slice()};
  const canonicalB={...rb.done,depth:bb.D,contamination:bb.C,sat:bb.saturation(),out:bb.out.slice()};
  sameWater(canonicalA,canonicalB,c.id+' canonical result');
  const full=b.canonicalSettle(structuredClone(m),{rules:c.rules});sameWater(canonicalA,full,c.id+' canonical full versus sliced');
  // Lower a 5x5 patch centered on the first deep interior tile, else the center.
  const next=structuredClone(m),W=m.W,H=m.H;
  let center=Math.floor(H/2)*W+Math.floor(W/2);
  for(let i=0;i<W*H;i++) {const x=i%W,y=Math.floor(i/W);if(x>=3&&y>=3&&x<W-3&&y<H-3&&canonicalA.depth[i]>.3){center=i;break;}}
  const x=center%W,y=Math.floor(center/W);
  for(let yy=Math.max(0,y-2);yy<=Math.min(H-1,y+2);yy++) for(let xx=Math.max(0,x-2);xx<=Math.min(W-1,x+2);xx++) next.floor[yy*W+xx]=Math.max(0,next.floor[yy*W+xx]-2);
  const from={model:m,water:canonicalA};
  const ja=new a.PreviewJob(structuredClone(from),structuredClone(next)),jb=new b.PreviewJob(structuredClone(from),structuredClone(next));
  n=0;let live;
  do {const take=[1,7,12,44][n++%4];live=ja.advance(take);const other=jb.advance(take);sameSim(ja.sim,jb.sim,c.id+' live '+n);if(live)sameWater(live,other,c.id+' live done');else assert.equal(other,null);checkpoints++;}while(!live);
  sameWater(live,b.previewSettle(structuredClone(from),structuredClone(next)),c.id+' live full versus sliced');
  // Exact headless copy of src/worker/session.ts startWeather scheduling: Normal's 9/8 days,
  // 12-tick frames on day 1, 96 thereafter; clean-source curve sampled once per frame.
  const weather=[];
  for(const hazard of ['drought','badtide']) {
    const ma=structuredClone(m),mb=structuredClone(m);
    const ca=ma.emitters.filter(e=>e.contamination===0),cb=mb.emitters.filter(e=>e.contamination===0);
    const initial={depth:Float64Array.from(water.depth),contamination:Float64Array.from(water.contamination)};
    const wa=new a.WaterSim(ma,initial),wb=new b.WaterSim(mb,initial);
    const days=a.hazardDays('normal',hazard),total=days*a.TICKS_PER_DAY;
    let frames=0;
    for(let t=0;t<total;) {
      const gap=t<a.TICKS_PER_DAY?12:96;
      if(hazard==='badtide') {
        for(const e of ca)e.contamination=a.badtideContamination(t/a.TICKS_PER_DAY,days);
        for(const e of cb)e.contamination=b.badtideContamination(t/b.TICKS_PER_DAY,days);
      }
      wa.run(gap,hazard==='drought'?0:1);wb.run(gap,hazard==='drought'?0:1);t+=gap;
      sameSim(wa,wb,c.id+' '+hazard+' frame '+t);frames++;checkpoints++;
    }
    // Source restoration uses the original base model in PreviewJob, as in the worker.
    const warm={model:m,water:{settled:false,ticks:0,depth:wa.D.slice(),contamination:wa.C.slice(),sat:new Uint8Array(wa.N),out:wa.out.slice(),preview:true}};
    const backA=a.previewSettle(structuredClone(warm),structuredClone(m)),backB=b.previewSettle(structuredClone(warm),structuredClone(m));
    sameWater(backA,backB,c.id+' '+hazard+' return');checkpoints++;
    weather.push({hazard,days,frames,waterDigest:hash(Buffer.concat([bytes(wa.D),bytes(wa.C),bytes(wa.Dold),bytes(wa.out)])),return:compactWater(backA)});
  }
  return {id:c.id,kind:c.kind,theme:c.theme,size:c.size??m.W,seed:c.seed,buildId,status:'pass',inputHash:inputHash(m),exportHash,generated,canonical:compactWater(canonicalA),live:compactWater(live),weather,checkpoints,elapsedMs:performance.now()-t0};
}
