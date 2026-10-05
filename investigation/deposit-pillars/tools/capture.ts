import {sediment} from './metrics';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {makeSpec} from '../local/checkout/src/core/spec/mapspec';
import {runGenerate} from '../local/checkout/src/worker/api';
import * as ed from '../local/checkout/src/worker/session';
import {DEPOSIT_DEFAULTS} from '../local/checkout/src/core/forces/deposit';
const root='investigation/deposit-pillars',phase=process.argv[2]??'capture';
const manifest=JSON.parse(readFileSync(`${root}/docs/sheets/cases.json`,'utf8'));
const olds=JSON.parse(readFileSync(`${root}/local/before/samples.json`,'utf8'));const samples:any[]=[];const comparisons:any[]=[];
let theme='';
for(const c of manifest){
 if(c.theme!==theme){theme=c.theme;await runGenerate(makeSpec({seed:1,theme:c.theme,size:{x:128,y:128}}));ed.refine();}
 const old=olds.find((s:any)=>s.theme===c.theme&&s.k===c.k&&s.seed===c.seed);const before=ed.terrainNow().heights.slice();
 if(JSON.stringify(Array.from(before))!==JSON.stringify(old.input))throw Error('Capture inputs changed');
 const start=ed.forceStart({verb:'deposit',settings:{...DEPOSIT_DEFAULTS,power:c.power,seed:c.k},path:c.path,cut:null,natural:true});
 let reason=null,h=before;
 if(!start.ok)reason=start.errors[0];else{for(let k=0;k<999;k++){const f=ed.forceAdvance(50);if(!f||f.done)break;}
  if(!ed.forceStop(start.gesture).kept)throw Error('Capture keep refused');h=ed.terrainNow().heights.slice();ed.undo();
 }
 const metric=(h:number[]|Uint8Array)=>sediment(before,h,128);
 const row={case:comparisons.length+1,theme:c.theme,k:c.k,power:c.power,reason,before:metric(old.heights),after:metric(h)};comparisons.push(row);console.log(JSON.stringify(row));
 samples.push({...c,reason,input:Array.from(before),heights:Array.from(h)});
}
mkdirSync(`${root}/local/${phase}`,{recursive:true});writeFileSync(`${root}/local/${phase}/samples.json`,JSON.stringify(samples));
writeFileSync(`${root}/local/${phase}/comparisons.json`,JSON.stringify(comparisons,null,2));
process.exit(comparisons.some(r=>r.reason||r.after.pillars||r.after.strays||r.after.wires||r.after.volume!==r.before.volume)?1:0);
