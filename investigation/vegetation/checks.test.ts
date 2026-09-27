import { test } from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { writeFileSync, mkdirSync } from 'node:fs';
import { PerspectiveCamera, ShaderMaterial } from 'three';
import { entityView } from '../../src/render3d/model';
import { F } from '../../src/core/format/json';
import { tree, entityJson } from '../../src/core/format/entities';
import { modelTriangles } from '../../src/render3d/entities3d';
import { growthOf, progressOf } from './growth';
import { model, placement, species, growthScale } from './models';
import { Forest } from './forest';

test('all models have finite geometry; far meshes reduce real submitted triangles', () => {
  for (const s of species) for (const dead of [false, true]) for (let v = 0; v < 3; v++) {
    const near = model(s, v, 'near', dead), far = model(s, v, 'far', dead);
    for (const g of [near, far]) {
      for (const name of ['position', 'normal', 'region', 'pcolor']) assert.ok([...g.getAttribute(name).array].every(Number.isFinite), `${s} ${name}`);
      assert.ok(g.boundingBox!.max.y > 0.2); assert.ok(g.boundingBox!.min.y > -0.015);
    }
    assert.ok(far.getAttribute('position').count <= near.getAttribute('position').count);
    if (!dead) assert.ok(far.getAttribute('position').count < near.getAttribute('position').count / 2);
    near.dispose(); far.dispose();
  }
});
test('mature variants differ in geometry, independent of instance rotation', () => {
  for (const s of species) {
    const values = [0, 1, 2].map(v => { const g = model(s, v); const a = JSON.stringify([...g.getAttribute('position').array]); g.dispose(); return a; });
    assert.equal(new Set(values).size, 3, s);
  }
});
test('every tile on 256² keeps its trunk base inside its own tile, with deterministic variation', () => {
  const phases = new Set<number>();
  for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
    const p = placement(x, y); assert.deepEqual(p, placement(x, y));
    assert.ok(Math.abs(p.dx) + 0.14 * p.scale < 0.5); assert.ok(Math.abs(p.dz) + 0.14 * p.scale < 0.5);
    phases.add(Math.round(p.phase * 1000));
  }
  assert.ok(phases.size > 5000);
});
test('stored JsonFloat growth survives input reordering, zero and mature defaults', () => {
  assert.equal(progressOf({ Growable: { GrowthProgress: F(0) } }), 0);
  assert.equal(progressOf({}), 1);
  const entities = [0.1, 0.4, 0.75, 1].map((growth, x) => entityJson(tree({ id: `${x}`, owner: 'test', x, y: 2, z: 3, species: 'Pine', growth })));
  const view = entityView([3, 0, 2, 1].map(x => ({ template: 'Pine', x, y: 2, z: 3, owner: 'test', orientation: 'Cw0', young: x !== 3 })));
  const g = growthOf(view, entities); assert.ok(Math.abs(g[1] - 0.1) < 1e-6); assert.ok(Math.abs(g[3] - 0.4) < 1e-6); assert.equal(g[0], 1);
  assert.ok(growthScale(0.1) < growthScale(0.4)); assert.ok(growthScale(0.4) < growthScale(1) * 0.6);
});
test('LOD partitions every entity exactly once; laptop mode removes detail; offscreen trees stay cheap', () => {
  const view = entityView(Array.from({ length: 1000 }, (_, i) => ({ template: species[i % 4], x: i % 50, y: Math.floor(i / 50), z: 0, orientation: 'Cw0', owner: 'test', dead: i % 13 === 0 })));
  const mat = new ShaderMaterial(), f = new Forest(view, undefined, mat), camera = new PerspectiveCamera(40, 1.5, 0.1, 1000);
  camera.position.set(25, 9, -3); camera.lookAt(25, 0, -10); camera.updateProjectionMatrix(); f.update(camera, 530);
  const count = () => f.batches.reduce((n, b) => n + b.mesh.count, 0);
  const ids = f.batches.flatMap(b => [...b.mesh.userData.objects.slice(0, b.mesh.count)]);
  assert.equal(count(), 1000); assert.equal(new Set(ids).size, 1000); assert.ok(f.stats.near > 0 && f.stats.far > 0);
  f.low = true; f.update(camera, 530); assert.equal(f.stats.near, 0); assert.equal(count(), 1000);
  f.low = false; camera.position.set(200, 200, 200); camera.lookAt(25, 0, -10); f.update(camera, 530); assert.equal(f.stats.near, 0);
  f.dispose(); mat.dispose();
});
test('CPU cost and geometry budgets for 52,224 trees (not a GPU benchmark)', () => {
  const view = entityView(Array.from({ length: 52224 }, (_, i) => ({ template: species[i % 3], x: i % 256, y: Math.floor(i / 256), z: 3, orientation: 'Cw0', owner: 'stress' })));
  const mat = new ShaderMaterial(), start = performance.now(), f = new Forest(view, undefined, mat), buildMs = performance.now() - start;
  const cam = new PerspectiveCamera(40, 1500 / 530, 0.1, 2000); cam.position.set(120, 10, -120); cam.lookAt(130, 3, -130); cam.updateProjectionMatrix();
  const times = [];
  for (let i = 0; i < 20; i++) { cam.position.x += 0.1; const t = performance.now(); f.update(cam, 530); times.push(performance.now() - t); }
  const geometry = species.map(s => { const near = model(s), far = model(s, 0, 'far'); const row = { species: s, today: modelTriangles(s), near: near.getAttribute('position').count / 3, far: far.getAttribute('position').count / 3 }; near.dispose(); far.dispose(); return row; });
  times.sort((a, b) => a - b);
  mkdirSync('out', { recursive: true }); writeFileSync('out/cpu-cost.json', JSON.stringify({ node: process.version, platform: process.platform, count: view.count, buildMs, lodP50: times[10], lodP95: times[19], stats: f.stats, geometry }, null, 2) + '\n');
  assert.equal(f.stats.plants, 52224); assert.ok(f.stats.draws <= 12); f.dispose(); mat.dispose();
});
