// Existing CC0 recordings. See ATTRIBUTION.md; no copied or generated samples.
const urls = [
  new URL("../juice-2/audio/crack-a.mp3", import.meta.url),
  new URL("../juice-2/audio/earth-bed.mp3", import.meta.url),
  new URL("../juice-2/audio/earth-b.mp3", import.meta.url)
];
export class Sound {
  private ctx: AudioContext | null = null;
  private buffers: AudioBuffer[] = [];
  private playing: AudioBufferSourceNode[] = [];
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
  crack(): void { this.stop(); this.play(0, .82, .65); this.play(1, .72, .25); }
  settle(): void { this.play(2, .48, .95); }
  stop(): void { for (const s of this.playing) { try { s.stop(); } catch { /* already ended */ } } this.playing = []; }
}
