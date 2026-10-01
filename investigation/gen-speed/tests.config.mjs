import {readFileSync,existsSync} from 'node:fs';
import {resolve,relative} from 'node:path';
import {root,dir} from './build.mjs';
const deps=process.env.DGM_DEPS??resolve(root,'../../../startup/local/checkout');
export default {
  root,cacheDir:resolve(dir,'local/vitest-cache'),
  plugins:[{name:'investigation-substitution',enforce:'pre',
    async resolveId(id,importer,options){if(!id.startsWith('.')&&!id.startsWith('/')&&!id.includes(':')&&!id.startsWith('\0'))return this.resolve(id,resolve(deps,'package.json'),{...options,skipSelf:true});},
    load(id){if(process.env.GEN_VARIANT==='before')return null;const file=id.split('?')[0];if(!file.replaceAll('\\','/').startsWith(root.replaceAll('\\','/')+'/src/core/'))return null;const p=resolve(dir,'candidate',relative(resolve(root,'src/core'),file));return existsSync(p)?readFileSync(p,'utf8'):null;}
  }],
  test:{include:['tests/unit/minePads.test.ts','tests/contract/drainedLakeWall.test.ts','tests/contract/firstLand.test.ts','tests/contract/firstLand256.test.ts','tests/contract/validate.test.ts'],fileParallelism:false,maxWorkers:1,testTimeout:1200000,hookTimeout:1200000,reporters:['default','json'],outputFile:{json:resolve(dir,`local/tests-${process.env.GEN_VARIANT??'after'}.json`)}}
};
