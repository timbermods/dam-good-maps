import {existsSync,readFileSync,readdirSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {serialize,deserialize} from 'node:v8';
import {api,ROOT,LOCAL,hash,bytes} from './common.mjs';
export function listCases() {
  const a=api(), cases=[];
  // M9b tools/batches.ts defaults: all seven themes, 1-100 at 128, 1-50 at 256.
  for(const size of [128,256]) for(let seed=1;seed<=(size===128?100:50);seed++) for(const theme of a.AVAILABLE_THEMES)
    cases.push({id:`generated-${theme}-${size}-${seed}`,kind:'generated',theme,size,seed});
  const dir=process.env.DGM_OFFICIAL;
  if(!dir || !existsSync(dir)) throw Error('DGM_OFFICIAL must name a local folder containing the 19 official maps');
  const names=readdirSync(dir).filter(f=>f.endsWith('.timber')&&!f.startsWith('_')).sort();
  if(names.length!==19) throw Error('Expected 19 official maps, found '+names.length);
  for(const name of names) cases.push({id:'official-'+name.slice(0,-7),kind:'official',path:resolve(dir,name)});
  for(const name of readdirSync(resolve(ROOT,'tests/fixtures/projects')).sort())
    cases.push({id:'project-'+name.split('.')[0],kind:'project',path:resolve(ROOT,'tests/fixtures/projects',name)});
  const saves=process.env.DGM_SAVES;
  if(saves) for(const name of readdirSync(saves).filter(f=>f.endsWith('.timber')).sort())
    cases.push({id:'save-'+name.slice(0,-7),kind:'official',path:resolve(saves,name)});
  return cases;
}
export function inputHash(m) {
  return hash(Buffer.concat([Buffer.from(JSON.stringify({W:m.W,H:m.H,emitters:m.emitters,retained:m.retained})),bytes(m.floor), ...(m.dam?[bytes(m.dam)]:[])]));
}
export function storedInput(c) {
  const path=resolve(LOCAL,'cases',c.id+'.bin');
  return existsSync(path)?deserialize(readFileSync(path)):null;
}
export function storeInput(c,m,water) {
  const dir=resolve(LOCAL,'cases');mkdirSync(dir,{recursive:true});
  writeFileSync(join(dir,c.id+'.bin'),serialize({model:m,water}));
}
