// A helper that fails at the final commit barrier of its second run (tests/unit/parallelWater.test.ts, F3):
// after the coordinator has written its own rows (its seep's tile, 13, is wet), it sets the shared failure
// signals and throws, as a helper lost mid-commit would.
import { parentPort } from "node:worker_threads";
import { tsImport } from "tsx/esm/api";

const { stripHelper } = await tsImport("../../../src/core/sim/parallel.ts", import.meta.url);
const handle = stripHelper();
let runs = 0;
let f, layout;
const add = Atomics.add;
Atomics.add = (a, i, v) => {
  // after one good run (generation 3), the final commit barrier of run 2 (generation 6)
  if (runs === 2 && a.length === 4 && i === 1 && Atomics.load(a, 0) === 6) {
    while (f[layout.d + 13] < 1) {
      /* the coordinator commits its own seep row first */
    }
    Atomics.store(a, 2, 1);
    add(a, 0, 1);
    Atomics.notify(a, 0);
    throw Error("helper lost at the commit barrier");
  }
  return add(a, i, v);
};
parentPort.on("message", (m) => {
  if (m.kind === "init") (f = new Float64Array(m.sab)), (layout = m.info.layout);
  if (m.kind === "run") runs++;
  handle(m);
});
