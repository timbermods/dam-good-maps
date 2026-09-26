import test from 'node:test';
import assert from 'node:assert/strict';
import { JuiceSynth, SOUNDS, MAX_VOICES, DEFAULTS } from '../synth.js';

function render(synth, seconds = 1) {
  const left = new Float32Array(128), right = new Float32Array(128);
  let sum = 0, peak = 0, roughness = 0, last = 0, count = 0;
  for(let block = 0; block < Math.ceil(seconds * synth.rate / 128); block++) {
    synth.render(left, right);
    for(let i = 0; i < left.length; i++) {
      assert.ok(Number.isFinite(left[i]) && Number.isFinite(right[i]), 'finite output');
      peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]));
      sum += left[i] ** 2 + right[i] ** 2;
      roughness += (left[i] - last) ** 2; last = left[i]; count++;
    }
  }
  return { rms: Math.sqrt(sum / (2 * count)), peak, brightness: roughness / (sum || 1) };
}
test('every sound is audible, finite, varied and ends at 44.1 and 48 kHz', () => {
  for(const rate of [44100, 48000]) for(const [name] of SOUNDS) {
    const a = new JuiceSynth(rate, 41), b = new JuiceSynth(rate, 95);
    assert.equal(a.play(name), true, name);
    b.play(name);
    const first = render(a, 6.5), second = render(b, 6.5);
    assert.ok(first.peak > 0.001, `${name} audible`);
    assert.ok(first.peak < 0.2, `${name} quiet default: ${first.peak}`);
    assert.notEqual(first.rms, second.rms, `${name} variation`);
    assert.equal(a.activeCount, 0, `${name} tail released`);
  }
});
test('distance reduces both loudness and high frequency content', () => {
  for(const name of ['raise', 'tree', 'ruin', 'water', 'carve', 'erupt', 'waterfall']) {
    const a = new JuiceSynth(48000, 43), b = new JuiceSynth(48000, 43);
    a.play(name, { distance: 0 }); b.play(name, { distance: 1 });
    const near = render(a, 6), far = render(b, 6);
    assert.ok(far.rms < near.rms * 0.2, `${name} quieter`);
    assert.ok(far.brightness < near.brightness, `${name} softer`);
  }
});
test('small and weak events are lighter than large powerful ones', () => {
  for(const name of ['raise', 'mine', 'craterize', 'slide', 'erupt']) {
    const small = new JuiceSynth(48000, 9), big = new JuiceSynth(48000, 9);
    small.play(name, { size: 0, strength: 0 }); big.play(name, { size: 1, strength: 1 });
    assert.ok(render(big, 7).rms > render(small, 7).rms * 4, name);
  }
});
test('a long paint stroke stays continuous; repeated begin updates do not stack', () => {
  const s = new JuiceSynth(48000, 18);
  s.start('raise', {}, 'brush'); const count = s.activeCount;
  for(let i = 0; i < 1000; i++) s.start('raise', { strength: i / 1000 }, 'brush');
  assert.equal(s.activeCount, count);
  const a = render(s, 2), b = render(s, 2);
  assert.ok(a.rms > 0.001 && b.rms > 0.001);
  assert.notEqual(a.rms, b.rms);
  s.stop('brush'); render(s, 0.3); assert.equal(s.activeCount, 0);
  assert.ok(render(s, 0.2).peak < 1e-8);
});
test('four sustained groups and total voices are bounded under a storm of events', () => {
  const s = new JuiceSynth(48000, 55); s.settings({ volume: 1 });
  for(let i = 0; i < 10000; i++) {
    s.play('craterize', { size: 1, strength: 1 });
    s.start('erupt', { size: 1, strength: 1 }, `stroke-${i}`);
  }
  assert.ok(s.dropped > 0);
  assert.ok(s.activeCount <= MAX_VOICES);
  const result = render(s, 4);
  assert.ok(result.peak > 0.1 && result.peak < 0.821, `limited output ${result.peak}`);
  s.stopAll(); render(s, 0.5); assert.equal(s.activeCount, 0);
});
test('cancellation removes scheduled impact/debris and never resumes it', () => {
  const s = new JuiceSynth(); s.play('craterize', {}, 'force-1');
  render(s, 0.1); s.stop('force-1'); render(s, 0.4);
  assert.equal(s.activeCount, 0);
  assert.ok(render(s, 3).peak < 1e-8);
});
test('phase API lets the force clock choose when impact and cooling happen', () => {
  const s = new JuiceSynth();
  s.play('craterize', {}, 'impact', 'incoming'); render(s, 1.2);
  assert.equal(s.activeCount, 0);
  assert.equal(render(s, 0.8).peak < 1e-8, true);
  s.play('craterize', {}, 'impact', 'impact'); assert.ok(render(s, 2).peak > 0.005);
  s.play('erupt', {}, 'eruption', 'cool'); assert.ok(render(s, 3).peak > 0.001);
});
test('off, zero volume, malformed inputs, repeated stop and fresh defaults', () => {
  const s = new JuiceSynth(); assert.equal(DEFAULTS.ambience, false);
  s.play('erupt'); render(s, 0.1); s.settings({ enabled: false });
  s.stopAll(); s.stopAll(); render(s, 0.5);
  assert.equal(s.play('raise'), false);
  assert.equal(s.start('raise'), false);
  assert.ok(render(s, 1).peak < 1e-8);
  s.settings({ enabled: true, volume: 0 }); assert.equal(s.play('raise'), false);
  s.settings({ volume: 1 }); assert.equal(s.play('unknown'), false);
  s.play('tree', { size: NaN, strength: Infinity, distance: -50, pan: 'bad' });
  assert.ok(render(s, 1).peak < 0.821);
});
test('live distance and activity changes smoothly silence an ongoing texture', () => {
  const s = new JuiceSynth(); s.start('carve', {}, 'water');
  const near = render(s, 1); s.setCamera(1); render(s, 0.3);
  assert.ok(render(s, 1).rms < near.rms * 0.25);
  s.update('water', { activity: 0 }); render(s, 0.5);
  assert.ok(render(s, 0.4).peak < 1e-7);
});
test('a texture restarts while its previous release is still fading', () => {
  const s = new JuiceSynth(); s.start('stream', {}, 'water'); render(s, 0.2);
  s.stop('water'); render(s, 0.02); s.start('stream', {}, 'water');
  render(s, 0.3);
  assert.equal(s.activeCount, 1);
  assert.ok(render(s, 0.5).rms > 0.0001);
  s.stopAll(); render(s, 0.2); assert.equal(s.activeCount, 0);
});
