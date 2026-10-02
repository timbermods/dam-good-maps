// Commit compact timing evidence; large outputs and detailed logs stay in local/.
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {HERE,LOCAL,arg,hash} from './common.mjs';
const name=arg('name','final'),median=a=>[...a].sort((a,b)=>a-b)[Math.floor(a.length/2)];
const files=['native-'+name+'.json','browser-'+name+'.json'];
const inputs=files.map(file=>{const bytes=readFileSync(resolve(LOCAL,file));return {file,sha256:hash(bytes),data:JSON.parse(bytes)};});
const rows=inputs.flatMap(input=>input.data.rows.map(r=>{
 const [verb,size,k]=r.id?.split('/')??[r.verb,r.size,r.k],t=r.times;
 const summary=a=>({median:median(a),worst:Math.max(...a),samples:a});
 const ts=summary(t.ts),compute=summary(t.nativeCompute??t.wasmCompute),boundary=summary(t.native??t.wasmPlan);
 return {target:r.engine??'native',version:r.version??null,verb,size:+size,k:+k,ts,compute,boundary,pass:boundary.median<=ts.median&&(+size<256||boundary.median<ts.median),load:r.load,fixtureSha256:r.sha256,harnessFingerprint:r.fingerprint??null,cohort:r.cohort??name,input:input.file};
}));
const expected=new Map();for(const r of rows){const key=r.verb+'/'+r.size+'/'+r.k;if(expected.has(key)&&expected.get(key)!==r.fixtureSha256)throw Error('Timed fixture differs across targets: '+r.target+'/'+key);expected.set(key,r.fixtureSha256);}
const firstThree=rows.filter(r=>['craterize','erupt','quake'].includes(r.verb));
const result={name,build:inputs[0].data.build??JSON.parse(readFileSync(resolve(LOCAL,'build.json'))),inputs:inputs.map(({file,sha256,data})=>({file,sha256,machine:data.machine,logicalCores:data.logicalCores,cohorts:data.cohorts??null})),phaseDefinitions:{ts:'referenceWithRecord, trace=false; includes planning, numerical finalization, literal changes, water and playback records',compute:'before-map clone through planner and literal computation; excludes command/object synchronization and typed record packaging',boundary:'retained-map force call, validation/synchronization and typed record packaging; browser also configures the command and reacquires the complete finite typed-view result. Excludes one-time import, fixture reset and cold diagnostic serialization'},firstThree:{cells:firstThree.length,pass:firstThree.length===72&&firstThree.every(r=>r.pass)},allForces:{cells:rows.filter(r=>r.verb!=='footprint').length,pass:rows.filter(r=>r.verb!=='footprint').length===120&&rows.filter(r=>r.verb!=='footprint').every(r=>r.pass)},rows};
writeFileSync(resolve(HERE,'measurement-evidence.json'),JSON.stringify(result,null,2)+'\n');
const number=n=>n.toFixed(2),cell=s=>number(s.median)+' / '+number(s.worst);
let md='# Repeated planning measurements\n\nMilliseconds: **median / worst**, five repetitions after five warm-ups. Two full-Power modes per force; Auto Size for Craterize and Erupt. Footprints use 256 calls per browser sample to avoid Firefox clock quantization. All samples, CPU load and pinned source/binary hashes are in `measurement-evidence.json`; raw logs remain ignored.\n\n';
md+='Native boundary includes the retained operation and numeric record packaging. Browser boundary additionally configures the command and reacquires its complete typed-view result. Nested object/map reconstruction in typedResult is a cold fixture diagnostic and is not timed. Both exclude one-time arena creation/import, fixture reset and diagnostic serialization. Compute includes the before-map clone, planner, finalization, water and literal computation. TypeScript performs the corresponding complete computation without diagnostic step snapshots.\n\n';
md+='This PC is shared. The first three gate uses paired warmed medians: no regression at any size and strict improvement at 256²/512². Worst values remain visible; a passed timing cohort is not an adoption approval.\n\n';
for(const target of ['native','chromium','firefox','webkit']){
 md+='## '+target+'\n\n| Force | Size | Mode | TypeScript | Rust compute | Rust + boundary | CPU mean / max % | Gate |\n|---|---:|---|---:|---:|---:|---:|---|\n';
 for(const r of rows.filter(r=>r.target===target)){
  const modes={craterize:['Strike','Aim'],erupt:['Vent','Fissure'],quake:['Lift','Slide'],carve:['Unleash','Aim'],glaciate:['Flow','Aim'],footprint:['Lake objects','Slide objects']};
  md+='| '+[r.verb,r.size,modes[r.verb][r.k],cell(r.ts),cell(r.compute),cell(r.boundary),r.load.mean==null?'unavailable':number(r.load.mean)+' / '+number(r.load.max),r.pass?'pass':'**FAIL**'].join(' | ')+' |\n';
 }
 md+='\n';
}
writeFileSync(resolve(HERE,'MEASUREMENTS.md'),md.trimEnd()+'\n');console.log(result.firstThree,result.allForces);
