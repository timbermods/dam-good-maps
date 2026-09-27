import { DEFAULTS, SOUNDS, LADDER, RewardRuns, clamp, parameters, spatial, recipe, texture } from './palette.js';
import { TRIM } from './calibration.js';

const known = new Set(SOUNDS.map(x => x.id));
const ambience = name => name === 'waterfall' || name === 'stream';
export const LIMITS = Object.freeze({ sources: 72, events: 20, sustained: 4 });
const slew = (param, value, at, seconds = .04) => {
  param.cancelAndHoldAtTime(at);
  param.setTargetAtTime(value, at, seconds);
};

export function outputGraph(context, volume = DEFAULTS.volume) {
  const input = context.createGain();
  const dc = context.createBiquadFilter(); dc.type = 'highpass'; dc.frequency.value = 28; dc.Q.value = .5;
  const compressor = context.createDynamicsCompressor();
  compressor.threshold.value = -11; compressor.knee.value = 12;
  compressor.ratio.value = 4; compressor.attack.value = .003; compressor.release.value = .16;
  const ceiling = context.createWaveShaper();
  const curve = new Float32Array(8193);
  for (let i = 0; i < curve.length; i++) {
    const x = (i/(curve.length-1)*2-1)*3;
    curve[i] = .92*Math.tanh(x/.92);
  }
  // Gain /3 maps the shaper's [-1,1] lookup to [-3,3] input. Its curve is bounded
  // below .92; no oversampling reconstruction after it can overshoot the ceiling.
  const range = context.createGain(); range.gain.value = 1/3;
  ceiling.curve = curve; ceiling.oversample = 'none';
  const master = context.createGain(); master.gain.value = clamp(volume);
  input.connect(dc).connect(compressor).connect(range).connect(ceiling).connect(master).connect(context.destination);
  return { input, master, compressor, disconnect() { for (const node of [input, dc, compressor, range, ceiling, master]) node.disconnect(); } };
}

function seamless(context, buffer) {
  const original = buffer.getChannelData(0);
  const overlap = Math.min(Math.floor(context.sampleRate*.12), Math.floor(original.length/4));
  const length = original.length - overlap;
  const loop = context.createBuffer(1, length, context.sampleRate);
  const out = loop.getChannelData(0);
  out.set(original.subarray(overlap));
  for (let i = 0; i < overlap; i++) {
    const t = i/overlap;
    out[length-overlap+i] = original[length+i]*(1-t) + original[i]*t;
  }
  return loop;
}

export async function loadBank(context) {
  const response = await fetch(new URL('./bank.json', import.meta.url));
  if (!response.ok) throw new Error('Sound manifest could not load.');
  const manifest = await response.json();
  const bank = new Map();
  // Four decodes at a time keep setup work modest. No decoding happens in play().
  let cursor = 0;
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (cursor < manifest.length) {
      const item = manifest[cursor++];
      const file = await fetch(new URL(item.file, import.meta.url));
      if (!file.ok) throw new Error(`Missing sound: ${item.id}`);
      const buffer = await context.decodeAudioData(await file.arrayBuffer());
      const data = buffer.getChannelData(0);
      const reversed = context.createBuffer(1, data.length, context.sampleRate);
      reversed.getChannelData(0).set(data); reversed.getChannelData(0).reverse();
      bank.set(item.id, { buffer, reversed,
        loop: /bed$|waterfall|bubbles|boom/.test(item.id) ? seamless(context, buffer) : buffer });
    }
  }));
  return bank;
}

// Shared by the live engine and OfflineAudioContext validation; the browser owns
// playback on its audio thread. The main thread neither renders PCM nor feeds a
// recurring grain timer. A stalled animation frame cannot interrupt a held bed.
export function scheduleLayer(context, bank, destination, layer, when, looping = false) {
  const entry = bank.get(layer.sample);
  if (!entry) return null;
  const source = context.createBufferSource();
  source.buffer = looping ? entry.loop : layer.reverse ? entry.reversed : entry.buffer;
  source.loop = looping;
  const rate = clamp(layer.rate ?? 1, .25, 3);
  source.playbackRate.value = rate;
  const gain = context.createGain();
  const pan = context.createStereoPanner(); pan.pan.value = clamp(layer.pan ?? 0, -1, 1);
  const filter = context.createBiquadFilter();
  filter.type = layer.highpass ? 'highpass' : 'lowpass';
  filter.frequency.value = Math.min(context.sampleRate*.45, layer.highpass || layer.lowpass || 18000);
  filter.Q.value = .5;
  source.connect(filter).connect(gain).connect(pan).connect(destination);
  const offset = Math.min(layer.offset ?? 0, source.buffer.duration*.8);
  const duration = Math.max(.025, Math.min(layer.duration ?? 8, (source.buffer.duration-offset)/rate));
  const at = when + (layer.delay ?? 0);
  const attack = Math.min(layer.attack ?? .001, duration*.3);
  const release = Math.min(layer.release ?? .08, duration*.5);
  const level = layer.gain * 2.6;
  gain.gain.setValueAtTime(0, at);
  gain.gain.linearRampToValueAtTime(level, at+attack);
  if (!looping) {
    gain.gain.setValueAtTime(level, at+Math.max(attack, duration-release));
    gain.gain.linearRampToValueAtTime(0, at+duration);
  }
  source.start(at, offset);
  if (!looping) source.stop(at+duration+.005);
  return { source, gain, rate, end: looping ? Infinity : at+duration+.005,
    disconnect() { source.disconnect(); gain.disconnect(); pan.disconnect(); filter.disconnect(); } };
}

export class JuiceEngine {
  constructor({ settings = {}, onState = () => {}, onReward = () => {} } = {}) {
    this.settings = { ...DEFAULTS, ...settings, volume: clamp(settings.volume ?? DEFAULTS.volume) };
    this.onState = onState; this.onReward = onReward;
    this.context = null; this.bank = null; this.graph = null; this.loading = null;
    this.events = new Map(); this.runs = new RewardRuns(); this.pending = new Map();
    this.distance = 0; this.nextId = 0; this.sources = 0; this.frame = 0;
    this.disposed = false; this.paused = false; this.generation = 0;
    this.tokens = 6; this.tokenAt = 0;
    this.visibility = () => { if (document.hidden) this.pause(); };
    globalThis.document?.addEventListener('visibilitychange', this.visibility);
  }
  get ready() { return !!this.bank && this.context?.state === 'running' && !this.paused && !this.disposed; }
  // Call directly inside a trusted interaction. Constructing the engine is silent
  // and does not create a context. Callers may await this in the demo, never in an
  // editor mutation: edits during loading are intentionally silent, never queued.
  unlock() {
    if (this.disposed) return Promise.resolve(false);
    this.paused = false; clearTimeout(this.pauseTimer);
    if (this.context) return this.context.resume().then(() => this.loading ?? !!this.bank).catch(() => false);
    const Audio = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!Audio) { this.onState('Web Audio is unavailable.'); return Promise.resolve(false); }
    try {
      const context = this.context = new Audio({ latencyHint: 'interactive' });
      const resumed = context.resume();
      this.graph = outputGraph(context, this.settings.enabled ? this.settings.volume : 0);
      this.onState('Loading local recordings…');
      this.loading = Promise.all([resumed, loadBank(context)]).then(([, bank]) => {
        if (this.disposed) return false;
        this.bank = bank; this.onState('Ready · recorded foley'); return true;
      }).catch(async error => {
        this.onState(`Audio unavailable: ${error.message}`);
        await context.close().catch(() => {});
        this.graph?.disconnect(); this.context = null; this.graph = null; return false;
      }).finally(() => { this.loading = null; });
      return this.loading;
    } catch (error) { this.onState(`Audio unavailable: ${error.message}`); return Promise.resolve(false); }
  }
  allowed(name) {
    return this.ready && this.settings.enabled && known.has(name) && (!ambience(name) || this.settings.ambience);
  }
  makeEvent(id, name, p, sustained, trim) {
    if (this.events.size >= LIMITS.events || this.events.has(id)) return null;
    const context = this.context;
    const gain = context.createGain(), filter = context.createBiquadFilter(), pan = context.createStereoPanner();
    filter.type = 'lowpass'; filter.Q.value = .5;
    gain.connect(filter).connect(pan).connect(this.graph.input);
    const event = { id, name, p: parameters(p), sustained, gain, filter, pan, voices: new Set(), trim, stopped: false };
    this.events.set(id, event); this.position(event, false);
    return event;
  }
  position(event, smooth = true) {
    const at = this.context.currentTime;
    const values = spatial(event.p, this.distance);
    const set = (param, value) => smooth ? slew(param, value, at) : param.setValueAtTime(value, at);
    set(event.gain.gain, values.gain*event.trim);
    set(event.filter.frequency, Math.min(this.context.sampleRate*.45, values.cutoff));
    set(event.pan.pan, values.pan);
  }
  add(event, layers, loop = false) {
    if (this.sources+layers.length > LIMITS.sources) { this.stop(event.id); return false; }
    const now = this.context.currentTime+.004;
    for (const layer of layers) {
      const voice = scheduleLayer(this.context, this.bank, event.gain, layer, now, loop);
      if (!voice) continue;
      event.voices.add(voice); this.sources++;
      voice.source.onended = () => {
        voice.disconnect(); event.voices.delete(voice); this.sources--;
        if (!event.voices.size) this.remove(event);
      };
    }
    return true;
  }
  remove(event) {
    event.gain.disconnect(); event.filter.disconnect(); event.pan.disconnect();
    if (this.events.get(event.id) === event) this.events.delete(event.id);
  }
  play(name, params = {}, { id = `one-${++this.nextId}`, phase } = {}) {
    if (!this.allowed(name)) return null;
    const now = this.context.currentTime;
    this.tokens = Math.min(6, this.tokens+(now-this.tokenAt)*10); this.tokenAt = now;
    if (this.tokens < 1) return null;
    const p = parameters(params), step = this.runs.next(name, now);
    const layers = recipe(name, p, { semitones: step, phase });
    if (!layers.length || this.sources+layers.length > LIMITS.sources) return null;
    // A force run may append real-clock phases under one cancellation id.
    const existing = this.events.get(id);
    if (existing && (existing.name !== name || existing.sustained || existing.stopped || !phase)) return null;
    const event = existing || this.makeEvent(id, name, p, false, TRIM[name] ?? 1);
    if (!event) return null;
    if (existing) { event.p = p; this.position(event); }
    this.tokens--;
    if (!this.add(event, layers)) return null;
    this.onReward({ name, semitones: step }); return id;
  }
  start(name, params = {}, id = `stroke-${++this.nextId}`) {
    if (!this.allowed(name)) return null;
    if (this.events.has(id)) { this.update(id, params); return id; }
    if ([...this.events.values()].filter(e => e.sustained && !e.stopped).length >= LIMITS.sustained) return null;
    const layers = texture(name);
    if (!layers.length || this.sources+layers.length+2 > LIMITS.sources) return null;
    const p = parameters(params);
    const event = this.makeEvent(id, name, p, true, .85);
    if (!event) return null;
    // Only the first brush contact gets an impact. Updates never create sources.
    if (SOUNDS.find(s => s.id === name).group === 'Brushes') this.add(event, recipe(name, p).slice(0, 1).map(l => ({ ...l, gain: l.gain*.55 })));
    this.add(event, layers.map(l => ({ ...l, attack: .09, offset: Math.random()*.8,
      rate: l.rate*(.97+Math.random()*.06) })), true);
    const now = this.context.currentTime;
    for (const voice of event.voices) if (voice.end === Infinity && !ambience(name)) {
      // Sample-clock automation gives long strokes a gentle rising run with no
      // timer, no repeated impacts, and a maximum perfect fifth.
      LADDER.forEach((step, i) => voice.source.playbackRate.linearRampToValueAtTime(voice.rate*2**(step/12), now+.2+i*.8));
    }
    this.onReward({ name, semitones: 0 }); return id;
  }
  update(id, params = {}) {
    const event = this.events.get(id);
    if (!this.ready || !event || event.stopped) return;
    this.pending.set(id, { ...this.pending.get(id), ...params });
    if (!this.frame) this.frame = requestAnimationFrame(() => {
      for (const [key, p] of this.pending) {
        const e = this.events.get(key);
        if (e && !e.stopped) { e.p = parameters({ ...e.p, ...p }); this.position(e); }
      }
      this.pending.clear(); this.frame = 0;
    });
  }
  stop(id) {
    this.pending.delete(id);
    const event = this.events.get(id);
    if (!event || event.stopped) return;
    event.stopped = true;
    const now = this.context.currentTime;
    slew(event.gain.gain, 0, now, .025);
    for (const v of event.voices) { try { v.source.stop(now+.13); } catch {} }
    if (!event.voices.size) this.remove(event);
  }
  stopAll() {
    this.generation++; this.pending.clear();
    globalThis.cancelAnimationFrame?.(this.frame); this.frame = 0;
    for (const id of this.events.keys()) this.stop(id);
    this.runs.clear();
  }
  setDistance(distance) {
    this.distance = clamp(distance, 0, 8);
    if (this.context) for (const e of this.events.values()) if (!e.stopped) this.position(e);
  }
  setSettings(settings) {
    this.settings = { ...this.settings, ...settings, volume: clamp(settings.volume ?? this.settings.volume) };
    if (this.graph) slew(this.graph.master.gain, this.settings.enabled ? this.settings.volume : 0, this.context.currentTime, .015);
    if (!this.settings.enabled) this.stopAll();
    if (!this.settings.ambience) for (const e of this.events.values()) if (ambience(e.name)) this.stop(e.id);
  }
  pause() {
    this.stopAll(); this.paused = true; clearTimeout(this.pauseTimer);
    this.pauseTimer = setTimeout(() => { if (this.paused) this.context?.suspend().catch(() => {}); }, 160);
    this.onState('Paused');
  }
  async dispose() {
    if (this.disposed) return;
    this.disposed = true; this.stopAll(); clearTimeout(this.pauseTimer);
    globalThis.document?.removeEventListener('visibilitychange', this.visibility);
    await this.context?.close().catch(() => {});
    for (const e of this.events.values()) { for (const v of e.voices) { v.source.onended = null; v.disconnect(); } this.remove(e); }
    this.sources = 0; this.graph?.disconnect(); this.bank = null;
  }
}
