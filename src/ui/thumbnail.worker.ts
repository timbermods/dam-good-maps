// Your maps' picture of a map (D234), made off the page's thread (D453): the core's top-down thumbnail (`thumbnailPixels`)
// put on a canvas of the worker's own, in memory (`willReadFrequently`, never on the GPU), and answered as a PNG data URL.
// On the page, a canvas's `toDataURL` waited on the GPU behind the 3D view's frames (150 ms in a 256² flood) and the
// thumbnail's arithmetic took 30 to 40 ms.

import { expose } from "comlink";
import { thumbnailPixels } from "../core/render/thumb";

const api = {
  /** The map's thumbnail as a PNG data URL. */
  async png(m: { heights: Uint8Array; W: number; H: number; water: Float32Array | null }): Promise<string> {
    const t = thumbnailPixels(m.heights, m.W, m.H, m.water);
    const c = new OffscreenCanvas(t.w, t.h);
    c.getContext("2d", { willReadFrequently: true })!.putImageData(new ImageData(t.rgba, t.w, t.h), 0, 0);
    return new FileReaderSync().readAsDataURL(await c.convertToBlob({ type: "image/png" }));
  },
};

export type ThumbnailApi = typeof api;
expose(api);
