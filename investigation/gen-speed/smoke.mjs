import {pathToFileURL} from 'node:url';
import {build} from './build.mjs';
import {resultIdentity} from './identity.mjs';
import {deepStrictEqual} from 'node:assert';
const a=await import(pathToFileURL(await build('before')));
const b=await import(pathToFileURL(await build('after')));
for(const theme of a.AVAILABLE_THEMES){
  const rows=[];
  for(const m of [a,b]){const lands=[];const r=m.generate(m.decodeSpecFragment(`s=1&t=${theme}&z=256&d=n`).spec,{onLand:l=>lands.push(structuredClone(l))});rows.push(resultIdentity(r,lands));console.log(theme,m===a?'before':'after',r.timings);}
  deepStrictEqual(rows[1],rows[0],theme);console.log('IDENTICAL',theme);
}
