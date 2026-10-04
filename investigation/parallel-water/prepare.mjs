import { execFileSync } from 'node:child_process';
import { writeFileSync,readFileSync } from 'node:fs';
// Pinned faster-settle source; no product files are rewritten.
const ref = 'ed6fc4fb';
let src = execFileSync('git', ['show', `${ref}:investigation/water-speed/water.ts`], {encoding:'utf8'}).replaceAll('\r\n','\n');
// M9b D358 increased the cap after the faster-settle investigation. Keep the NEW cap.
const product=readFileSync(new URL('../../src/core/sim/water.ts',import.meta.url),'utf8');
const cap=product.match(/export const SETTLE_DAYS = \d+;/)?.[0];
if(!cap)throw Error('Current M9b cap export is missing');
src=src.replace('export const TICKS_PER_DAY = 768;','export const TICKS_PER_DAY = 768;\n'+cap).replace('opts.maxDays ?? 4','opts.maxDays ?? SETTLE_DAYS');
const start = src.indexOf('    for (let w = 0; w < this.wetCount; w++) {', src.indexOf('private substep'));
const mid = src.indexOf('    // 2. depth', start);
const second = src.indexOf('    for (let a = 0; a < this.activeCount; a++) {', mid);
const end = src.indexOf('    for (let a = 0; a < this.activeCount; a++) {', second + 10);
if ([start,mid,second,end].some(i=>i<0)) throw Error('Source shape changed');
const locals = '    const { W, H, F, D, C, out, f, wall, mod, dam, game, edgeSpill } = this;\n    const nb0=this.n0, nb1=this.n1, nb2=this.n2, nb3=this.n3;\n';
const pass1 = src.slice(start,mid).replace('let w = 0; w < this.wetCount','let w = lo; w < hi').replace('this.wet[w]','indices[w]');
const pass2 = src.slice(second,end).replace('let a = 0; a < this.activeCount','let a = lo; a < hi').replace('this.active[a]','indices[a]');
src = src.slice(0,start)+'    this.execute(1, this.wet, this.wetCount);\n\n'+src.slice(mid,second)+'    this.execute(2, this.active, this.activeCount);\n'+src.slice(end);
// Expose the numerical kernels to helper workers; retain all scalar/cache orchestration.
const methods = `
  executor: ((phase: number, indices: Int32Array, count: number) => void) | null = null;
  runScope: ((body: () => void) => void) | null = null;
  private execute(phase: number, indices: Int32Array, count: number): void {
    if (this.executor) this.executor(phase, indices, count);
    else this.kernel(phase, indices, 0, count);
  }
  kernel(phase: number, indices: Int32Array, lo: number, hi: number): void {
${locals}    if (phase === 1) {
${pass1}    } else {
      const Cnew = this.Cnew;
${pass2}    }
  }
`;
src=src.replace('  private substep(scale: number): void {', methods+'\n  private substep(scale: number): void {');
src=src.replace('export class WaterSim {','let constructionHook: ((sim: WaterSim) => void) | null = null;\nexport function installWaterConstructionHook(hook: ((sim: WaterSim) => void) | null): void { constructionHook = hook; }\n\nexport class WaterSim {');
const constructorEnd='    for (let i = 0; i < N; i++) if (this.D[i] > 0) this.wet[this.wetCount++] = i;';
if(!src.includes(constructorEnd))throw Error('Constructor shape changed');
src=src.replace(constructorEnd,constructorEnd+'\n    constructionHook?.(this);');
src=src.replace('  run(ticks: number, strengthScale = 1): this {',`  run(ticks: number, strengthScale = 1): this {
    if (this.runScope) {
      const scope = this.runScope; this.runScope = null;
      try { scope(() => this.run(ticks, strengthScale)); }
      finally { this.runScope = scope; }
      return this;
    }`);
writeFileSync(new URL('water.ts',import.meta.url),src);
writeFileSync(new URL('provenance.json',import.meta.url),JSON.stringify({base:'6c29b7e5',fasterSettle:ref,method:'extract unchanged numerical loops; synchronous phase executor'},null,2)+'\n');
