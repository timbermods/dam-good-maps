import { topDown } from '../workshop/lib/render';
import { encodePng } from '../../tools/png';
import { readFileSync,writeFileSync,readdirSync } from 'node:fs';
import {resolve}from'node:path';
const dir=process.argv[2];
for(const name of readdirSync(dir).filter(n=>n.endsWith('.map.json'))){
 const m=JSON.parse(readFileSync(resolve(dir,name),'utf8'));
 const p=topDown(Uint8Array.from(m.heights),128,128,m.water,m.contamination,m.objects??[],128);
 writeFileSync(resolve(dir,name.replace('.map.json','.png')),encodePng(p.rgb,p.w,p.h));
}
