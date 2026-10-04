import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {cpus} from 'node:os';
import {LOCAL,deps,arg,json,hash} from './common.mjs';
import {exact,untimed} from './codec.mjs';
import {analysisProfile,analysisTime} from './generation-profile.mjs';
import {loadSampler} from './load.mjs';
const api=deps(resolve(LOCAL,'api.cjs')),bridge=deps(resolve(LOCAL,'native-bridge.cjs'));bridge.installNativeAnalysis(deps(resolve(LOCAL,'analysis.node')));const sampler=loadSampler(),rows=[];
try{api.generate(api.makeSpec({seed:1,theme:'delta',size:{x:48,y:48}}));
for(const theme of api.AVAILABLE_THEMES)for(let rep=0;rep<Number(arg('reps','3'));rep++){
 const pair=[];for(const backend of rep%2?['native','typescript']:['typescript','native']){const hook=analysisProfile(bridge,backend);globalThis.__ra=hook;sampler.reset();const t=performance.now();const r=api.generate(api.makeSpec({theme,seed:1,size:{x:256,y:256}}));const ms=performance.now()-t;globalThis.__ra=null;const analysis=analysisTime(hook.totals);pair.push({theme,rep,backend,ms,analysis,share:analysis/ms,totals:hook.totals,load:sampler.summary(),bytes:hash(r.bytes),state:hash(exact({report:r.report,analysis:r.analysis,outcomes:r.outcomes}))});}
 if(pair[0].bytes!==pair[1].bytes||pair[0].state!==pair[1].state)throw Error(theme+' full generation bytes');rows.push(...pair);json('generation-native.json',{machine:cpus()[0].model,rows});console.log(theme,rep,pair.map(p=>[p.backend,p.ms,p.analysis]));
}}finally{sampler.stop();globalThis.__ra=null;}
