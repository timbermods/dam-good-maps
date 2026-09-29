// Original dry fixtures for round 4; the flat round 3 fixture stays untouched.
import { washMap, type ErodeMap } from "../core/map";
import type { Case } from "./cases";

export function unevenMap(id: string): ErodeMap | undefined {
  if (!["terraces", "step", "slope"].includes(id)) return;
  const m = washMap();
  m.id = id; m.name = `${id === "step" ? "Tall step" : id === "slope" ? "Sloping country" : "Dry terraces"} · 128²`;
  m.source = "Original procedural dry terrain for Erode round 4";
  for (let i = 0; i < m.heights.length; i++) {
    const x = i % m.W, y = Math.floor(i / m.W), contour = x + 2 * Math.sin(y / 13);
    m.heights[i] = id === "step" ? (contour < 64 ? 22 : 10) : id === "slope" ?
      Math.max(8, Math.min(22, 22 - Math.floor((contour - 12) / 7))) :
      22 - 3 * Math.max(0, Math.min(4, Math.floor((contour - 10) / 20)));
  }
  return m;
}

const points = [[18.5, 53.5], [47.5, 58.5], [79.5, 67.5], [108.5, 72.5]];
const on = (id: string, xy: number[][]) => {
  const m = unevenMap(id)!;
  return xy.map(([x, y]) => ({ x, y, z: m.heights[Math.floor(y) * m.W + Math.floor(x)] - 0.1 }));
};
export const UNEVEN_CASES: Case[] = [
  ...[true, false].map(up => ({
    id: `wash-terraces-${up ? "up" : "down"}`, title: `Terraces → wash drawn ${up ? "uphill" : "downhill"}`,
    map: "terraces", gesture: `Sweep ${up ? "up" : "down"} across the terraces`,
    points: on("terraces", up ? points.slice().reverse() : points), power: 85, size: 80, seed: 1,
    overview: { target: [67, 10, -62] as [number, number, number], yaw: 0.9, pitch: 0.7, distance: 100 },
    low: up ? { target: [72.5, 11, -65.5] as [number, number, number], yaw: 1.7682, pitch: -0.1055, distance: 25.637, fov: 64 } :
      { target: [58.5, 14.4, -65.5] as [number, number, number], yaw: -1.0304, pitch: 0.128, distance: 23.52, fov: 64 },
    lowName: "Along the terraced wash",
  })),
  { id: "wash-step", title: "Tall step → a slot and dry fall", map: "step", gesture: "Sweep across the tall step",
    points: on("step", [[36.5, 53.5], [61.5, 62.5], [98.5, 72.5]]), power: 85, size: 80, seed: 1,
    overview: { target: [65, 12, -63], yaw: 1.0, pitch: 0.55, distance: 75 },
    low: { target: [64, 10, -62], yaw: 1.1, pitch: -0.1, distance: 18, fov: 64 }, lowName: "Below the dry fall" },
];
