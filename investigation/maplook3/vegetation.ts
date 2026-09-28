import { BufferGeometry, Float32BufferAttribute, CylinderGeometry, IcosahedronGeometry, Matrix4, Quaternion, Vector3, Mesh, OrthographicCamera, Scene, ShaderMaterial, WebGLRenderer, LinearSRGBColorSpace, PlaneGeometry } from 'three';

type RGB = [number, number, number];
/** Original deterministic mesh construction. Faceted clusters have asymmetry, open
 * gaps and visible branch structure; this is a specimen study, not map replacement. */
function specimen(kind: 'pine' | 'birch' | 'oak', seed: number) {
  let state = seed;
  const rand = () => { state = Math.imul(state, 1664525) + 1013904223 | 0; return (state >>> 0) / 4294967296; };
  const position: number[] = [], normal: number[] = [], color: number[] = [];
  function add(geometry: BufferGeometry, rgb: RGB, at: Vector3, scale = new Vector3(1, 1, 1), rotation = new Quaternion()) {
    let g = geometry.index ? geometry.toNonIndexed() : geometry;
    g.applyMatrix4(new Matrix4().compose(at, rotation, scale));
    const p = g.getAttribute('position'), n = g.getAttribute('normal');
    for (let i = 0; i < p.count; i++) {
      position.push(p.getX(i), p.getY(i), p.getZ(i)); normal.push(n.getX(i), n.getY(i), n.getZ(i));
      const shade = .86 + rand() * .12 + Math.max(0, n.getY(i)) * .10;
      color.push(rgb[0] * shade, rgb[1] * shade, rgb[2] * shade);
    }
    g.dispose(); if (g !== geometry) geometry.dispose();
  }
  function branch(a: Vector3, b: Vector3, radius: number, rgb: RGB) {
    const delta = b.clone().sub(a);
    add(new CylinderGeometry(radius * .5, radius, delta.length(), 6), rgb, a.clone().add(b).multiplyScalar(.5), new Vector3(1, 1, 1), new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), delta.normalize()));
  }
  const bark: RGB = kind === 'birch' ? [.78, .77, .66] : [.35, .26, .17];
  const height = kind === 'pine' ? 3.65 : kind === 'birch' ? 3.4 : 2.85;
  branch(new Vector3(), new Vector3(.035, height * .9, .045), kind === 'oak' ? .16 : .07, bark);
  // Buttress roots, visible against the quiet ground disc.
  for (let k = 0; k < 5; k++) { const a = k * 1.256; branch(new Vector3(0, .25, 0), new Vector3(Math.cos(a) * .34, .025, Math.sin(a) * .34), .055, bark); }
  if (kind === 'pine') {
    for (let tier = 0; tier < 7; tier++) {
      const y = .65 + tier * .40, radius = .88 - tier * .10;
      for (let arm = 0; arm < 5; arm++) {
        const angle = arm * 1.256 + tier * 2.4;
        const r = radius * (.67 + rand() * .20);
        const p = new Vector3(Math.cos(angle) * r, y, Math.sin(angle) * r);
        branch(new Vector3(0, y + .14, 0), p, .027, bark);
        add(new IcosahedronGeometry(1, 0), [.17 + rand() * .035, .32 + rand() * .045, .17], p.clone().add(new Vector3(0, .20, 0)), new Vector3(radius * .48, .40, radius * .40));
      }
    }
    add(new IcosahedronGeometry(1, 0), [.21, .37, .20], new Vector3(0, 3.39, 0), new Vector3(.24, .48, .23));
  } else {
    const oak = kind === 'oak';
    const arms = oak ? 7 : 6;
    for (let k = 0; k < arms; k++) {
      const angle = k * 2.399, y = oak ? 1.42 + rand() * .75 : 1.48 + k * .22;
      const r = oak ? .85 + rand() * .32 : .42 + rand() * .30;
      const p = new Vector3(Math.cos(angle) * r, y + .42, Math.sin(angle) * r);
      branch(new Vector3(0, y - .7, 0), p, oak ? .09 : .035, bark);
      for (let leaf = 0; leaf < (oak ? 6 : 5); leaf++) {
        const a = rand() * Math.PI * 2, spread = rand() * (oak ? .55 : .33);
        const rgb: RGB = oak ? [.29 + rand() * .065, .40 + rand() * .07, .16] : [.42 + rand() * .07, .51 + rand() * .05, .21];
        const size = oak ? .44 + rand() * .16 : .27 + rand() * .12;
        add(new IcosahedronGeometry(1, 1), rgb, p.clone().add(new Vector3(Math.cos(a) * spread, rand() * .42, Math.sin(a) * spread)), new Vector3(size, size * (oak ? .80 : 1.35), size * .84));
      }
    }
    if (!oak) {
      // Short charcoal bark scars, geometry rather than an imported texture.
      for (let k = 0; k < 9; k++) add(new CylinderGeometry(.072, .075, .035, 7, 1, true, k * 1.1, 1.2), [.23, .24, .20], new Vector3(0, .3 + k * .24, 0));
    }
  }
  const out = new BufferGeometry();
  out.setAttribute('position', new Float32BufferAttribute(position, 3)); out.setAttribute('normal', new Float32BufferAttribute(normal, 3)); out.setAttribute('color', new Float32BufferAttribute(color, 3));
  out.computeBoundingSphere(); return out;
}

export class Vegetation {
  enabled = true;
  wind = true;
  private gl: WebGLRenderer;
  private scene = new Scene();
  private camera = new OrthographicCamera(-5, 5, 3.0, -3.0, .1, 80);
  private meshes: Mesh[] = [];
  readonly material = new ShaderMaterial({
    uniforms: { time: { value: 8 }, wind: { value: 1 } }, vertexColors: true,
    vertexShader: /* glsl */ `
      uniform float time, wind;
      varying vec3 c, n; varying float foot;
      void main() {
        vec3 p = position;
        float flex = pow(max(0.0, p.y - .20) / 3.6, 1.5);
        float phase = modelMatrix[3].x * 1.7;
        float sway = sin(time * 1.05 + phase) * .075 + sin(time * 1.83 + phase * 2.0) * .022;
        p.x += sway * flex * wind; p.z += sin(time * .87 + phase) * .043 * flex * wind;
        c = color; n = normal; foot = p.y;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 c, n; varying float foot;
      void main() {
        float sun = clamp(dot(normalize(n), normalize(vec3(-.45,.77,.45))) * .75 + .25, 0.0, 1.0);
        vec3 light = vec3(.61,.62,.64) * (.80 + .20 * n.y) + vec3(1.0,.95,.84) * sun * .56;
        float ao = mix(.65, 1.0, smoothstep(0.0, .85, foot));
        gl_FragColor = vec4(c * light * ao, 1.0);
      }`,
  });
  private shadow = new ShaderMaterial({
    transparent: true, depthWrite: false,
    vertexShader: `varying vec2 v;void main(){v=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
    fragmentShader: `varying vec2 v;void main(){float a=1.0-smoothstep(0.05,0.5,length(v-.5));gl_FragColor=vec4(.20,.25,.14,a*.28);}`,
  });
  constructor(private canvas: HTMLCanvasElement) {
    this.gl = new WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
    this.gl.outputColorSpace = LinearSRGBColorSpace;
    this.gl.setPixelRatio(Math.min(2, devicePixelRatio));
    this.camera.position.set(5, 4, 9); this.camera.lookAt(0, 1.5, 0);
    for (const [i, kind] of (['pine', 'birch', 'oak'] as const).entries()) {
      const mesh = new Mesh(specimen(kind, 912 + i * 42), this.material); mesh.position.x = (i - 1) * 3.1; this.meshes.push(mesh); this.scene.add(mesh);
      const shade = new Mesh(new PlaneGeometry(3.3, 2.5), this.shadow); shade.rotation.x = -Math.PI / 2; shade.position.set(mesh.position.x + .2, .01, .1); this.meshes.push(shade); this.scene.add(shade);
    }
  }
  render(t: number) {
    if (!this.enabled) return;
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    if (!w || !h) return;
    if (this.canvas.width !== Math.round(w * this.gl.getPixelRatio()) || this.canvas.height !== Math.round(h * this.gl.getPixelRatio())) this.gl.setSize(w, h, false);
    this.camera.left = -5.5; this.camera.right = 5.5; this.camera.top = 5.5 * h / w; this.camera.bottom = -this.camera.top; this.camera.updateProjectionMatrix();
    this.material.uniforms.time.value = t; this.material.uniforms.wind.value = +this.wind; this.gl.render(this.scene, this.camera);
  }
  get triangles() { return this.meshes.reduce((sum, m) => sum + (m.geometry.index?.count ?? m.geometry.getAttribute('position').count) / 3, 0); }
  finish() { this.gl.getContext().finish(); }
  context() { return this.gl.getContext() as WebGL2RenderingContext; }
  dispose() { for (const m of this.meshes) m.geometry.dispose(); this.material.dispose(); this.shadow.dispose(); this.gl.dispose(); }
}
