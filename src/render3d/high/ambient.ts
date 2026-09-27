// Ambient occlusion for the High look (#65, investigation/maplook3 ambient.ts; PLAN §20 D242): stable
// and in map space, one texel a tile. R: how much of the sky the ground sees past the terrain round
// it (eight horizons at four radii); G: the soft footprint of trees' canopies and ruins. No camera
// in it, no halos at the screen's edge, no work per frame. An edit redoes the tiles round it only.

import { DataTexture, LinearFilter, RGBAFormat, UnsignedByteType } from "three";
import { DEAD, type EntityView } from "../model";

const RADII = [1, 2, 4, 8];
/** How far a height change moves the terrain term. */
export const AMBIENT_REACH = RADII[RADII.length - 1];

export class Ambient {
  readonly texture: DataTexture;
  private data: Uint8Array;
  private cover: Float32Array;
  /** Time of the last bake (ms): information. */
  ms = 0;

  constructor(
    readonly W: number,
    readonly H: number,
  ) {
    this.data = new Uint8Array(W * H * 4);
    this.cover = new Float32Array(W * H);
    this.texture = new DataTexture(this.data, W, H, RGBAFormat, UnsignedByteType);
    this.texture.minFilter = this.texture.magFilter = LinearFilter;
  }

  /** The whole map. */
  bake(heights: Uint8Array, e: EntityView): void {
    const t0 = performance.now();
    this.canopy(heights, e);
    this.terrainRect(heights, 0, 0, this.W - 1, this.H - 1);
    this.ms = performance.now() - t0;
  }

  /** The canopies again (the objects changed). */
  objects(heights: Uint8Array, e: EntityView): void {
    this.canopy(heights, e);
    const { data, cover } = this;
    for (let i = 0; i < this.W * this.H; i++) data[i * 4 + 1] = Math.round(255 * (1 - Math.min(0.4, cover[i])));
    this.texture.needsUpdate = true;
  }

  /** The terrain round a rectangle of changed heights. */
  terrainAround(heights: Uint8Array, x0: number, y0: number, x1: number, y1: number): void {
    const r = AMBIENT_REACH;
    this.terrainRect(heights, x0 - r, y0 - r, x1 + r, y1 + r);
  }

  private canopy(heights: Uint8Array, e: EntityView): void {
    const { W, H } = this;
    const cover = this.cover;
    cover.fill(0);
    for (let k = 0; k < e.count; k++) {
      const name = e.templates[e.template[k]];
      const tree = /^(Pine|Birch|Oak)/.test(name) && !(e.flags[k] & DEAD);
      const ruin = name.startsWith("RuinColumnH");
      if (!tree && !ruin) continue;
      const radius = tree ? (name.startsWith("Oak") ? 2.3 : 1.55) : 1.25;
      const reach = Math.ceil(radius);
      for (let dy = -reach; dy <= reach; dy++)
        for (let dx = -reach; dx <= reach; dx++) {
          const x = e.x[k] + dx;
          const y = e.y[k] + dy;
          if (x < 0 || y < 0 || x >= W || y >= H) continue;
          const i = y * W + x;
          const d = Math.hypot(dx, dy) / radius;
          if (d >= 1 || Math.abs(heights[i] - e.z[k]) > 1) continue;
          // multiplied, so a dense grove saturates gently
          const occlusion = (tree ? 0.27 : 0.18) * (1 - d * d) ** 2;
          cover[i] = 1 - (1 - cover[i]) * (1 - occlusion);
        }
    }
  }

  private terrainRect(heights: Uint8Array, x0: number, y0: number, x1: number, y1: number): void {
    const { W, H, data, cover } = this;
    for (let y = Math.max(0, y0); y <= Math.min(H - 1, y1); y++)
      for (let x = Math.max(0, x0); x <= Math.min(W - 1, x1); x++) {
        const i = y * W + x;
        const z = heights[i];
        let occlusion = 0;
        for (let a = 0; a < 8; a++) {
          const angle = (a * Math.PI) / 4;
          const c = Math.cos(angle);
          const s = Math.sin(angle);
          let horizon = 0;
          for (const r of RADII) {
            const xx = x + Math.round(c * r);
            const yy = y + Math.round(s * r);
            if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
            const rise = Math.max(0, heights[yy * W + xx] - z);
            horizon = Math.max(horizon, (rise / Math.hypot(rise, r)) * (1 - r / 16));
          }
          occlusion += horizon / 8;
        }
        data[i * 4] = Math.round(255 * (1 - Math.min(0.32, occlusion * 0.55)));
        data[i * 4 + 1] = Math.round(255 * (1 - Math.min(0.4, cover[i])));
        data[i * 4 + 2] = z;
        data[i * 4 + 3] = 255;
      }
    this.texture.needsUpdate = true;
  }

  dispose(): void {
    this.texture.dispose();
  }
}
