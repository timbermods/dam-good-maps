// A set of tiles of one map (y * W + x), as bits. The collaboration records use it for what an
// action wrote and what it touched (docs/progress/collab.md). Plain data: it travels as runs.

export class Mask {
  readonly words: Uint32Array;
  constructor(readonly N: number, full = false) {
    this.words = new Uint32Array(Math.ceil(N / 32));
    if (full) for (let i = 0; i < N; i++) this.add(i);
  }

  add(i: number): this {
    if (!Number.isInteger(i) || i < 0 || i >= this.N) throw new Error(`tile ${i} is outside the map`);
    this.words[i >>> 5] |= 1 << (i & 31);
    return this;
  }

  has(i: number): boolean {
    return i >= 0 && i < this.N && (this.words[i >>> 5] & (1 << (i & 31))) !== 0;
  }

  clone(): Mask {
    return new Mask(this.N).union(this);
  }

  union(m: Mask): this {
    for (let k = 0; k < this.words.length; k++) this.words[k] |= m.words[k];
    return this;
  }

  intersects(m: Mask): boolean {
    for (let k = 0; k < this.words.length; k++) if (this.words[k] & m.words[k]) return true;
    return false;
  }

  get size(): number {
    let n = 0;
    for (const w of this.words) {
      let v = w;
      while (v) {
        v &= v - 1;
        n++;
      }
    }
    return n;
  }

  get empty(): boolean {
    return this.words.every((w) => w === 0);
  }

  /** Every tile in the set, ascending. */
  tiles(): number[] {
    const out: number[] = [];
    for (let i = 0; i < this.N; i++) if (this.has(i)) out.push(i);
    return out;
  }

  /** The set as runs [start, end] of consecutive tile indices, ascending (the form a record travels in). */
  toRuns(): [number, number][] {
    const out: [number, number][] = [];
    let start = -1;
    for (let i = 0; i <= this.N; i++) {
      const on = i < this.N && this.has(i);
      if (on && start < 0) start = i;
      else if (!on && start >= 0) {
        out.push([start, i - 1]);
        start = -1;
      }
    }
    return out;
  }

  static fromRuns(N: number, runs: readonly (readonly [number, number])[]): Mask {
    const m = new Mask(N);
    for (const [a, b] of runs) {
      if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b >= N || a > b) throw new Error(`the run [${a}, ${b}] is outside the map`);
      for (let i = a; i <= b; i++) m.add(i);
    }
    return m;
  }
}
