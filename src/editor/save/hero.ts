// The saved map's picture (D488): the .timber's thumbnail drawn in 3D (`render3d/hero.ts`) in place of the
// core's top-down one. Never in a save's way: without the picture (no GPU or WebGL 2, the file keeps its own
// picture, or anything fails) the file is saved as the core wrote it.

import type { Remote } from "comlink";
import type { GeneratorApi } from "../../worker/generator.worker";
import type { MapView } from "../../render3d/model";

/** `timber` with the map's 3D picture as its thumbnail, or `timber` itself. `picture` is the map as the file
 *  holds it (the export's, its canonical water), absent when the file keeps its own thumbnail. */
export async function withHeroPicture(api: Remote<GeneratorApi>, timber: Uint8Array, picture: MapView | undefined): Promise<Uint8Array> {
  if (!picture) return timber;
  try {
    const t0 = performance.now();
    const { heroPicture } = await import("../../render3d/hero");
    const jpeg = await heroPicture(picture);
    if (!jpeg) return timber;
    // (copied to the worker, not transferred: `timber` stays whole for the fallback)
    const r = await api.replaceThumbnail(timber, jpeg);
    if (!r.ok) {
      console.warn(`The map's picture was not used: ${r.reason}.`);
      return timber;
    }
    window.dgmHeroMs = Math.round(performance.now() - t0);
    return r.bytes;
  } catch (e) {
    console.warn("The map's picture could not be drawn; the file keeps its top-down one.", e);
    return timber;
  }
}

declare global {
  interface Window {
    /** How long the last saved map's picture took (ms): information for the measurements. */
    dgmHeroMs?: number;
  }
}
