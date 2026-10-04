// Compare cheap pre-fill evidence with settled outcomes; results stay ignored.
import {build,dir} from '../build.mjs';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {appendFileSync} from 'node:fs';
for(const variant of['after','round2']){
 const m=await import(pathToFileURL(await build(variant,false,'node',true)));
 for(const seed of[1,2,3,4]){
  const r=m.generate(m.decodeSpecFragment(`s=${seed}&t=canyon&z=256&d=n`).spec);
  const p=m.prefill(r.built.waterModel),b={...r.built,water:p.depth,contamination:p.contamination};
  const o=m.outcomesOf({spec:r.spec,built:b,features:r.features,intentions:[]});
  const row={variant,seed,prefill:{promise:o.promise,story:o.story},settled:{promise:r.outcomes.promise,story:r.outcomes.story}};
  appendFileSync(resolve(dir,'local/round2-prefill-audit.jsonl'),JSON.stringify(row)+'\n');
  console.log(variant,seed,'prefill',o.promise,o.story.readable,o.story.leastWet,o.story.why,'settled',r.outcomes.promise,r.outcomes.story.readable,r.outcomes.story.leastWet,r.outcomes.story.why);
 }
}
