import {defineConfig} from 'vitest/config';
import {applyCandidate} from './candidate.mjs';
export default defineConfig({plugins:[{name:'candidate-only',enforce:'pre',transform(code,id){if(id.replaceAll('\\','/').endsWith('/src/worker/session.ts'))return {code:applyCandidate(code),map:null};}}],test:{include:['tests/contract/waterStatus.test.ts'],maxWorkers:6,fileParallelism:false,testTimeout:300000}});
