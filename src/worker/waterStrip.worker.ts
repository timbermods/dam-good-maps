// A helper thread of the multi-core water (src/core/sim/parallel.ts): the editor's generator worker starts these
// on a cross-origin isolated page; each runs the Rust water on a strip of a big map, in step with the others.

import { stripHelper } from "../core/sim/parallel";

// its messages come straight from the generator worker that started it, or through a port when the page started
// it (platform/index.ts); "stop" ends it
const handle = stripHelper();
// an error nothing caught: the threads stop waiting for this one, and the water runs on one thread
self.addEventListener("error", () => handle.died());
self.addEventListener("unhandledrejection", () => handle.died());
const take = (e: MessageEvent) => (e.data?.kind === "stop" ? self.close() : handle(e.data));
self.onmessage = (e: MessageEvent) => {
  const port = (e.data as { waterPort?: MessagePort } | null)?.waterPort;
  if (port) port.onmessage = take;
  else take(e);
};
