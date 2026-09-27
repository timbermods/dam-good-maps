import type { ShaderMaterial } from 'three';
import { replace } from './lighting';

export class Terrain {
  strata = { value: 1 };
  blend = { value: 1 };
  variation = { value: 1 };
  constructor(material: ShaderMaterial) {
    Object.assign(material.uniforms, { m3Strata: this.strata, m3Blend: this.blend, m3Variation: this.variation });
    let s = 'uniform float m3Strata, m3Blend, m3Variation;\n' + material.fragmentShader;
    s = replace(s, 'float moist = smoothstep(0.42, 0.58, s.x + edge);',
      'float moist = m3Blend > 0.5 ? smoothstep(0.08, 0.92, s.x + edge * 0.24) : smoothstep(0.42, 0.58, s.x + edge);');
    s = replace(s, 'float bad = smoothstep(0.4, 0.6, s.z + edge * 0.6);',
      'float bad = m3Blend > 0.5 ? smoothstep(0.08, 0.92, s.z + edge * 0.16) : smoothstep(0.4, 0.6, s.z + edge * 0.6);');
    s = replace(s, '        // contamination: a layer over the ground', /* glsl */ `
        if (m3Variation > 0.5) {
          // Two incommensurate world scales: broad warm/cool drifts, restrained grain.
          float broad = vnoise(g * 0.043 + vec2(12.0, 33.0)) - 0.5;
          float mottling = vnoise(g * 0.317 + vec2(21.0, 8.0)) - 0.5;
          c *= 1.0 + broad * 0.15 + mottling * 0.065;
          c *= vec3(1.0 + broad * 0.055, 1.0 + broad * 0.015, 1.0 - broad * 0.045);
        }
        // contamination: a layer over the ground`);
    s = replace(s, '          float py = fwidth(y);', /* glsl */ `
          if (m3Strata > 0.5) {
            float warp = (vnoise(vec2(along * 0.34, y * 0.21)) - 0.5) * 0.85;
            float beds = y * 3.2 + warp;
            float grain = vnoise(vec2(along * 7.7, y * 13.1)) - 0.5;
            float slab = vnoise(vec2(along * 0.71, y * 2.7));
            float band = sin(beds * 6.28318) * (1.0 - smoothstep(0.09, 0.30, fwidth(beds)));
            vec3 rock = mix(vec3(0.43, 0.445, 0.405), vec3(0.56, 0.545, 0.47), slab);
            rock *= shade * (0.90 + band * 0.075 + grain * 0.16 + (k - 0.5) * 0.24);
            float fissure = cracks(vec2(along * 0.83, y * 1.27) + 8.2).x;
            rock *= 1.0 - fissure * 0.20 * (1.0 - smoothstep(0.04, 0.22, fwidth(along)));
            wc = rock;
            // Tiny normal tilt catches the sun on the layers without rounding the voxels.
            n = normalize(n + vec3(0.0, band * 0.06, 0.0));
          }
          float py = fwidth(y);`);
    s = replace(s, 'float lines = (1.0 - smoothstep(0.22, 0.34, py)) * markers;',
      'float lines = (1.0 - smoothstep(0.22, 0.34, py)) * max(markers, m3Strata * 0.22);');
    material.fragmentShader = s; material.needsUpdate = true;
  }
}
