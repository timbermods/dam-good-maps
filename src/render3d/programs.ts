// Shader programs compiled before a frame needs them (D453: anything that feels slow is a bug). A material whose
// defines change (the branches a map with terrain above terrain compiles: the terrain's `CUTAWAY` and `RUN_SOIL`, the
// roofed materials' `CAVES`) needs a new program, and three.js compiles it on the page's thread at the next frame that
// draws the material: seconds for the terrain's and High's programs, the whole page frozen. Here a switch is compiled
// first, in the background (`KHR_parallel_shader_compile`: the program's compile and link are sent, and whether it is
// done is asked without waiting for it), and the material takes its new defines only once the program is ready; the
// frames until then draw with the program it has. The programs an edit could need next are compiled the same way,
// unasked, once a map is drawn (`warm`), so the switch finds them ready and is made at once. Those are sent a few at a
// time, and none while a switch waits for its own: the browser compiles what it was sent in turn, so a switch's
// program never waits behind a queue of ones nobody needs yet.
//
// A material keeps every program it has drawn or been compiled with (three.js holds them in the material's own map
// until it is disposed), so switching back is free, and a warmed program stays warm for the material's life.

import type { Camera, Material, Object3D, Scene, ShaderMaterial, WebGLRenderer } from "three";

export type Defines = Record<string, number>;

/** The defines that come and go (present or not at all), always written after a material's own and in this order, so
 *  the same branches are the same program however the map came by them. */
const BRANCHES = ["CAVES", "RUN_SOIL"];

/** These defines with one changed (null: left out), in their one order: the material's own (the ones not in
 *  `BRANCHES`) as they were, then the branches present. */
export function withDefine(d: Defines, name: string, value: number | null): Defines {
  const all: Defines = { ...d };
  if (value === null) delete all[name];
  else all[name] = value;
  return ordered(all);
}

/** These defines in their one order. */
function ordered(d: Defines): Defines {
  const out: Defines = {};
  for (const k of Object.keys(d)) if (!BRANCHES.includes(k)) out[k] = d[k];
  for (const k of BRANCHES) if (k in d) out[k] = d[k];
  return out;
}

const signature = (d: Defines) => JSON.stringify(d);

/** three.js's program, as far as this module reads it. */
interface Program {
  isReady(): boolean;
}

interface Entry {
  /** The programs the compile with these defines added to the material (two for a transparent double-sided one). */
  programs: Program[];
  ready: boolean;
}

export interface ProgramsHost {
  gl: WebGLRenderer;
  scene: Scene;
  camera(): Camera;
  /** The objects drawn with this material now, one of each kind (the program's other half comes from the object:
   *  instancing, its attributes); none when nothing draws it. */
  drawnWith(mat: ShaderMaterial): Object3D[];
  /** An object like those this material draws, to compile its program with when nothing draws it (its kind and the
   *  attributes the program reads: instanced or not, a normal or not). */
  standIn(mat: ShaderMaterial): Object3D;
  /** A switch was made: draw again. */
  changed(): void;
}

const POLL_MS = 16;
/** How many programs compiled ahead are sent to the browser at once. */
export const WARM_IN_FLIGHT = 2;

/** A program to compile ahead: its entry once its compile is sent. */
interface Job {
  mat: ShaderMaterial;
  defines: Defines;
  entry: Entry | null;
}

export class Programs {
  /** Whether programs compile in the background here: without it a compile is waited for at its first frame whatever
   *  is done, so a define is set at once, as three.js would. */
  readonly background: boolean;
  private entries = new WeakMap<ShaderMaterial, Map<string, Entry>>();
  /** The defines each material is to take once their program is ready. */
  private wanted = new Map<ShaderMaterial, Defines>();
  /** The programs to compile ahead not sent yet, those sent and still compiling, and who waits for which. */
  private queue: Job[] = [];
  private inFlight = new Set<Entry>();
  /** Who waits for which programs; `now`: one the page waits on (a switch of the look), ahead of the queue. */
  private waiters: { jobs: Job[]; done: () => void; now: boolean }[] = [];
  private watched = new WeakSet<ShaderMaterial>();
  private timer = 0;
  private disposed = false;

  constructor(private host: ProgramsHost) {
    this.background = host.gl.extensions.has("KHR_parallel_shader_compile");
  }

  /** The defines this material has or is about to take. */
  defines(mat: ShaderMaterial): Defines {
    return this.wanted.get(mat) ?? (mat.defines as Defines);
  }

  /** Set one define of a material (null: leave it out): at once when its program is compiled, else when its compile in
   *  the background ends, the frames in between drawing with the program it has. */
  set(mat: ShaderMaterial, name: string, value: number | null): void {
    const want = withDefine(this.defines(mat), name, value);
    const now = mat.defines as Defines;
    if (signature(want) === signature(now)) {
      this.wanted.delete(mat);
      return;
    }
    // (without compiles in the background, or on a material never compiled, there is nothing to draw with meanwhile)
    if (!this.background || !(this.host.gl.properties.get(mat) as { programs?: unknown }).programs) {
      this.apply(mat, want);
      return;
    }
    this.watch(mat);
    // (what it has now is what it draws with: switching back to it is free)
    if (!this.known(mat).has(signature(now))) this.known(mat).set(signature(now), { programs: [], ready: true });
    this.wanted.set(mat, want);
    const e = this.known(mat).get(signature(want));
    if (e && this.isReady(e)) this.apply(mat, want);
    else this.soon();
  }

  /** Compile these materials' programs with these defines in the background, without drawing with them, behind every
   *  switch waiting for its own (`WARM_IN_FLIGHT` sent at a time): resolved when all are ready. */
  warm(list: [ShaderMaterial, Defines][]): Promise<void> {
    if (!this.background || this.disposed || !list.length) return Promise.resolve();
    const jobs: Job[] = list.map(([mat, defines]) => {
      this.watch(mat);
      const d = ordered(defines);
      // (one sent already, or compiled: waited for where it is, never queued again)
      return { mat, defines: d, entry: this.known(mat).get(signature(d)) ?? null };
    });
    this.queue.push(...jobs.filter((j) => !j.entry));
    return this.wait(jobs, false);
  }

  /** Compile these materials' programs now, ahead of the queue, which waits until they are ready (a switch of the
   *  look the page waits on): resolved when they are. */
  now(list: [ShaderMaterial, Defines][]): Promise<void> {
    if (!this.background || this.disposed || !list.length) return Promise.resolve();
    const jobs: Job[] = list.map(([mat, defines]) => {
      this.watch(mat);
      return { mat, defines: ordered(defines), entry: this.compile(mat, ordered(defines)) };
    });
    return this.wait(jobs, true);
  }

  private wait(jobs: Job[], now: boolean): Promise<void> {
    return new Promise((done) => {
      this.waiters.push({ jobs, done, now });
      this.soon();
    });
  }

  /** The programs to compile ahead not sent to the browser yet (the tests read it). */
  get queued(): number {
    return this.queue.length;
  }

  /** Whether these materials' programs with these defines are compiled (their compiles sent if they were not). */
  ready(list: [ShaderMaterial, Defines][]): boolean {
    if (!this.background) return true;
    let all = true;
    for (const [mat, defines] of list) {
      this.watch(mat);
      if (!this.isReady(this.compile(mat, ordered(defines)))) all = false;
    }
    return all;
  }

  /** Whether every define asked for has been set (the picture is the final one). */
  get settled(): boolean {
    return this.wanted.size === 0;
  }

  dispose(): void {
    this.disposed = true;
    clearTimeout(this.timer);
    this.wanted.clear();
    this.queue = [];
    this.inFlight.clear();
    this.waiters = [];
  }

  private known(mat: ShaderMaterial): Map<string, Entry> {
    let m = this.entries.get(mat);
    if (!m) this.entries.set(mat, (m = new Map()));
    return m;
  }

  private watch(mat: ShaderMaterial): void {
    if (this.watched.has(mat)) return;
    this.watched.add(mat);
    // (a disposed material's programs go with it: never asked after again)
    mat.addEventListener("dispose", () => {
      for (const e of this.entries.get(mat)?.values() ?? []) this.inFlight.delete(e);
      this.queue = this.queue.filter((j) => j.mat !== mat);
      for (const w of this.waiters) w.jobs = w.jobs.filter((j) => j.mat !== mat);
      this.entries.delete(mat);
      this.wanted.delete(mat);
    });
  }

  private isReady(e: Entry): boolean {
    if (!e.ready) e.ready = e.programs.every((p) => p.isReady());
    return e.ready;
  }

  private apply(mat: ShaderMaterial, want: Defines): void {
    this.wanted.delete(mat);
    mat.defines = { ...want };
    mat.needsUpdate = true;
  }

  /** The material's program with these defines, its compile sent if it was not: the material takes them for the
   *  length of a compile with an object it draws (or a stand-in), then has its own back, so nothing drawn changes. */
  private compile(mat: ShaderMaterial, d: Defines): Entry {
    const known = this.known(mat);
    const key = signature(d);
    const had = known.get(key);
    if (had) return had;
    const { gl } = this.host;
    const programsOf = () => (gl.properties.get(mat) as { programs?: Map<string, Program> }).programs;
    const before = new Set(programsOf()?.values() ?? []);
    const drawn = this.host.drawnWith(mat);
    const keepDefines = mat.defines;
    for (const o of drawn.length ? drawn : [this.host.standIn(mat)]) {
      const obj = o as Object3D & { material: Material | Material[] };
      const keepMaterial = obj.material;
      obj.material = mat;
      mat.defines = { ...d };
      mat.needsUpdate = true;
      try {
        gl.compile(obj, this.host.camera(), this.host.scene);
      } finally {
        obj.material = keepMaterial;
        mat.defines = keepDefines;
        // (its own program again at the next frame: three.js finds it in the material's map)
        mat.needsUpdate = true;
      }
    }
    const programs = [...(programsOf()?.values() ?? [])].filter((p) => !before.has(p));
    const e: Entry = { programs, ready: false };
    this.isReady(e);
    known.set(key, e);
    return e;
  }

  /** Send the switches' compiles and make each whose program is ready before the next frame (a microtask, so a switch
   *  made of several defines set one after another compiles only where it ends), then ask after the rest. */
  private soon(): void {
    if (this.microtask || this.disposed) return;
    this.microtask = true;
    queueMicrotask(() => {
      this.microtask = false;
      if (!this.disposed) this.tick();
    });
  }

  private microtask = false;

  /** Ask after the compiles still running a frame's length apart. */
  private poll(): void {
    if (this.timer || this.disposed) return;
    this.timer = window.setTimeout(() => {
      this.timer = 0;
      if (!this.disposed) this.tick();
    }, POLL_MS);
  }

  /** Make each switch whose program is ready (its compile sent at once if it was not), send the next programs to
   *  compile ahead while no switch waits, and tell those waiting for them. */
  private tick(): void {
    let made = false;
    for (const [mat, want] of [...this.wanted]) {
      if (this.isReady(this.compile(mat, want))) {
        this.apply(mat, want);
        made = true;
      }
    }
    for (const e of [...this.inFlight]) if (this.isReady(e)) this.inFlight.delete(e);
    // (a switch waiting for its program has the browser to itself: nothing more is sent ahead of it)
    const ready = (w: { jobs: Job[] }) => w.jobs.every((j) => j.entry && this.isReady(j.entry));
    const urgent = this.waiters.some((w) => w.now && !ready(w));
    while (!this.wanted.size && !urgent && this.inFlight.size < WARM_IN_FLIGHT && this.queue.length) {
      const job = this.queue.shift()!;
      job.entry = this.compile(job.mat, job.defines);
      if (!this.isReady(job.entry)) this.inFlight.add(job.entry);
    }
    const done = this.waiters.filter(ready);
    this.waiters = this.waiters.filter((w) => !ready(w));
    if (made) this.host.changed();
    for (const w of done) w.done();
    if (this.wanted.size || this.inFlight.size || this.queue.length || this.waiters.length) this.poll();
  }
}
