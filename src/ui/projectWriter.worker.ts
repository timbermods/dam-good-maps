// Writes a project file off the page's thread and the generator's (ui/projectWriter.ts): the generator's worker hands
// over the open map's document (`projectDocument`) and is free for the next map at once.

import { encodeProject, type MapDocument } from "../core/doc/document";

self.onmessage = (e: MessageEvent<{ id: number; doc: MapDocument; level: number }>) => {
  const { id, doc, level } = e.data;
  try {
    const bytes = encodeProject(doc, level);
    (self as unknown as Worker).postMessage({ id, bytes }, [bytes.buffer]);
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, error: err instanceof Error ? err.message : String(err) });
  }
};
