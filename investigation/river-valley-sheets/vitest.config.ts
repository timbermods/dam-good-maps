import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {defineConfig} from 'vitest/config';
const require=createRequire(import.meta.url);
const transform=require('./transform.cjs');
export default defineConfig({
 plugins:[{name:'river-valley-adoption',enforce:'pre',load(id){if(id.replaceAll('\\','/').endsWith('/src/core/land/hydro.ts'))return transform(id,readFileSync(id,'utf8'));}}],
 test:{include:['tests/unit/straight.test.ts','tests/unit/genome.test.ts','tests/unit/riverSheet.test.ts','tests/contract/firstLand.test.ts','investigation/river-valley-sheets/regression.test.ts'],maxWorkers:4,minWorkers:1,testTimeout:300000,hookTimeout:300000}
});
