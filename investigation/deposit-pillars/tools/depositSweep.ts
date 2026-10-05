// Reproduction from core-hunt-2; same worker path, maps and gestures. No timing measurements.
import { writeFileSync, mkdirSync } from 'node:fs';
import { makeSpec, THEMES } from '../local/checkout/src/core/spec/mapspec';
import { runGenerate } from '../local/checkout/src/worker/api';
import * as ed from '../local/checkout/src/worker/session';
import { DEPOSIT_DEFAULTS } from '../local/checkout/src/core/forces/deposit';
const phase=process.argv[2]??'before', uses=Number(process.argv[3]??120);
mkdirSync(`investigation/deposit-pillars/local/${phase}`,{recursive:true});
const rows:any[]=[];const samples:any[]=[];
for(const side of [64,128])for(const theme of THEMES){
 let kept=0,refused=0,spiky=0,scattered=0,weak=0;const failures:any[]=[];const reasons:Record<string,number>={};
 const skipped:number[]=[];let maps=0;
 for(let seed=1;maps<3&&seed<=24;seed++){
  const generated=await runGenerate(makeSpec({seed,theme,size:{x:side,y:side}}));
  if(!generated.passed){skipped.push(seed);continue;}ed.refine();maps++;
  let a=seed*104729;const r=()=>{a=(a+0x6d2b79f5)>>>0;let t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;};
  for(let k=0;k<uses/3;k++){
   const x=2+Math.floor(r()*(side-4)),y=2+Math.floor(r()*(side-4)),ang=r()*6.283,len=r()<.4?0:4+r()*20;
   const path=[{x,y},{x:Math.max(0,Math.min(side-1,Math.round(x+Math.cos(ang)*len))),y:Math.max(0,Math.min(side-1,Math.round(y+Math.sin(ang)*len)))}];
   const power=[0,35,70,100][k%4];const before=ed.terrainNow().heights.slice();
   const s=ed.forceStart({verb:'deposit',settings:{...DEPOSIT_DEFAULTS,power,seed:k},path,cut:null,natural:true});
   let reason:string|null=null,h=before;
   if(!s.ok){reason=s.errors[0]??'refused';refused++;reasons[reason]=(reasons[reason]??0)+1;}
   else{
    for(let j=0;j<999;j++){const f=ed.forceAdvance(50);if(!f||f.done)break;}
    if(!ed.forceStop(s.gesture).kept)throw Error('Unexpected keep refusal');
    kept++;h=ed.terrainNow().heights.slice();ed.undo();
    let changed=0,spikes=0;const raised=new Set<number>();
    for(let i=0;i<h.length;i++){
     if(h[i]!==before[i])changed++;
     if(h[i]>before[i]){raised.add(i);const X=i%side,Y=(i/side)|0;
      if(X>0&&Y>0&&X+1<side&&Y+1<side&&[i-1,i+1,i-side,i+side].every(j=>h[i]-h[j]>=3))spikes++;
     }
    }
    const components:number[]=[];
    while(raised.size){const todo=[raised.values().next().value!];raised.delete(todo[0]);let count=0;
     while(todo.length){const i=todo.pop()!;count++;for(const j of [i%side>0?i-1:-1,i%side+1<side?i+1:-1,i-side,i+side])if(raised.delete(j))todo.push(j);}
     components.push(count);
    }
    if(changed<9)weak++;if(spikes)spiky++;if(components.length>1)scattered++;
    if(spikes||components.length>1||changed<9)failures.push({seed,k,path,power,changed,spikes,components});
   }
   if(side===128&&seed===1&&(k<3||failures.at(-1)?.k===k&&samples.filter(v=>v.theme===theme).length<6))samples.push({theme,side,seed,k,path,power,reason,input:Array.from(before),heights:Array.from(h)});
  }
 }
 if(maps!==3)throw Error(`Only ${maps} maps for ${theme} ${side}`);
 const row={theme,side,maps,skipped,uses:kept+refused,kept,refused,spiky,scattered,weak,reasons,failures};rows.push(row);
 writeFileSync(`investigation/deposit-pillars/local/${phase}/${theme}-${side}.json`,JSON.stringify(row,null,2));
 console.log(JSON.stringify({...row,failures:failures.length}));
}
writeFileSync(`investigation/deposit-pillars/local/${phase}/summary.json`,JSON.stringify(rows.map(({failures,...r})=>r),null,2));
writeFileSync(`investigation/deposit-pillars/local/${phase}/samples.json`,JSON.stringify(samples));
if(phase==='after'&&rows.some(r=>r.spiky||r.scattered||r.weak))process.exitCode=1;
process.exit(process.exitCode ? Number(process.exitCode) : 0);
