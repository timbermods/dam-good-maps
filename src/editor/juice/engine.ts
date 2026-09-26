// The editor's one sound engine (PLAN §20 D205, D212, D220), for the editor's lifetime: the page's
// side of the synthesiser in its AudioWorklet (worklet.ts). Ported from investigation/juice
// `engine.js` (PR #58). Nothing is made before the player's first click or key (browsers ask for
// that), and nothing waits on it: every call is optional feedback, dropped while the worklet loads,
// while it is paused or muted, or when too many come at once (never queued). Strokes and forces
// are sustained textures (start, update, stop); the rest are accents.

import { SYNTH_DEFAULTS, type SoundParams, type SynthSettings } from "./synth";

type Params = Partial<SoundParams>;

export class JuiceEngine {
  settings: SynthSettings;
  private context: AudioContext | null = null;
  private node: AudioWorkletNode | null = null;
  private loading: Promise<boolean> | null = null;
  private disposed = false;
  private nextId = 0;
  private pending = new Map<string | number, Params>();
  private frame = 0;
  private distance = 0;
  private accentTokens = 8;
  private tokenTime = performance.now();
  private sustained = new Set<string | number>();
  private suspended = false;
  private pauseTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly visibility = () => {
    if (document.hidden) this.pause();
  };

  constructor(
    settings: Partial<SynthSettings> = {},
    /** The worklet's module (a URL), loaded at the first unlock. */
    private readonly worklet: () => Promise<string> = async () => (await import("./worklet.ts?worker&url")).default,
  ) {
    this.settings = { ...SYNTH_DEFAULTS, ...settings };
    if (typeof document !== "undefined") document.addEventListener("visibilitychange", this.visibility);
  }

  /** Call inside a trusted pointer or key handler (the edit itself never waits on it). */
  unlock(): Promise<boolean> {
    if (this.disposed) return Promise.resolve(false);
    if (this.context) {
      this.suspended = false;
      return this.context
        .resume()
        .then(() => this.loading ?? !!this.node)
        .catch(() => false);
    }
    const Ctor = globalThis.AudioContext ?? (globalThis as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return Promise.resolve(false);
    try {
      const context = new Ctor({ latencyHint: "interactive" });
      this.context = context;
      const resumed = context.resume();
      this.loading = Promise.all([resumed, this.worklet().then((url) => context.audioWorklet.addModule(url))])
        .then(() => {
          if (this.disposed) return false;
          this.node = new AudioWorkletNode(context, "dgm-juice", {
            numberOfInputs: 0,
            numberOfOutputs: 1,
            outputChannelCount: [2],
            processorOptions: { seed: (Math.random() * 4294967295) >>> 0 },
          });
          this.node.onprocessorerror = () => this.pause();
          this.node.connect(context.destination);
          this.send({ type: "settings", settings: this.settings });
          this.send({ type: "camera", distance: this.distance });
          return true;
        })
        .catch(async () => {
          await this.context?.close().catch(() => undefined);
          this.context = null;
          this.node = null;
          return false;
        })
        .finally(() => {
          this.loading = null;
        });
      return this.loading;
    } catch {
      void this.context?.close().catch(() => undefined);
      this.context = null;
      return Promise.resolve(false);
    }
  }

  get ready(): boolean {
    return !!this.node && this.context?.state === "running" && !this.suspended && !this.disposed;
  }

  private send(message: unknown): void {
    this.node?.port.postMessage(message);
  }

  /** An accent (or one phase of a force's), grouped under `id` for cancelling. */
  play(name: string, params: Params = {}, { id = ++this.nextId, phase }: { id?: string | number; phase?: string } = {}): string | number | null {
    if (!this.ready || !this.settings.enabled) return null;
    // Bound message traffic too, not just voices: drop excess accents now; never replay a late burst.
    const now = performance.now();
    this.accentTokens = Math.min(8, this.accentTokens + (now - this.tokenTime) * 0.012);
    this.tokenTime = now;
    if (this.accentTokens < 1) return null;
    this.accentTokens--;
    this.send({ type: "play", name, params, id, phase });
    return id;
  }

  /** A sustained texture under `id` (starting it again updates it). */
  start(name: string, params: Params = {}, id: string | number = `stroke-${++this.nextId}`): string | number | null {
    if (!this.ready || !this.settings.enabled) return null;
    if (this.sustained.has(id)) {
      this.update(id, params);
      return id;
    }
    if (this.sustained.size >= 4) return null;
    this.sustained.add(id);
    this.send({ type: "start", name, params, id });
    return id;
  }

  /** A texture's parameters now (coalesced: one message a handle an animation frame). */
  update(id: string | number | null, params: Params): void {
    if (!this.ready || id == null) return;
    if (!this.pending.has(id) && this.pending.size >= 8) return;
    this.pending.set(id, params);
    if (!this.frame)
      this.frame = requestAnimationFrame(() => {
        for (const [key, value] of this.pending) this.send({ type: "update", id: key, params: value });
        this.pending.clear();
        this.frame = 0;
      });
  }

  stop(id: string | number | null): void {
    if (id == null) return;
    this.pending.delete(id);
    this.sustained.delete(id);
    this.send({ type: "stop", id });
  }

  stopAll(): void {
    this.pending.clear();
    if (this.frame) cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.sustained.clear();
    this.send({ type: "stopAll" });
  }

  setSettings(settings: Partial<SynthSettings>): void {
    this.settings = { ...this.settings, ...settings };
    this.send({ type: "settings", settings: this.settings });
    if (!this.settings.enabled) this.stopAll();
  }

  /** The page is hidden or lost the focus: every sound stops (a new click resumes). */
  pause(): void {
    this.stopAll();
    this.suspended = true;
    clearTimeout(this.pauseTimer);
    // let the 110 ms release finish before suspending
    this.pauseTimer = setTimeout(() => {
      if (this.suspended) void this.context?.suspend();
    }, 160);
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    this.stopAll();
    clearTimeout(this.pauseTimer);
    if (typeof document !== "undefined") document.removeEventListener("visibilitychange", this.visibility);
    this.node?.disconnect();
    await this.context?.close().catch(() => undefined);
    this.node = null;
  }
}
