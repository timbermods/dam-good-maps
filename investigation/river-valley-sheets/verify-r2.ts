import {readFileSync,writeFileSync} from 'node:fs';
import {checkIntention} from '../../src/core/land/intentions';
const root='investigation/river-valley-sheets';
const checks={};
for(const mode of ['dev','round1','round2']){
 const out={};
 const measures=JSON.parse(readFileSync(`${root}/local/${mode}/measures.json`,'utf8'));

 for(const seed of [5,6,12,21,22,23,27]){
  const r=JSON.parse(readFileSync(`${root}/local/${mode}/${seed}.json`,'utf8'));
  const cliff=checkIntention('upper-lower',{W:r.W,H:r.H,h:r.heights,start:r.start} as any);
  let badDistance=Infinity,nearClean=Infinity;
  for(let i=0;i<r.W*r.H;i++)if(r.water[i]>.05){const d=Math.hypot(i%r.W-r.start.x,Math.floor(i/r.W)-r.start.y);if(r.contamination[i]>=.05)badDistance=Math.min(badDistance,d);else if(r.water[i]>=.5)nearClean=Math.min(nearClean,d);}
  const seen=new Uint8Array(r.W*r.H);const ponds=[];
  for(let i=0;i<seen.length;i++){
   if(seen[i]||r.water[i]<=.05||r.contamination[i]>=.05)continue;
   const q=[i];seen[i]=1;let x0=r.W,y0=r.H,x1=0,y1=0,edge=false;
   for(let k=0;k<q.length;k++){const c=q[k],x=c%r.W,y=Math.floor(c/r.W);x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);if(x===0||y===0||x===r.W-1||y===r.H-1)edge=true;
    for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const xx=x+dx,yy=y+dy,n=yy*r.W+xx;if(xx<0||yy<0||xx>=r.W||yy>=r.H||seen[n]||r.water[n]<=.05||r.contamination[n]>=.05)continue;seen[n]=1;q.push(n);}
   }
   if(!edge&&q.length>=36)ponds.push({tiles:q.length,box:[x0,y0,x1,y1],boxFill:q.length/((x1-x0+1)*(y1-y0+1))});
  }
  out[seed]={startChecks:measures.find(m=>m.seed===seed).checks.filter(c=>['start.water','start.badwater'].includes(c.id)).map(c=>({id:c.id,ok:c.ok,value:c.value,limit:c.limit})),cliff:cliff.note,badWaterEuclideanDistance:badDistance,nearestCleanPumpDepthEuclideanDistance:nearClean,ponds,intentions:r.intentions};
 }
 checks[mode]=out;
}
writeFileSync(`${root}/regressions-r2.json`,JSON.stringify(checks,null,2)+'\n');console.log(JSON.stringify(checks,null,2));
