// A placed object's pop and wiggle (PLAN §20 D205 (2)): the objects on its tiles grow from a little smaller, overshoot
// and settle, in about a third of a second. The renderer finds the objects' instances (`MapRenderer.wiggle`); this
// moves their matrices, on the renderer's time (clock.ts).

import type { InstancedMesh } from "three";
import { WALL_CLOCK, type Clock } from "./clock";

/** An object's instance in its batch, and its matrix as built. */
export interface PopItem {
  mesh: InstancedMesh;
  i: number;
  base: Float32Array;
}

/** How long a pop lasts (ms). */
export const POP_MS = 360;

/** A pop's scale `t` of the way through it (0–1): a little smaller, over, and settled at 1. */
export function popScale(t: number): number {
  return 1 - 0.3 * Math.cos(3 * Math.PI * t) * (1 - t) ** 2;
}

interface Pop {
  items: PopItem[];
  t0: number;
  /** The objects were built again meanwhile: the new ones stand as built. */
  gone: () => boolean;
}

export class Pops {
  private live: Pop[] = [];
  private frame = 0;

  constructor(
    private readonly render: () => void,
    /** The renderer's time (clock.ts): the wall clock, or a recording's. */
    private readonly clock: Clock = WALL_CLOCK,
  ) {}

  /** Pop these objects from now. */
  add(items: PopItem[], gone: () => boolean): void {
    const p = { items, t0: this.clock.now(), gone };
    if (this.step(p, p.t0)) this.live.push(p);
    this.render();
    // (a recording draws its own frames, and moves the pops on before each: `advance`)
    if (this.live.length && !this.clock.driven && !this.frame) this.frame = requestAnimationFrame(this.tick);
  }

  /** Every pop as it is at the clock's time now; whether any still plays. */
  advance(): boolean {
    const now = this.clock.now();
    this.live = this.live.filter((p) => this.step(p, now));
    return this.live.length > 0;
  }

  /** Its objects at `now`; whether it still plays. */
  private step(p: Pop, now: number): boolean {
    if (p.gone()) return false;
    const t = Math.min(1, (now - p.t0) / POP_MS);
    const s = popScale(t);
    for (const it of p.items) {
      const a = it.mesh.instanceMatrix.array as Float32Array;
      for (const j of [0, 1, 2, 4, 5, 6, 8, 9, 10]) a[it.i * 16 + j] = it.base[j] * s;
      it.mesh.instanceMatrix.needsUpdate = true;
    }
    return t < 1;
  }

  private tick = (): void => {
    this.frame = 0;
    const on = this.advance();
    this.render();
    if (on) this.frame = requestAnimationFrame(this.tick);
  };

  /** Every pop put away where it stands (a new map: its objects are built again). */
  clear(): void {
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.live = [];
  }
}
