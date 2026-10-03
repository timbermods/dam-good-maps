import base from '../local/round2/base/vitest.config.ts';
import {readFileSync,existsSync} from 'node:fs';
import {resolve,dirname,isAbsolute} from 'node:path';
import {dir,root,proposed,overlay,helpers} from './overlay.mjs';
helpers();
export default {...base,root,cacheDir:resolve(dir,'../local/round2/vite-cache'),plugins:[{
 name:'scaling-round2-legacy-contracts',enforce:'pre',
 resolveId(source,importer){if(!importer||!source.startsWith('.'))return;const at=resolve(dirname(importer),source);if(!at.startsWith(root))return;
  for(const p of [at,at+'.ts']){const rel=p.slice(root.length+1),candidate=resolve(proposed,rel);if(existsSync(candidate))return p;}
 },
 load(id){if(!id.startsWith(root))return;const rel=id.slice(root.length+1),candidate=resolve(proposed,rel);if(existsSync(candidate))return readFileSync(candidate,'utf8');},
 transform(code,id){if(!id.startsWith(root))return;const next=overlay(id.slice(root.length+1).replaceAll('\\','/'),code);return next===code?undefined:{code:next,map:null};}
}],test:{...base.test,maxWorkers:1,cacheDir:resolve(dir,'../local/round2/vitest-cache')}};
