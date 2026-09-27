import { type DataTexture, type ShaderMaterial } from 'three';
import { MapRenderer } from '../../src/render3d/renderer';
import type { MapView } from '../../src/render3d/model';
import { bridge, Effects } from './base-effects';
import { ambientGLSL, bakeAmbient } from './ambient';

export function replace(source: string, from: string, to: string) {
  if (!source.includes(from)) throw new Error(`High shader bridge changed: ${from.slice(0, 80)}`);
  return source.replace(from, to);
}

export class Lighting {
  readonly ao = { value: 1 };
  readonly haze = { value: 1 };
  readonly sky = { value: 1 };
  readonly unclamp = { value: 1 };
  readonly ambient: { value: DataTexture | null } = { value: null };
  stats = { milliseconds: 0, trees: 0, ruins: 0, bytes: 0 };
  constructor(private renderer: MapRenderer, base: Effects) {
    const b = bridge(renderer);
    for (const material of base.materials) {
      material.uniforms.m3Haze = this.haze;
      material.uniforms.m3Unclamp = this.unclamp;
      material.fragmentShader = 'uniform float m3Haze, m3Unclamp;\n' + material.fragmentShader;
      material.fragmentShader = replace(material.fragmentShader,
        'c = mix(c, hazeColor, hazeAmount * smoothstep(hazeRange.x, hazeRange.y, d));',
        `if (m3Haze > 0.5 && hazeAmount > 0.0) {
          // A clear afternoon: no air wash in the foreground or at the target.
          float farAir = smoothstep(max(64.0, hazeRange.x * 1.5), max(160.0, hazeRange.y * 1.3), d);
          c = mix(c, vec3(0.78, 0.84, 0.91), farAir * 0.055);
        } else c = mix(c, hazeColor, hazeAmount * smoothstep(hazeRange.x, hazeRange.y, d));`);
      material.fragmentShader = replace(material.fragmentShader, 'return clamp(c, 0.0, 1.0);', 'return m3Unclamp > 0.5 ? max(c, vec3(0.0)) : clamp(c, 0.0, 1.0);');
      material.needsUpdate = true;
    }
    for (const material of [b.terrainMat, b.objectMat]) {
      material.uniforms.m3AO = this.ao; material.uniforms.m3Ambient = this.ambient;
      material.fragmentShader = replace(material.fragmentShader, '  /** Sky light and sun light', ambientGLSL + '\n  /** Sky light and sun light');
      material.fragmentShader = replace(material.fragmentShader,
        material === b.terrainMat ? 'skyColor * 1.0 *' : 'skyColor * 1.15 *',
        material === b.terrainMat ? 'skyColor * ambientVisibility(vWorld, n) * 1.0 *' : 'skyColor * ambientVisibility(vWorld, n) * 1.15 *');
      material.needsUpdate = true;
    }
    this.patchSky(b.skyMat);
  }
  private patchSky(material: ShaderMaterial) {
    material.uniforms.m3Sky = this.sky;
    material.fragmentShader = 'uniform float m3Sky;\n' + material.fragmentShader;
    material.fragmentShader = replace(material.fragmentShader, '        gl_FragColor = vec4(c, 1.0);', /* glsl */ `
      if (m3Sky > 0.5) {
        float horizon = exp(-abs(d.y) * 5.5);
        c = mix(vec3(0.39, 0.65, 0.91), vec3(0.78, 0.84, 0.91), horizon);
        if (d.y < 0.0) c = mix(vec3(0.49, 0.71, 0.89), c, exp(d.y * 3.0));
        vec2 p = d.xz / max(abs(d.y), 0.12) * 1.1;
        float n = vn(p) * 0.52 + vn(p * 2.07 + 3.7) * 0.30 + vn(p * 4.31 + 19.1) * 0.18;
        float cloud = smoothstep(0.55, 0.79, n) * smoothstep(0.03, 0.22, d.y);
        c = mix(c, vec3(0.97, 0.96, 0.89), cloud * 0.55);
        float sun = pow(max(dot(d, normalize(vec3(-0.45, 0.77, -0.45))), 0.0), 24.0);
        c += vec3(0.11, 0.075, 0.028) * sun;
      }
      gl_FragColor = vec4(c, 1.0);`);
    material.needsUpdate = true;
  }
  setMap(map: MapView) {
    const baked = bakeAmbient(map);
    this.ambient.value?.dispose(); this.ambient.value = baked.texture;
    const { texture, ...stats } = baked; this.stats = stats;
    this.renderer.requestRender();
  }
  dispose() { this.ambient.value?.dispose(); }
}
