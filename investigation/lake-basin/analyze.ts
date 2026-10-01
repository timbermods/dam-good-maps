import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { polygonMask } from '../../src/core/features/geometry';
import { wetSystems } from '../../src/core/analysis/story';
import type { Feature, RiverFeature } from '../../src/core/features/schema';

// Composition information, stricter than the product's area-only Lake Basin promise.
// Feeding heads follow the directed river graph; wet mouths are counted separately.
export function composition(m: {size: number; heights: number[]; water: number[]; features: Feature[]}) {
  const W = m.size, N = W * W;
  const rivers = m.features.filter((f): f is RiverFeature => f.kind === 'river' && !f.params.badwater && f.role !== 'river/startSpring' && f.role !== 'river/lakeSpring');
  const lakeMask = new Uint8Array(N);
  const lakes = m.features.filter(f => f.kind === 'lake').map(f => {
    if (f.kind !== 'lake') throw Error('lake');
    const mask = polygonMask(f.params.outline, W, W);
    for(let i=0;i<N;i++) if(mask[i]) lakeMask[i]=1;
    const wet = Array.from(mask.keys()).filter(i => mask[i] && m.water[i] >= 0.05);
    const planned = Array.from(mask).reduce((a, v) => a + (v ? 1 : 0), 0);
    const cx = wet.reduce((a, i) => a + i % W, 0) / Math.max(1, wet.length);
    const cy = wet.reduce((a, i) => a + Math.floor(i / W), 0) / Math.max(1, wet.length);
    const touches = (r: RiverFeature) => r.params.path.some(([x,y]) => {
      const xx=Math.round(x), yy=Math.round(y); return xx>=0 && yy>=0 && xx<W && yy<W && mask[yy*W+xx];
    });
    const feeders = rivers.filter(r => {
      const seen = new Set<string>(); let cur: RiverFeature | undefined = r;
      while (cur && !seen.has(cur.id)) {
        seen.add(cur.id); if (touches(cur)) return true;
        const target: string | undefined = 'river' in cur.params.exit ? cur.params.exit.river : undefined;
        cur = target ? rivers.find(x => x.id === target) : undefined;
      } return false;
    });
    const systems = wetSystems(W,W,m.water);
    const lakeSystems = new Map<number,number>();
    for(const i of wet)lakeSystems.set(systems.labels[i],(lakeSystems.get(systems.labels[i])??0)+1);
    const label = [...lakeSystems.entries()].sort((a,b)=>b[1]-a[1]||a[0]-b[0])[0]?.[0]??-1;
    const linkedHeads = feeders.filter(r => {
      const [x,y]=r.params.path[Math.min(2,r.params.path.length-1)];
      const xx=Math.max(0,Math.min(W-1,Math.round(x))), yy=Math.max(0,Math.min(W-1,Math.round(y)));
      return label>=0 && systems.labels[yy*W+xx]===label;
    }).length;
    const shore = wet.filter(i => [[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dy]) => {
      const x=i%W+dx,y=Math.floor(i/W)+dy; return x>=0&&x<W&&y>=0&&y<W&&m.water[y*W+x]<0.05;
    }));
    const beaches = new Set<number>();
    for(const i of shore)for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const x=i%W+dx,y=Math.floor(i/W)+dy;
      if(x<0||y<0||x>=W||y>=W)continue;
      const j=y*W+x,surface=m.heights[i]+m.water[i];
      if(m.water[j]<.05&&m.heights[j]>=surface&&m.heights[j]<=surface+1.2)beaches.add(j);
    }
    return { id:f.id, area:wet.length, planned, fill:wet.length/Math.max(1,planned), share:wet.length/N,
      center:[cx/W,cy/W], offset:Math.hypot(cx/W-0.5,cy/W-0.5), feedingHeads:feeders.length, linkedHeads,
      shallowShore:shore.filter(i=>m.water[i]>=0.1&&m.water[i]<=1.2).length, beachTiles:beaches.size, outlet:f.params.outlet };
  }).sort((a,b)=>b.area-a.area);
  const main=lakes[0];
  let dryCourseInLake=0,dryCourseOutsideLake=0,courseSamples=0;
  for(const r of rivers) for(let k=0;k+1<r.params.path.length;k++) {
    const a=r.params.path[k],b=r.params.path[k+1],n=Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])));
    for(let t=0;t<n;t++) {
      const x=Math.round(a[0]+(b[0]-a[0])*t/n),y=Math.round(a[1]+(b[1]-a[1])*t/n);
      if(x<2||y<2||x>=W-2||y>=W-2)continue;
      const i=y*W+x; courseSamples++;
      if(m.water[i]<0.05) {if(lakeMask[i])dryCourseInLake++;else dryCourseOutsideLake++;}
    }
  }
  let wetOutside=0,thinOutside=0;
  for(let i=0;i<N;i++)if(!lakeMask[i]&&m.water[i]>=0.05){wetOutside++;if(m.water[i]<0.2)thinOutside++;}
  const reasons:string[]=[];
  if (!main || main.share<0.04) reasons.push('no substantial lake (4% area information line)');
  if (main && main.offset>0.18) reasons.push('largest lake off-centre (>18% side)');
  if (main && lakes[1]?.area>main.area*0.6) reasons.push('competing lakes (>60% of largest)');
  if (main && main.feedingHeads<3) reasons.push('fewer than three feeding river heads');
  if (main && main.linkedHeads<3) reasons.push('fewer than three visibly connected wet heads');
  return { main, secondShare:lakes[1]?.share??0, lakeCount:lakes.length, strongPromise:reasons.length===0, reasons,
    evidence:{riverRoots:rivers.filter(r=>'edge' in r.params.exit).length,courseSamples,dryCourseInLake,dryCourseOutsideLake,wetOutside,thinOutside} };
}
export function analyze(out:string):void {
  const rows=readFileSync(join(out,'measures.jsonl'),'utf8').trim().split('\n').map(x=>JSON.parse(x)).sort((a,b)=>a.size-b.size||a.seed-b.seed);
  const diagnostics=rows.map(r=> {
    const m=JSON.parse(readFileSync(join(out,`${r.size}-${r.seed}.json`),'utf8'));
    const c=composition(m);
    const causes:string[]=[];
    if(!r.ok) causes.push('absolute: '+r.failedChecks.join(', '));
    if(!r.outcomes) causes.push('no playable first map; outcomes unavailable');
    else {
      if(!r.outcomes.promise) causes.push(`lake area: ${(r.outcomes.signature.bigLake*100).toFixed(1)}% largest, ${(r.outcomes.signature.lakeShare*100).toFixed(1)}% wet in lakes`);
      if(!r.outcomes.water) causes.push(...r.outcomes.story.why.map((x:string)=>'water: '+x));
      if(!r.outcomes.standout) causes.push('drawn intentions did not emerge: '+m.intentions.map((x:any)=>`${x.id}: ${x.note??x.ok}`).join('; '));
    }
    return {size:r.size,seed:r.seed,ok:r.ok,met:r.outcomes?.met??false,composition:c,causes,failedChecks:r.failedChecks,fixes:r.fixes,settleDays:r.settleTicks/768,lands:r.lands,shown:r.shown,changed:r.changed,phaseCpu:m.phaseCpu};
  });
  const quant=(a:number[],p:number)=>a.slice().sort((a,b)=>a-b)[Math.min(a.length-1,Math.floor(a.length*p))];
  const summary=[96,128,256].map(size=>{
    const a=rows.filter(r=>r.size===size),d=diagnostics.filter(r=>r.size===size);
    if(!a.length)return {size,maps:0};
    return {size,maps:a.length,all:a.filter(r=>r.ok&&r.outcomes?.met).length,promise:a.filter(r=>r.outcomes?.promise).length,standout:a.filter(r=>r.outcomes?.standout).length,water:a.filter(r=>r.outcomes?.water).length,absoluteFailures:a.filter(r=>!r.ok).length,strongPromise:d.filter(r=>r.ok&&r.composition.strongPromise).length,
      firstLandMs:{median:quant(a.map(r=>r.ms.firstLook),.5),p90:quant(a.map(r=>r.ms.firstLook),.9),max:Math.max(...a.map(r=>r.ms.firstLook))},
      timedWaterMaps:a.filter(r=>r.ms.water>=0).length,
      firstWaterMs:{median:quant(a.filter(r=>r.ms.water>=0).map(r=>r.ms.water),.5),p90:quant(a.filter(r=>r.ms.water>=0).map(r=>r.ms.water),.9)},
      cpuLandMs:{median:quant(a.map(r=>r.cpu.land),.5),p90:quant(a.map(r=>r.cpu.land),.9)},
      cpuWaterMs:{median:quant(a.filter(r=>r.ms.water>=0).map(r=>r.cpu.water),.5),p90:quant(a.filter(r=>r.ms.water>=0).map(r=>r.cpu.water),.9)},
      finalMs:{median:quant(a.map(r=>r.ms.final),.5),p90:quant(a.map(r=>r.ms.final),.9)},
      settleDays:{median:quant(d.map(r=>r.settleDays),.5),p90:quant(d.map(r=>r.settleDays),.9),max:Math.max(...d.map(r=>r.settleDays))},shownMoreThanOne:a.filter(r=>r.shown>1).length,
      changedLandMaps:a.filter(r=>r.changed>0).length,
      shores:{withShallows:d.filter(r=>(r.composition.main?.shallowShore??0)>0).length,withBeaches:d.filter(r=>(r.composition.main?.beachTiles??0)>0).length},
      practicalStart:{minLogs:Math.min(...a.filter(r=>r.ok&&r.walk).map(r=>r.walk.logs)),minLevelLand:Math.min(...a.filter(r=>r.ok&&r.walk).map(r=>r.walk.level)),minFarmland:Math.min(...a.filter(r=>r.ok&&r.walk).map(r=>r.walk.farmland))},
      directCpu:{maps:d.filter(r=>r.phaseCpu?.waterCpuMs!==undefined).length,
        landMedian:quant(d.filter(r=>r.phaseCpu?.landCpuMs!==undefined).map(r=>r.phaseCpu.landCpuMs),.5),landP90:quant(d.filter(r=>r.phaseCpu?.landCpuMs!==undefined).map(r=>r.phaseCpu.landCpuMs),.9),
        waterMedian:quant(d.filter(r=>r.phaseCpu?.waterCpuMs!==undefined).map(r=>r.phaseCpu.waterCpuMs),.5),waterP90:quant(d.filter(r=>r.phaseCpu?.waterCpuMs!==undefined).map(r=>r.phaseCpu.waterCpuMs),.9)}};
  });
  writeFileSync(join(out,'diagnostics.json'),JSON.stringify(diagnostics,null,2));
  writeFileSync(join(out,'summary.json'),JSON.stringify(summary,null,2));
  console.log(JSON.stringify(summary,null,2));
}
