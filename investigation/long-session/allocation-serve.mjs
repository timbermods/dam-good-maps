// Targeted follow-up only: compare the suspected allocation with an in-memory adoption candidate.
import {build,preview} from 'vite';
import {fileURLToPath} from 'node:url';
import {applyCandidate} from './candidate.mjs';
const probe=fileURLToPath(new URL('./allocation-probe.mjs',import.meta.url)).replaceAll('\\','/');
for(const fixed of [false,true]){
 const plugin=()=>({name:'allocation-follow-up',enforce:'pre',transform(code,id){
  const path=id.replaceAll('\\','/');
  if(/\/(generator|checks|waterStrip|waterMesh|bake)\.worker\.ts$/.test(path))code=`import ${JSON.stringify(probe)};\n${code}`;
  if(path.endsWith('/src/worker/session.ts')){
   code=code.replaceAll('\r\n','\n');
   if(fixed){const changed=applyCandidate(code);if(changed===code)throw new Error('Candidate did not match');code=changed;}
   else code=code.replace('const run = s.canonicalRun();\n    const w = await settleInSlices(run.model, current, onProgress);', 'const run = s.canonicalRun();\n    (globalThis as any).__allocationProbe?.unused(run, run.model.W * run.model.H);\n    const w = await settleInSlices(run.model, current, onProgress);');
  }
  if(path.endsWith('/src/core/sim/rustWater.ts')){
   code=code.replace('this.handle = withBytes(w.bytes(), (ptr, len) => x.water_new(ptr, len));','this.handle = withBytes(w.bytes(), (ptr, len) => x.water_new(ptr, len));\n    (globalThis as any).__allocationProbe?.created(this.handle, owner, n);');
   code=code.replace('this.freed = true;','this.freed = true;\n    (globalThis as any).__allocationProbe?.freed(this.handle);');
   code=code.replace('((handle) => rustWater().water_free(handle));','((handle) => { rustWater().water_free(handle); (globalThis as any).__allocationProbe?.finalized(handle); });');
  }
  return {code,map:null};
 }});
 const outDir=`investigation/long-session/local/allocation/${fixed?'fixed':'baseline'}/dist`;
 await build({mode:'e2e',plugins:[plugin()],worker:{plugins:()=>[plugin()]},build:{outDir}});
 const server=await preview({build:{outDir},preview:{port:fixed?4201:4200,strictPort:true}});server.printUrls();
}
