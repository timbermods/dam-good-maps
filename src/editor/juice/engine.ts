// The editor's one sound engine (PLAN §20 D205, D212, D220, D226), for the editor's lifetime: Codex's
// second round (investigation/juice-2 `engine.js`, PR #64), ported. Recorded CC0 foley, predecoded,
// played by the browser's own audio thread (buffer sources): no synthesis on the page, no worklet,
// no timer. Nothing is made before the player's first click or key (browsers ask for that), and
// nothing waits on it: while the bank loads, while it is paused or off, or when too many sounds come
// at once, a sound is dropped, never queued to burst out later. Strokes and forces are held beds
// (start, update, stop); the rest are accents, a force's by phase under its run's id. At most 72
// recordings, 20 sounds and four held beds at once, ten accents a second; a compressor softens an
// overload and a bounded curve keeps every sample below 0.92 of full scale, then the master volume.

import { loadBank, type BankEntry } from "./bank";
import { TRIM } from "./calibration";
import { clamp, DEFAULTS, LADDER, parameters, recipe, RewardRuns, SOUNDS, spatial, texture, type Layer, type SoundParams } from "./palette";

export interface EngineSettings {
  enabled: boolean;
  /** 0–1: the master level. */
  volume: number;
  ambience: boolean;
}

const known = new Set(SOUNDS.map((s) => s.id));
const brushes = new Set(SOUNDS.filter((s) => s.group === "Brushes").map((s) => s.id));
const ambience = (name: string) => name === "waterfall" || name === "stream";
export const LIMITS = Object.freeze({ sources: 72, events: 20, sustained: 4 });

/** Move a level smoothly from now (a click-free change). */
function slew(param: AudioParam, value: number, at: number, seconds = 0.04): void {
  const p = param as AudioParam & { cancelAndHoldAtTime?: (t: number) => AudioParam };
  if (typeof p.cancelAndHoldAtTime === "function") p.cancelAndHoldAtTime(at);
  else {
    // (Firefox: hold where it is now, then glide)
    const now = param.value;
    param.cancelScheduledValues(at);
    param.setValueAtTime(now, at);
  }
  param.setTargetAtTime(value, at, seconds);
}

/** The output: a gentle high-pass, a compressor for overloads, a bounded curve (below 0.92), the
 *  master volume. */
export function outputGraph(context: BaseAudioContext, volume: number = DEFAULTS.volume) {
  const input = context.createGain();
  const dc = context.createBiquadFilter();
  dc.type = "highpass";
  dc.frequency.value = 28;
  dc.Q.value = 0.5;
  const compressor = context.createDynamicsCompressor();
  compressor.threshold.value = -11;
  compressor.knee.value = 12;
  compressor.ratio.value = 4;
  compressor.attack.value = 0.003;
  compressor.release.value = 0.16;
  const ceiling = context.createWaveShaper();
  const curve = new Float32Array(8193);
  for (let i = 0; i < curve.length; i++) {
    const x = ((i / (curve.length - 1)) * 2 - 1) * 3;
    curve[i] = 0.92 * Math.tanh(x / 0.92);
  }
  // (a third maps the curve's [−1, 1] lookup to a [−3, 3] input; bounded below 0.92, nothing after
  // it can overshoot)
  const range = context.createGain();
  range.gain.value = 1 / 3;
  ceiling.curve = curve;
  ceiling.oversample = "none";
  const master = context.createGain();
  master.gain.value = clamp(volume);
  input.connect(dc).connect(compressor).connect(range).connect(ceiling).connect(master).connect(context.destination);
  return {
    input,
    master,
    compressor,
    disconnect() {
      for (const node of [input, dc, compressor, range, ceiling, master]) node.disconnect();
    },
  };
}

interface Voice {
  source: AudioBufferSourceNode;
  gain: GainNode;
  rate: number;
  end: number;
  disconnect(): void;
}

/** One recorded layer, scheduled on the audio clock (shared with offline checks). */
export function scheduleLayer(context: BaseAudioContext, bank: Map<string, BankEntry>, destination: AudioNode, layer: Layer, when: number, looping = false): Voice | null {
  const entry = bank.get(layer.sample);
  if (!entry) return null;
  const source = context.createBufferSource();
  const buffer = looping ? entry.loop : layer.reverse ? entry.reversed : entry.buffer;
  source.buffer = buffer;
  source.loop = looping;
  const rate = clamp(layer.rate ?? 1, 0.25, 3);
  source.playbackRate.value = rate;
  const gain = context.createGain();
  const pan = context.createStereoPanner();
  pan.pan.value = clamp(layer.pan ?? 0, -1, 1);
  const filter = context.createBiquadFilter();
  filter.type = layer.highpass ? "highpass" : "lowpass";
  filter.frequency.value = Math.min(context.sampleRate * 0.45, layer.highpass || layer.lowpass || 18000);
  filter.Q.value = 0.5;
  source.connect(filter).connect(gain).connect(pan).connect(destination);
  const offset = Math.min(layer.offset ?? 0, buffer.duration * 0.8);
  const duration = Math.max(0.025, Math.min(layer.duration ?? 8, (buffer.duration - offset) / rate));
  const at = when + (layer.delay ?? 0);
  const attack = Math.min(layer.attack ?? 0.001, duration * 0.3);
  const release = Math.min(layer.release ?? 0.08, duration * 0.5);
  const level = layer.gain * 2.6;
  gain.gain.setValueAtTime(0, at);
  gain.gain.linearRampToValueAtTime(level, at + attack);
  if (!looping) {
    gain.gain.setValueAtTime(level, at + Math.max(attack, duration - release));
    gain.gain.linearRampToValueAtTime(0, at + duration);
  }
  source.start(at, offset);
  if (!looping) source.stop(at + duration + 0.005);
  return {
    source,
    gain,
    rate,
    end: looping ? Infinity : at + duration + 0.005,
    disconnect() {
      source.disconnect();
      gain.disconnect();
      pan.disconnect();
      filter.disconnect();
    },
  };
}

interface SoundEvent {
  id: string | number;
  name: string;
  p: SoundParams;
  sustained: boolean;
  gain: GainNode;
  filter: BiquadFilterNode;
  pan: StereoPannerNode;
  voices: Set<Voice>;
  trim: number;
  stopped: boolean;
}

type Params = Partial<SoundParams>;
type Id = string | number;

export class JuiceEngine {
  settings: EngineSettings;
  private context: AudioContext | null = null;
  private bank: Map<string, BankEntry> | null = null;
  private graph: ReturnType<typeof outputGraph> | null = null;
  private loading: Promise<boolean> | null = null;
  private events = new Map<Id, SoundEvent>();
  private runs = new RewardRuns();
  private pending = new Map<Id, Params>();
  private distance = 0;
  private nextId = 0;
  private sources = 0;
  private frame = 0;
  private disposed = false;
  private paused = false;
  private tokens = 6;
  private tokenAt = 0;
  private pauseTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly visibility = () => {
    if (document.hidden) this.pause();
  };

  constructor(
    settings: Partial<EngineSettings> = {},
    /** How the bank's files are fetched (tests give their own). */
    private readonly fetcher?: (url: string) => Promise<Response>,
    /** The audio context to make (tests give their own). */
    private readonly makeContext?: () => AudioContext,
  ) {
    this.settings = { ...DEFAULTS, ...settings, volume: clamp(settings.volume ?? DEFAULTS.volume) };
    if (typeof document !== "undefined") document.addEventListener("visibilitychange", this.visibility);
  }

  /** Decoded and running (a sound plays only then). */
  get ready(): boolean {
    return !!this.bank && this.context?.state === "running" && !this.paused && !this.disposed;
  }

  /** Recordings playing now (tests). */
  get playing(): number {
    return this.sources;
  }

  /** The audio context and its output (no recording fetched, nothing played). Making the page's
   *  first context opens the audio device, a few hundred milliseconds on the page's thread: `prepare`
   *  lets that happen as the editor opens, never on the player's gestures. */
  private ensureContext(): AudioContext | null {
    if (this.context) return this.context;
    const Ctor = globalThis.AudioContext ?? (globalThis as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!this.makeContext && !Ctor) return null;
    try {
      const context = (this.context = this.makeContext ? this.makeContext() : new Ctor!({ latencyHint: "interactive" }));
      this.graph = outputGraph(context, this.settings.enabled ? this.settings.volume : 0);
      return context;
    } catch {
      this.context = null;
      return null;
    }
  }

  /** Get the context ready as the editor opens (it stays silent, suspended until a gesture where the
   *  browser asks for one); off, nothing is made. */
  prepare(): void {
    if (this.disposed || this.context || !this.settings.enabled) return;
    this.ensureContext();
  }

  /** Call inside a trusted pointer or key handler; the edit itself never waits on it. It resumes the
   *  context (made now if `prepare` hasn't) and starts loading the bank the first time. */
  unlock(): Promise<boolean> {
    if (this.disposed) return Promise.resolve(false);
    this.paused = false;
    clearTimeout(this.pauseTimer);
    const context = this.ensureContext();
    if (!context) return Promise.resolve(false);
    const resumed = context.resume();
    if (this.bank) return resumed.then(() => true).catch(() => false);
    if (this.loading) return resumed.then(() => this.loading ?? !!this.bank).catch(() => false);
    this.loading = Promise.all([resumed, loadBank(context, this.fetcher)])
      .then(([, bank]) => {
        if (this.disposed) return false;
        this.bank = bank;
        return true;
      })
      .catch(async () => {
        await context.close().catch(() => undefined);
        this.graph?.disconnect();
        this.context = null;
        this.graph = null;
        return false;
      })
      .finally(() => {
        this.loading = null;
      });
    return this.loading;
  }

  private allowed(name: string): boolean {
    return this.ready && this.settings.enabled && known.has(name) && (!ambience(name) || this.settings.ambience);
  }

  private makeEvent(id: Id, name: string, p: Params, sustained: boolean, trim: number): SoundEvent | null {
    if (this.events.size >= LIMITS.events || this.events.has(id)) return null;
    const context = this.context!;
    const gain = context.createGain();
    const filter = context.createBiquadFilter();
    const pan = context.createStereoPanner();
    filter.type = "lowpass";
    filter.Q.value = 0.5;
    gain.connect(filter).connect(pan).connect(this.graph!.input);
    const event: SoundEvent = { id, name, p: parameters(p), sustained, gain, filter, pan, voices: new Set(), trim, stopped: false };
    this.events.set(id, event);
    this.position(event, false);
    return event;
  }

  private position(event: SoundEvent, smooth = true): void {
    const context = this.context!;
    const at = context.currentTime;
    const values = spatial(event.p, this.distance);
    const set = (param: AudioParam, value: number) => (smooth ? slew(param, value, at) : param.setValueAtTime(value, at));
    set(event.gain.gain, values.gain * event.trim);
    set(event.filter.frequency, Math.min(context.sampleRate * 0.45, values.cutoff));
    set(event.pan.pan, values.pan);
  }

  private add(event: SoundEvent, layers: Layer[], loop = false): boolean {
    if (this.sources + layers.length > LIMITS.sources) {
      this.stop(event.id);
      return false;
    }
    const now = this.context!.currentTime + 0.004;
    for (const layer of layers) {
      const voice = scheduleLayer(this.context!, this.bank!, event.gain, layer, now, loop);
      if (!voice) continue;
      event.voices.add(voice);
      this.sources++;
      voice.source.onended = () => {
        voice.disconnect();
        event.voices.delete(voice);
        this.sources--;
        if (!event.voices.size) this.remove(event);
      };
    }
    return true;
  }

  private remove(event: SoundEvent): void {
    event.gain.disconnect();
    event.filter.disconnect();
    event.pan.disconnect();
    if (this.events.get(event.id) === event) this.events.delete(event.id);
  }

  /** An accent (a force's phase appends under its run's id; `span`: how long that phase shows, in
   *  seconds, for a recipe that fits itself to it). Null: dropped. */
  play(name: string, params: Params = {}, { id = `one-${++this.nextId}`, phase, span }: { id?: Id; phase?: string; span?: number } = {}): Id | null {
    if (!this.allowed(name)) return null;
    const now = this.context!.currentTime;
    this.tokens = Math.min(6, this.tokens + (now - this.tokenAt) * 10);
    this.tokenAt = now;
    if (this.tokens < 1) return null;
    const p = parameters(params);
    const step = this.runs.next(name, now);
    const layers = recipe(name, p, { semitones: step, phase, ...(span !== undefined ? { span } : {}) });
    if (!layers.length || this.sources + layers.length > LIMITS.sources) return null;
    const existing = this.events.get(id);
    if (existing && (existing.name !== name || existing.sustained || existing.stopped || !phase)) return null;
    const event = existing ?? this.makeEvent(id, name, p, false, TRIM[name] ?? 1);
    if (!event) return null;
    if (existing) {
      event.p = p;
      this.position(event);
    }
    this.tokens--;
    if (!this.add(event, layers)) return null;
    return id;
  }

  /** A held bed (a stroke, a force), until `stop`; updates move it, never restart it. */
  start(name: string, params: Params = {}, id: Id = `stroke-${++this.nextId}`): Id | null {
    if (!this.allowed(name)) return null;
    if (this.events.has(id)) {
      this.update(id, params);
      return id;
    }
    if ([...this.events.values()].filter((e) => e.sustained && !e.stopped).length >= LIMITS.sustained) return null;
    const layers = texture(name);
    if (!layers.length || this.sources + layers.length + 2 > LIMITS.sources) return null;
    const p = parameters(params);
    const event = this.makeEvent(id, name, p, true, 0.85);
    if (!event) return null;
    // only a brush's first contact gets an impact; updates never make sources
    if (brushes.has(name)) this.add(event, recipe(name, p).slice(0, 1).map((l) => ({ ...l, gain: l.gain * 0.55 })));
    this.add(event, layers.map((l) => ({ ...l, attack: 0.09, offset: Math.random() * 0.8, rate: (l.rate ?? 1) * (0.97 + Math.random() * 0.06) })), true);
    const now = this.context!.currentTime;
    for (const voice of event.voices)
      if (voice.end === Infinity && !ambience(name)) {
        // a long stroke rises gently, to a fifth at most, on the audio clock
        LADDER.forEach((step, i) => voice.source.playbackRate.linearRampToValueAtTime(voice.rate * 2 ** (step / 12), now + 0.2 + i * 0.8));
      }
    return id;
  }

  /** A held bed's new inputs: the latest of each, once an animation frame. */
  update(id: Id | null, params: Params = {}): void {
    if (id === null) return;
    const event = this.events.get(id);
    if (!this.ready || !event || event.stopped) return;
    this.pending.set(id, { ...this.pending.get(id), ...params });
    if (!this.frame && typeof requestAnimationFrame === "function")
      this.frame = requestAnimationFrame(() => {
        for (const [key, p] of this.pending) {
          const e = this.events.get(key);
          if (e && !e.stopped) {
            e.p = parameters({ ...e.p, ...p });
            this.position(e);
          }
        }
        this.pending.clear();
        this.frame = 0;
      });
  }

  /** Fade it out now (every layer of a force's run, the ones still to come too). */
  stop(id: Id | null): void {
    if (id === null) return;
    this.pending.delete(id);
    const event = this.events.get(id);
    if (!event || event.stopped) return;
    event.stopped = true;
    const now = this.context!.currentTime;
    slew(event.gain.gain, 0, now, 0.025);
    for (const v of event.voices) {
      try {
        v.source.stop(now + 0.13);
      } catch {
        // (already stopped)
      }
    }
    if (!event.voices.size) this.remove(event);
  }

  stopAll(): void {
    this.pending.clear();
    if (this.frame && typeof cancelAnimationFrame === "function") cancelAnimationFrame(this.frame);
    this.frame = 0;
    for (const id of [...this.events.keys()]) this.stop(id);
    this.runs.clear();
  }

  /** A distance the whole view adds (a zoom-out), 0–8. */
  setDistance(distance: number): void {
    this.distance = clamp(distance, 0, 8);
    if (this.context) for (const e of this.events.values()) if (!e.stopped) this.position(e);
  }

  setSettings(settings: Partial<EngineSettings>): void {
    this.settings = { ...this.settings, ...settings, volume: clamp(settings.volume ?? this.settings.volume) };
    if (this.graph && this.context) slew(this.graph.master.gain, this.settings.enabled ? this.settings.volume : 0, this.context.currentTime, 0.015);
    if (!this.settings.enabled) this.stopAll();
    if (!this.settings.ambience) for (const e of this.events.values()) if (ambience(e.name)) this.stop(e.id);
  }

  /** The page hidden: everything stops at once and the context sleeps; a click or key wakes it
   *  (nothing from before plays then). */
  pause(): void {
    this.stopAll();
    this.paused = true;
    clearTimeout(this.pauseTimer);
    this.pauseTimer = setTimeout(() => {
      if (this.paused) this.context?.suspend().catch(() => undefined);
    }, 160);
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    this.stopAll();
    clearTimeout(this.pauseTimer);
    if (typeof document !== "undefined") document.removeEventListener("visibilitychange", this.visibility);
    await this.context?.close().catch(() => undefined);
    for (const e of this.events.values()) {
      for (const v of e.voices) {
        v.source.onended = null;
        v.disconnect();
      }
      this.remove(e);
    }
    this.sources = 0;
    this.graph?.disconnect();
    this.bank = null;
  }
}
