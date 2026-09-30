// Capture-only output tap. The product's audio clock and destination remain unchanged.
class Capture extends AudioWorkletProcessor {
  constructor() {
    super(); this.chunks = []; this.samples = 0; this.first = 0; this.record = false;
    this.port.onmessage = e => { this.record = !!e.data.record; if (!this.record) this.flush(); };
  }
  flush() {
    if (!this.samples) return;
    const pcm = new Float32Array(this.samples);
    let offset = 0; for (const chunk of this.chunks) { pcm.set(chunk, offset); offset += chunk.length; }
    this.port.postMessage({ frame: this.first, rate: sampleRate, pcm }, [pcm.buffer]);
    this.chunks = []; this.samples = 0;
  }
  process(inputs, outputs) {
    const input = inputs[0]?.[0];
    if (this.record) {
      // Silence is part of the output timeline. Omitting empty input quanta manufactures gaps
      // and can concatenate nonadjacent audio into one block.
      if (this.samples && currentFrame !== this.first + this.samples) this.flush();
      if (!this.samples) this.first = currentFrame;
      const chunk = input ? input.slice() : new Float32Array(outputs[0]?.[0]?.length ?? 128);
      this.chunks.push(chunk); this.samples += chunk.length;
      if (this.samples >= sampleRate / 2) this.flush();
    }
    return true;
  }
}
registerProcessor('performance-capture', Capture);
