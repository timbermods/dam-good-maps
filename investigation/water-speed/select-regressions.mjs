import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {LOCAL,json} from './common.mjs';
const all=JSON.parse(readFileSync(resolve(LOCAL,'timing-all.json'),'utf8'));
const tail=JSON.parse(readFileSync(resolve(LOCAL,'tail-selection.json'),'utf8'));
const allIds=all.rows.filter(r=>r.rows[0].cpuRatio<1).map(r=>r.id);
const ids=allIds.filter(id=>!tail.ids.includes(id));
json(resolve(LOCAL,'regression-selection.json'),{buildId:all.buildId,allIds,ids});
console.log(ids.join(','));
