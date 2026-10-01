// Reproducible exact rewrites. This script reads production and writes only this investigation.
import {readFileSync, writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {HERE, ROOT} from './common.mjs';
let s = readFileSync(resolve(ROOT,'src/core/sim/water.ts'),'utf8').replaceAll('\r\n','\n');
function replace(a,b) { if(!s.includes(a)) throw Error('Upstream changed: '+a.slice(0,80)); s=s.replace(a,b); }
replace('  private readonly wall: Uint8Array;', `  // Geometry only: no floor, depth, source or momentum values are cached.
  private readonly n0: Int32Array;
  private readonly n1: Int32Array;
  private readonly n2: Int32Array;
  private readonly n3: Int32Array;
  private readonly wetMask: Uint8Array;
  private readonly dirtyMask: Uint8Array;
  private readonly dirtyMod: Int32Array;
  private dirtyModCount = 0;
  private readonly evap = new Float64Array(9);
  private readonly activeRefs: Uint8Array;
  private readonly activePos: Int32Array;
  private readonly transitions: Int32Array;
  private readonly wall: Uint8Array;`);
replace('    this.sourceCells = Int32Array.from(cells);', `    this.sourceCells = Int32Array.from(cells);
    this.n0 = new Int32Array(N);
    this.n1 = new Int32Array(N);
    this.n2 = new Int32Array(N);
    this.n3 = new Int32Array(N);
    this.wetMask = new Uint8Array(N);
    this.dirtyMask = new Uint8Array(N);
    this.dirtyMod = new Int32Array(N);
    this.activeRefs = new Uint8Array(N);
    this.activePos = new Int32Array(N).fill(-1);
    this.transitions = new Int32Array(N);
    for (let i = 0; i < N; i++) {
      const x = i % W, y = (i - x) / W;
      this.n0[i] = y > 0 ? i - W : -1;
      this.n1[i] = x > 0 ? i - 1 : -1;
      this.n2[i] = y < H - 1 ? i + W : -1;
      this.n3[i] = x < W - 1 ? i + 1 : -1;
      this.wetMask[i] = +(this.D[i] > 0);
      this.wn[i] = 1;
      if (this.D[i] > 0) this.dirtyMask[i] = 1, this.dirtyMod[this.dirtyModCount++] = i;
    }
    for (let i = 0; i < N; i++) if (this.D[i] > 0) this.adjustWn(i, 1);
    for (let i = 0; i < N; i++) if (this.D[i] > 0) this.adjustActive(i, 1);
    for (const i of this.sourceCells) this.adjustActiveTile(i, 1);
    for (let sat = 1; sat <= 8; sat++) {
      const t = 10 - sat;
      this.evap[sat] = 0.0595 * (t * t) + 0.101 * t + 0.72;
    }`);
const computeStart = s.indexOf('  private computeWn(): void {');
const computeEnd = s.indexOf('  private satAt(',computeStart);
s = s.slice(0,computeStart) + `  // wn[i] is 1 + the current eight-neighbour wet count, also on dry cells.
  // Integer +/-1 updates commute exactly. Only wet cells' counts are read by satAt.
  private computeWn(): void {}

  private adjustWn(i: number, delta: number): void {
    const { W, H, wn } = this;
    const x = i % W, y = (i - x) / W;
    for (let dy = -1; dy <= 1; dy++) {
      const yy = y + dy;
      if (yy < 0 || yy >= H) continue;
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const xx = x + dx;
        if (xx >= 0 && xx < W) wn[yy * W + xx] += delta;
      }
    }
  }

  // A positivity change can affect saturation at distance at most two. A 5x5 square
  // deliberately includes a few extra cells; duplicate invalidations are coalesced.
  private invalidateMod(i: number): void {
    const { W, H, dirtyMask, dirtyMod } = this;
    const x = i % W, y = (i - x) / W;
    for (let yy = Math.max(0, y - 2); yy <= Math.min(H - 1, y + 2); yy++) {
      for (let xx = Math.max(0, x - 2); xx <= Math.min(W - 1, x + 2); xx++) {
        const c = yy * W + xx;
        if (!dirtyMask[c]) {
          dirtyMask[c] = 1;
          dirtyMod[this.dirtyModCount++] = c;
        }
      }
    }
  }

` + s.slice(computeEnd);
const evapStart = s.indexOf('  private updateEvapMod(): void {');
const evapEnd = s.indexOf('  private buildActive(): void {',evapStart);
s = s.slice(0,evapStart) + `  private updateEvapMod(): void {
    // Consume topology changes only at the original tick boundary. Both substeps
    // still use the same modifier, even if a tile becomes wet or dry between them.
    for (let k = 0; k < this.dirtyModCount; k++) {
      const i = this.dirtyMod[k];
      this.mod[i] = this.D[i] > 0 ? this.evap[this.satAt(i)] : 1;
      this.dirtyMask[i] = 0;
    }
    this.dirtyModCount = 0;
  }

` + s.slice(evapEnd);
const activeStart = s.indexOf('  private buildActive(): void {');
const activeEnd = s.indexOf('  /** The outflow of wet tile', activeStart);
s = s.slice(0, activeStart) + `  // Active iff wet, adjacent to wet, or a constructor source cell. Refcounts
  // are integers in [0,6]. List order may differ, but both numerical passes
  // read complete previous-state buffers and write only their own tile.
  private buildActive(): void {}

  private adjustActiveTile(i: number, delta: number): void {
    const before = this.activeRefs[i];
    const after = before + delta;
    this.activeRefs[i] = after;
    if (!before && after) {
      this.activePos[i] = this.activeCount;
      this.active[this.activeCount++] = i;
    } else if (before && !after) {
      const pos = this.activePos[i];
      const last = this.active[--this.activeCount];
      this.active[pos] = last;
      this.activePos[last] = pos;
      this.activePos[i] = -1;
    }
  }

  private adjustActive(i: number, delta: number): void {
    this.adjustActiveTile(i, delta);
    const a = this.n0[i], b = this.n1[i], c = this.n2[i], d = this.n3[i];
    if (a >= 0) this.adjustActiveTile(a, delta);
    if (b >= 0) this.adjustActiveTile(b, delta);
    if (c >= 0) this.adjustActiveTile(c, delta);
    if (d >= 0) this.adjustActiveTile(d, delta);
  }

` + s.slice(activeEnd);
replace('      const b = 4 * this.prevWet[k];', `      const c = this.prevWet[k];
      if (D[c] > 0) continue; // all four slots are overwritten by flow pass 1
      const b = 4 * c;`);
replace('const { W, H, F, D, C, out, f, wall, mod, dam, game, edgeSpill } = this;', 'const { W, H, F, D, C, out, f, wall, mod, dam, game, edgeSpill, n0: nb0, n1: nb1, n2: nb2, n3: nb3 } = this;');
for (const [a,b] of [
  ['const n = y > 0 ? c - W : -1;', 'const n = nb0[c];'],
  ['const n = x > 0 ? c - 1 : -1;', 'const n = nb1[c];'],
  ['const n = y < H - 1 ? c + W : -1;', 'const n = nb2[c];'],
  ['const n = x < W - 1 ? c + 1 : -1;', 'const n = nb3[c];'],
  ['const n0 = y > 0 ? c - W : -1;', 'const n0 = nb0[c];'],
  ['const n1 = x > 0 ? c - 1 : -1;', 'const n1 = nb1[c];'],
  ['const n2 = y < H - 1 ? c + W : -1;', 'const n2 = nb2[c];'],
  ['const n3 = x < W - 1 ? c + 1 : -1;', 'const n3 = nb3[c];'],
]) replace(a,b);
replace('      const c = this.wet[w];\n      const x = c % W;\n      const y = (c - x) / W;', '      const c = this.wet[w];');
replace('      const c = this.active[a];\n      const x = c % W;\n      const y = (c - x) / W;', '      const c = this.active[a];');
for (const text of ['  private readonly mark: Int32Array;\n', '  private stamp = 0;\n', '  private modSet: Int32Array;\n', '  private modSetCount = 0;\n', '    this.mark = new Int32Array(N);\n', '    this.modSet = new Int32Array(N);\n']) replace(text, '');
replace('    let n = 0;\n    for (let a = 0; a < this.activeCount; a++) {', '    let n = 0;\n    let changed = 0;\n    for (let a = 0; a < this.activeCount; a++) {');
replace('      if (D[c] > 0) this.wet[n++] = c;', `      const positive = +(D[c] > 0);
      if (positive !== this.wetMask[c]) {
        this.adjustWn(c, positive ? 1 : -1);
        this.wetMask[c] = positive;
        this.invalidateMod(c);
        this.transitions[changed++] = c;
      }
      if (positive) this.wet[n++] = c;`);
replace('    this.wetCount = n;\n  }', `    this.wetCount = n;
    // Membership changes are applied after scanning the old active list.
    for (let k = 0; k < changed; k++) {
      const c = this.transitions[k];
      this.adjustActive(c, this.wetMask[c] ? 1 : -1);
    }
  }`);
replace('      const outsum = f0 + f1 + f2 + f3;', `      // A dry active neighbour with no inflow remains dry. All four f slots of
      // a dry tile are zero; retain the old zero's sign in Dold, as the reference does.
      if (D[c] === 0 && in0 === 0 && in1 === 0 && in2 === 0 && in3 === 0) {
        this.Dold[c] = D[c];
        out[b] = 0; out[b + 1] = 0; out[b + 2] = 0; out[b + 3] = 0;
        Cnew[c] = 0;
        D[c] = 0;
        continue;
      }
      const outsum = f0 + f1 + f2 + f3;`);
// Every physical expression, four-term sum and source/check schedule remains unchanged.
replace('      this.updateSeeps();', `      // Sorting indices improves locality without regrouping any physical sum.
      // Rebuild the swap-delete positions after sorting; memberships stay unchanged.
      if (this.ticks % 64 === 0) {
        this.active.subarray(0, this.activeCount).sort();
        for (let a = 0; a < this.activeCount; a++) this.activePos[this.active[a]] = a;
      }
      this.updateSeeps();`);
const speedStart = s.indexOf('// Speed:');
const speedEnd = s.indexOf('export const DT', speedStart);
if (speedStart < 0 || speedEnd <= speedStart) throw Error('Upstream speed/provenance header changed');
s = s.slice(0, speedStart) + `// Investigation speedups: incremental wet-neighbour counts and active membership;
// tick-boundary evaporation invalidation; fixed neighbour indices; clearing only dried
// flow slots; an exact dry/no-inflow shortcut; periodic private-index sorting. Numerical
// expressions and the original substeps, source order and settle checks are preserved.
// See INTEGRATION.md for the dependency proofs and the supported simulator contract.

` + s.slice(speedEnd);
writeFileSync(resolve(HERE,'water.ts'), '// Investigation prototype, derived from M9b by prototype.mjs. See INTEGRATION.md.\n' + s);
console.log('wrote water.ts');
