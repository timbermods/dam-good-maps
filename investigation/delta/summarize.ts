import {readFileSync,writeFileSync} from 'node:fs';
import {deltaHydro} from './prototype';
import type {MapMeasure} from '../m9b/measures';
import {wetSystems} from '../../src/core/analysis/story';
const root=__dirname;
const quant=(a:number[],p:number)=>a.slice().sort((a,b)=>a-b)[Math.min(a.length-1,Math.floor(p*a.length))];
const rows:any[]=[],summary:any[]=[];
for(const size of [96,128,256])for(const mode of ['before','after-final']) {
 const ms:MapMeasure[]=readFileSync(`${root}/local/${mode}/measures-${size}.jsonl`,'utf8').trim().split('\n').map(s=>JSON.parse(s));
 if(ms.length!==20||ms.some(m=>'error' in m))throw Error('Batch missing a map or has an error');
 let maxDry=0,minArm=1,minFlat=1,minFertile=1,settled=0;
 for(const m of ms) {
  const c=JSON.parse(readFileSync(`${root}/local/${mode}/${size}-${m.seed}.json`,'utf8'));
  if(c.settled)settled++;
  let dry=0,flat=0,fertile=0;
  for(let i=0;i<size*size;i++)if(c.water[i]<=.05){dry++;if(c.heights[i]===4){flat++;if(c.moisture[i]>0&&c.contamination[i]<.05)fertile++;}}
  minFlat=Math.min(minFlat,flat/dry);minFertile=Math.min(minFertile,fertile/Math.max(1,flat));
  let armWet=1,dryRun=0;
  if(mode==='after-final') {
   const hy=deltaHydro(new Uint8Array(size*size),c.info.genome,m.seed,size,size);
   const sys=wetSystems(size,size,c.water);let main=0;for(let k=1;k<sys.volume.length;k++)if(sys.volume[k]>sys.volume[main])main=k;
   for(const a of hy.arms) {
    let n=0,wet=0,run=0;
    for(let k=0;k+1<a.path.length;k++) {
     const [ax,ay]=a.path[k],[bx,by]=a.path[k+1],steps=Math.max(1,Math.ceil(Math.hypot(bx-ax,by-ay)));
     for(let t=0;t<steps;t++) {
      const x=Math.round(ax+(bx-ax)*t/steps),y=Math.round(ay+(by-ay)*t/steps);
      if(x<2||y<2||x>=size-2||y>=size-2)continue;
      const wetHere=[[x,y],[x-1,y],[x+1,y],[x,y-1],[x,y+1]].some(([xx,yy])=>sys.labels[yy*size+xx]===main && c.contamination[yy*size+xx]<.05);
      n++;if(wetHere){wet++;run=0;}else{run++;dryRun=Math.max(dryRun,run);}
     }
    }
    armWet=Math.min(armWet,n?wet/n:0);
   }
   minArm=Math.min(minArm,armWet);maxDry=Math.max(maxDry,dryRun);
  }
  rows.push({mode:mode==='before'?'before':'after',size,seed:m.seed,ok:m.ok,promise:m.outcomes?.promise,readable:m.outcomes?.water,standout:m.outcomes?.standout,all:m.ok&&!!m.outcomes?.met,landMs:m.ms.firstLook,cpuLandMs:m.cpu?.land,changed:m.changed,shown:m.shown,mainWet:m.outcomes?.story? (m.outcomes.story as any).mainWet:null,mouths:(m.outcomes?.signature as any)?.mouths,logs:m.walk?.logs,mines:m.mines.walked,bushes:m.bushesNear,settleTicks:m.settleTicks,armWet:mode==='before'?null:armWet,dryRun:mode==='before'?null:dryRun});
 }
 summary.push({mode:mode==='before'?'before':'after',size,n:20,all:ms.filter(m=>m.ok&&m.outcomes?.met).length,promise:ms.filter(m=>m.outcomes?.promise).length,readable:ms.filter(m=>m.outcomes?.water).length,standout:ms.filter(m=>m.outcomes?.standout).length,failing:ms.filter(m=>!m.ok).map(m=>[m.seed,m.failedChecks]),landMedian:quant(ms.map(m=>m.ms.firstLook),.5),landP90:quant(ms.map(m=>m.ms.firstLook),.9),cpuMedian:quant(ms.map(m=>m.cpu?.land??m.ms.firstLook),.5),cpuP90:quant(ms.map(m=>m.cpu?.land??m.ms.firstLook),.9),waterMedian:quant(ms.map(m=>m.ms.water),.5),waterP90:quant(ms.map(m=>m.ms.water),.9),settled,settleMax:Math.max(...ms.map(m=>m.settleTicks??0)),shown:ms.filter(m=>m.shown!==1).length,changed:ms.filter(m=>(m.changed??0)>0).map(m=>[m.seed,m.changed]),mainWetMin:Math.min(...ms.map(m=>(m.outcomes?.story as any)?.mainWet??0)),logsMin:Math.min(...ms.map(m=>m.walk?.logs??0)),minesMin:Math.min(...ms.map(m=>m.mines.walked)),bushesMin:Math.min(...ms.map(m=>m.bushesNear)),flatMin:minFlat,fertileMin:minFertile,minArm:mode==='before'?null:minArm,maxDry:mode==='before'?null:maxDry});
}
writeFileSync(`${root}/results.json`,JSON.stringify({base:'6c29b7e524eea5739d49b6f0df2eae3b0856f4bd',summary},null,2)+'\n');
const keys=Object.keys(rows[0]);writeFileSync(`${root}/results.csv`,keys.join(',')+'\n'+rows.map(r=>keys.map(k=>r[k]??'').join(',')).join('\n')+'\n');
console.log(JSON.stringify(summary,null,2));
