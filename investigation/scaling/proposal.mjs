import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
export const dir=fileURLToPath(new URL('.',import.meta.url)),root=resolve(dir,'../..');
export const files=['src/editor/waterPlayer.ts','src/render3d/renderer.ts','src/core/doc/ops.ts','src/core/doc/ops.schema.json','src/core/features/raster/brush.ts','src/core/features/features.schema.json','tests/contract/projects.test.ts'];
function change(s,a,b){if(s.indexOf(a)<0||s.indexOf(a)!==s.lastIndexOf(a))throw Error('Changed adoption anchor: '+a.slice(0,90));return s.replace(a,b);}
export function adopt(file,code){let s=code.replaceAll('\r\n','\n');
  if(file===files[2])s=change(s,'export const MAX_OP_TILES = 256 * 256;','export const MAX_OP_TILES = 512 * 512;');
  if(file===files[3]){
    s=s.replaceAll('65536','262144').replaceAll('65535','262143');
    s=change(s,'"coordinate": { "type": "integer", "minimum": 0, "maximum": 255 }','"coordinate": { "type": "integer", "minimum": 0, "maximum": 511 }');
    s=change(s,'"items": { "type": "array", "minItems": 3, "maxItems": 3, "items": { "type": "integer", "minimum": 0, "maximum": 255 } }','"items": { "type": "array", "minItems": 3, "maxItems": 3, "items": { "type": "integer", "minimum": 0, "maximum": 511 } }');
    s=change(s,'"maximum": 1023','"maximum": 2047');
    s=change(s,'"items": { "type": "number", "minimum": 0, "maximum": 255 }','"items": { "type": "number", "minimum": 0, "maximum": 511 }');
    s=change(s,'"size": { "type": "number", "minimum": 0.5, "maximum": 128 }','"size": { "type": "number", "minimum": 0.5, "maximum": 256 }');
  }
  if(file===files[5]){
    // Every 255 bound in this schema is a coordinate, never a terrain/pressure value.
    s=s.replaceAll('"maximum": 255','"maximum": 511').replaceAll('65536','262144').replaceAll('131072','524288');
    s=change(s,'256 tiles, the largest side','512 tiles, the largest side');
    s=change(s,'"minimum": -256, "maximum": 512','"minimum": -512, "maximum": 1024');
  }
  if(file===files[6]){
    s=change(s,'lie up to one map side (256 tiles) past each edge, in the runtime checker and in Ajv alike','lie up to one supported map side (512 tiles, D357) past each edge, in the runtime checker and in Ajv alike');
    s=change(s,'    expect(both([[-256, -256], [512, -256], [512, 512], [-256, 512]])).toEqual([true, true]);',`    expect(both([[-256, -256], [512, -256], [512, 512], [-256, 512]])).toEqual([true, true]);
    expect(both([[-512, -512], [1024, -512], [1024, 1024], [-512, 1024]])).toEqual([true, true]);`);
    s=change(s,'[[-256.01, 40]','[[-512.01, 40]');
    s=change(s,'[512.01, 0]','[1024.01, 0]');
  }
  if(file===files[4]){
    s=change(s,'export const BRUSH_SIZE_MAX = 128;','export const BRUSH_SIZE_MAX = 256;');
    s=change(s,"/** The largest radius: half the widest map's width (256², D322 item 42: the largest brush paints a","/** The largest radius: half the widest supported side (512, D357: the largest brush paints a");
  }
  if(file===files[0]){
    const start=s.indexOf('  const tiles: number[] = [];',s.indexOf('export function blendWater'));
    const end=s.indexOf('\n}\n',start);
    if(start<0||end<0)throw Error('blendWater anchor');
    s=s.slice(0,start)+`  // Keep the old order and double arithmetic; allocate the four final buffers once.
  const seen = new Set<number>();
  for (let k = 0; k < b.count; k++) seen.add(b.tile[k]);
  let count = b.count;
  for (let k = 0; k < a.count; k++) if (!seen.has(a.tile[k]) && !(a.depth[k] * (1 - t) <= 0.001)) count++;
  const tile = new Int32Array(count), floor = new Float32Array(count);
  const depth = new Float32Array(count), contamination = new Float32Array(count);
  let q = 0;
  for (let k = 0; k < b.count; k++, q++) {
    const i = b.tile[k], j = at.get(i);
    tile[q] = i;
    floor[q] = b.floor[k];
    depth[q] = (j === undefined ? 0 : a.depth[j]) * (1 - t) + b.depth[k] * t;
    contamination[q] = (j === undefined ? b.contamination[k] : a.contamination[j]) * (1 - t) + b.contamination[k] * t;
  }
  for (let k = 0; k < a.count; k++) {
    const i = a.tile[k];
    if (seen.has(i)) continue;
    const d = a.depth[k] * (1 - t);
    if (d <= 0.001) continue;
    tile[q] = i; floor[q] = a.floor[k]; depth[q] = d; contamination[q] = a.contamination[k]; q++;
  }
  return { count, tile, floor, depth, contamination };`+s.slice(end);
    s=change(s,'if (f.final && last && !this.weather) for (let k = 1; k <= EASE; k++) this.frames.push({ water: blendWater(last.water, f.water, k / (EASE + 1)), done: last.done + ((1 - last.done) * k) / (EASE + 1) });',`if (f.final && last && !this.weather) for (let k = 1; k <= EASE; k++) {
      // Unshown blends allocate nothing; replay computes exactly the same frame on demand.
      let water: WaterView | undefined;
      this.frames.push({
        get water() { return water ??= blendWater(last.water, f.water, k / (EASE + 1)); },
        done: last.done + ((1 - last.done) * k) / (EASE + 1),
      });
    }`);
  }
  if(file===files[1]){
    s=change(s,'  BufferAttribute,','  BufferAttribute,\n  DynamicDrawUsage,');
    s=change(s,'  private meshTerrain(cx: number, cy: number): number {',`  /** A same-shape remesh retains its GPU allocation; changed topology disposes it as a unit. */
  private meshGeometry(old: Mesh | undefined, attrs: Record<string, BufferAttribute>, index: BufferAttribute): BufferGeometry {
    const g = old?.geometry;
    if (g && g.index?.array.length === index.array.length && Object.keys(attrs).every((key) => g.getAttribute(key)?.array.length === attrs[key].array.length)) {
      for (const [key, attr] of Object.entries(attrs)) {
        const a = g.getAttribute(key) as BufferAttribute;
        a.array.set(attr.array); a.needsUpdate = true;
      }
      g.index.array.set(index.array); g.index.needsUpdate = true;
      return g;
    }
    g?.dispose();
    const next = new BufferGeometry();
    for (const [key, attr] of Object.entries(attrs)) next.setAttribute(key, attr.setUsage(DynamicDrawUsage));
    next.setIndex(index.setUsage(DynamicDrawUsage));
    return next;
  }

  private meshTerrain(cx: number, cy: number): number {`);
    s=change(s,`    if (old) this.dropMesh(old);
    this.terrain.delete(key);
    const d = meshChunk(this.map!.source, cx, cy);
    if (!d.quads) return 0;
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(d.positions, 3));
    g.setAttribute("normal", new BufferAttribute(d.normals, 3, true));
    g.setIndex(new BufferAttribute(d.indices, 1));`,`    const d = meshChunk(this.map!.source, cx, cy);
    if (!d.quads) {
      if (old) this.dropMesh(old);
      this.terrain.delete(key); return 0;
    }
    const g = this.meshGeometry(old, {
      position: new BufferAttribute(d.positions, 3), normal: new BufferAttribute(d.normals, 3, true),
    }, new BufferAttribute(d.indices, 1));`);
    s=change(s,'    const mesh = new Mesh(g, this.terrainMat);\n    mesh.matrixAutoUpdate = false;\n    this.scene.add(mesh);\n    this.terrain.set(key, mesh);','    const mesh = old ?? new Mesh(g, this.terrainMat);\n    mesh.geometry = g;\n    mesh.matrixAutoUpdate = false;\n    this.scene.add(mesh);\n    this.terrain.set(key, mesh);');
    s=change(s,`    if (old) this.dropMesh(old);
    this.water.delete(key);
    const m = this.map!;`,'    const m = this.map!;');
    s=change(s,`    if (!d.quads) return 0;
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(d.positions, 3));
    g.setAttribute("normal", new BufferAttribute(d.normals, 3, true));
    g.setAttribute("wdata", new BufferAttribute(d.data, 2));
    g.setAttribute("wflags", new BufferAttribute(d.flags, 1));
    g.setIndex(new BufferAttribute(d.indices, 1));`,`    if (!d.quads) {
      if (old) this.dropMesh(old);
      this.water.delete(key); return 0;
    }
    const g = this.meshGeometry(old, {
      position: new BufferAttribute(d.positions, 3), normal: new BufferAttribute(d.normals, 3, true),
      wdata: new BufferAttribute(d.data, 2), wflags: new BufferAttribute(d.flags, 1),
    }, new BufferAttribute(d.indices, 1));`);
    s=change(s,'    const mesh = new Mesh(g, this.waterMat);','    const mesh = old ?? new Mesh(g, this.waterMat);\n    mesh.geometry = g;');
  }
  return s;
}
if(process.argv[1]?.endsWith('proposal.mjs')){
  const out=[];
  for(const file of files){const a=resolve(dir,'local/original',file),b=resolve(dir,'local/candidate',file);mkdirSync(resolve(a,'..'),{recursive:true});mkdirSync(resolve(b,'..'),{recursive:true});const s=readFileSync(resolve(root,file),'utf8').replaceAll('\r\n','\n');writeFileSync(a,s);writeFileSync(b,adopt(file,s));const r=spawnSync('git',['diff','--no-index','--no-prefix','--unified=2','--',a,b],{encoding:'utf8'});if(r.status!==1)throw Error(r.stderr||r.error);out.push(r.stdout.split('\n').map(l=>l===' '?'':l.startsWith('diff --git ')?`diff --git a/${file} b/${file}`:l.startsWith('--- ')?'--- a/'+file:l.startsWith('+++ ')?'+++ b/'+file:l).join('\n'));}
  writeFileSync(resolve(dir,'adoption.patch'),out.join(''));
}
