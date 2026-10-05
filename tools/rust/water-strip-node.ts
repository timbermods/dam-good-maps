// A helper thread of the multi-core water in Node (worker_threads), for the identity check only
// (tools/rust/water-threads.ts): the browser's is src/worker/waterStrip.worker.ts.

import { parentPort } from "node:worker_threads";
import { stripHelper } from "../../src/core/sim/parallel";

const handle = stripHelper();
parentPort!.on("message", handle);
