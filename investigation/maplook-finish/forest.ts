import { Color, Group, InstancedBufferAttribute, InstancedMesh, Matrix4, ShaderMaterial, Vector3, type Camera, type BufferGeometry } from 'three';
import { DEAD, YOUNG, type EntityView } from '../../src/render3d/model';
import { model, noise, paletteDefaults, placement, registry, slots, species, type Palette, type Species, type Detail } from './models';
import { motion, windGLSL } from './wind';
import type {DroughtPlants} from './plants';

export const isPlant = (name: string): name is Species => species.includes(name as Species);
// The inherited custom shader writes display-referred RGB itself, without three's output transform.
const displayColor = (hex: string) => new Color(parseInt(hex.slice(1, 3), 16) / 255, parseInt(hex.slice(3, 5), 16) / 255, parseInt(hex.slice(5, 7), 16) / 255);
export function vegetationMaterial(base: ShaderMaterial) {
  const material = new ShaderMaterial({
    defines: { ...base.defines }, uniforms: { ...base.uniforms, ...motion,
      vegPalette: { value: slots.map(k => displayColor(paletteDefaults[k])) },
      vegWrap: { value: 0.25 }, vegRoughness: { value: 0.92 }, vegSpecular: { value: 0.045 }, vegAmbient: { value: 1 },
    },
    vertexShader: `attribute float region; attribute float droughtStress; uniform vec3 vegPalette[${slots.length}];\n${windGLSL}\n` + base.vertexShader
      .replace('vNormal = normalize(mat3(m) * normal);', 'vec2 wv = windVector(); vNormal = normalize(mat3(m) * bendNormal(position, normal, wv));')
      .replace('vColor = pcolor;', 'vec3 leaf=vegPalette[int(region)]; if(region<3.5 || (region>6.5 && region<7.5))leaf=mix(leaf,vec3(.52,.46,.31),pow(droughtStress,.65)*.95); vColor = pcolor * leaf;')
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
type Entry = { index: number; species: Species; dead: boolean; initialDead:boolean; stress:number; variant: number; matrix: Matrix4; tint: Color; wind: number[]; near: boolean; x: number; y: number; z: number; nearBatch?: InstancedMesh; farBatch?: InstancedMesh };
type Batch = { mesh: InstancedMesh; detail: Detail; key: string };

/** Whole-species instancing: at most 32 draws, independent of map area or tree count.
 * Far variants collapse to one silhouette/species. LOD changes only with camera/mode changes. */
export class Forest {
  group = new Group(); entries: Entry[] = []; batches: Batch[] = []; private key = '';
  revision = 0;
  detail = true; low = false; stats = { plants: 0, near: 0, far: 0, triangles: 0, draws: 0, lodMs: 0,drought:{dry:0,dying:0,killed:0} };
  constructor(view: EntityView, growth: Float32Array | undefined, public material: ShaderMaterial) {
    for (let i = 0; i < view.count; i++) {
      const name = view.templates[view.template[i]]; if (!isPlant(name)) continue;
      const x = view.x[i], y = view.y[i], z = view.z[i], dead = !!(view.flags[i] & DEAD);
      const p = placement(x, y, growth?.[i] ?? (view.flags[i] & YOUNG ? 0.35 : 1));
      const m = new Matrix4().makeRotationY(p.turn).scale(new Vector3(p.scale, p.scale, p.scale));
      m.setPosition(x + 0.5 + p.dx, z, -y - 0.5 + p.dz);
      this.entries.push({ index: i, species: name, dead, initialDead:dead,stress:0,variant: p.variant, matrix: m,
        tint: new Color(1 + p.hue, 0.98 + noise(x, y, 9) * 0.04, 1 - p.hue),
        wind: [p.phase, p.rate, dead ? 0 : registry[name].wind, registry[name].height], near: false, x: x + 0.5, y: z, z: -y - 0.5 });
    }
    for (const name of species) for (const dead of [false, true]) {
      // Reserve both forms once: changing a plant's state does not rebuild models.
      const count = this.entries.filter(e => e.species === name).length;
      if (!count) continue;
      for (const detail of ['near', 'far'] as const) for (let v = 0; v < (detail === 'near' ? 3 : 1); v++) {
        const g = model(name, v, detail, dead);
        g.setAttribute('wind', new InstancedBufferAttribute(new Float32Array(count * 4), 4));
        g.setAttribute('grow', new InstancedBufferAttribute(new Float32Array(count * 3), 3));
        g.setAttribute('droughtStress',new InstancedBufferAttribute(new Float32Array(count),1));
        const mesh = new InstancedMesh(g, material, count);
        mesh.instanceColor = new InstancedBufferAttribute(new Float32Array(count * 3), 3);
        mesh.count = 0; mesh.frustumCulled = false; mesh.name = `${name}.${dead}.${detail}.${v}`;
        mesh.userData.objects = new Int32Array(count); mesh.castShadow = mesh.receiveShadow = true;
        this.batches.push({ mesh, detail, key: mesh.name }); this.group.add(mesh);
      }
    }
    this.stats.plants = this.entries.length;
    this.bindBatches();
  }
  bindBatches() {
    const lookup = new Map(this.batches.map(b => [b.key, b.mesh]));
    for (const e of this.entries) { e.nearBatch = lookup.get(`${e.species}.${e.dead}.near.${e.variant}`)!; e.farBatch = lookup.get(`${e.species}.${e.dead}.far.0`)!; }
  }
  setDrought(state:DroughtPlants|undefined,enabled:boolean){
    let changed=false;
    for(const e of this.entries){
      const dead=e.initialDead||!!(enabled&&state?.dead[e.index]);
      const stress=enabled&&!dead?(state?.stress[e.index]??0):0;
      if(e.dead!==dead||e.stress!==stress)changed=true;
      e.dead=dead;e.stress=stress;e.wind[2]=dead?0:registry[e.species].wind;
    }
    if(changed){this.bindBatches();this.key='';}
    this.stats.drought=enabled&&state?{dry:state.dry,dying:state.dying,killed:state.killed}:{dry:0,dying:0,killed:0};
  }
  update(camera: Camera, pixels: number, force = false) {
    camera.updateMatrixWorld();
    const key = `${this.detail}|${this.low}|${pixels}|${camera.projectionMatrix.elements.join(',')}|${camera.matrixWorld.elements.join(',')}`;
    if (!force && key === this.key) return;
    let changed = force || !this.key; this.key = key;
    const start = performance.now();
    const c = camera.matrixWorldInverse.elements, proj = camera.projectionMatrix.elements;
    for (const e of this.entries) {
      const depth = -(c[2] * e.x + c[6] * e.y + c[10] * e.z + c[14]);
      const perUnit = pixels * 0.5 * proj[5] / (proj[15] === 1 ? 1 : Math.max(0.1, depth));
      const cx = c[0] * e.x + c[4] * e.y + c[8] * e.z + c[12], cy = c[1] * e.x + c[5] * e.y + c[9] * e.z + c[13];
      const w = proj[15] === 1 ? 1 : depth;
      // Offscreen casters remain in the cheap silhouette, including trees behind the camera.
      const onScreen = w > 0 && Math.abs(cx * proj[0]) < w * 1.25 && Math.abs(cy * proj[5]) < w * 1.25;
      const near = this.detail && !this.low && onScreen && perUnit > (e.near ? 18 : 23);
      if (near !== e.near) changed = true; e.near = near;
    }
    if (!changed) { this.stats.lodMs = performance.now() - start; return; }
    this.revision++;
    this.stats.near = this.stats.far = this.stats.triangles = this.stats.draws = 0;
    for (const b of this.batches) b.mesh.count = 0;
    for (const e of this.entries) {
      const detail = e.near ? 'near' : 'far', mesh = e.near ? e.nearBatch! : e.farBatch!;
      const i = mesh.count++; mesh.setMatrixAt(i, e.matrix); mesh.setColorAt(i, e.tint);
      (mesh.geometry.getAttribute('wind') as InstancedBufferAttribute).setXYZW(i, ...e.wind as [number, number, number, number]);
      (mesh.geometry.getAttribute('droughtStress') as InstancedBufferAttribute).setX(i,e.stress);
      mesh.userData.objects[i] = e.index;
      this.stats[detail]++;
    }
    for (const { mesh } of this.batches) {
      mesh.visible = mesh.count > 0; if (!mesh.count) continue;
      mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor!.needsUpdate = true; mesh.geometry.getAttribute('wind').needsUpdate = true;
      mesh.geometry.getAttribute('droughtStress').needsUpdate=true;
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
  g.setAttribute('droughtStress',new InstancedBufferAttribute(new Float32Array(1),1));
  const mesh = new InstancedMesh(g, material, 1); mesh.setMatrixAt(0, new Matrix4());
  mesh.setColorAt(0, new Color(1, 1, 1)); mesh.frustumCulled = false; return mesh;
}
