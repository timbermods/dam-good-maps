import {defineConfig} from './local/node_modules/vitest/dist/config.js';
import {proposalPlugin} from './proposal.mjs';
import {resolve} from 'node:path';
export default defineConfig({root:resolve('investigation/high-soul/local/site'),cacheDir:resolve('investigation/high-soul/local/vitest-cache'),plugins:process.env.SOUL_BASELINE?[]:[proposalPlugin()],test:{include:['tests/unit/look*.test.ts','tests/unit/brush-ring.test.ts','tests/unit/highLook.test.ts','tests/contract/look*.test.ts'],maxWorkers:2,testTimeout:300000,hookTimeout:300000,reporters:['default','json'],outputFile:resolve('investigation/high-soul/local/tests-'+(process.env.SOUL_BASELINE?'baseline':'proposal')+'.json')}});
