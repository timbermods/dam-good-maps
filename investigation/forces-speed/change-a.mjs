import {readFileSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
const tree=resolve(import.meta.dirname,process.argv[2] ?? 'local/adopted');
function edit(path,changes){let s=readFileSync(join(tree,path),'utf8');for(const [a,b] of changes){if(!s.includes(a))throw Error(path+' missing '+a.slice(0,70));s=s.replace(a,b);}writeFileSync(join(tree,path),s);}
edit('src/core/features/geometry.ts',[
 ['  const cum: number[] = [0];','  const cum: number[] = [0];\n  // forces-speed: segment invariants keep the original arithmetic, outside the tile loops.\n  const segments: { ax: number; ay: number; vx: number; vy: number; l2: number }[] = [];'],
 ['    const l = portable.sqrt(dx * dx + dy * dy);','    const l2 = dx * dx + dy * dy;\n    const l = portable.sqrt(l2);\n    segments.push({ ax: path[i][0], ay: path[i][1], vx: dx, vy: dy, l2 });'],
 ['              const ax = path[i][0];\n              const ay = path[i][1];\n              const vx = path[i + 1][0] - ax;\n              const vy = path[i + 1][1] - ay;\n              const l2 = vx * vx + vy * vy;','              const { ax, ay, vx, vy, l2 } = segments[i];']
]);
edit('src/core/forces/carve/play.ts',[
 ['      this.removedShown = gone;','      this.removedShown = gone;\n      const ownById = new Map<string, typeof this.run.group[number]>();\n      for (const g of this.run.group) if (!ownById.has(g.id)) ownById.set(g.id, g);\n      const unleashed = this.unleashedObject();'],
 ['          const own = this.run.group.find((g) => g.id === e.id);','          const own = ownById.get(e.id);'],
 ['          if (e === this.unleashedObject())','          if (e === unleashed)']
]);
edit('src/core/forces/rift.ts',[
 ['    const out = snapshotMap(this.before);','    if (stage >= this.stages) { this.map = snapshotMap(raw); return; }\n    // Both object lists are replaced below; do not clone the discarded lists.\n    const out = snapshotMap<FullForceMap>({ ...this.before, entities: [], fallen: [] });'],
 ['    out.fallen = raw.fallen.map(f => {\n      const old = this.before.fallen.find(g => g.id === f.id);','    const oldFallen = new Map<string, typeof this.before.fallen[number]>();\n    for (const f of this.before.fallen) if (!oldFallen.has(f.id)) oldFallen.set(f.id, f);\n    out.fallen = raw.fallen.map(f => {\n      const old = oldFallen.get(f.id);'],
 ['    this.map = stage >= this.stages ? snapshotMap(raw) : out;','    this.map = out;']
]);
edit('src/core/forces/runs.ts',[
 ['    const m = stageMap(this.before, this.plan0.map, t);','    const m = stageMap(this.before, this.plan0.map, t, this.before.water);'],
 ['    m.water = { depth: this.before.water.depth.slice(), contamination: this.before.water.contamination.slice() };\n    this.map = m;\n  }\n\n  /** The eruption','    this.map = m;\n  }\n\n  /** The eruption'],
 ['      m = snapshotMap(this.before);\n      this.shift','      // The riders below replace every object: avoid a discarded JSON round trip.\n      m = snapshotMap({ ...this.before, entities: [] });\n      this.shift'],
 ['  private shift(f: number, heights: Uint8Array, lava: Uint32Array | null, src: Uint32Array | null): void {','  private travel0: { plan: QuakePlan; values: Float64Array } | null = null;\n\n  private shift(f: number, heights: Uint8Array, lava: Uint32Array | null, src: Uint32Array | null): void {'],
 ['    const priority = new Float32Array(N).fill(-1);','    if (this.travel0?.plan !== p) this.travel0 = { plan: p, values: Float64Array.from(p.dx, (dx, i) => portable.hypot(dx, p.dy[i])) };\n    const travelValues = this.travel0.values;\n    const priority = new Float32Array(N).fill(-1);'],
 ['      const travel = portable.hypot(p.dx[i], p.dy[i]);','      const travel = travelValues[i];']
]);
edit('src/core/forces/erupt.ts',[
 ['export function stageMap(before: FullForceMap, after: FullForceMap, t: number): FullForceMap {\n  const m = snapshotMap(after);','export function stageMap(before: FullForceMap, after: FullForceMap, t: number, water = after.water): FullForceMap {\n  // Playback keeps the old water; copy that directly instead of copying and discarding the new water.\n  const m = snapshotMap({ ...after, water });']
]);
edit('src/core/forces/glaciate/run.ts',[
 ['    const b = this.before;\n    const f = p.map;\n    const m = snapshotMap(b);','    // After the first retreat stage only the cue changes, until the final water arrives.\n    if (stage > ADVANCE_STEPS + 1) return;\n    const b = this.before;\n    const f = p.map;\n    const m = snapshotMap<FullForceMap>({ ...b, fallen: [] });']
]);
console.log('A: invariant work and discarded playback copies applied only to '+tree);