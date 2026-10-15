// The saved map's picture (D488): the .timber's thumbnail drawn in 3D (`render3d/hero.ts`) in place of the
// core's top-down one. Drawn while the export's checks run where the map's water is settled already (the worker
// sends the map then, `onPicture`), else once the file is written. Never in a save's way: without the picture (no
// GPU or WebGL 2, the file keeps its own picture, or anything fails) the file is saved as the core wrote it.

import { proxy, type Remote } from "comlink";
import type { GeneratorApi } from "../../worker/generator.worker";
import type { MapView } from "../../render3d/model";

/** The map's picture, or null where it can't be drawn or drawing failed. */
async function draw(view: MapView): Promise<Uint8Array | null> {
  try {
    const { heroPicture } = await import("../../render3d/hero");
    return await heroPicture(view);
  } catch (e) {
    console.warn("The map's picture could not be drawn; the file keeps its top-down one.", e);
    return null;
  }
}

/** One save's picture: `onPicture` goes to `api.exportTimber` (the map, early), `finish` takes the export's answer
 *  and gives the bytes to save: the file with the picture as its thumbnail, or the file itself. */
export function heroPicture(api: Remote<GeneratorApi>): {
  onPicture: (view: MapView) => void;
  finish: (r: { bytes: Uint8Array; picture?: MapView; pictureEarly?: boolean }) => Promise<Uint8Array>;
} {
  let early: Promise<Uint8Array | null> | null = null;
  return {
    onPicture: proxy((view: MapView) => {
      early = draw(view);
    }),
    async finish(r) {
      const t0 = performance.now();
      const jpeg = r.pictureEarly && early ? await early : r.picture ? await draw(r.picture) : null;
      if (!jpeg) return r.bytes;
      try {
        // (copied to the worker, not transferred: the file stays whole for the fallback)
        const out = await api.replaceThumbnail(r.bytes, jpeg);
        if (!out.ok) {
          console.warn(`The map's picture was not used: ${out.reason}.`);
          return r.bytes;
        }
        window.dgmHeroMs = Math.round(performance.now() - t0);
        return out.bytes;
      } catch (e) {
        console.warn("The map's picture could not be put in; the file keeps its top-down one.", e);
        return r.bytes;
      }
    },
  };
}

declare global {
  interface Window {
    /** How long the last saved map's picture held its save up after the file was written (ms): information. */
    dgmHeroMs?: number;
  }
}
