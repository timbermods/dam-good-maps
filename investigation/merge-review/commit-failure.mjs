import { parentPort } from 'node:worker_threads';
import { tsImport } from 'tsx/esm/api';
const { stripHelper } = await tsImport('../../src/core/sim/parallel.ts', import.meta.url);
const handle = stripHelper();
let runs = 0; let f, layout;
const original = Atomics.add;
Atomics.add = (a, i, v) => {
  // After one successful run (GEN=3), fail the final commit barrier of run 2 (GEN=6).
  if (runs === 2 && a.length === 4 && i === 1 && Atomics.load(a, 0) === 6) {
    while (f[layout.d + 13] < 1) { /* coordinator commits its owned seep first */ }
    Atomics.store(a, 2, 1); original(a, 0, 1); Atomics.notify(a, 0);
    throw Error('helper lost at commit barrier');
  }
  return original(a, i, v);
};
parentPort.on('message', m => { if (m.kind === 'init') { f = new Float64Array(m.sab); layout = m.info.layout; } if (m.kind === 'run') runs++; handle(m); });
