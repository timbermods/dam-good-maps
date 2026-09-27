import type { ShaderMaterial } from 'three';
import { replace } from './lighting';

/** The boundary is a cut through the exact mesh, including caves and stored water.
 * Nothing displaces terrain or fabricates a shoreline. */
export class DioramaEdge {
  geology = { value: 1 }; soil = { value: 1 }; water = { value: 1 };
  constructor(terrain: ShaderMaterial, water: ShaderMaterial) {
    Object.assign(terrain.uniforms, { finishGeology: this.geology, finishSoil: this.soil });
    terrain.fragmentShader = 'uniform float finishGeology, finishSoil;\n' + terrain.fragmentShader;
    const anchor = '        // Markers: an outline where contaminated ground ends';
    terrain.fragmentShader = replace(terrain.fragmentShader, anchor, /* glsl */ `
        // Only the four exterior cut faces; inland cliffs retain phase 1.
        bool cut = abs(n.y) < 0.5 && (vWorld.x < 0.003 || vWorld.x > mapSize.x - 0.003 || -vWorld.z < 0.003 || -vWorld.z > mapSize.y - 0.003);
        if (cut && (finishGeology > 0.5 || finishSoil > 0.5)) {
          float a = abs(n.x) > 0.5 ? -vWorld.z : vWorld.x;
          float y = vWorld.y;
          float warp = (vnoise(vec2(a * 0.075, 19.7)) - 0.5) * 0.75;
          float bed = y + warp;
          float broad = vnoise(vec2(a * 0.24, y * 1.6));
          float band = sin(bed * 4.8) * 0.5 + 0.5;
          vec3 stone = mix(vec3(0.40, 0.43, 0.40), vec3(0.63, 0.59, 0.47), smoothstep(0.2, 0.8, band));
          float seam = 1.0 - smoothstep(0.035, 0.095 + fwidth(bed), abs(sin(bed * 1.83 + 2.4)));
          stone = mix(stone, vec3(0.77, 0.71, 0.57), seam * 0.65);
          float grain = vnoise(vec2(a * 8.3, y * 16.7));
          float joint = cracks(vec2(a * 0.67 + warp, y * 0.93) + 41.8).x;
          stone *= 0.87 + broad * 0.18 + grain * 0.10;
          stone *= 1.0 - joint * 0.18 * (1.0-smoothstep(0.06,0.22,fwidth(a)));
          stone *= 0.86 + 0.14 * smoothstep(-3.0, 1.0, y);
          if (finishGeology > 0.5) c = stone;
          if (finishSoil > 0.5) {
            float depth = h0 - y;
            float soilDepth = 0.54 + 0.22 * vnoise(vec2(a * 1.53, 7.2));
            float cap = 1.0 - smoothstep(soilDepth - 0.12, soilDepth + 0.12, depth);
            vec3 earth = mix(vec3(0.43, 0.30, 0.18), vec3(0.63, 0.46, 0.28), grain);
            float roots = pow(1.0 - abs(sin(a * 11.3 + y * 2.7 + vnoise(vec2(a, y)) * 4.0)), 14.0);
            earth = mix(earth, vec3(0.29, 0.24, 0.14), roots * smoothstep(0.15, 0.45, depth) * 0.55);
            c = mix(c, earth, cap);
            float moist = step(0.5, soilOf(d0).x);
            c = mix(c, mix(vec3(0.63,0.53,0.30),vec3(0.49,0.61,0.22),moist), 1.0-smoothstep(0.015,0.09,depth));
          }
          light = skyColor * 1.1 + sunColor * 0.50 * max(dot(n,sunDir),0.0);
        }
` + anchor);
    terrain.needsUpdate = true;
    water.uniforms.finishWaterSection = this.water;
    water.fragmentShader = 'uniform float finishWaterSection;\n' + water.fragmentShader;
    water.fragmentShader = replace(water.fragmentShader, '  foam *= 1.0 - bad * 0.55;', /* glsl */ `
  if (finishWaterSection > 0.5 && n.y < 0.5 && vFlags > 254.5) {
    // Water edge geometry already spans the actual column floor to surface.
    float sectionDepth = max(vData.x, 0.0);
    vec3 section = mix(vec3(0.18,0.50,0.55), vec3(0.075,0.23,0.30), 1.0-exp(-sectionDepth*0.65));
    section = mix(section, vec3(0.38,0.14,0.095), cont);
    float sediment = vnoise(vec2(g.x+g.y, vWorld.y*5.7))*0.08;
    c = section * (0.94+sediment);
    alpha = mix(0.91,0.98,cont);
  }
  foam *= 1.0 - bad * 0.55;`);
    water.needsUpdate = true;
  }
}
