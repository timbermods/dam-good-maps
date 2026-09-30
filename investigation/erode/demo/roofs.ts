// Original 128² limestone shelter: corbelled ceiling, thin beds and a thicker diagonal rib.
import { washMap } from "../core/map";
import { Terrain } from "../core/terrain";
import { support } from "../core/support";
import type { Case } from "./cases";

export function roofMap() {
  const map = washMap(), { W, H } = map;
  map.id = "roof"; map.name = "Weathered shelter · 128²"; map.source = "Original procedural roof fixture for Erode round 7";
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const edge = Math.hypot((x - 64) / 28, (y - 61) / 30);
    const rib = y - (60 + (x - 64) * 0.35);
    const base = 3 + Math.round(9 * Math.max(0, Math.min(1, (1 - edge) * 5)));
    map.heights[y * W + x] = base + Math.round(6 * Math.exp(-((rib / 3.3) ** 2) - ((x - 64) / 18) ** 4));
  }
  const terrain = Terrain.fromHeights(W, H, map.heights);
  for (let y = 40; y <= 91; y++) for (let x = 58; x <= 69; x++) {
    const ceiling = 9 + Math.floor(Math.min(x - 58, 69 - x) / 3);
    for (let z = 3; z < Math.min(ceiling, terrain.surface(y * W + x)); z++) terrain.set(y * W + x, z, false);
  }
  for (const v of support(terrain).unsupported) terrain.set(v % terrain.N, Math.floor(v / terrain.N), false);
  // A few original schematic objects exercise falling trees and carrying a 3×3 start.
  map.things = [
    { id: "roof-pine", template: "Pine", x: 63, y: 53, z: 12 },
    { id: "roof-bush", template: "BlueberryBush", x: 65, y: 65, z: terrain.surface(65 * W + 65) },
    { id: "roof-start", template: "StartingLocation", x: 61, y: 65, z: 12 },
  ];
  return { map, terrain };
}

const overview = { target: [64, 9, -60] as [number, number, number], yaw: 0.55, pitch: 0.68, distance: 53, fov: 50 };
const low = { target: [64, 10, -58] as [number, number, number], yaw: 0, pitch: -0.08, distance: 19, fov: 64 };
export const ROOF_CASES: Case[] = [
  { id: "roof-skylight", title: "Thin roof → a skylight", map: "roof", gesture: "Click the thin roof from above",
    points: [{ x: 63.5, y: 53.5, z: 11.5, nz: 1 }], power: 25, size: 45, seed: 1,
    overview: { ...overview, target: [64, 10, -53], distance: 34 }, low, lowName: "Below the skylight" },
  { id: "roof-bridge", title: "Roof collapse → a natural bridge", map: "roof", gesture: "Sweep over the roof and its thicker rib",
    points: [{ x: 63.5, y: 51.5, z: 11.5, nz: 1 }, { x: 63.5, y: 59.5, z: 17.5, nz: 1 }, { x: 64.5, y: 68.5, z: 11.5, nz: 1 }],
    power: 100, size: 100, seed: 1, overview, low, lowName: "Under the bridge" },
  { id: "roof-dome", title: "Ceiling → a higher dome", map: "roof", gesture: "Sweep the ceiling from inside",
    points: [{ x: 62.5, y: 59.5, z: 10.5, nz: -1 }, { x: 65.5, y: 60.5, z: 10.5, nz: -1 }],
    power: 65, size: 60, seed: 1, overview: { ...low, target: [64, 12.5, -60], distance: 4.5, pitch: -0.65, fov: 74 },
    low, lowName: "Inside the dome" },
];
