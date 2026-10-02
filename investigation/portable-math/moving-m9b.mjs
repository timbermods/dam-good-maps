// Record a head published after the experiment began, without changing its inputs.
import {execFileSync} from 'node:child_process';
import {ROOT,json,hash} from './common.mjs';
import {violations} from './guard.mjs';
import {transform} from './transform.mjs';
import {operationTool} from './scope.mjs';
const git=args=>execFileSync('git',args,{cwd:ROOT,encoding:'utf8',maxBuffer:32*1024*1024});
const experimental='e292cefe30469033a922650f0455f87297c051d5',latest=git(['rev-parse','origin/feature/m9b']).trim();
const paths=git(['ls-tree','-r','--name-only',latest,'src','tools']).trim().split('\n').filter(f=>/\.[cm]?[jt]sx?$/.test(f)&&(f.startsWith('src/')||operationTool(f)));
const rows=paths.map(file=>{const source=git(['show',latest+':'+file]);return {file,sha256:hash(source),native:violations(source,file),remaining:violations(transform(source,file,'./portable'),file)};});
const weather=git(['show',latest+':src/core/sim/weather.ts']),devWeather=git(['show','4aab909e23016902cbbe6ffaeddeece786176ab3:src/core/sim/weather.ts']);
const mathChanges=git(['diff','--name-only','4aab909e23016902cbbe6ffaeddeece786176ab3',latest,'--','src/core/math']).trim();
const summary={experimental,latest,nativeReferences:rows.reduce((n,r)=>n+r.native.length,0),remaining:rows.flatMap(r=>r.remaining),weather:{sourceIdenticalToDev:weather===devWeather,mathSourceIdenticalToDev:!mathChanges,sha256:hash(weather)},files:rows.length};
json('moving-m9b.json',summary);if(summary.remaining.length)throw Error('New M9b native maths needs an adapter');console.log(JSON.stringify(summary));
