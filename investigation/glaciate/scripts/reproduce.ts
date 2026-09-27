import {writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {fixture} from '../tests/fixtures';
import {json} from '../../forces-core/core/map';
const old=await import(pathToFileURL(resolve('local/reference/round1.mjs')).href);
const m=fixture('river-128');
for(const power of [47,60]){
 const p=old.makePlan(m,{...old.DEFAULTS,power},{origin:16*128+64});
 let settled=null,run=old.waterRun(p);while(!settled)settled=run.advance(128);p.map.water=settled;
 const ruins=p.map.entities.filter((e:any)=>/Relic|Ruin/.test(e.template)&&p.mask[e.y*m.W+e.x]);
 console.log(JSON.stringify({power,head:[64,16],retainedRuinColumns:ruins.length,metrics:p.metrics}));
 writeFileSync('local/results/'+(power===47?'kyler-round1':'default-round1')+'.json',JSON.stringify(json(p.map)));
 if(power===47)writeFileSync('checks/kyler-reproduction.json',JSON.stringify({reference:'f63e4aea0d24b63088e1fe4556b95ee8f0cbf8d1',head:[64,16],power,seed:891,ruins:ruins.map((e:any)=>({id:e.id,template:e.template,x:e.x,y:e.y,z:e.z})),note:'Reconstructed matching failure at the original default head; the review supplied no recorded pointer coordinates. This is a reproduction, not a claim of recovered click telemetry.'},null,2)+'\n');
}
writeFileSync('local/results/before.json',JSON.stringify(json(m)));
