// The tour's hands (D377): synthetic keys, pointer moves, presses and wheel turns, dispatched on the map exactly as a
// player's are, so every gesture goes through the editor's own input paths (its keyboard shortcuts, the brush's
// pointer tool, the forces' pointer tools, F's sizing, the wheel's habits) and the tour survives any change to
// the layout. The tour's script (script.ts) is written in these; nothing here knows what a brush or a force is.

/** A screen position, CSS pixels. */
export interface Pt {
  x: number;
  y: number;
}

/** The tour was ended (Esc, or the editor closed): every pending step stops with it. */
export class TourEnded extends Error {
  constructor() {
    super("the tour ended");
  }
}

/** What the conductor shows of itself: the ghost cursor and a ripple where it presses. */
export interface Ghost {
  cursor(p: Pt | null, pressed?: boolean): void;
  ripple(p: Pt): void;
}

export interface Hands {
  /** The map's canvas: the pointer and the wheel are dispatched on it, as the browser would. */
  canvas: HTMLElement;
  ghost: Ghost;
  signal: AbortSignal;
}

const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

export class Conductor {
  private at: Pt = { x: 0, y: 0 };
  private pressed = false;
  private shift = false;
  private ctrl = false;
  private onCanvas = false;

  constructor(private readonly h: Hands) {}

  get position(): Pt {
    return { ...this.at };
  }

  private check(): void {
    if (this.h.signal.aborted) throw new TourEnded();
  }

  /** Wait `ms` (the tour's pace; a hidden tab waits with it). */
  sleep(ms: number): Promise<void> {
    this.check();
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => (this.h.signal.aborted ? reject(new TourEnded()) : resolve()), ms);
      this.h.signal.addEventListener("abort", () => (clearTimeout(t), reject(new TourEnded())), { once: true });
    });
  }

  /** Wait until `done()` is true (polled each frame), at most `limit` ms; whether it was. */
  async until(done: () => boolean, limit: number): Promise<boolean> {
    const t0 = performance.now();
    for (;;) {
      this.check();
      if (done()) return true;
      if (performance.now() - t0 > limit) return false;
      await this.frame();
    }
  }

  private frame(): Promise<number> {
    return new Promise((resolve, reject) => {
      const id = requestAnimationFrame((t) => (this.h.signal.aborted ? reject(new TourEnded()) : resolve(t)));
      this.h.signal.addEventListener("abort", () => (cancelAnimationFrame(id), reject(new TourEnded())), { once: true });
    });
  }

  /** Run `step(t)` every frame for `ms`, t from 0 to 1 (the last call is exactly 1). */
  async over(ms: number, step: (t: number) => void): Promise<void> {
    const t0 = performance.now();
    for (;;) {
      await this.frame();
      const t = Math.min(1, (performance.now() - t0) / ms);
      step(t);
      if (t >= 1) return;
    }
  }

  // ------------------------------------------------------------------------------ keys

  private key(type: "keydown" | "keyup", key: string, code: string, repeat = false): void {
    document.body.dispatchEvent(new KeyboardEvent(type, { key, code, bubbles: true, cancelable: true, shiftKey: this.shift, ctrlKey: this.ctrl, repeat }));
  }

  /** Hold a key down (Shift and Ctrl count in the pointer's presses from here; F is read by the editor itself). */
  hold(name: "Shift" | "Control" | "f"): void {
    if (name === "Shift") this.shift = true;
    if (name === "Control") this.ctrl = true;
    this.key("keydown", name, name === "f" ? "KeyF" : name === "Shift" ? "ShiftLeft" : "ControlLeft");
  }

  release(name: "Shift" | "Control" | "f"): void {
    if (name === "Shift") this.shift = false;
    if (name === "Control") this.ctrl = false;
    this.key("keyup", name, name === "f" ? "KeyF" : name === "Shift" ? "ShiftLeft" : "ControlLeft");
  }

  /** A key tapped by the character it types and its place on the keyboard (`Digit2`), with Shift when asked. */
  async tap(code: string, opts: { shift?: boolean } = {}): Promise<void> {
    this.check();
    if (opts.shift) this.hold("Shift");
    const digit = /^Digit(\d)$/.exec(code);
    const key = digit ? (opts.shift ? ")!@#$%^&*("[Number(digit[1])] : digit[1]) : code;
    this.key("keydown", key, code);
    await this.sleep(70);
    this.key("keyup", key, code);
    if (opts.shift) this.release("Shift");
  }

  // ------------------------------------------------------------------------------ the pointer

  private pointer(type: "pointermove" | "pointerdown" | "pointerup", p: Pt): void {
    this.at = p;
    this.h.ghost.cursor(p, this.pressed);
    const rect = this.h.canvas.getBoundingClientRect();
    const inside = p.x >= rect.left && p.x < rect.right && p.y >= rect.top && p.y < rect.bottom;
    if (!inside) {
      // (over the page's own controls: the map is left, as a real pointer leaves it)
      if (this.onCanvas) this.h.canvas.dispatchEvent(new PointerEvent("pointerleave", { pointerId: 1, pointerType: "mouse", isPrimary: true, bubbles: false, clientX: p.x, clientY: p.y }));
      this.onCanvas = false;
      return;
    }
    this.onCanvas = true;
    this.h.canvas.dispatchEvent(
      new PointerEvent(type, {
        pointerId: 1,
        pointerType: "mouse",
        isPrimary: true,
        bubbles: true,
        cancelable: true,
        clientX: p.x,
        clientY: p.y,
        button: type === "pointermove" ? -1 : 0,
        buttons: type === "pointerup" ? 0 : this.pressed || type === "pointerdown" ? 1 : 0,
        pressure: this.pressed || type === "pointerdown" ? 0.5 : 0,
        shiftKey: this.shift,
        ctrlKey: this.ctrl,
      }),
    );
  }

  /** The ghost appears at `p` (no move is sent: the map sees the pointer arrive with the first move). */
  appear(p: Pt): void {
    this.at = p;
    this.h.ghost.cursor(p, false);
  }

  /** Glide to `p` in `ms`, a pointer move each frame (an unhurried hand: eased both ends). */
  async moveTo(p: Pt, ms: number): Promise<void> {
    await this.along([p], ms);
  }

  /** Glide through `points` in `ms`, at one pace along the whole line, eased at both ends. */
  async along(points: readonly Pt[], ms: number): Promise<void> {
    const line = [this.at, ...points];
    const lens = [0];
    for (let k = 1; k < line.length; k++) lens.push(lens[k - 1] + Math.hypot(line[k].x - line[k - 1].x, line[k].y - line[k - 1].y));
    const total = lens[lens.length - 1];
    if (total < 0.5) return;
    await this.over(ms, (t) => {
      const d = ease(t) * total;
      let k = 1;
      while (k < line.length - 1 && lens[k] < d) k++;
      const seg = lens[k] - lens[k - 1];
      const u = seg ? (d - lens[k - 1]) / seg : 1;
      this.pointer("pointermove", { x: line[k - 1].x + (line[k].x - line[k - 1].x) * u, y: line[k - 1].y + (line[k].y - line[k - 1].y) * u });
    });
  }

  /** Press the left button where the pointer is. */
  down(): void {
    this.check();
    this.pointer("pointerdown", this.at);
    this.pressed = true;
    this.h.ghost.cursor(this.at, true);
  }

  /** Let the left button go where the pointer is. */
  up(): void {
    this.pointer("pointerup", this.at);
    this.pressed = false;
    this.h.ghost.cursor(this.at, false);
  }

  /** A click where the pointer is. */
  async click(): Promise<void> {
    this.down();
    this.h.ghost.ripple(this.at);
    await this.sleep(110);
    this.up();
  }

  /** A turn of the wheel at the pointer (negative: up, away from the player), with the keys held. */
  wheel(deltaY: number): void {
    this.check();
    this.h.canvas.dispatchEvent(
      new WheelEvent("wheel", { deltaY, deltaMode: 0, bubbles: true, cancelable: true, clientX: this.at.x, clientY: this.at.y, shiftKey: this.shift, ctrlKey: this.ctrl }),
    );
  }

  /** Everything let go (the tour ended mid-gesture). */
  letGo(): void {
    if (this.pressed) this.up();
    for (const k of ["Shift", "Control", "f"] as const) this.release(k);
  }
}
