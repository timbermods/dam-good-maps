import {defineConfig} from 'vitest/config';
import {resolve} from 'node:path';
import {transform} from './brush-adoption.mjs';
export default defineConfig({root:resolve(import.meta.dirname,'../..'),plugins:[{name:'brush-proposal',enforce:'pre',transform(code,id){return transform(code,id.replaceAll('\\','/'));}}],test:{include:['investigation/performance/brush.spec.ts','tests/unit/look-water*.test.ts','tests/unit/look-badwater.test.ts','tests/contract/look-waterfalls.test.ts'],maxWorkers:1,fileParallelism:false}});
