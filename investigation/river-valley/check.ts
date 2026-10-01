import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { generate, rebuild } from '../../src/core/gen/generate';
import { makeSpec, type ThemeId } from '../../src/core/spec/mapspec';
import { drawGenome } from '../../src/core/land/genome';
import { THEME_PRESETS } from '../../src/core/spec/mapspec';
import { leanGenome } from '../../src/core/land/genome';
import { planHydro } from '../../src/core/land/hydro';
import { makeField } from '../../src/core/land/field';
import { snapLevels } from '../../src/core/land/levels';
import { terrainColumns } from '../../src/core/terrain/runs';

const mode = process.env.RV_MODE ?? 'before';
const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const result: Record<string, unknown> = {};
const themes: ThemeId[] = mode === 'after' ? ['any', 'canyon', 'highlands', 'lakeBasin', 'delta', 'islands', 'riverValley'] : ['any', 'canyon', 'highlands', 'lakeBasin', 'delta', 'islands'];
for (const theme of themes) {
  const size=96;
  const spec = makeSpec({ theme, seed: 21, size: {x:size,y:size} });
  let shown=0;
  const r=generate(spec,{onLand:()=>{shown++;}});
  result[theme] = {hash:digest(r.bytes),passed:r.report.passed,shown,lands:r.info.lands};
  if (!r.bytes.length) throw new Error(`Empty parity fixture: ${theme}`);
  if (mode==='after' && theme!=='riverValley') {
    const before=JSON.parse(readFileSync('investigation/river-valley/local/check-before.json','utf8'));
    if(before[theme].hash!==digest(r.bytes))throw new Error(`Other theme changed: ${theme}`);
  }
  if (theme==='riverValley') {
    if (!r.report.passed || shown!==1 || r.info.lands!==1) throw new Error('River Valley validation / D348 failed');
    const again=generate(spec);
    if(digest(r.bytes)!==digest(again.bytes))throw new Error('Seed replay differs');
    const ramps: [number,number][]=[];
    for(let k=0;k<(r.field?.ramps?.length??0);k+=2)ramps.push([r.field!.ramps![k],r.field!.ramps![k+1]]);
    const b=rebuild(r.spec,r.features,r.field ? {heights:terrainColumns(r.field,size*size).heights, contains:new Set(r.field.contains), ...(ramps.length ? {ramps}:{}), ...(r.field.top?{top:r.field.top}:{})} : null);
    if(digest(r.bytes)!==digest(b.bytes))throw new Error('Feature/field rebuild differs');
    result.replay='identical bytes';
    result.rebuild='identical bytes';
  }
}
// Explicit Rivers counts stay player-owned; planning preserves the request even when a
// particular field cannot realize every inflow (the existing generator retries that land).
if(mode==='after') {
  const g=drawGenome('riverValley',23,128,128,0);
  leanGenome(g,makeSpec({theme:'riverValley',seed:23,size:{x:128,y:128}}).settings,128,128,23,0);
  g.hydro.exactInflows=true; g.hydro.inflows=3;
  const f=makeField(g,23,128,128),h=snapLevels(f.E,g,23,128,128);
  planHydro(f.E,h,g,23,128,128,0);
  if(g.hydro.inflows!==3)throw new Error('Explicit Rivers request changed');
  result.explicitInflows='preserved';
  // Priors for every other theme, including Any's combined ranges, are checked through
  // byte identity above; settings and intentions still use their named seed streams.
  result.preset=THEME_PRESETS.riverValley;
}
writeFileSync(`investigation/river-valley/local/check-${mode}.json`,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({mode,result}));
