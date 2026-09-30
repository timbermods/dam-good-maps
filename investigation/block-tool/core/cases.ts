import { Terrain } from "../../erode/core/terrain";
import { fromJson, type MapJson } from "../../erode/core/map";
import { planErode } from "../../erode/core/erode";
import type { Face } from "./block";
export const IDS = ["cliff", "cave", "flat"] as const;
export type CaseId = typeof IDS[number];
export function makeCase(id: CaseId, json: MapJson) {
  const map = fromJson(json);
  let terrain = Terrain.fromHeights(map.W,map.H,map.heights);
  if (id === "cave") terrain = planErode({ terrain, rock: map.rock, keep: map.keep, water: map.water },
    { points: [{ x: 93.5, y: 71.5, z: 4.5 }] }, { power: 70, size: null, seed: 1 }).final;
  return { map, terrain };
}
export const NORMALS = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]] as const;
export function faces(t: Terrain, bounds = [1,1,t.W-2,t.H-2]): Face[] {
  const out: Face[] = [];
  for (let y=bounds[1]; y<=bounds[3]; y++) for (let x=bounds[0]; x<=bounds[2]; x++) for (let z=1;z<22;z++) {
    if (!t.solid(x,y,z)) continue;
    for (const [nx,ny,nz] of NORMALS) if (!t.solid(x+nx,y+ny,z+nz)) out.push({x,y,z,nx,ny,nz});
  }
  return out;
}
