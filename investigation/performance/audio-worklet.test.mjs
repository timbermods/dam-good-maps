import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
test('capture keeps silence and separates genuinely nonadjacent output quanta', () => {
  const packets = [];
  let Processor;
  const context = { sampleRate: 1024, currentFrame: 0, Float32Array,
    AudioWorkletProcessor: class { constructor() { this.port = { postMessage: p => packets.push(p) }; } },
    registerProcessor: (_name, ctor) => { Processor = ctor; } };
  runInNewContext(readFileSync(new URL('./audio-worklet.js', import.meta.url), 'utf8'), context);
  const tap = new Processor(); tap.port.onmessage({ data: { record: true } });
  tap.process([], [[new Float32Array(128)]]);
  context.currentFrame = 128;
  tap.process([[new Float32Array(128).fill(0.5)]], [[new Float32Array(128)]]);
  context.currentFrame = 512;
  tap.process([[new Float32Array(128).fill(-0.5)]], [[new Float32Array(128)]]);
  tap.port.onmessage({ data: { record: false } });
  assert.equal(packets.length, 2);
  assert.equal(packets[0].frame, 0); assert.equal(packets[0].pcm.length, 256);
  assert.ok(packets[0].pcm.slice(0, 128).every(x => x === 0));
  assert.ok(packets[0].pcm.slice(128).every(x => x === 0.5));
  assert.equal(packets[1].frame, 512); assert.equal(packets[1].pcm.length, 128);
});
