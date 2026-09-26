import { DEFAULTS } from './synth.js';

export class JuiceEngine {
  constructor({ onState = () => {}, onMeter = () => {}, settings = {} } = {}) {
    this.settings = { ...DEFAULTS, ...settings };
    this.onState = onState; this.onMeter = onMeter;
    this.context = null; this.node = null; this.loading = null; this.disposed = false;
    this.nextId = 0; this.pending = new Map(); this.frame = 0;
    this.distance = 0;
    this.accentTokens = 8; this.tokenTime = performance.now();
    this.sustained = new Set();
    this.suspended = false;
    this.visibility = () => { if (document.hidden) this.pause(); };
    document.addEventListener('visibilitychange', this.visibility);
  }
  // Call synchronously inside a trusted pointer/key handler. No context at import
  // or construction time; editor events before readiness are simply discarded.
  unlock() {
    if (this.disposed) return Promise.resolve(false);
    if (this.context) {
      this.suspended = false;
      return this.context.resume().then(() => this.loading ?? !!this.node).catch(() => false);
    }
    const AudioContext = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AudioContext) { this.onState('Audio is unavailable in this browser.'); return Promise.resolve(false); }
    try {
      this.context = new AudioContext({ latencyHint: 'interactive' });
      const resumed = this.context.resume();
      this.onState('Warming up…');
      this.loading = Promise.all([resumed, this.context.audioWorklet.addModule(new URL('./worklet.js', import.meta.url))])
        .then(() => {
          if (this.disposed) return false;
          this.node = new AudioWorkletNode(this.context, 'dgm-juice', {
            numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2],
            processorOptions: { seed: (Math.random() * 4294967295) >>> 0 },
          });
          this.node.port.onmessage = e => this.onMeter(e.data);
          this.node.onprocessorerror = () => { this.pause(); this.onState('Audio stopped. Reload to try again.'); };
          this.node.connect(this.context.destination);
          this.send({ type: 'settings', settings: this.settings });
          this.send({ type: 'camera', distance: this.distance });
          this.onState(this.suspended ? 'Paused' : 'Ready');
          return true;
        }).catch(async () => {
          this.onState('Audio is unavailable. Try a current browser on localhost.');
          await this.context?.close().catch(() => {});
          this.context = null; this.node = null;
          return false;
        }).finally(() => { this.loading = null; });
      return this.loading;
    } catch {
      this.context?.close().catch(() => {}); this.context = null;
      this.onState('Audio could not start.'); return Promise.resolve(false);
    }
  }
  get ready() { return !!this.node && this.context?.state === 'running' && !this.suspended && !this.disposed; }
  send(message) { this.node?.port.postMessage(message); }
  play(name, params = {}, { id = ++this.nextId, phase } = {}) {
    if (!this.ready || !this.settings.enabled) return null;
    // Bound message traffic too, not just DSP voices. Drop excess accents now;
    // never replay a late burst after a busy main-thread frame.
    const now = performance.now();
    this.accentTokens = Math.min(8, this.accentTokens + (now - this.tokenTime) * 0.012);
    this.tokenTime = now;
    if (this.accentTokens < 1) return null;
    this.accentTokens--;
    this.send({ type: 'play', name, params, id, phase }); return id;
  }
  start(name, params = {}, id = `stroke-${++this.nextId}`) {
    if (!this.ready || !this.settings.enabled) return null;
    if (this.sustained.has(id)) { this.update(id, params); return id; }
    if (this.sustained.size >= 4) return null;
    this.sustained.add(id);
    this.send({ type: 'start', name, params, id }); return id;
  }
  update(id, params) {
    if (!this.ready || id == null) return;
    // Latest value wins. Bound work even if pointer input arrives at 1000 Hz.
    if (!this.pending.has(id) && this.pending.size >= 8) return;
    this.pending.set(id, params);
    if (!this.frame) this.frame = requestAnimationFrame(() => {
      for (const [key, value] of this.pending) this.send({ type: 'update', id: key, params: value });
      this.pending.clear(); this.frame = 0;
    });
  }
  stop(id) { this.pending.delete(id); this.sustained.delete(id); this.send({ type: 'stop', id }); }
  stopAll() {
    this.pending.clear(); cancelAnimationFrame(this.frame); this.frame = 0;
    this.sustained.clear();
    this.send({ type: 'stopAll' });
  }
  setSettings(settings) {
    this.settings = { ...this.settings, ...settings };
    this.send({ type: 'settings', settings: this.settings });
    if (!this.settings.enabled) this.stopAll();
  }
  setDistance(distance) { this.distance = distance; this.send({ type: 'camera', distance }); }
  pause() {
    this.stopAll(); this.suspended = true;
    // Let the 110 ms release finish before suspending. New interaction cancels it.
    clearTimeout(this.pauseTimer);
    this.pauseTimer = setTimeout(() => { if (this.suspended) this.context?.suspend(); }, 160);
    this.onState('Paused');
  }
  async dispose() {
    if (this.disposed) return;
    this.disposed = true; this.stopAll(); clearTimeout(this.pauseTimer);
    document.removeEventListener('visibilitychange', this.visibility);
    this.node?.disconnect(); await this.context?.close().catch(() => {}); this.node = null;
  }
}
