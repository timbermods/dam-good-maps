// The page half of tools/rock-texture.ts: draws the pattern texture as the view does and reads back its rock layer
// (materials.ts `ROCK`) at one mip, as base64 RGBA bytes. Loaded by the dev server (so `three` is the app's own).

import { Mesh, NearestFilter, OrthographicCamera, PlaneGeometry, Scene, ShaderMaterial, WebGLRenderer, WebGLRenderTarget } from "three";
import { drawPatterns } from "../src/render3d/materials";

export function readRock(mip: number): string {
  const gl = new WebGLRenderer();
  const rt = drawPatterns(gl);
  const n = rt.width >> mip;
  const out = new WebGLRenderTarget(n, n, { minFilter: NearestFilter, magFilter: NearestFilter });
  const mat = new ShaderMaterial({
    uniforms: { t: { value: rt.texture }, lod: { value: mip } },
    vertexShader: "varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }",
    fragmentShader: "precision highp sampler2DArray; uniform sampler2DArray t; uniform float lod; varying vec2 vUv; void main() { gl_FragColor = textureLod(t, vec3(vUv, 1.0), lod); }",
  });
  const scene = new Scene();
  scene.add(new Mesh(new PlaneGeometry(2, 2), mat));
  gl.setRenderTarget(out);
  gl.render(scene, new OrthographicCamera(-1, 1, 1, -1, 0, 1));
  const buf = new Uint8Array(n * n * 4);
  gl.readRenderTargetPixels(out, 0, 0, n, n, buf);
  gl.dispose();
  let s = "";
  for (let i = 0; i < buf.length; i += 8192) s += String.fromCharCode(...buf.subarray(i, i + 8192));
  return btoa(s);
}
