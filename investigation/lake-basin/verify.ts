import { strict as assert } from 'node:assert';
import { createHash } from 'node:crypto';
import { generate } from '../../src/core/gen/generate';
import { drawGenome, leanGenome } from '../../src/core/land/genome';
import { makeSpec, AVAILABLE_THEMES } from '../../src/core/spec/mapspec';
import { install, shapeLakeBasin } from './prototype';
export function verify():void {
  // Isolation is tested on every other theme's real leaned genome, with the same stream inputs.
  for(const theme of AVAILABLE_THEMES.filter(t=>t!=='lakeBasin')) {
    const spec=makeSpec({seed:37,theme,size:{x:128,y:128}});
    const g=drawGenome(theme,37,128,128,0); leanGenome(g,spec.settings,128,128,37,0);
    const before=JSON.stringify(g); shapeLakeBasin(g,spec.settings,128,128,37,0);
    assert.equal(JSON.stringify(g),before,theme+' changed');
  }
  install('prototype');
  // A fresh generation, not a cached field: both the land and the final .timber bytes must repeat.
  for(const size of [96,128,256]) {
    const spec=makeSpec({seed:37,theme:'lakeBasin',size:{x:size,y:size}});
    const run=()=> {
      let shown=0; const r=generate(spec,{onLand:()=>shown++});
      assert.equal(shown,1,'land replaced'); assert.equal(r.report.passed,true,JSON.stringify(r.report.checks.filter(c=>!c.ok)));
      assert.equal(r.built.settle.settled,true,'unsettled');
      return createHash('sha256').update(r.bytes).digest('hex');
    };
    const a=run(),b=run(); assert.equal(a,b,'nondeterministic'); console.log(`seed 37 ${size}: deterministic ${a}`);
  }
  console.log('Other themes unchanged; first land shown once; all sampled absolutes pass.');
}
