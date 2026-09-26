import { JuiceSynth } from './synth.js';

class JuiceProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.synth = new JuiceSynth(sampleRate, options.processorOptions?.seed);
    this.lastReport = 0;
    this.port.onmessage = ({ data: m }) => {
      switch (m.type) {
        case 'play': this.synth.play(m.name, m.params, m.id, m.phase); break;
        case 'start': this.synth.start(m.name, m.params, m.id); break;
        case 'update': this.synth.update(m.id, m.params); break;
        case 'stop': this.synth.stop(m.id); break;
        case 'stopAll': this.synth.stopAll(); break;
        case 'settings': this.synth.settings(m.settings); break;
        case 'camera': this.synth.setCamera(m.distance); break;
      }
    };
  }
  process(inputs, outputs) {
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
registerProcessor('dgm-juice', JuiceProcessor);
