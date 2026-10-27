// Your maps' pictures (D234), made in a worker of their own (`thumbnail.worker.ts`, D453): the page's thread only copies the
// map's heights and water. A picture never holds a save up: when the worker can't start (its script didn't load, say the
// network dropped or a release replaced the site's files) or doesn't answer within a few seconds, the picture is null (the
// save keeps the map's last one) and the worker is let go, so the next save starts a fresh one.

import { transfer, wrap, type Remote } from "comlink";
import type { ThumbnailApi } from "./thumbnail.worker";

/** A map's land and water, as the view shows them. */
export interface ThumbnailMap {
  heights: Uint8Array;
  W: number;
  H: number;
  water: ArrayLike<number> | null;
}

/** How long a picture may take before the save goes on without it. */
export const THUMBNAIL_WAIT_MS = 5000;

/** Pictures made in workers `start` gives (the page's: `thumbnail.worker.ts`), one at a time while it answers. */
export function thumbnailMaker(start: () => Worker, waitMs = THUMBNAIL_WAIT_MS): (m: ThumbnailMap) => Promise<string | null> {
  let current: { worker: Worker; api: Remote<ThumbnailApi>; failed: Promise<null> } | null = null;
  const stop = (w: Worker) => {
    w.terminate();
    if (current?.worker === w) current = null;
  };
  return async (m) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      if (!current) {
        const worker = start();
        // (comlink never hears a worker that failed to load: its own `error` event says so)
        const failed = new Promise<null>((done) =>
          worker.addEventListener("error", () => {
            stop(worker);
            done(null);
          }),
        );
        current = { worker, api: wrap<ThumbnailApi>(worker), failed };
      }
      const { worker, api, failed } = current;
      const heights = m.heights.slice();
      const water = m.water ? Float32Array.from(m.water) : null;
      const late = new Promise<null>((done) => {
        timer = setTimeout(() => {
          stop(worker);
          done(null);
        }, waitMs);
      });
      return await Promise.race([api.png(transfer({ heights, W: m.W, H: m.H, water }, water ? [heights.buffer, water.buffer] : [heights.buffer])), failed, late]);
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  };
}
