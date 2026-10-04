import {resolve} from 'node:path';
import {readFileSync,readdirSync,mkdirSync,writeFileSync} from 'node:fs';
import {serialize} from 'node:v8';
import {LOCAL,deps,hash,json} from './common.mjs';
const source=process.env.DGM_OFFICIAL;if(!source)throw Error('Set DGM_OFFICIAL to a read-only folder containing the 19 official .timber maps');
const names=readdirSync(source).filter(n=>n.endsWith('.timber')&&!n.startsWith('_')).sort();
if(names.length!==19)throw Error('Expected all 19 official maps');
const api=deps(resolve(LOCAL,'api.cjs')),directory=resolve(LOCAL,'official-inputs');mkdirSync(directory,{recursive:true});
const manifest=[];
for(const name of names){
  const raw=readFileSync(resolve(source,name)),world=api.readTimber(raw).world;
  const model=api.waterModelFromWorld(world,api.surfaceOf(world));
  const id='official-'+name.slice(0,-7),provenance={base:'6c29b7e5',file:name,raw:hash(raw)};
  writeFileSync(resolve(directory,id+'.bin'),serialize({model,provenance}));
  manifest.push({id,...provenance,W:model.W,H:model.H,model:hash(serialize(model))});
}
json('official-inputs-manifest.json',manifest);
console.log('Prepared 19 current official water models; set DGM_INPUTS to',directory);
