// A plug holding back a lake (M9b; PLAN §20 D274, "a plug holds back a lake: open it when you are
// ready"): on a map steered toward that intention, a line of Blockage across the channel where a big
// lake's water leaves it. The lake then stands a block higher, its water spilling over the plug, and
// removing the plug lets that block of water run down the valley. Found on the field the processes
// made, as the weir is (gen/weir.ts): it cuts nothing and raises nothing; the lake that holds the
// water is the land's. The intention's check (land/intentions.ts `plug-lake`) says whether it held.

import { pathField } from "../features/geometry";
import { featureId } from "../features/ids";
import { CARVED_HALF_SPREAD } from "../features/raster/terrain";
import type { MapObjectFeature } from "../features/schema";
import type { Hydro } from "../land/hydro";
import { tilesToRuns } from "../math/grid";

export interface PlugPlan {
  feature: MapObjectFeature;
  /** The plug's tiles and the lake it holds: the start and the badwater keep off them. */
  pool: number[];
}

/** A plug across the outlet of the biggest lake with a clear way out, or null. */
export function planPlug(h: Uint8Array, W: number, H: number, hy: Pick<Hydro, "rivers" | "lakes" | "water">, seed: number, protect: Uint8Array | null): PlugPlan | null {
  const N = W * H;
  const areaK = N / (128 * 128);
  const lakes = hy.lakes.filter((l) => l.tiles.length >= 350 * areaK).sort((a, b) => b.tiles.length - a.tiles.length || a.tiles[0] - b.tiles[0]);
  for (const lake of lakes) {
    const inLake = new Uint8Array(N);
    for (const i of lake.tiles) inLake[i] = 1;
    // the river that runs through it, and where its course leaves the lake
    for (const r of hy.rivers) {
      const f = pathField(r.params.path, W, H);
      const reach = (r.params.width / 2) * CARVED_HALF_SPREAD + 0.5;
      // arc positions of the course's points inside the lake
      let last = -1;
      for (let i = 0; i < N; i++) if (inLake[i] && f.d[i] < 1 && f.s[i] > last) last = f.s[i];
      if (last < 0) continue;
      // the line across the channel three tiles below the lake: channel tiles at that arc position
      const at = last + 3;
      if (at > f.length - 6) continue;
      const tiles: number[] = [];
      let bed = Infinity;
      for (let i = 0; i < N; i++) {
        if (!(f.d[i] < reach) || Math.abs(f.s[i] - at) > 0.5 || hy.water[i] !== 1) continue;
        if (inLake[i] || protect?.[i]) {
          tiles.length = 0;
          break;
        }
        const x = i % W;
        const y = (i - x) / W;
        if (x < 3 || y < 3 || x > W - 4 || y > H - 4) {
          tiles.length = 0;
          break;
        }
        tiles.push(i);
        if (h[i] < bed) bed = h[i];
      }
      if (tiles.length < 2 || tiles.length > 12) continue;
      // one level: the plug's tiles stand on the same bed, so its top is one line
      if (tiles.some((i) => h[i] !== bed)) continue;
      const role = "mapObject/plug/primary";
      const feature: MapObjectFeature = {
        id: featureId(seed, "mapObject", role),
        kind: "mapObject",
        origin: "generated",
        role,
        locked: false,
        params: { kind: "plug", placement: { area: tilesToRuns(tiles.slice().sort((a, b) => a - b), W) } },
      };
      return { feature, pool: [...tiles, ...lake.tiles] };
    }
  }
  return null;
}
