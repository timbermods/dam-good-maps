import { gunzipSync, strFromU8 } from "fflate";
import { fullMap, type FullForceMap } from "../../src/core/forces/force";
import type { Intent } from "./landslide";
export interface Case { id: string; title: string; map: string; intent: Intent; power: number; size: number }
export const CASES: Case[] = [
 { id: "rockfall", title: "Rockfall · cliff above a river", map: "canyon", intent: {path:[{x:50,y:48},{x:30,y:48}]}, power: 90, size: 26 },
 { id: "slump", title: "Slump · slope above farmland", map: "highlands", intent: {path:[{x:23,y:36},{x:47,y:42}]}, power: 70, size: 20 },
 { id: "flow", title: "Flow · valley and natural dam", map: "highlands", intent: {path:[{x:14,y:25},{x:47,y:42}]}, power: 100, size: 32 }
];
export function decode(bytes: Uint8Array): FullForceMap {
  // Vite may serve .gz with Content-Encoding: gzip; fetch has already decoded it then.
  const j = JSON.parse(strFromU8(bytes[0] === 31 && bytes[1] === 139 ? gunzipSync(bytes) : bytes));
  return fullMap({ ...j, heights: Uint8Array.from(j.heights), lava: Uint32Array.from(j.lava),
    water: { depth: Float64Array.from(j.water.depth), contamination: Float64Array.from(j.water.contamination) } });
}
export async function loadCase(c: Case): Promise<FullForceMap> {
  const url = c.map === "highlands" ? new URL("./maps/highlands.json.gz", import.meta.url) : new URL("./maps/canyon.json.gz", import.meta.url);
  const response = await fetch(url); if (!response.ok) throw Error("Map could not load");
  return decode(new Uint8Array(await response.arrayBuffer()));
}
