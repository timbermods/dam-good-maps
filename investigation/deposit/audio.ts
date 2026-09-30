// Existing CC0 recordings. See ATTRIBUTION.md; no copied or generated samples.
const urls = [
  new URL("../juice-2/audio/earth-bed.mp3", import.meta.url),
  new URL("../juice-2/audio/earth-b.mp3", import.meta.url),
  new URL("../juice-2/audio/waterfall.mp3", import.meta.url)
];
export class Sound {
  private ctx: AudioContext | null = null;
  private buffers: AudioBuffer[] = [];
  private playing: AudioBufferSourceNode[] = [];
  private rush: GainNode | null = null;
  async unlock(): Promise<void> {
    this.ctx ??= new AudioContext();
    await this.ctx.resume();
    if (!this.buffers.length) this.buffers = await Promise.all(urls.map(async url => this.ctx!.decodeAudioData(await (await fetch(url)).arrayBuffer())));
  }
  play(k: number, rate: number, gain: number): void {
    if (!this.ctx || !this.buffers[k]) return;
    const s = this.ctx.createBufferSource(), g = this.ctx.createGain(), low = this.ctx.createBiquadFilter();
    s.buffer = this.buffers[k]; s.playbackRate.value = rate; low.type = "lowpass"; low.frequency.value = k === 0 ? 2600 : 600;
    g.gain.value = gain; s.connect(low).connect(g).connect(this.ctx.destination); s.start(); this.playing.push(s);
  }
  arrive(): void {
    this.stop(); this.play(0, .82, .20);
    if (!this.ctx || !this.buffers[2]) return;
    const s = this.ctx.createBufferSource(), g = this.ctx.createGain(), low = this.ctx.createBiquadFilter();
    s.buffer = this.buffers[2]; s.loop = true; s.playbackRate.value = .85;
    low.type = "lowpass"; low.frequency.value = 1400;
    g.gain.setValueAtTime(0, this.ctx.currentTime); g.gain.linearRampToValueAtTime(.18, this.ctx.currentTime + .35);
    s.connect(low).connect(g).connect(this.ctx.destination); s.start(); this.playing.push(s); this.rush = g;
  }
  settle(): void { this.stop(); this.play(1, .65, .35); }
  stop(): void {
    const time = this.ctx?.currentTime ?? 0;
    this.rush?.gain.cancelScheduledValues(time); this.rush?.gain.setTargetAtTime(0, time, .07); this.rush = null;
    for (const s of this.playing) { try { s.stop(time + .25); } catch { /* already ended */ } } this.playing = [];
  }
}
