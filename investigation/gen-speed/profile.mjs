import { performance } from 'node:perf_hooks';
import { Session } from 'node:inspector';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build,dir } from './build.mjs';
import {trace} from './trace.mjs';
const m=await import(pathToFileURL(await build('before',true)));
const themes=process.argv.slice(2).length?process.argv.slice(2):m.AVAILABLE_THEMES;
for(const theme of themes) {
  const events=[],prof=trace();globalThis.__gs=prof;
  const session=new Session();session.connect();
  const post=(method,params={})=>new Promise((res,rej)=>session.post(method,params,(e,r)=>e?rej(e):res(r)));
  await post('Profiler.enable');await post('Profiler.start');
  const start=performance.now();
  const r=m.generate(m.decodeSpecFragment(`s=1&t=${theme}&z=256&d=n`).spec,{onLand(l){events.push({kind:'land',at:performance.now()-start,attempt:l.attempt});prof.land();},onProgress(p){events.push({...p,at:performance.now()-start});},onAttempt(a){events.push({kind:'attempt',attempt:a.attempt,passed:a.passed,stage:a.result.info.stage,at:performance.now()-start});}});
  prof.finish();globalThis.__gs=undefined;
  const {profile}=await post('Profiler.stop'); session.disconnect();
  writeFileSync(resolve(dir,`local/${theme}.cpuprofile`),JSON.stringify(profile));
  writeFileSync(resolve(dir,`local/${theme}-profile.json`),JSON.stringify({theme,timings:r.timings,events,totals:prof.totals,categories:prof.categories},null,2));
  console.log(theme, r.timings, Object.entries(prof.totals).sort((a,b)=>b[1].self-a[1].self).slice(0,12));
}
