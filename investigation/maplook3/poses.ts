import { pose as priorPose } from '../maplook2/poses';
import { DEAD, type MapView } from '../../src/render3d/model';

export function pose(map: MapView, kind: string) {
  if (kind !== 'forest') return priorPose(map, kind);
  const { W, H, entities: e, heights } = map;
  const trees = new Uint8Array(W * H);
  for (let k = 0; k < e.count; k++) if (/^(Pine|Birch|Oak)/.test(e.templates[e.template[k]]) && !(e.flags[k] & DEAD)) trees[e.y[k] * W + e.x[k]] = 1;
  let best = -Infinity, tile = -1;
  for (let y = 8; y < H - 8; y++) for (let x = 8; x < W - 8; x++) {
    const i = y * W + x;
    if (!trees[i]) continue;
    let around = 0, clear = 0;
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const j = i + dy * W + dx; around += trees[j];
      if (dy < -1 && !trees[j] && heights[j] === heights[i]) clear++;
    }
    const score = Math.min(around, 28) + clear * 0.6 - Math.hypot(x - W / 2, y - H / 2) * 0.035;
    if (score > best) { best = score; tile = i; }
  }
  return tile < 0 ? { found: false, camera: {} } : {
    found: true, tile, camera: { mode: 'orbit' as const, target: [tile % W + .5, heights[tile] + 1, -Math.floor(tile / W) - .5] as [number, number, number], distance: 36, yaw: -.45, pitch: .68 },
  };
}
