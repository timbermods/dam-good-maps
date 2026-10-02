import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
export const files = ['src/editor/forceDriver.ts', 'src/editor/waterPlayer.ts', 'src/editor/juice.ts', 'src/render3d/renderer.ts'];
function change(s, before, after) {
  if (!s.includes(before) || s.indexOf(before) !== s.lastIndexOf(before)) throw new Error(`Adoption anchor changed: ${before.slice(0, 100)}`);
  return s.replace(before, after);
}
export function adopt(file, text) {
  let s = text.replaceAll('\r\n', '\n');
  if (file === files[0]) {
    s = change(s, 'export const FRAME_MS = 30;', 'export const FRAME_MS = 1000 / 60;');
    s = change(s, 'sleep: (ms) => new Promise<void>((r) => setTimeout(r, ms)),',
      'sleep: (ms) => new Promise<void>((r) => {\n    // Presentation follows a display frame; long pause/pump waits keep their timers.\n    if (ms <= FRAME_MS) requestAnimationFrame(() => r());\n    else setTimeout(r, ms);\n  }),');
    s = change(s, 'void this.host.drop(st.gesture);',
      'void this.host.drop(st.gesture).then(\n      () => this.dropped.delete(st.gesture),\n      (e) => this.host.error(String(e instanceof Error ? e.message : e)),\n    );');
  }
  if (file === files[1]) {
    const old = 'if (f.final && last && !this.weather) for (let k = 1; k <= EASE; k++) this.frames.push({ water: blendWater(last.water, f.water, k / (EASE + 1)), done: last.done + ((1 - last.done) * k) / (EASE + 1) });';
    s = change(s, old, `if (f.final && last && !this.weather) for (let k = 1; k <= EASE; k++) {
      // Build only blends actually shown. Skipped frames cost no arrays or tile maps.
      let water: WaterView | undefined;
      this.frames.push({
        get water() { return water ??= blendWater(last.water, f.water, k / (EASE + 1)); },
        done: last.done + ((1 - last.done) * k) / (EASE + 1),
      });
    }`);
  }
  if (file === files[2]) {
    s = change(s, '    switch (cue.verb) {', `    // A held texture follows visible motion, not a queued keep/settle round-trip.
    if (cue.phase === "done") {
      for (const k of f.ids) this.engine.stop(k);
      f.ids.length = 0;
    }
    switch (cue.verb) {`);
  }
  if (file === files[3]) {
    s = change(s, '  BufferAttribute,', '  BufferAttribute,\n  DynamicDrawUsage,');
    s = change(s, '  private meshTerrain(cx: number, cy: number): number {', `  /** Retain GPU buffers only when all attribute/index shapes match. A changed topology gets a
   *  new geometry, disposing all old attributes together (never leaking detached GPU buffers). */
  private meshGeometry(old: Mesh | undefined, attrs: Record<string, BufferAttribute>, index: BufferAttribute): BufferGeometry {
    const g = old?.geometry;
    const same = g && g.index?.array.length === index.array.length &&
      Object.keys(attrs).every((name) => g.getAttribute(name)?.array.length === attrs[name].array.length);
    if (same) {
      for (const [name, attr] of Object.entries(attrs)) {
        const a = g.getAttribute(name) as BufferAttribute;
        a.array.set(attr.array);
        a.needsUpdate = true;
      }
      g.index!.array.set(index.array);
      g.index!.needsUpdate = true;
      return g;
    }
    g?.dispose();
    const next = new BufferGeometry();
    for (const [name, attr] of Object.entries(attrs)) next.setAttribute(name, attr.setUsage(DynamicDrawUsage));
    next.setIndex(index.setUsage(DynamicDrawUsage));
    return next;
  }

  private meshTerrain(cx: number, cy: number): number {`);
    s = change(s, `    if (old) this.dropMesh(old);
    this.terrain.delete(key);
    const d = meshChunk(this.map!.source, cx, cy);
    if (!d.quads) return 0;
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(d.positions, 3));
    g.setAttribute("normal", new BufferAttribute(d.normals, 3, true));
    g.setIndex(new BufferAttribute(d.indices, 1));`, `    const d = meshChunk(this.map!.source, cx, cy);
    if (!d.quads) {
      if (old) this.dropMesh(old);
      this.terrain.delete(key);
      return 0;
    }
    const g = this.meshGeometry(old, {
      position: new BufferAttribute(d.positions, 3),
      normal: new BufferAttribute(d.normals, 3, true),
    }, new BufferAttribute(d.indices, 1));`);
    s = change(s, '    const mesh = new Mesh(g, this.terrainMat);\n    mesh.matrixAutoUpdate = false;\n    this.scene.add(mesh);\n    this.terrain.set(key, mesh);', '    const mesh = old ?? new Mesh(g, this.terrainMat);\n    mesh.geometry = g;\n    mesh.matrixAutoUpdate = false;\n    this.scene.add(mesh);\n    this.terrain.set(key, mesh);');
    s = change(s, `    if (old) this.dropMesh(old);
    this.water.delete(key);
    const m = this.map!;`, '    const m = this.map!;');
    s = change(s, `    if (!d.quads) return 0;
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(d.positions, 3));
    g.setAttribute("normal", new BufferAttribute(d.normals, 3, true));
    g.setAttribute("wdata", new BufferAttribute(d.data, 2));
    g.setAttribute("wflags", new BufferAttribute(d.flags, 1));
    g.setIndex(new BufferAttribute(d.indices, 1));`, `    if (!d.quads) {
      if (old) this.dropMesh(old);
      this.water.delete(key);
      return 0;
    }
    const g = this.meshGeometry(old, {
      position: new BufferAttribute(d.positions, 3),
      normal: new BufferAttribute(d.normals, 3, true),
      wdata: new BufferAttribute(d.data, 2),
      wflags: new BufferAttribute(d.flags, 1),
    }, new BufferAttribute(d.indices, 1));`);
    s = change(s, '    const mesh = new Mesh(g, this.waterMat);', '    const mesh = old ?? new Mesh(g, this.waterMat);\n    mesh.geometry = g;');
    s = change(s, '      for (const [cx, cy] of chunks) this.meshWater(cx, cy, lower);',
      '      // Falls read ground two tiles from the lip, including across a chunk boundary.\n      for (const [cx, cy] of dirtyChunks(m.W, m.H, { x0: rect.x0 - 1, y0: rect.y0 - 1, x1: rect.x1 + 1, y1: rect.y1 + 1 })) this.meshWater(cx, cy, lower);');
    s = change(s, `    old.dispose();
    const t = overlayTexture(m.W, m.H);`, `    const t = old.image.width === m.W && old.image.height === m.H ? old : overlayTexture(m.W, m.H);
    if (t !== old) old.dispose();`);
  }
  return s;
}
export function candidate(file) { return adopt(file, readFileSync(resolve(root, file), 'utf8')); }
