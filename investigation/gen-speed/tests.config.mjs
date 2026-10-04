import {readFileSync,existsSync} from 'node:fs';
import {resolve,relative} from 'node:path';
import {root,dir} from './build.mjs';
const deps=process.env.DGM_DEPS??resolve(root,'../../../startup/local/checkout');
const round2Scope=process.env.GEN_VARIANT==='round2'||process.env.GEN_TEST_SCOPE==='round2';
export default {
  root,cacheDir:resolve(dir,'local/vitest-cache'),
  plugins:[{name:'investigation-substitution',enforce:'pre',
    async resolveId(id,importer,options){if(process.env.GEN_VARIANT==='round2'&&id.endsWith('/portable'))return resolve(root,'src/core/math/portable.ts');if(!id.startsWith('.')&&!id.startsWith('/')&&!id.includes(':')&&!id.startsWith('\0'))return this.resolve(id,resolve(deps,'package.json'),{...options,skipSelf:true});},
    load(id){if(process.env.GEN_VARIANT==='before')return null;const file=id.split('?')[0];if(!file.replaceAll('\\','/').startsWith(root.replaceAll('\\','/')+'/src/core/'))return null;const rel=relative(resolve(root,'src/core'),file);const p2=resolve(dir,'round2/candidate',rel),p=resolve(dir,'candidate',rel);return process.env.GEN_VARIANT==='round2'&&existsSync(p2)?readFileSync(p2,'utf8'):existsSync(p)?readFileSync(p,'utf8'):null;}
  }],
  test:{include:['tests/unit/minePads.test.ts','tests/contract/drainedLakeWall.test.ts','tests/contract/firstLand.test.ts','tests/contract/firstLand256.test.ts','tests/contract/validate.test.ts',...(round2Scope?['tests/unit/colonyReach.test.ts','tests/unit/edgeLip.test.ts','tests/contract/minePair.test.ts','tests/contract/resources.test.ts','tests/contract/rivers.test.ts','tests/contract/edges.test.ts']:[])],fileParallelism:false,maxWorkers:1,testTimeout:1200000,hookTimeout:1200000,reporters:['default','json'],outputFile:{json:resolve(dir,`local/${process.env.GEN_TEST_REPORT??'tests-'+(process.env.GEN_VARIANT??'after')}.json`)}}
};
