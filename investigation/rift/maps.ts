import { gunzipSync, strFromU8 } from "fflate";
import { fullMap, type FullForceMap } from "../../src/core/forces/force";
import type { Intent } from "./rift";
export interface Case { id: string; title: string; map: string; intent: Intent; power: number; size: number }
export const CASES: Case[] = [
  { id: "plateau", title: "Across a plateau", map: "highlands", intent: { path: [{ x: 86, y: 39 }, { x: 95, y: 53 }, { x: 93, y: 73 }, { x: 106, y: 94 }] }, power: 70, size: 22 },
  { id: "river", title: "Capture a river", map: "highlands", intent: { path: [{ x: 40, y: 38 }, { x: 61, y: 46 }, { x: 81, y: 52 }, { x: 101, y: 60 }] }, power: 100, size: 26 },
  { id: "curved", title: "A long, curved Rift", map: "highlands", intent: { path: [{ x: 14, y: 18 }, { x: 34, y: 24 }, { x: 51, y: 45 }, { x: 42, y: 66 }, { x: 58, y: 88 }, { x: 83, y: 94 }, { x: 109, y: 109 }] }, power: 80, size: 23 }
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
