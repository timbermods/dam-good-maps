import { Color, Group, InstancedBufferAttribute, InstancedMesh, Matrix4, ShaderMaterial, Vector3, type Camera, type BufferGeometry } from 'three';
import { DEAD, YOUNG, type EntityView } from '../../src/render3d/model';
import { model, noise, paletteDefaults, placement, registry, slots, species, type Palette, type Species, type Detail } from './models';
import { motion, windGLSL } from './wind';

export const isPlant = (name: string): name is Species => species.includes(name as Species);
// The inherited custom shader writes display-referred RGB itself, without three's output transform.
const displayColor = (hex: string) => new Color(hex).convertLinearToSRGB();
export function vegetationMaterial(base: ShaderMaterial) {
  const material = new ShaderMaterial({
    defines: { ...base.defines }, uniforms: { ...base.uniforms, ...motion,
      vegPalette: { value: slots.map(k => displayColor(paletteDefaults[k])) },
      vegWrap: { value: 0.25 }, vegRoughness: { value: 0.92 }, vegSpecular: { value: 0.045 }, vegAmbient: { value: 1 },
    },
    vertexShader: `attribute float region; uniform vec3 vegPalette[${slots.length}];\n${windGLSL}\n` + base.vertexShader
      .replace('vNormal = normalize(mat3(m) * normal);', 'vec2 wv = windVector(); vNormal = normalize(mat3(m) * bendNormal(position, normal, wv));')
      .replace('vColor = pcolor;', 'vColor = pcolor * vegPalette[int(region)];')
      .replace('vec3 p = position;', 'vec3 p = bend(position, wv);'),
    fragmentShader: 'uniform float vegWrap; uniform float vegRoughness; uniform float vegSpecular; uniform float vegAmbient;\n' + base.fragmentShader
      .replace('dot(n, sunDir) * 0.75 + 0.25', '(dot(n, sunDir) + vegWrap) / (1.0 + vegWrap)')
      .replace('skyColor * 1.15', 'skyColor * 1.15 * vegAmbient')
      .replace('finish(vColor * light, vWorld)', `finish(vColor * light + sunColor * vegSpecular * (1.0 - vegRoughness * 0.85) * pow(max(dot(n, normalize(sunDir + normalize(cameraPosition - vWorld))), 0.0), mix(64.0, 4.0, vegRoughness)) * lit, vWorld)`),
  });
  return material;
}
export function setPalette(material: ShaderMaterial, palette: Palette) {
  slots.forEach((k, i) => (material.uniforms.vegPalette.value[i] as Color).copy(displayColor(palette[k])));
}
type Entry = { index: number; species: Species; dead: boolean; variant: number; matrix: Matrix4; tint: Color; wind: number[]; near: boolean; x: number; y: number; z: number };
type Batch = { mesh: InstancedMesh; detail: Detail; key: string };

/** Whole-species instancing: at most 32 draws, independent of map area or tree count.
 * Far variants collapse to one silhouette/species. LOD changes only with camera/mode changes. */
export class Forest {
  group = new Group(); entries: Entry[] = []; batches: Batch[] = []; private key = '';
  detail = true; low = false; stats = { plants: 0, near: 0, far: 0, triangles: 0, draws: 0, lodMs: 0 };
  constructor(view: EntityView, growth: Float32Array | undefined, public material: ShaderMaterial) {
    for (let i = 0; i < view.count; i++) {
      const name = view.templates[view.template[i]]; if (!isPlant(name)) continue;
      const x = view.x[i], y = view.y[i], z = view.z[i], dead = !!(view.flags[i] & DEAD);
      const p = placement(x, y, growth?.[i] ?? (view.flags[i] & YOUNG ? 0.35 : 1));
      const m = new Matrix4().makeRotationY(p.turn).scale(new Vector3(p.scale, p.scale, p.scale));
      m.setPosition(x + 0.5 + p.dx, z, -y - 0.5 + p.dz);
      this.entries.push({ index: i, species: name, dead, variant: p.variant, matrix: m,
        tint: new Color(1 + p.hue, 0.98 + noise(x, y, 9) * 0.04, 1 - p.hue),
        wind: [p.phase, p.rate, dead ? 0 : registry[name].wind, registry[name].height], near: false, x: x + 0.5, y: z, z: -y - 0.5 });
    }
    for (const name of species) for (const dead of [false, true]) {
      const count = this.entries.filter(e => e.species === name && e.dead === dead).length;
      if (!count) continue;
      for (const detail of ['near', 'far'] as const) for (let v = 0; v < (detail === 'near' ? 3 : 1); v++) {
        const g = model(name, v, detail, dead);
        g.setAttribute('wind', new InstancedBufferAttribute(new Float32Array(count * 4), 4));
        g.setAttribute('grow', new InstancedBufferAttribute(new Float32Array(count * 3), 3));
        const mesh = new InstancedMesh(g, material, count);
        mesh.instanceColor = new InstancedBufferAttribute(new Float32Array(count * 3), 3);
        mesh.count = 0; mesh.frustumCulled = false; mesh.name = `${name}.${dead}.${detail}.${v}`;
        mesh.userData.objects = new Int32Array(count); mesh.castShadow = mesh.receiveShadow = true;
        this.batches.push({ mesh, detail, key: mesh.name }); this.group.add(mesh);
      }
    }
    this.stats.plants = this.entries.length;
  }
  update(camera: Camera, pixels: number, force = false) {
    camera.updateMatrixWorld();
    const key = `${this.detail}|${this.low}|${pixels}|${camera.projectionMatrix.elements.join(',')}|${camera.matrixWorld.elements.join(',')}`;
    if (!force && key === this.key) return; this.key = key;
    const start = performance.now(), lookup = new Map(this.batches.map(b => [b.key, b.mesh]));
    this.stats.near = this.stats.far = this.stats.triangles = this.stats.draws = 0;
    for (const b of this.batches) b.mesh.count = 0;
    const c = camera.matrixWorldInverse.elements, proj = camera.projectionMatrix.elements;
    for (const e of this.entries) {
      const depth = -(c[2] * e.x + c[6] * e.y + c[10] * e.z + c[14]);
      const perUnit = pixels * 0.5 * proj[5] / (proj[15] === 1 ? 1 : Math.max(0.1, depth));
      e.near = this.detail && !this.low && perUnit > (e.near ? 18 : 23);
      const detail = e.near ? 'near' : 'far', v = e.near ? e.variant : 0;
      const mesh = lookup.get(`${e.species}.${e.dead}.${detail}.${v}`)!;
      const i = mesh.count++; mesh.setMatrixAt(i, e.matrix); mesh.setColorAt(i, e.tint);
      (mesh.geometry.getAttribute('wind') as InstancedBufferAttribute).setXYZW(i, ...e.wind as [number, number, number, number]);
      mesh.userData.objects[i] = e.index;
      this.stats[detail]++;
    }
    for (const { mesh } of this.batches) {
      mesh.visible = mesh.count > 0; if (!mesh.count) continue;
      mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor!.needsUpdate = true; mesh.geometry.getAttribute('wind').needsUpdate = true;
      this.stats.triangles += mesh.count * mesh.geometry.getAttribute('position').count / 3; this.stats.draws++;
    }
    this.stats.lodMs = performance.now() - start;
  }
  dispose() { for (const b of this.batches) { b.mesh.geometry.dispose(); b.mesh.dispose(); } this.group.removeFromParent(); }
}

/** Icons and ghosts use the exact near geometry, with one instance and no wind. */
export function specimen(name: Species, material: ShaderMaterial, dead = false, variant = 0) {
  const g: BufferGeometry = model(name, variant, 'near', dead);
  g.setAttribute('wind', new InstancedBufferAttribute(new Float32Array([0, 0, 0, 1]), 4));
  g.setAttribute('grow', new InstancedBufferAttribute(new Float32Array([0, 0, 1]), 3));
  const mesh = new InstancedMesh(g, material, 1); mesh.setMatrixAt(0, new Matrix4());
  mesh.setColorAt(0, new Color(1, 1, 1)); mesh.frustumCulled = false; return mesh;
}
