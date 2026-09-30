import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
export const HERE = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(HERE, '../..');
export const LOCAL = resolve(HERE, 'local');
export const require = createRequire(import.meta.url);
export const deps = createRequire(resolve(process.env.DGM_DEPS ?? HERE, 'package.json'));
export const hash = b => createHash('sha256').update(b).digest('hex');
export const bytes = a => Buffer.from(a.buffer, a.byteOffset, a.byteLength);
export function sameArray(a, b, label) {
  assert.equal(a.constructor.name, b.constructor.name, label + ' type');
  assert.equal(a.byteLength, b.byteLength, label + ' length');
  if (!bytes(a).equals(bytes(b))) {
    for (let i = 0; i < a.length; i++) if (!Object.is(a[i], b[i]))
      assert.fail(`${label}[${i}]: ${a[i]} !== ${b[i]}`);
    assert.fail(label + ': byte mismatch');
  }
}
export function sameSim(a, b, label) {
  for (const key of ['D', 'C', 'Dold', 'out']) sameArray(a[key], b[key], label + ' ' + key);
  sameArray(a.saturation(), b.saturation(), label + ' saturation');
  assert.equal(a.ticks, b.ticks, label + ' ticks');
  assert.ok(Object.is(a.volume(), b.volume()), label + ' volume');
  sameArray(a.seepOn, b.seepOn, label + ' seep hysteresis');
}
export function sameWater(a, b, label) {
  for (const key of ['depth', 'contamination', 'sat', 'out']) {
    if (a[key] || b[key]) sameArray(a[key], b[key], label + ' ' + key);
  }
  for (const key of ['settled', 'ticks', 'steadyTicks', 'preview', 'stale']) assert.equal(a[key], b[key], label + ' ' + key);
}
export function json(path, value) {
  mkdirSync(dirname(path), {recursive: true});
  writeFileSync(path, JSON.stringify(value, null, 2) + '\n');
}
export function api(variant = 'baseline') { return require(resolve(LOCAL, `${variant}.cjs`)); }
export function fixtures() {
  return JSON.parse(deps('fflate').strFromU8(deps('fflate').gunzipSync(readFileSync(resolve(ROOT, 'tests/golden/water.json.gz'))))).fixtures;
}
export function model(f) {
  return {W:f.W, H:f.H, floor:Float64Array.from(f.floor), dam:f.dam ? Float64Array.from(f.dam) : null, emitters:structuredClone(f.emitters)};
}
export const arg = (name, fallback) => {
  const i = process.argv.indexOf('--' + name);
  return i < 0 ? fallback : process.argv[i + 1];
};
