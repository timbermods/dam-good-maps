// Check moving dev without changing the fixed experimental oracle or patch base.
import {execFileSync} from 'node:child_process';
import {ROOT,json,hash} from './common.mjs';
import {violations} from './guard.mjs';
import {transform} from './transform.mjs';
import {operationTool} from './scope.mjs';
const git=args=>execFileSync('git',args,{cwd:ROOT,encoding:'utf8',maxBuffer:32*1024*1024});
const base='4aab909e23016902cbbe6ffaeddeece786176ab3',latest=git(['rev-parse',process.env.DGM_LATEST_DEV_REF??'origin/dev']).trim();
const changed=git(['diff','--name-only',base,latest,'--','src','tools']).trim().split('\n').filter(f=>/\.[cm]?[jt]sx?$/.test(f)&&(f.startsWith('src/')||operationTool(f))),rows=[];
for(const file of changed){const source=git(['show',latest+':'+file]);const native=violations(source,file),after=violations(transform(source,file,'./portable'),file);rows.push({file,sha256:hash(source),native,remaining:after});}
const weather='src/core/sim/weather.ts',before=git(['show',base+':'+weather]),after=git(['show',latest+':'+weather]);
const mathChanges=git(['diff','--name-only',base,latest,'--','src/core/math']).trim();
const summary={base,latest,weather:{file:weather,sourceIdentical:before===after,mathSourceIdentical:!mathChanges,sha256:hash(after)},changed:rows};json('latest-dev.json',summary);
if(before!==after||mathChanges||rows.some(r=>r.native.length||r.remaining.length))throw Error('Dev maths changed; extend the recorded revision proof');
console.log('Latest dev',latest,'Weather source unchanged;',rows.length,'changed operation sources add no native maths');
