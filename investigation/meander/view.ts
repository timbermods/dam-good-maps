import * as THREE from "three";
import { isPlant } from "../../src/core/forces/objects";
import { hash, clamp, smooth } from "../../src/core/forces/random";
import type { FullForceMap } from "../../src/core/forces/force";
import type { PathPoint } from "../../src/core/forces/path";
import type { Plan } from "./meander";
// Original primitive meshes; no game assets. A fixed orthographic view makes motion readable.
export class View {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.OrthographicCamera(-95, 95, 60, -60, .1, 500);
  private terrain!: THREE.InstancedMesh;
  private water!: THREE.InstancedMesh;
  private plants!: THREE.InstancedMesh;
  private things!: THREE.InstancedMesh;
  private band: THREE.Mesh | null = null;
  private dust: THREE.Points | null = null;
  private base!: FullForceMap;
  private transform = new THREE.Object3D();
  private ray = new THREE.Raycaster();
  private color = new THREE.Color();
  private zoom = 1.18;
  constructor(readonly canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(1.5, devicePixelRatio));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene.add(new THREE.HemisphereLight(0xf4f7ed, 0x465348, 1.5));
    const sun = new THREE.DirectionalLight(0xffefdb, 2);
    sun.position.set(-80, 130, -30);
    this.scene.add(sun);
    this.camera.position.set(176, 150, 196);
    this.camera.lookAt(64, 5, 64);
    new ResizeObserver(() => this.resize()).observe(canvas);
    canvas.addEventListener("wheel", e => { e.preventDefault(); this.zoom = clamp(this.zoom * Math.exp(-e.deltaY * .001), .8, 2.5); this.resize(); }, { passive: false });
  }
  resize(): void {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight, a = w / Math.max(1, h);
    const extent = Math.max(77, 90 / a) / this.zoom;
    this.camera.left = -extent * a;
    this.camera.right = extent * a;
    this.camera.top = extent;
    this.camera.bottom = -extent;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
    this.render();
  }
  private instances(geometry: THREE.BufferGeometry, material: THREE.Material, count: number): THREE.InstancedMesh {
    const m = new THREE.InstancedMesh(geometry, material, count);
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.frustumCulled = false;
    this.scene.add(m);
    return m;
  }
  load(m: FullForceMap): void {
    for (const mesh of [this.terrain, this.water, this.plants, this.things])
      if (mesh) {
        this.scene.remove(mesh);
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
        mesh.dispose();
      }
    this.base = m;
    this.terrain = this.instances(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial(), m.W * m.H);
    this.water = this.instances(new THREE.BoxGeometry(.99, .10, .99), new THREE.MeshLambertMaterial({ color: 0x5eaaa6, transparent: true, opacity: .82 }), m.W * m.H);
    this.plants = this.instances(new THREE.ConeGeometry(.62, 2.7, 5), new THREE.MeshLambertMaterial(), m.entities.filter(isPlant).length);
    this.things = this.instances(new THREE.BoxGeometry(.8, 1, .8), new THREE.MeshLambertMaterial(), m.entities.filter(e => !isPlant(e) && e.template !== "Slope").length);
    this.show(m);
    this.resize();
  }
  show(m: FullForceMap, p?: Plan, progress = 1): void {
    const t = this.transform, W = m.W;
    const n = p ? progress * p.stages.length : 0, k = p ? Math.min(p.stages.length - 1, Math.floor(n)) : 0;
    const stage = p?.stages[k], previous = p ? (k ? p.stages[k - 1].map : p.before) : null;
    const height = (i: number) => {
      if (!p)
        return m.heights[i];
      const f = smooth((n - k - stage!.arrival[i]) / .25);
      return previous!.heights[i] + (stage!.map.heights[i] - previous!.heights[i]) * f;
    };
    for (let i = 0; i < m.heights.length; i++) {
      const h = height(i), x = i % W, y = Math.floor(i / W);
      t.position.set(x, Math.max(.03, h) / 2 - .04, y);
      t.scale.set(1, Math.max(.06, h), 1);
      t.updateMatrix();
      this.terrain.setMatrixAt(i, t.matrix);
      const dry = m.water.depth[i] <= .04, seed = hash(4, i);
      this.color.setHSL(.25 + seed * .015, .20, .30 + seed * .027 + h * .006);
      if (!dry)
        this.color.setHSL(.16, .21, .35 + h * .007);
      const cut = p ? p.map.heights[i] < p.before.heights[i] && progress >= p.arrival[i] : m.heights[i] < this.base.heights[i];
      if (cut)
        this.color.setHSL(.115, .22, .36 + h * .004);
      this.terrain.setColorAt(i, this.color);
      // Water remains on its old surface until the land is final.
      const waterFloor = p && progress < 1 ? p.before.heights[i] : m.heights[i];
      t.position.set(x, waterFloor + m.water.depth[i], y);
      t.scale.setScalar(dry ? 0 : 1);
      t.updateMatrix();
      this.water.setMatrixAt(i, t.matrix);
    }
    let plant = 0, thing = 0;
    const originals = previous ? new Map(previous.entities.map(e => [e.id, e])) : null;
    for (const e of m.entities) {
      if (e.template === "Slope")
        continue;
      const old = originals?.get(e.id) ?? e, i = old.y * W + old.x;
      const movedStart = e.template === "StartingLocation" && (e.x !== old.x || e.y !== old.y);
      const reached = !p || progress >= 1 || n - k >= stage!.arrival[i];
      const x = movedStart && !reached ? old.x : e.x, y = movedStart && !reached ? old.y : e.y;
      const z = movedStart ? (reached ? e.z : old.z) : old.z + height(i) - (previous ? previous.heights[i] : m.heights[i]);
      const bush = e.template === "BlueberryBush", src = /Source|Seep/.test(e.template), start = e.template === "StartingLocation";
      const scale = isPlant(e) ? (bush ? .55 : .75 + hash(1, i) * .45) : start ? 2 : src ? .7 : 1;
      t.position.set(x, z + (isPlant(e) ? 1.25 * scale : .5 * scale), y);
      t.scale.setScalar(scale);
      t.updateMatrix();
      const mesh = isPlant(e) ? this.plants : this.things, instance = isPlant(e) ? plant++ : thing++;
      mesh.setMatrixAt(instance, t.matrix);
      this.color.setHex(isPlant(e) ? (bush ? 0x719753 : 0x466047) : start ? 0xe9c77b : src ? 0x70d5de : 0x958679);
      mesh.setColorAt(instance, this.color);
    }
    this.plants.count = plant;
    this.things.count = thing;
    for (const mesh of [this.terrain, this.water, this.plants, this.things]) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor)
        mesh.instanceColor.needsUpdate = true;
    }
    this.render();
  }
  at(clientX: number, clientY: number): PathPoint | null {
    const r = this.canvas.getBoundingClientRect();
    this.ray.setFromCamera(new THREE.Vector2((clientX - r.left) / r.width * 2 - 1, -(clientY - r.top) / r.height * 2 + 1), this.camera);
    const hit = this.ray.intersectObjects([this.terrain, this.water])[0];
    if (!hit)
      return null;
    return { x: clamp(hit.point.x, 0, this.base.W - 1), y: clamp(hit.point.z, 0, this.base.H - 1) };
  }
  screen(p: PathPoint): {
    x: number;
    y: number;
  } {
    const i = Math.round(p.y) * this.base.W + Math.round(p.x);
    const v = new THREE.Vector3(p.x, this.base.heights[i] + this.base.water.depth[i] + .06, p.y).project(this.camera), r = this.canvas.getBoundingClientRect();
    return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height };
  }
  drawBand(path: PathPoint[] | null, width: number, m: FullForceMap): void {
    if (this.band) {
      this.scene.remove(this.band);
      this.band.geometry.dispose();
      (this.band.material as THREE.Material).dispose();
      this.band = null;
    }
    if (path && path.length > 1) {
      const positions: number[] = [];
      // Tile-following band, not a cursor circle; no route prediction.
      for (let i = 0; i < m.heights.length; i++) {
        const x = i % m.W, y = Math.floor(i / m.W);
        let nearest = Infinity;
        for (let k = 1; k < path.length; k++) {
          const a = path[k - 1], b = path[k], dx = b.x - a.x, dy = b.y - a.y;
          const f = clamp(((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy || 1), 0, 1);
          nearest = Math.min(nearest, Math.hypot(x - a.x - dx * f, y - a.y - dy * f));
        }
        if (nearest > width / 2)
          continue;
        const z = m.heights[i] + m.water.depth[i] + .12;
        positions.push(x - .5, z, y - .5, x + .5, z, y - .5, x + .5, z, y + .5, x - .5, z, y - .5, x + .5, z, y + .5, x - .5, z, y + .5);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
      this.band = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0xe6bc79, transparent: true, opacity: .43, side: THREE.DoubleSide, depthWrite: false }));
      this.scene.add(this.band);
    }
    this.render();
  }
  effects(p: Plan | null, progress: number): void {
    if (this.dust) {
      this.scene.remove(this.dust);
      this.dust.geometry.dispose();
      (this.dust.material as THREE.Material).dispose();
      this.dust = null;
    }
    if (p && progress < 1) {
      const positions: number[] = [];
      for (let i = 0; i < p.map.heights.length; i++) {
        const age = progress - p.arrival[i];
        if (p.map.heights[i] === p.before.heights[i] || age < 0 || age > .14 || hash(9, i) > .24)
          continue;
        positions.push(i % p.map.W, p.before.heights[i] + age * 16, Math.floor(i / p.map.W));
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
      this.dust = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xe3d4b7, size: .75, transparent: true, opacity: .45, depthWrite: false }));
      this.scene.add(this.dust);
    }
    this.render();
  }
  render(): void { this.renderer.render(this.scene, this.camera); }
}
