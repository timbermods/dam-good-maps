import { parentPort } from 'node:worker_threads';
import { tsImport } from 'tsx/esm/api';
const { stripHelper } = await tsImport('../../src/core/sim/parallel.ts', import.meta.url);
const handle = stripHelper();
parentPort.on('message', handle);
process.on('uncaughtException', () => handle.died());
