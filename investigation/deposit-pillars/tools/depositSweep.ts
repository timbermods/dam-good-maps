import {sediment} from './metrics';
// Reproduction from core-hunt-2; same worker path, maps and gestures. No timing measurements.
import { writeFileSync, mkdirSync } from 'node:fs';
import { makeSpec, THEMES } from '../local/checkout/src/core/spec/mapspec';
import { runGenerate } from '../local/checkout/src/worker/api';
import * as ed from '../local/checkout/src/worker/session';
import * as originalEd from '../../../src/worker/session';
import { DEPOSIT_DEFAULTS } from '../local/checkout/src/core/forces/deposit';
const phase=process.argv[2]??'before', uses=Number(process.argv[3]??120);
mkdirSync(`investigation/deposit-pillars/local/${phase}`,{recursive:true});
const rows:any[]=[];const samples:any[]=[];
for(const side of [64,128])for(const theme of THEMES){
 let kept=0,refused=0,spiky=0,scattered=0,wires=0,lobed=0,weak=0,volumeChanges=0,expandedSmallFans=0;const failures:any[]=[];const reasons:Record<string,number>={};
 const skipped:number[]=[];let maps=0;
 for(let seed=1;maps<3&&seed<=24;seed++){
  const generated=await runGenerate(makeSpec({seed,theme,size:{x:side,y:side}}));
  if(!generated.passed){skipped.push(seed);continue;}ed.refine();maps++;originalEd.openProject(ed.project().bytes);
  let a=seed*104729;const r=()=>{a=(a+0x6d2b79f5)>>>0;let t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;};
  for(let k=0;k<uses/3;k++){
   const x=2+Math.floor(r()*(side-4)),y=2+Math.floor(r()*(side-4)),ang=r()*6.283,len=r()<.4?0:4+r()*20;
   const path=[{x,y},{x:Math.max(0,Math.min(side-1,Math.round(x+Math.cos(ang)*len))),y:Math.max(0,Math.min(side-1,Math.round(y+Math.sin(ang)*len)))}];
   const power=[0,35,70,100][k%4];const before=ed.terrainNow().heights.slice();
   const request={verb:'deposit' as const,settings:{...DEPOSIT_DEFAULTS,power,seed:k},path,cut:null,natural:true};
   const oldStart=originalEd.forceStart(request);let oldHeights=before;
   if(oldStart.ok){for(let j=0;j<999;j++){const f=originalEd.forceAdvance(50);if(!f||f.done)break;}
    if(!originalEd.forceStop(oldStart.gesture).kept)throw Error('Baseline keep refused');oldHeights=originalEd.terrainNow().heights.slice();originalEd.undo();
   }
   const s=ed.forceStart(request);
   let reason:string|null=null,h=before;
   if(!s.ok){reason=s.errors[0]??'refused';refused++;reasons[reason]=(reasons[reason]??0)+1;}
   else{
    for(let j=0;j<999;j++){const f=ed.forceAdvance(50);if(!f||f.done)break;}
    if(!ed.forceStop(s.gesture).kept)throw Error('Unexpected keep refusal');
    kept++;h=ed.terrainNow().heights.slice();ed.undo();
    const metric=sediment(before,h,side),components=metric.components,spikes=metric.pillars;
    const changed=h.reduce((s,v,i)=>s+Number(v!==before[i]),0);
    const oldVolume=oldHeights.reduce((s,v,i)=>s+Math.max(0,v-before[i]),0),newVolume=h.reduce((s,v,i)=>s+Math.max(0,v-before[i]),0);
    if(oldVolume<9&&newVolume===9)expandedSmallFans++;
    if(newVolume!==Math.max(9,oldVolume)){volumeChanges++;failures.push({seed,k,path,power,oldVolume,newVolume});}
    if(changed<9)weak++;if(spikes)spiky++;if(phase==='before'?components.length>1:metric.strays>0)scattered++;if(metric.wires)wires++;if(components.length>1)lobed++;
    if(spikes||metric.strays||metric.wires||changed<9)failures.push({seed,k,path,power,changed,spikes,components,wires:metric.wires});
   }
   if(side===128&&seed===1&&(k<3||failures.at(-1)?.k===k&&samples.filter(v=>v.theme===theme).length<6))samples.push({theme,side,seed,k,path,power,reason,input:Array.from(before),heights:Array.from(h)});
  }
 }
 if(maps!==3)throw Error(`Only ${maps} maps for ${theme} ${side}`);
 const row={theme,side,maps,skipped,uses:kept+refused,kept,refused,spiky,scattered,wires,lobed,weak,volumeChanges,expandedSmallFans,reasons,failures};rows.push(row);
 writeFileSync(`investigation/deposit-pillars/local/${phase}/${theme}-${side}.json`,JSON.stringify(row,null,2));
 console.log(JSON.stringify({...row,failures:failures.length}));
}
writeFileSync(`investigation/deposit-pillars/local/${phase}/summary.json`,JSON.stringify(rows.map(({failures,...r})=>r),null,2));
writeFileSync(`investigation/deposit-pillars/local/${phase}/samples.json`,JSON.stringify(samples));
if(phase!=='before'&&rows.some(r=>r.spiky||r.scattered||r.wires||r.weak||r.volumeChanges||r.refused))process.exitCode=1;
process.exit(process.exitCode ? Number(process.exitCode) : 0);
