// The moment's sounds: recorded CC0 foley only (ATTRIBUTION.md lists each recording, its author and
// its source). A grinding wear under the whole moment, swelling with how much rock is going, and
// falling stone as the rubble lands. Quiet by default, with an off switch outside the force's row.

type Name = "granite" | "scrape" | "rocks" | "rockfall";
const FILES: Record<Name, string> = {
  granite: "audio/granite-mediaman57.mp3",
  scrape: "audio/scrape-vrymaa.mp3",
  rocks: "audio/rocks-adamgryu.mp3",
  rockfall: "audio/rockfall-iwanplays.mp3",
};

export class Sounds {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private buffers = new Map<Name, AudioBuffer>();
  private bed: { src: AudioBufferSourceNode; gain: GainNode; src2: AudioBufferSourceNode } | null = null;
  private lastLand = 0;
  private active = new Set<AudioBufferSourceNode>();
  private track(src: AudioBufferSourceNode): void {
    this.active.add(src); src.onended = () => this.active.delete(src);
  }
  /** A fresh gesture cancels every lingering sound from the previous one. */
  interrupt(): void {
    for (const src of this.active) { try { src.stop(); } catch { /* already stopped */ } }
    this.active.clear(); this.bed = null;
  }
  on = true;
  volume = 0.55;

  /** Must follow a user gesture (the browser's rule). */
  async wake(): Promise<void> {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
      await Promise.all(
        (Object.keys(FILES) as Name[]).map(async (k) => {
          try {
            const r = await fetch(FILES[k]);
            this.buffers.set(k, await this.ctx!.decodeAudioData(await r.arrayBuffer()));
          } catch {
            /* a sound that won't load is skipped */
          }
        }),
      );
    }
    if (this.ctx.state === "suspended") await this.ctx.resume();
  }

  /** The grinding wear starts: at once on pointer-down, before the rock is planned. */
  startWear(): void {
    if (!this.on || !this.ctx || this.bed) return;
    const a = this.buffers.get("scrape"), b = this.buffers.get("granite");
    if (!a) return;
    const ctx = this.ctx;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.gain.setTargetAtTime(0.35, ctx.currentTime, 0.05);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 2400;
    const src = ctx.createBufferSource();
    this.track(src);
    src.buffer = a;
    src.loop = true;
    src.playbackRate.value = 0.8 + Math.random() * 0.15;
    src.connect(lp);
    const src2 = ctx.createBufferSource();
    this.track(src2);
    if (b) {
      src2.buffer = b;
      src2.loop = true;
      src2.playbackRate.value = 0.55 + Math.random() * 0.1;
      const g2 = ctx.createGain();
      g2.gain.value = 0.6;
      src2.connect(g2).connect(lp);
      src2.start(ctx.currentTime, Math.random() * b.duration);
    }
    lp.connect(gain).connect(this.master!);
    src.start(ctx.currentTime, Math.random() * a.duration);
    this.bed = { src, gain, src2 };
  }

  /** How much rock is going now (0–1): the grind swells and deepens with it. */
  wear(level: number): void {
    if (!this.bed || !this.ctx) return;
    const t = this.ctx.currentTime;
    this.bed.gain.gain.setTargetAtTime(0.18 + 0.55 * Math.min(1, level), t, 0.12);
    this.bed.src.playbackRate.setTargetAtTime(0.72 + 0.2 * Math.min(1, level), t, 0.2);
  }

  stopWear(fade = 0.5): void {
    if (!this.bed || !this.ctx) return;
    const { src, gain, src2 } = this.bed;
    const t = this.ctx.currentTime;
    gain.gain.cancelScheduledValues(t);
    gain.gain.setTargetAtTime(0, t, fade / 3);
    src.stop(t + fade + 0.1);
    if (src2.buffer) src2.stop(t + fade + 0.1);
    this.bed = null;
  }

  /** Stone landing: a slice of a recorded rockfall, pitched by size, never more than ~12 a second. */
  land(hard: number): void {
    if (!this.on || !this.ctx) return;
    const now = this.ctx.currentTime;
    if (now - this.lastLand < 0.08) return;
    this.lastLand = now;
    const buf = this.buffers.get(Math.random() < 0.5 ? "rocks" : "rockfall");
    if (!buf) return;
    const src = this.ctx.createBufferSource();
    this.track(src);
    src.buffer = buf;
    src.playbackRate.value = 0.85 + Math.random() * 0.4;
    const g = this.ctx.createGain();
    const v = Math.min(0.5, 0.12 + hard * 0.04);
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(v, now + 0.01);
    g.gain.setTargetAtTime(0, now + 0.18, 0.12);
    src.connect(g).connect(this.master!);
    src.start(now, Math.random() * Math.max(0, buf.duration - 1), 0.8);
  }

  /** A heavier fall as the opening clears (the wear's peak). */
  collapse(): void {
    if (!this.on || !this.ctx) return;
    const buf = this.buffers.get("rockfall");
    if (!buf) return;
    const now = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    this.track(src);
    src.buffer = buf;
    src.playbackRate.value = 0.8 + Math.random() * 0.1;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.5, now);
    g.gain.setTargetAtTime(0, now + 1.2, 0.4);
    src.connect(g).connect(this.master!);
    src.start(now, 0, 2.4);
  }

  setOn(on: boolean): void {
    this.on = on;
    if (!on) this.stopWear(0.1);
  }
}
