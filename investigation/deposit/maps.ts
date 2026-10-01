import { gunzipSync, strFromU8 } from "fflate";
import { fullMap, type FullForceMap } from "../../src/core/forces/force";
import type { Intent } from "./deposit";
export interface Case { id: string; title: string; map: string; intent: Intent; power: number; size: number }
export const CASES: Case[] = [
  { id: "canyon", title: "Canyon · river fan", map: "canyon", intent: { click: { x: 36, y: 48 } }, power: 100, size: 64 },
  { id: "dry", title: "Highlands · dry gully", map: "highlands", intent: { click: { x: 88, y: 20 } }, power: 100, size: 64 },
  { id: "lake", title: "Valley · into a lake", map: "lake", intent: { click: { x: 52, y: 48 } }, power: 100, size: 64 }
];
export const EXTRA_CLICKS: Case[] = [
  { id: "slope", title: "Highlands · slope click", map: "highlands", intent: { click: { x: 100, y: 79 } }, power: 100, size: 64 },
  { id: "flat", title: "Highlands · flat click", map: "highlands", intent: { click: { x: 112, y: 35 } }, power: 100, size: 64 },
  { id: "peak", title: "Highlands · peak click", map: "highlands", intent: { click: { x: 104, y: 80 } }, power: 100, size: 64 }
];
export const DEMOS = [...CASES, ...EXTRA_CLICKS];
export function decode(bytes: Uint8Array): FullForceMap {
  const j = JSON.parse(strFromU8(bytes[0] === 31 && bytes[1] === 139 ? gunzipSync(bytes) : bytes));
  return fullMap({ ...j, heights: Uint8Array.from(j.heights), lava: Uint32Array.from(j.lava), water: { depth: Float64Array.from(j.water.depth), contamination: Float64Array.from(j.water.contamination) } });
}
export async function loadCase(c: Case): Promise<FullForceMap> {
  const urls: Record<string, URL> = { canyon: new URL("./maps/canyon.json.gz", import.meta.url), highlands: new URL("./maps/highlands.json.gz", import.meta.url), lake: new URL("./maps/lake.json.gz", import.meta.url) };
  const response = await fetch(urls[c.map]); if (!response.ok) throw Error("Map could not load");
  return decode(new Uint8Array(await response.arrayBuffer()));
}
