import { mkdirSync, writeFileSync } from 'node:fs';
import { gzipSync, strToU8 } from 'fflate';
import { generate } from '../../../src/core/gen/generate';
import { makeSpec, type ThemeId } from '../../../src/core/spec/mapspec';
import { normalize,json } from '../../forces-core/core/map';
import { drawGenomeV2 } from '../../generative/v2/genome';
import { fieldV2 } from '../../generative/v2/field';
import { snapLevelsV2,relaxEdges,naturalRamps } from '../../generative/v2/levels';
import { planHydro } from '../../generative/v2/hydro';
import { mergeSmallRegions,cleanPitsAndSpikes,fillDryHollows } from '../../generative/proto/levels';
mkdirSync('maps',{recursive:true});mkdirSync('checks',{recursive:true});const records:any[]=[];
for(const [id,theme,seed,W] of [['river-128','riverValley',18,128],['highlands-128','highlands',7,128],['highlands-256','highlands',7,256],['canyon-128','canyon',10,128]] as [string,ThemeId,number,number][]){
 const g=generate(makeSpec({theme,seed,size:{x:W,y:W}})),b=g.built;
 const m=normalize({name:id==='canyon-128'?'Canyon · 10':id,W,H:W,heights:b.heights,entities:b.entities,water:{depth:b.water,contamination:b.contamination},maxHeight:22});
 writeFileSync('maps/'+id+'.json.gz',gzipSync(strToU8(JSON.stringify(json(m)))));
 records.push({id,seed,W,source:'src/core/gen/generate.ts (editor runGenerate)',passed:g.report.passed,attempts:g.attempts,min:Math.min(...m.heights),max:Math.max(...m.heights)});console.log(records.at(-1));
}
// Reproduce generative/v2/unlocked.ts without its out-of-folder writes. This is NOT the shipped editor.
const W=128,seed=7,g=drawGenomeV2('highlands',seed,W,W,0,{vt:85,unlocked:true}),F=fieldV2(g,seed,W,W),h=snapLevelsV2(F.E,g,seed,W,W);
relaxEdges(h,W,W);const hy=planHydro(F.E,h,g,seed,W,W,0);relaxEdges(h,W,W);const keep=Uint8Array.from(hy.water,v=>v===1||v===2?1:0);
mergeSmallRegions(h,W,W,4,keep);cleanPitsAndSpikes(h,W,W,keep);fillDryHollows(h,W,W,keep);naturalRamps(h,W,W,keep,new Uint8Array(W*W),g,seed,0);
const m=normalize({name:'Tall generator pre-build · VT85',W,H:W,heights:h,entities:[],water:{depth:new Float64Array(W*W),contamination:new Float64Array(W*W)},maxHeight:22});
writeFileSync('maps/tall-128.json.gz',gzipSync(strToU8(JSON.stringify(json(m)))));
records.push({id:'tall-128',W,seed,verticality:85,source:'generative/v2/unlocked.ts pipeline, BEFORE product build',min:Math.min(...h),max:Math.max(...h),limitation:'dev editor has no VT control; no objects or source build'});
writeFileSync('checks/maps.json',JSON.stringify(records,null,2)+'\n');
