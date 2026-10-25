// Arrays the page's thread hands to a worker (the water's meshes, its flow): on shared memory where the page is
// cross-origin isolated (vite.config.ts, public/sw.js), so posting them copies nothing, where a plain array is
// copied for every worker it goes to (a 256² map's water is about 1.5 MB, sent to three mesh workers several times a
// second). The page copies them once into it, a snapshot that never changes while a worker reads it: the worker
// reads exactly the values a copy would hold. Elsewhere, null: the caller posts its arrays as before.

type Numbers = Float32Array | Int32Array | Uint8Array;

/** Whether arrays on shared memory can be posted to a worker. */
export function canShare(): boolean {
  return typeof SharedArrayBuffer === "function" && (globalThis as { crossOriginIsolated?: boolean }).crossOriginIsolated === true;
}

/** A block of shared memory that copies of arrays go into (`copies`), kept and grown as needed. Kept by one sender
 *  whose worker has read the last copies before the next are made (the water mesh workers: one batch out at a
 *  time, and a forgotten batch's answer is never drawn). */
export class SharedBlock {
  private buffer: SharedArrayBuffer | null = null;

  /** Copies of `arrays`, each of its own type and contents; null where the page can't share them. `keep` false: a
   *  block of their own, for a sender that may have several out at once. */
  copies<T extends readonly Numbers[]>(arrays: T, keep = true): { [K in keyof T]: T[K] } | null {
    if (!canShare()) return null;
    let bytes = 0;
    for (const a of arrays) bytes += Math.ceil(a.byteLength / 8) * 8;
    let buffer = keep ? this.buffer : null;
    if (!buffer || buffer.byteLength < bytes) buffer = new SharedArrayBuffer(Math.max(8, bytes));
    if (keep) this.buffer = buffer;
    let at = 0;
    return arrays.map((a) => {
      const Kind = a.constructor as new (b: SharedArrayBuffer, offset: number, length: number) => Numbers;
      const out = new Kind(buffer, at, a.length);
      out.set(a);
      at += Math.ceil(a.byteLength / 8) * 8;
      return out;
    }) as unknown as { [K in keyof T]: T[K] };
  }

  /** Let go of the block: the next copies go in a new one (a worker may still be reading the last). */
  forget(): void {
    this.buffer = null;
  }
}

/** Copies of `arrays` on a block of shared memory of their own; null where the page can't share it. */
export function sharedCopies<T extends readonly Numbers[]>(arrays: T): { [K in keyof T]: T[K] } | null {
  return new SharedBlock().copies(arrays, false);
}
