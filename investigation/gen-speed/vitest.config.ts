import {defineConfig} from 'vitest/config';
import {readFileSync,existsSync} from 'node:fs';
import {resolve,relative} from 'node:path';
const root=resolve('.'),overlay=resolve('investigation/gen-speed/overlay');
export default defineConfig({plugins:[{name:'gen-speed-overlay',enforce:'pre',load(id){
 const path=id.split('?')[0],rel=relative(root,path);if(!rel.replaceAll('\\','/').startsWith('src/core/'))return;
 const alt=resolve(overlay,rel);if(existsSync(alt))return readFileSync(alt,'utf8');
}}],test:{include:['tests/unit/water-speedups.test.ts','tests/unit/soilGame.test.ts','tests/contract/start.test.ts','tests/contract/resources.test.ts','tests/contract/features.test.ts','tests/contract/firstLand.test.ts'],maxWorkers:1,testTimeout:300000,hookTimeout:300000}});
