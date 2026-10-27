import { parentPort } from 'node:worker_threads';
import { tsImport } from 'tsx/esm/api';
const { stripHelper } = await tsImport('../../src/core/sim/parallel.ts', import.meta.url);
const { rustWater } = await tsImport('../../src/core/sim/rustWater.ts', import.meta.url);
const handle = stripHelper(),jobs=new Set();
parentPort.on('message',m=>{handle(m);if(m.kind==='init')jobs.add(m.job);if(m.kind==='free')jobs.delete(m.job);if(m.kind==='inspect')parentPort.postMessage({jobs:jobs.size,memory:rustWater().memory.buffer.byteLength});});
process.on('uncaughtException',()=>handle.died());
