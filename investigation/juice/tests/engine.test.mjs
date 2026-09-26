import test from 'node:test';
import assert from 'node:assert/strict';
import { JuiceEngine } from '../engine.js';

// Transport-only fake: real AudioWorklet creation/output is checked by checks.html.
const listeners = new Set();
globalThis.document = { addEventListener: (_, cb) => listeners.add(cb), removeEventListener: (_, cb) => listeners.delete(cb) };
const frames = new Map(); let frameId = 0;
globalThis.requestAnimationFrame = cb => { frames.set(++frameId, cb); return frameId; };
globalThis.cancelAnimationFrame = id => frames.delete(id);
function connected() {
  const e = new JuiceEngine(), messages = [];
  e.context = { state: 'running', close: async () => { e.context.state = 'closed'; } };
  e.node = { port: { postMessage: m => messages.push(m) }, disconnect() {} };
  return { e, messages };
}
test('pre-interaction events are dropped without creating a context', async () => {
  const e = new JuiceEngine();
  assert.equal(e.context, null); assert.equal(e.play('tree'), null); assert.equal(e.start('raise'), null);
  assert.equal(e.context, null); await e.dispose(); await e.dispose();
});
test('pointer event storms coalesce and stop clears pending updates', async () => {
  const { e, messages } = connected(); e.start('raise', {}, 'paint');
  for(let i = 0; i < 10000; i++) e.update('paint', { size: i / 10000 });
  assert.equal(e.pending.size, 1); assert.equal(frames.size, 1);
  assert.equal(messages.length, 1);
  e.stop('paint'); assert.equal(e.pending.size, 0);
  e.stopAll(); assert.equal(frames.size, 0); await e.dispose();
});
test('sustained starts and one-shot message bursts are bounded', async () => {
  const { e, messages } = connected();
  for(let i = 0; i < 1000; i++) e.start('raise', {}, `stroke-${i}`);
  assert.equal(messages.length, 4);
  for(let i = 0; i < 1000; i++) e.play('tree');
  assert.ok(messages.length < 20, 'no unbounded MessagePort backlog');
  e.stop('stroke-0'); assert.equal(e.start('stream', {}, 'water'), 'water');
  e.stopAll(); assert.equal(e.sustained.size, 0); await e.dispose();
});
test('mute stops active groups and dispose removes lifecycle listeners', async () => {
  const { e, messages } = connected(); e.start('carve', {}, 'run');
  e.setSettings({ enabled: false });
  assert.equal(e.sustained.size, 0); assert.equal(messages.at(-1).type, 'stopAll');
  assert.equal(e.play('erupt'), null);
  await e.dispose(); await e.dispose(); assert.equal(e.ready, false);
  assert.equal(listeners.size, 0);
});
