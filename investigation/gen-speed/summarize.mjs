import {readFileSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
const p=JSON.parse(readFileSync('investigation/gen-speed/local/profile.json','utf8'));
const fmt=x=>(x/1000).toFixed(2);
let text='# Node generation profile\n\nBase: `'+p.base+'`; '+p.node+'; 256²; default theme settings, seed 1.\nOne sequential generation per case in one Node process, first case cold and later cases sharing module/JIT state; default Rust WebAssembly water, no native binary or water helper pool.\nThe extreme case uses Any, seed 3399078211, relief/terracing/verticality/variety 100, highest terrain 22, two Lush rivers, Many lakes and Many waterfalls; other settings are Normal defaults.\n\nThese are wall seconds inside the instrumented generation progress windows. They sum to the generation duration. They are not uninstrumented timing comparisons: function hooks and the inspector add overhead, especially to the terrain noise functions.\nThe water window also contains hydrology and planned-water land/start screening; the start window includes repair builds. “Check” includes final intentions, outcomes and serialization. See function attribution below for shared-stage costs.\n\n| Case | Attempts | Passed | Land | Water/planning | Start/repair | Objects | Resources | Check/finish | Total |\n|---|---:|:---:|---:|---:|---:|---:|---:|---:|---:|\n';
for(const r of p.rows)text+='| '+[r.id,r.attempts,r.passed?'yes':'no',...['land','water','start','objects','resources','check'].map(k=>fmt(r.stages[k]||0)),fmt(r.ms)].join(' | ')+' |\n';
text+='\n## Shared functions\n\nSelf wall milliseconds in selected named functions, excluding instrumented children. Unwrapped class methods (notably the water run) remain charged to their calling build. These figures overlap the progress table but do not overlap other self rows. Full function totals are local-only.\n\n';
let csv='case,function,calls,self_ms,total_ms\n';
for(const r of p.rows){text+='### '+r.id+'\n\n| Function | Calls | Self ms |\n|---|---:|---:|\n';
const shared=Object.entries(r.totals).filter(([k])=>!/^land\/(field|islands|lakeBasin)\.ts|^math\/noise\.ts/.test(k)&&!/^gen\/generate\.ts:generate$/.test(k));
for(const [k,v]of shared.sort((a,b)=>b[1].self-a[1].self).slice(0,10))text+='| `'+k+'` | '+v.calls+' | '+Math.round(v.self)+' |\n';
for(const [k,v]of Object.entries(r.totals))csv+=[r.id,k,v.calls,v.self.toFixed(3),v.total.toFixed(3)].join(',')+'\n';
}
text+='\n## Interpretation\n\nRepeated fresh builds dominate shared work, including water runs and repeated soil construction. Start candidates repeatedly derive slopes and scan pump shores. The extreme case rebuilds spill levels 292 times, calls `pickStart` 124 times and constructs 121 settler intention views. Drainage and dam-wall checking are also substantial. Theme shaping and the Rust water kernel are untouched.\n\nNo early failure return is proposed: attempts report reasons and feed subsequent retry decisions. Skipping their work without carrying identical failure information could move later maps.\n';
writeFileSync('investigation/gen-speed/PROFILE.md',text);
writeFileSync('investigation/gen-speed/profile-functions.csv',csv);
const files=['gen/generate.ts','gen/intentions.ts','gen/resources.ts','gen/settler.ts','sim/drought.ts','validate/playability.ts'];
let patch='';for(const f of files){let diff='';try{diff=execFileSync('git',['diff','--no-index','--ignore-space-at-eol','--','src/core/'+f,'investigation/gen-speed/overlay/src/core/'+f],{encoding:'utf8',maxBuffer:4000000});}catch(e){if(e.status!==1)throw e;diff=e.stdout;}
patch+=diff.replaceAll('b/investigation/gen-speed/overlay/src/core/','b/src/core/');}
writeFileSync('investigation/gen-speed/adoption.patch',patch.replace(/^ +$/gm,''));
console.log('Wrote profile tables and adoption patch for '+files.length+' shared files.');
