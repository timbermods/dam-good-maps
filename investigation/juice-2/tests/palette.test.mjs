import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { SOUNDS, recipe, texture, RewardRuns, spatial, parameters } from '../palette.js';
import { createServer } from '../server.mjs';

test('every recipe uses a traceable, intact recording; the bank stays small', async () => {
  const manifest=JSON.parse(await readFile(new URL('../bank.json',import.meta.url)));
  const ids=new Set(manifest.map(x=>x.id));
  let bytes=0;
  for(const file of manifest) {
    const url=new URL(`../${file.file}`,import.meta.url), data=await readFile(url);
    bytes+=(await stat(url)).size;
    assert.equal(createHash('sha256').update(data).digest('hex'),file.sha256);
    assert.ok(file.sources.length&&file.provenance);
  }
  assert.ok(bytes<2_000_000);
  assert.equal(SOUNDS.length,21);
  for(const sound of SOUNDS) for(let i=0;i<20;i++) {
    const layers=recipe(sound.id,{size:i/20,strength:i/20});
    assert.ok(layers.length>0&&layers.length<=16);
    for(const layer of [...layers,...texture(sound.id)]) {
      assert.ok(ids.has(layer.sample),layer.sample);
      assert.ok(Number.isFinite(layer.rate)&&layer.rate>0&&layer.rate<3);
      assert.ok(Number.isFinite(layer.gain)&&layer.gain>0);
    }
  }
});
test('reward runs cap at a fifth, reset after a pause, and separate actions', () => {
  const runs=new RewardRuns();
  assert.deepEqual([0,.2,.4,.6,.8].map(t=>runs.next('tree',t)),[0,2,4,7,7]);
  assert.equal(runs.next('berry',.9),0);
  assert.equal(runs.next('tree',1.7),0);
  runs.clear(); assert.equal(runs.next('tree',1.8),0);
});
test('force phases have independent real-event hooks and audible material', () => {
  for(const [name, phases] of [['craterize',['incoming','impact','debris']],['erupt',['rumble','plume','cool']]]) {
    for(const phase of phases) {
      const layers=recipe(name,{}, {phase});
      assert.ok(layers.length); assert.ok(Math.min(...layers.map(l=>l.delay))<.04);
    }
  }
});
test('distance reduces gain and brightness; invalid inputs stay bounded', () => {
  const near=spatial(parameters({})), far=spatial(parameters({distance:2}));
  assert.ok(far.gain<near.gain/5&&far.cutoff<near.cutoff/5);
  for(const value of [NaN,Infinity,-100,100]) {
    const p=parameters({size:value,strength:value,pan:value,distance:value});
    assert.ok(Object.values(p).every(Number.isFinite));
    assert.ok(spatial(p).gain>=0);
  }
});
test('local server serves the A/B modules but never arbitrary repository files', async () => {
  const server=createServer(); await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try {
    const base=`http://127.0.0.1:${server.address().port}`;
    for(const path of ['/','/engine.js','/audio/wood-a.mp3','/round-one/engine.js','/round-one/synth.js']) assert.equal((await fetch(base+path)).status,200,path);
    for(const path of ['/package.json','/local/sources/explosion.mp3','/round-one/../../CLAUDE.md','/%2e%2e%2fCLAUDE.md','/audio/../bank-secret.json']) assert.equal((await fetch(base+path)).status,404,path);
    assert.equal((await fetch(base+'/',{method:'POST'})).status,405);
  } finally { await new Promise(resolve=>server.close(resolve)); }
});
