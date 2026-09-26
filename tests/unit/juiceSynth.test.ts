// The editor's synthesised sounds (D205, D212, D220), from investigation/juice's numeric checks (#58):
// every sound is audible, finite, varied, quiet by default, and ends; distance softens it; bigger
// events are louder; a long stroke stays one continuous texture; storms of events stay bounded and
// below full scale; a cancelled force never sounds later; off and zero volume are silent.

import { describe, expect, it } from "vitest";
import { JuiceSynth, MAX_VOICES, SOUNDS, SYNTH_DEFAULTS } from "../../src/editor/juice/synth";

function render(synth: JuiceSynth, seconds = 1) {
  const left = new Float32Array(128);
  const right = new Float32Array(128);
  let sum = 0;
  let peak = 0;
  let roughness = 0;
  let last = 0;
  let count = 0;
  for (let block = 0; block < Math.ceil((seconds * synth.rate) / 128); block++) {
    synth.render(left, right);
    for (let i = 0; i < left.length; i++) {
      if (!Number.isFinite(left[i]) || !Number.isFinite(right[i])) throw new Error("output not finite");
      peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]));
      sum += left[i] ** 2 + right[i] ** 2;
      roughness += (left[i] - last) ** 2;
      last = left[i];
      count++;
    }
  }
  return { rms: Math.sqrt(sum / (2 * count)), peak, brightness: roughness / (sum || 1) };
}

describe("the editor's synthesised sounds", () => {
  it("every sound is audible, finite, varied, quiet by default, and ends", () => {
    for (const [name] of SOUNDS) {
      const a = new JuiceSynth(48000, 41);
      const b = new JuiceSynth(48000, 95);
      expect(a.play(name), name).toBe(true);
      b.play(name);
      const first = render(a, 6.5);
      const second = render(b, 6.5);
      expect(first.peak, `${name} audible`).toBeGreaterThan(0.001);
      expect(first.peak, `${name} quiet`).toBeLessThan(0.2);
      expect(first.rms, `${name} varies`).not.toBe(second.rms);
      expect(a.activeCount, `${name} ends`).toBe(0);
    }
  });

  it("distance makes a sound quieter and softer; a bigger, stronger event is louder", () => {
    for (const name of ["raise", "tree", "carve", "erupt"]) {
      const a = new JuiceSynth(48000, 43);
      const b = new JuiceSynth(48000, 43);
      a.play(name, { distance: 0 });
      b.play(name, { distance: 1 });
      const near = render(a, 6);
      const far = render(b, 6);
      expect(far.rms, name).toBeLessThan(near.rms * 0.2);
      expect(far.brightness, name).toBeLessThan(near.brightness);
    }
    for (const name of ["raise", "craterize", "slide", "erupt"]) {
      const small = new JuiceSynth(48000, 9);
      const big = new JuiceSynth(48000, 9);
      small.play(name, { size: 0, strength: 0 });
      big.play(name, { size: 1, strength: 1 });
      expect(render(big, 7).rms, name).toBeGreaterThan(render(small, 7).rms * 4);
    }
  });

  it("a long stroke stays one continuous texture: starting it again only updates it", () => {
    const s = new JuiceSynth(48000, 18);
    s.start("raise", {}, "brush");
    const count = s.activeCount;
    for (let i = 0; i < 1000; i++) s.start("raise", { strength: i / 1000 }, "brush");
    expect(s.activeCount).toBe(count);
    expect(render(s, 2).rms).toBeGreaterThan(0.001);
    s.stop("brush");
    render(s, 0.3);
    expect(s.activeCount).toBe(0);
    expect(render(s, 0.2).peak).toBeLessThan(1e-8);
  });

  it("a storm of events stays bounded and below full scale", () => {
    const s = new JuiceSynth(48000, 55);
    s.settings({ volume: 1 });
    for (let i = 0; i < 10000; i++) {
      s.play("craterize", { size: 1, strength: 1 });
      s.start("erupt", { size: 1, strength: 1 }, `stroke-${i}`);
    }
    expect(s.dropped).toBeGreaterThan(0);
    expect(s.activeCount).toBeLessThanOrEqual(MAX_VOICES);
    const out = render(s, 4);
    expect(out.peak).toBeGreaterThan(0.1);
    expect(out.peak).toBeLessThan(0.821);
    s.stopAll();
    render(s, 0.5);
    expect(s.activeCount).toBe(0);
  });

  it("a cancelled force never sounds later; its phases play when the force says", () => {
    const s = new JuiceSynth();
    s.play("craterize", {}, "force-1");
    render(s, 0.1);
    s.stop("force-1");
    render(s, 0.4);
    expect(s.activeCount).toBe(0);
    expect(render(s, 3).peak).toBeLessThan(1e-8);
    const t = new JuiceSynth();
    t.play("craterize", {}, "impact", "incoming");
    render(t, 1.2);
    expect(t.activeCount).toBe(0);
    t.play("craterize", {}, "impact", "impact");
    expect(render(t, 2).peak).toBeGreaterThan(0.005);
  });

  it("off, zero volume and nonsense are silent; ambience is off by default", () => {
    expect(SYNTH_DEFAULTS.ambience).toBe(false);
    const s = new JuiceSynth();
    s.play("erupt");
    render(s, 0.1);
    s.settings({ enabled: false });
    render(s, 0.5);
    expect(s.play("raise")).toBe(false);
    expect(s.start("raise")).toBe(false);
    expect(render(s, 1).peak).toBeLessThan(1e-8);
    s.settings({ enabled: true, volume: 0 });
    expect(s.play("raise")).toBe(false);
    s.settings({ volume: 1 });
    expect(s.play("unknown")).toBe(false);
    s.play("tree", { size: NaN, strength: Infinity, distance: -50 });
    expect(render(s, 1).peak).toBeLessThan(0.821);
  });
});
