// The project file of a document the generator's worker handed over (`projectDocument`), written on a worker of its
// own: Generate no longer waits for the map it replaces to be written before the new one starts (the click's lag at
// 256², 0.6 to 0.7 s of it the old map's file). The same bytes as the worker's `project` (`encodeProject`); where the
// worker fails, written here.

import { encodeProject, type MapDocument } from "../core/doc/document";

let writer: Worker | null = null;
let broken = false;
let ids = 0;
const waits = new Map<number, { done: (b: Uint8Array) => void; fail: (e: Error) => void }>();

function failAll(e: Error): void {
  broken = true;
  for (const w of waits.values()) w.fail(e);
  waits.clear();
  writer?.terminate();
}

/** The project file of `doc` at gzip `level`. */
export async function writeProject(doc: MapDocument, level: number): Promise<Uint8Array> {
  // (the end-to-end build lets a test make every write fail, here and on the worker: generate-new-map.spec.ts)
  if (import.meta.env.MODE === "e2e" && (globalThis as { __dgmWriteFails?: boolean }).__dgmWriteFails) throw new Error("the test's write failure");
  if (!broken && typeof Worker !== "undefined") {
    try {
      writer ??= (() => {
        const w = new Worker(new URL("./projectWriter.worker.ts", import.meta.url), { type: "module", name: "project writer" });
        w.onerror = () => failAll(new Error("the project writer failed"));
        w.onmessageerror = () => failAll(new Error("the project writer's message could not be read"));
        w.onmessage = (e: MessageEvent<{ id: number; bytes?: Uint8Array; error?: string }>) => {
          const w = waits.get(e.data.id);
          if (!w) return;
          waits.delete(e.data.id);
          if (e.data.bytes) w.done(e.data.bytes);
          else w.fail(new Error(e.data.error ?? "the project writer failed"));
        };
        return w;
      })();
      const id = ++ids;
      return await new Promise<Uint8Array>((done, fail) => {
        waits.set(id, { done, fail });
        writer!.postMessage({ id, doc, level });
      });
    } catch {
      // (written here instead)
    }
  }
  return encodeProject(doc, level);
}
