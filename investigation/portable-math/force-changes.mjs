// Compare the complete current-dev checkpoints, including mixed edits and replay.
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {LOCAL,json} from './common.mjs';
const read=p=>JSON.parse(readFileSync(resolve(LOCAL,p)));
const before=read('forces-native-full/summary.json'),after=read('forces-adoption/summary.json');
if(before.base!==after.base||before.cases!==316||after.cases!==316)throw Error('Different or incomplete force sources');
const changes={source:before.base,cases:316,engines:{}};
for(const engine of ['chromium','firefox','webkit']){
  for(const s of [before,after])if(s.engines[engine].checkpoints!==1716||s.engines[engine].errors.length||s.mismatches.length)throw Error('Incomplete force evidence');
  const old=new Map(read('forces-native-full/'+engine+'.json').map(r=>[r.label,r]));
  const rows=read('forces-adoption/'+engine+'.json'),changed=[];
  for(const r of rows){const previous=old.get(r.label);if(!previous)throw Error('Missing checkpoint '+r.label);if(r.hash!==previous.hash)changed.push({label:r.label,components:Object.keys(r.components).filter(k=>r.components[k]!==previous.components[k])});}
  changes.engines[engine]={checkpoints:rows.length,changed:changed.length,rows:changed};
}
json('forces-full-changes.json',changes);
console.log(JSON.stringify(Object.fromEntries(Object.entries(changes.engines).map(([e,s])=>[e,s.changed]))));
