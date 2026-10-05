// A helper thread of the determinism check's threaded engines (threads.ts).
import { stripHelper } from "../../src/core/sim/parallel";

const handle = stripHelper();
self.onmessage = (e: MessageEvent) => handle(e.data);
