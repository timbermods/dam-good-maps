// Sequential driver: timing runs never overlap verification or input generation.
import {spawn} from 'node:child_process';
import {readFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {HERE,LOCAL,hash} from './common.mjs';
const env={...process.env};
for(const key of['DGM_LABEL','DGM_COUNTS','DGM_COORDINATOR','DGM_ENGINE','DGM_FILTER','DGM_RUNTIME_SMOKE'])delete env[key];
async function run(file,args=[],extra={}){
  console.log('STAGE',file,...args,new Date().toISOString());
  await new Promise((resolveRun,reject)=>{
    const child=spawn(process.execPath,[resolve(HERE,file),...args],{cwd:HERE,env:{...env,...extra},stdio:'inherit'});
    child.on('error',reject);child.on('exit',code=>code===0?resolveRun():reject(Error(file+' exited '+code)));
  });
}
if(process.argv.includes('--after-bench')){
  const build=hash(readFileSync(resolve(LOCAL,'coordinator.js'))+readFileSync(resolve(LOCAL,'helper.js')));
  for(;;){
    const file=resolve(LOCAL,'benchmark-summary.json');
    if(existsSync(file)){
      const data=JSON.parse(readFileSync(file));
      if(data.build===build){
        if(data.complete!==21||data.errors.length||data.crossEngine.length)throw Error('Benchmark did not finish cleanly');
        break;
      }
    }
    await new Promise(r=>setTimeout(r,1000));
  }
}else await run('survey.mjs',['--bench']);
await run('build-generation.mjs');
await run('typecheck.mjs');
await run('generation.mjs'); // quiet full generator timings, includes separate helper startup
await run('generation.mjs',['--runtime']);
await run('failure.mjs');
await run('survey.mjs',['--forced'],{DGM_COUNTS:'1,2,3,4,7,8,16'});
await run('survey.mjs');
await run('survey.mjs',['--weather']);
await run('batch.mjs');
await run('make-patch.mjs');
await run('summarize.mjs');
console.log('PIPELINE COMPLETE',new Date().toISOString());
