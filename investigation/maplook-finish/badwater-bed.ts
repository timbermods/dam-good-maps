import type { ShaderMaterial } from 'three';

/** Let High's translucent badwater reveal the existing poisoned-ground art.
 * Baseline terrain deliberately replaces all submerged soil with a plain wet bed.
 * This hook changes only submerged, contaminated tiles beneath polluted water. */
export function badwaterBed(terrain: ShaderMaterial, water: ShaderMaterial) {
  const anchor='          vec3 ground = groundColor(soil, g, detail, clev, glow);';
  if(!terrain.fragmentShader.includes(anchor))throw new Error('Badwater bed bridge needs updating');
  const enabled={value:1};
  terrain.uniforms.mlBedEnabled=enabled;
  terrain.uniforms.mlBedFlow=water.uniforms.mlFlow;
  terrain.uniforms.mlBedSize=water.uniforms.mlFlowSize;
  terrain.fragmentShader=/* glsl */ `
uniform float mlBedEnabled;
uniform sampler2D mlBedFlow;
uniform vec2 mlBedSize;
`+terrain.fragmentShader.replace(anchor,anchor+/* glsl */ `
          if(mlBedEnabled>0.5 && d0.a>0.002 && soil.w>0.0 && clev>0.0) {
            float polluted=texture2D(mlBedFlow,g/mlBedSize).b*soil.w;
            if(polluted>0.0) {
              float poisonGlow;
              vec3 poisoned=groundColor(vec4(soil.xyz,0.0),g,detail,clev,poisonGlow);
              ground=mix(ground,poisoned,polluted);
              glow=mix(glow,poisonGlow,polluted);
            }
          }
`);
  terrain.needsUpdate=true;
  return {setEnabled(on:boolean){enabled.value=on?1:0;}};
}
