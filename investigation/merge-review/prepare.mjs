import { cpSync,mkdirSync,readFileSync,writeFileSync } from 'node:fs';
import { resolve,join } from 'node:path';
import { execFileSync } from 'node:child_process';
const root=resolve(import.meta.dirname,'../..'),local=join(import.meta.dirname,'local'),adopted=join(local,'adopted'),before=join(local,'pre-forces');
mkdirSync(local,{recursive:true});
cpSync(join(root,'tests'),join(adopted,'tests'),{recursive:true});
cpSync(join(root,'vitest.config.ts'),join(adopted,'vitest.config.ts'));
writeFileSync(join(adopted,'tsconfig.json'),JSON.stringify({extends:'../../../../tsconfig.json',include:['src'],exclude:[]},null,2)+'\n');
cpSync(join(root,'src'),join(adopted,'src'),{recursive:true});
cpSync(join(root,'src'),join(before,'src'),{recursive:true});
const forceFiles=['src/core/features/geometry.ts','src/core/forces/carve/play.ts','src/core/forces/erupt.ts','src/core/forces/glaciate/run.ts','src/core/forces/rift.ts','src/core/forces/runs.ts'];
for(const path of forceFiles)writeFileSync(join(before,path),execFileSync('git',['show',`4c28a6ed^:${path}`],{cwd:root}));
function edit(path,fn){const original=readFileSync(join(root,path),'utf8'),s=fn(original.replaceAll('\r\n','\n'));writeFileSync(join(adopted,path),original.includes('\r\n')?s.replaceAll('\n','\r\n'):s);}
function replace(s,a,b){if(!s.includes(a))throw Error('replacement missing: '+a.slice(0,100));return s.replace(a,b);}
edit('src/core/sim/parallel.ts',s=>{
 s=replace(s,'  /** Runs \x60ticks\x60 ticks with the others, then writes its own rows back; false when a thread failed (nothing is\n   *  written then, so the shared state is still the run\'s start). */','  /** Runs ticks with the others, then writes its own rows back. A failure during the final\n   *  commit can leave partial rows written; the coordinator keeps a separate private carry for retry. */');
 s=replace(s,'    h.postMessage({ kind: "hello", ctl: this.ready.buffer, index: this.helpers.length } satisfies Message);','    try {\n      h.postMessage({ kind: "hello", ctl: this.ready.buffer, index: this.helpers.length } satisfies Message);\n    } catch (error) {\n      try { h.terminate(); } catch { /* a failed port may already be closed */ }\n      throw error;\n    }');
 s=replace(s,'    for (const h of this.helpers) h.terminate();','    for (const h of this.helpers) {\n      try { h.terminate(); } catch { /* continue releasing the rest of a failed pool */ }\n    }');
 s=replace(s,'  for (const h of opts.helpers ?? []) {\n    if (pool.helpers.length < pool.cap - 1) pool.add(h);\n    else h.terminate();\n  }','  try {\n    for (const h of opts.helpers ?? []) {\n      if (pool.helpers.length < pool.cap - 1) pool.add(h);\n      else h.terminate();\n    }\n  } catch {\n    pool.break();\n    for (const h of opts.helpers ?? []) { try { h.terminate(); } catch { /* already closed */ } }\n    return false;\n  }');
 s=replace(s,'  private freed = false;', '  private freed = false;\n  private failedCarry: { dold: Float64Array; seeps: Uint8Array } | null = null;');
 s=replace(s,'    const { layout: L, W, H, emitters } = this.info;','    if (this.failedCarry) return this.failedCarry;\n    const { layout: L, W, H, emitters } = this.info;');

 s=replace(s,'  carry(): { dold: Float64Array; seeps: Uint8Array } {','  carry(D: Float64Array, C: Float64Array, out: Float64Array): { dold: Float64Array; seeps: Uint8Array; water?: { depth: Float64Array; contamination: Float64Array; out: Float64Array } } {');
 s=replace(s,'    return { dold: this.f.slice(L.dold, L.dold + W * H), seeps: Uint8Array.from(this.f.subarray(L.seeps, L.seeps + emitters.length)) };','    const f = this.f, n = W * H;\n    const water = this.changed(D, C, out) ? { depth: f.subarray(L.d, L.d + n), contamination: f.subarray(L.c, L.c + n), out: f.subarray(L.out, L.out + 4 * n) } : undefined;\n    return { dold: f.slice(L.dold, L.dold + n), seeps: Uint8Array.from(f.subarray(L.seeps, L.seeps + emitters.length)), water };');
 s=replace(s,'  /** Runs '+String.fromCharCode(96)+'ticks'+String.fromCharCode(96)+' ticks on several threads,','  changed(D: Float64Array, C: Float64Array, out: Float64Array): boolean {\n    if (!this.fresh || !this.shared) return false;\n    const f = this.shared, L = this.info.layout;\n    return D.some((v, i) => !Object.is(v, f[L.d + i])) || C.some((v, i) => !Object.is(v, f[L.c + i])) || out.some((v, i) => !Object.is(v, f[L.out + i]));\n  }\n\n  /** Runs '+String.fromCharCode(96)+'ticks'+String.fromCharCode(96)+' ticks on several threads,');
 s=replace(s,'    const replan = !this.fresh || this.sinceInit >= REBALANCE_TICKS;','    // Public water edits preserve the established single-thread bookkeeping.\n    if (this.changed(D, C, out)) return false;\n    const replan = !this.fresh || this.sinceInit >= REBALANCE_TICKS;');
 const start=s.indexOf('    if (strips0) {',s.indexOf('  run(m: RustModel'));
 const end=s.indexOf('    if (!ok) {',start);
 let body=s.slice(start,end);
 body=replace(body,'    let ok = false;\n    try {\n      ok = this.own!.run(this.ctl, this.pool.ready, ticks, scale);\n    } catch {\n      ok = false;\n    }\n','    ok = this.own!.run(this.ctl, this.pool.ready, ticks, scale);\n');
 s=s.slice(0,start)+'    // A helper can fail after another strip wrote its final rows. Public water has not been\n    // overwritten yet; preserve the private carry too, so a single-thread retry starts exactly.\n    const checkpoint = f.slice(L.dold, L.seeps + this.info.emitters.length);\n    let ok = false;\n    try {\n'+body.split('\n').filter((_,i,a)=>i<a.length-1).map(l=>'  '+l).join('\n')+'\n    } catch {\n      ok = false;\n    }\n'+s.slice(end);
 s=replace(s,'      // a thread failed or stopped answering: the shared state is still the run\'s start, and the water runs\n      // on one thread from now on','      // Keep private carry outside shared memory: another strip may still be exiting its failed run.\n      this.failedCarry = { dold: checkpoint.slice(0, N), seeps: Uint8Array.from(checkpoint.subarray(N + 4 * this.info.emitters.length)) };\n      // The public water still holds the run\'s start; retry all ticks on one thread.');
 s=replace(s,'    if (!this.pool.broken) for (let j = 1; j < used; j++) this.pool.helpers[j - 1]?.postMessage({ kind: "free", job: this.id } satisfies Message);','    if (!this.pool.broken) {\n      try {\n        for (let j = 1; j < used; j++) this.pool.helpers[j - 1]?.postMessage({ kind: "free", job: this.id } satisfies Message);\n      } catch { this.pool.break(); }\n    }');
 return s;
});

edit('src/core/sim/rustWater.ts',s=>{
 s=replace(s,'  private freed = false;', '  private freed = false;\n  private adoptedPending = false;');
 s=replace(s,'    const { n, ptrs } = this;\n    this.f64(ptrs.floor, n).set(m.floor);','    // An adopted state has dirty evaporation modifiers. Flush them against committed depth\n    // before copying a public edit; an ordinary run computes them itself, with unchanged bytes.\n    if (this.adoptedPending && this.waterChanged(D, C, out)) {\n      rustWater().water_books(this.handle);\n      this.adoptedPending = false;\n    }\n    const { n, ptrs } = this;\n    this.f64(ptrs.floor, n).set(m.floor);');
 s=replace(s,'    D.set(this.f64(ptrs.d, n));','    this.adoptedPending = false;\n    D.set(this.f64(ptrs.d, n));');
 s=replace(s,'    x.water_sync(this.handle, 0, m.H);','    x.water_sync(this.handle, 0, m.H);\n    this.adoptedPending = true;');
 return replace(s,'  /** Copies the caller\'s water and model into the simulation. */','  /** Whether public water changed since this simulation last held it (use the single-thread\n   *  slice for such edits; reconstructing occupancy first would change its established bytes). */\n  waterChanged(D: Float64Array, C: Float64Array, out: Float64Array, depthOnly = false): boolean {\n    const { n, ptrs } = this;\n    const d = this.f64(ptrs.d, n), c = this.f64(ptrs.c, n), o = this.f64(ptrs.out, 4 * n);\n    return D.some((v, i) => !Object.is(v, d[i])) || (!depthOnly && (C.some((v, i) => !Object.is(v, c[i])) || out.some((v, i) => !Object.is(v, o[i]))));\n  }\n\n  /** Copies the caller\'s water and model into the simulation. */');
});
edit('src/core/sim/water.ts',s=>{
 s=replace(s,'  private singleFresh = true;','  private singleFresh = true;\n  /** Direct state edits preserve the established single-thread bookkeeping for this instance. */\n  private editedSingle = false;');
 s=replace(s,'  private runThreaded(n: number, scale: number): boolean {','  private runThreaded(n: number, scale: number): boolean {\n    if (this.editedSingle) return false;\n    if ((this.singleFresh && this.rust.waterChanged(this.D, this.C, this.out, this.ticks === 0)) || this.threads?.changed(this.D, this.C, this.out)) {\n      this.editedSingle = true;\n      return false;\n    }');
 s=replace(s,'    const { dold, seeps } = this.threads.carry();\n    this.rust.adopt(this.model, this.D, this.C, this.out, dold, seeps);','    const { dold, seeps, water } = this.threads.carry(this.D, this.C, this.out);\n    if (water) this.editedSingle = true;\n    // First restore bookkeeping from committed water; run/saturation then copies any public edit.\n    this.rust.adopt(this.model, water?.depth ?? this.D, water?.contamination ?? this.C, water?.out ?? this.out, dold, seeps);');
 return s;
});
edit('src/platform/index.ts',s=>{
 const a=s.indexOf('  for (let k = 0; k < count; k++) {'),b=s.indexOf('  return ports;',a);
 s=s.slice(0,a)+'  const helpers: Worker[] = [];\n  try {\n    for (let k = 0; k < count; k++) {\n      const helper = new Worker(new URL("../worker/waterStrip.worker.ts", import.meta.url), { type: "module" });\n      helpers.push(helper);\n      const ch = new MessageChannel();\n      ports.push(ch.port2);\n      helper.postMessage({ waterPort: ch.port1 }, [ch.port1]);\n    }\n  } catch {\n    for (const helper of helpers) helper.terminate();\n    for (const port of ports) port.close();\n    return []; // helper creation is optional: keep the one-thread generator working\n  }\n'+s.slice(b);return s;
});
edit('src/worker/session.ts',s=>{
 const start=s.indexOf('  void (async () => {',s.indexOf('export function startWeather'));
 const end=s.indexOf('  })();',start);
 let body=s.slice(start+'  void (async () => {\n'.length,end);
 body=replace(body,'    const back = new PreviewJob(', '    back = new PreviewJob(');
 s=s.slice(0,start)+'  void (async () => {\n    let back: PreviewJob | null = null;\n    try {\n'+body.split('\n').filter((_,i,a)=>i<a.length-1).map(l=>'  '+l).join('\n')+'\n    } finally {\n      sim.dispose();\n      back?.dispose();\n    }\n'+s.slice(end);
 s=replace(s,'function opened(s: MapSession): SessionOpen {','/** Dropping a map drops every job that still owns its water and force state. */\nfunction discardSessionWork(): void {\n  stopWater();\n  draft?.job.dispose();\n  draft = null;\n  draftToken++;\n  handoff = null;\n  endForceWater();\n  weatherToken++;\n  force = null;\n  series = null;\n  lastKept = null;\n  takenBack.clear();\n}\n\nfunction opened(s: MapSession): SessionOpen {');
 s=replace(s,'  s.setWaterMode("defer");\n  stopWater();','  s.setWaterMode("defer");\n  discardSessionWork();');
 s=replace(s,'export function closeSession(): void {\n  stopWater();\n  force = null;\n  series = null;\n  lastKept = null;\n  takenBack.clear();','export function closeSession(): void {\n  discardSessionWork();');
 return s;
});
for(const file of ['water.ts','occupancy.ts','helper.mjs','failure.ts','commit-failure.mjs','startup.test.ts','weather.test.ts','close.test.ts','lifecycle-helper.mjs','vitest.config.ts']){
 const dest=join(adopted,'investigation/merge-review',file);mkdirSync(resolve(dest,'..'),{recursive:true});cpSync(join(import.meta.dirname,file),dest);
}
mkdirSync(join(adopted,'investigation/merge-review/local'),{recursive:true});
let patch='';
for(const file of ['src/core/sim/parallel.ts','src/core/sim/rustWater.ts','src/core/sim/water.ts','src/platform/index.ts','src/worker/session.ts']){
 let diff;try{diff=execFileSync('git',['diff','--no-index','--ignore-space-at-eol','--',file,`investigation/merge-review/local/adopted/${file}`],{cwd:root,encoding:'utf8'});}catch(e){if(e.status!==1)throw e;diff=e.stdout;}
 patch+=diff.replaceAll('b/investigation/merge-review/local/adopted/','b/');
}
writeFileSync(join(import.meta.dirname,'adoption.patch'),patch);
console.log('Prepared local candidate and pre-forces reference; product files untouched.');
