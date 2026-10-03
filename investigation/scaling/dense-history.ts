// Synthetic worst case: fresh literal vectors on every accepted force-result operation.
// This measures history storage/writer limits, not the physics or visual character of a force.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {constants} from 'node:buffer';
import {MapSession} from '../../src/core/doc/session';
const size=process.argv[2]??'512x512',phase=process.argv[3]??'after',steps=Number(process.env.SCALING_DENSE_STEPS??256);
const [W,H]=size.split('x').map(Number),N=W*H,local=resolve('investigation/scaling/local/dense');mkdirSync(local,{recursive:true});
const s=MapSession.importMap(readFileSync(`investigation/scaling/local/probe/sizes-${size}.timber`),size+'.timber');s.setWaterMode('defer');
const result:any={size,phase,pid:process.pid,scenario:'synthetic dense literal force history; deferred water; all tiles; fresh vectors each operation',maxStringLength:constants.MAX_STRING_LENGTH,rows:[]};
const save=()=>writeFileSync(resolve(local,`${phase}-${size}.json`),JSON.stringify(result,null,2));
for(let n=0;n<=steps;n++){
 if([0,8,32,64,128,256].includes(n)){
  (globalThis as any).gc?.();result.rows.push({step:n,at:Date.now(),memory:process.memoryUsage(),maxRSS_KiB:process.resourceUsage().maxRSS,history:s.editCount,numericVectorElements:2*N*n});save();console.log(size,phase,n,Math.round(process.memoryUsage().heapUsed/1048576)+' MiB heap');
  if(n>=64){const t=performance.now();try{const p=s.project();result.rows.at(-1).project={bytes:p.length,sha256:createHash('sha256').update(p).digest('hex'),ms:performance.now()-t};}catch(e){result.rows.at(-1).project={error:String(e),stack:(e as Error).stack,ms:performance.now()-t};result.breakageAt=n;save();break;}save();}
 }
 if(n===steps)break;
 const r=s.apply({op:'forceResult',params:{version:1,verb:'craterize',settings:{mode:'strike',power:100,seed:4242,walls:'steep',centre:'auto',debris:'light',rays:false,size:null},where:{origin:[0,0]},steps:1,reason:'Dense history memory stress',tiles:Array.from({length:N},(_,i)=>i),heights:Array(N).fill(n%2?10:11),removed:[]}});
 if(!r.ok){result.refusal={step:n,errors:r.errors.slice(0,3)};save();break;}
}
save();console.log(size,phase,'done',result.breakageAt??result.refusal??'saved');
