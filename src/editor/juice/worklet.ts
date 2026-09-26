// The editor's sounds play here, in an AudioWorklet (off the page's thread): the synthesiser renders
// every block, and the page sends it what to play (engine.ts). Ported from investigation/juice
// `worklet.js` (PR #58).

import { JuiceSynth } from "./synth";

// (the worklet's own globals: this file only ever runs in an AudioWorkletGlobalScope)
declare const sampleRate: number;
declare function registerProcessor(name: string, ctor: unknown): void;
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
  constructor(options?: unknown);
}

class JuiceProcessor extends AudioWorkletProcessor {
  private synth: JuiceSynth;
  private lastReport = 0;

  constructor(options: { processorOptions?: { seed?: number } }) {
    super();
    this.synth = new JuiceSynth(sampleRate, options.processorOptions?.seed);
    this.port.onmessage = ({ data: m }) => {
      switch (m.type) {
        case "play":
          this.synth.play(m.name, m.params, m.id, m.phase);
          break;
        case "start":
          this.synth.start(m.name, m.params, m.id);
          break;
        case "update":
          this.synth.update(m.id, m.params);
          break;
        case "stop":
          this.synth.stop(m.id);
          break;
        case "stopAll":
          this.synth.stopAll();
          break;
        case "settings":
          this.synth.settings(m.settings);
          break;
        case "camera":
          this.synth.setCamera(m.distance);
          break;
      }
    };
  }

  process(_inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const [left, right] = outputs[0];
    this.synth.render(left, right);
    if (this.synth.clock - this.lastReport >= sampleRate) {
      this.lastReport = this.synth.clock;
      this.port.postMessage({ active: this.synth.activeCount, peak: this.synth.peak, dropped: this.synth.dropped });
      this.synth.peak = 0;
    }
    return true;
  }
}

registerProcessor("dgm-juice", JuiceProcessor);
