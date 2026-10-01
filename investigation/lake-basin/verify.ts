import { strict as assert } from 'node:assert';
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { generate } from '../../src/core/gen/generate';
import { drawGenome, leanGenome } from '../../src/core/land/genome';
import { makeSpec, AVAILABLE_THEMES } from '../../src/core/spec/mapspec';
import { install, shapeLakeBasin } from './round2';
export function verify():void {
  // Isolation is tested on every other theme's real leaned genome, with the same stream inputs.
  for(const theme of AVAILABLE_THEMES.filter(t=>t!=='lakeBasin')) {
    const spec=makeSpec({seed:37,theme,size:{x:128,y:128}});
    const g=drawGenome(theme,37,128,128,0); leanGenome(g,spec.settings,128,128,37,0);
    const before=JSON.stringify(g); shapeLakeBasin(g,spec.settings,128,128,37,0);
    assert.equal(JSON.stringify(g),before,theme+' changed');
  }
  // Settings/difficulty/size workstreams retain the shared generator until independently tested.
  for(const [size, difficulty, altered] of [[128,'normal',true],[128,'hard',false],[48,'normal',false]] as const) {
    const spec=makeSpec({seed:37,theme:'lakeBasin',size:{x:size,y:size},designedFor:difficulty});
    if(altered)spec.settings.water.lakes='none';
    const g=drawGenome('lakeBasin',37,size,size,0);leanGenome(g,spec.settings,size,size,37,0,difficulty);
    const before=JSON.stringify(g);shapeLakeBasin(g,spec.settings,size,size,37,0,difficulty);
    assert.equal(JSON.stringify(g),before,'untested setting/difficulty/size changed');
  }
  install('prototype');
  // A fresh generation, not a cached field: both the land and the final .timber bytes must repeat.
  const evidence:unknown[]=[];const landChanges:{size:number;tiles:number;fixes:unknown}[]=[];
  for(const size of [96,128,256]) {
    const spec=makeSpec({seed:37,theme:'lakeBasin',size:{x:size,y:size}});
    const run=()=> {
      let shown=0;let first:Uint8Array|undefined;
      const r=generate(spec,{onLand:l=>{shown++;first=l.heights.slice();}});
      assert.equal(shown,1,'land replaced'); assert.equal(r.report.passed,true,JSON.stringify(r.report.checks.filter(c=>!c.ok)));
      const changed=r.built.heights.reduce((n,h,i)=>n+(h!==first![i]?1:0),0);
      if(changed)landChanges.push({size,tiles:changed,fixes:r.info.fixes});
      evidence.push({size,changed,fixes:r.info.fixes,worn:r.info.worn,passed:r.report.passed,settled:r.built.settle.settled,sha256:createHash('sha256').update(r.bytes).digest('hex')});
      writeFileSync(join(__dirname,'local','round2-verify.json'),JSON.stringify(evidence,null,2));
      assert.equal(r.built.settle.settled,true,'unsettled');
      return createHash('sha256').update(r.bytes).digest('hex');
    };
    const a=run(),b=run(); assert.equal(a,b,'nondeterministic'); console.log(`seed 37 ${size}: deterministic ${a}`);
  }
  console.log('Other themes unchanged; first land shown once; all sampled absolutes pass.');
  assert.equal(landChanges.length,0,'Strict unchanged-land check: '+JSON.stringify(landChanges));
}
