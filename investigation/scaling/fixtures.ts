import {buildSize,SIZES} from './local/probe/sizes';
import {existsSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
const dir=resolve('investigation/scaling/local/probe');
for(const spec of [{id:'sizes-128x128',W:128,H:128,name:'investigation reference'},...SIZES]) {
  const file=resolve(dir,spec.id+'.timber');
  if(existsSync(file))continue;
  const t=performance.now();const {map}=buildSize(spec);
  writeFileSync(file,map.bytes);console.log(spec.id,Math.round(performance.now()-t),map.bytes.length);
}
