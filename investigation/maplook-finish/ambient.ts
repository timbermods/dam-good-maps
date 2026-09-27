import { DataTexture, LinearFilter, RGBAFormat, UnsignedByteType } from 'three';
import { DEAD, type MapView } from '../../src/render3d/model';

/** Stable, map-space AO. Eight terrain horizons at four radii, plus soft canopy/ruin
 * footprints. No camera dependency, no screen-edge halos, no per-frame CPU work. */
export function bakeAmbient(map: MapView) {
  const start = performance.now();
  const { W, H, heights, entities: e } = map;
  const cover = new Float32Array(W * H);
  let trees = 0, ruins = 0;
  for (let k = 0; k < e.count; k++) {
    const name = e.templates[e.template[k]];
    const tree = /^(Pine|Birch|Oak)/.test(name) && !(e.flags[k] & DEAD);
    const ruin = name.startsWith('RuinColumnH');
    if (!tree && !ruin) continue;
    if (tree) trees++; else ruins++;
    const radius = tree ? (name.startsWith('Oak') ? 2.3 : 1.55) : 1.25;
    const reach = Math.ceil(radius);
    for (let dy = -reach; dy <= reach; dy++) for (let dx = -reach; dx <= reach; dx++) {
      const x = e.x[k] + dx, y = e.y[k] + dy;
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const i = y * W + x, d = Math.hypot(dx, dy) / radius;
      if (d >= 1 || Math.abs(heights[i] - e.z[k]) > 1) continue;
      // Multiplicative visibility saturates gracefully in dense groves.
      const occlusion = (tree ? 0.27 : 0.18) * (1 - d * d) ** 2;
      cover[i] = 1 - (1 - cover[i]) * (1 - occlusion);
    }
  }
  const data = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, z = heights[i];
    let occlusion = 0;
    for (let a = 0; a < 8; a++) {
      const angle = a * Math.PI / 4;
      let horizon = 0;
      for (const r of [1, 2, 4, 8]) {
        const xx = x + Math.round(Math.cos(angle) * r), yy = y + Math.round(Math.sin(angle) * r);
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const rise = Math.max(0, heights[yy * W + xx] - z);
        horizon = Math.max(horizon, rise / Math.hypot(rise, r) * (1 - r / 16));
      }
      occlusion += horizon / 8;
    }
    data[i * 4] = Math.round(255 * (1 - Math.min(0.32, occlusion * 0.55)));
    data[i * 4 + 1] = Math.round(255 * (1 - Math.min(0.40, cover[i])));
    data[i * 4 + 2] = z;
    data[i * 4 + 3] = 255;
  }
  const texture = new DataTexture(data, W, H, RGBAFormat, UnsignedByteType);
  texture.minFilter = texture.magFilter = LinearFilter;
  texture.needsUpdate = true;
  return { texture, milliseconds: performance.now() - start, trees, ruins, bytes: data.byteLength };
}

export const ambientGLSL = /* glsl */ `
uniform sampler2D m3Ambient;
uniform float m3AO;
float ambientVisibility(vec3 world, vec3 normal) {
  if (m3AO < 0.5) return 1.0;
  vec2 g = vec2(world.x + normal.x * 0.55, -world.z - normal.z * 0.55);
  vec4 a = texture2D(m3Ambient, clamp(g / mapSize, 0.5 / mapSize, 1.0 - 0.5 / mapSize));
  float ground = texture2D(tileTex, (clamp(floor(g), vec2(0.0), mapSize - 1.0) + 0.5) / mapSize).r * 255.0;
  float above = max(0.0, world.y - ground);
  // At a cliff, use the air-side floor, so darkening fades upward from its foot.
  float terrain = mix(a.r, 1.0, smoothstep(0.1, 3.5, above));
  float canopy = mix(a.g, 1.0, smoothstep(0.0, 2.4, above));
  return max(0.58, terrain * canopy);
}
`;
