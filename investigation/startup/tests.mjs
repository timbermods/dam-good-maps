import test from 'node:test';
import assert from 'node:assert/strict';
import { median, summary, traceCost } from './metrics.mjs';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

async function starter(load) {
  // Exercise the real adoption helper; substitute only its network dependency.
  const source=readFileSync(new URL('start.ts',import.meta.url),'utf8').replace('import { loadFirstVisit } from "./load";', 'const loadFirstVisit = globalThis.__startupLoad;');
  globalThis.__startupLoad=load;
  return (await import(`data:text/javascript;base64,${Buffer.from(ts.transpile(source,{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022})).toString('base64')}#${Math.random()}`)).startFirstVisit;
}

test('opening the map overlaps editor loading and preserves the exact bytes',async()=>{
  const bytes=new Uint8Array([7,8]);let releaseEditor;let opened=false;
  const start=await starter(async()=>({map:{id:'map'},project:bytes}));
  const result=start(()=>new Promise(r=>releaseEditor=r),async b=>{assert.equal(b,bytes);opened=true;return 'open';});
  await new Promise(r=>setTimeout(r,0));assert.ok(opened,'project must not wait for editor');
  releaseEditor('editor');assert.deepEqual(await result,{editor:'editor',opened:'open',map:{id:'map'}});
});
test('a missing fixture returns null without opening; worker failures propagate',async()=>{
  const absent=await starter(async()=>null);assert.equal(await absent(async()=>null,()=>{throw Error('must not open');}),null);
  const present=await starter(async()=>({map:{},project:new Uint8Array()}));
  await assert.rejects(present(async()=>null,async()=>{throw Error('cannot open');}),/cannot open/);
});

test('medians are independent of sample order, including an even sample',()=>{
  assert.equal(median([9,1,3]),3); assert.equal(median([5,1,3,9]),4);
  assert.deepEqual(summary([100,200,1000]),{median:200,worst:1000});
});
test('nested trace events are not counted twice; parallel thread CPU is counted',()=>{
  const e=(tid,ts,dur)=>({pid:1,tid,ts,dur,ph:'X',name:'CompileScript'});
  assert.equal(traceCost([e(1,0,10000),e(1,1000,5000),e(2,0,2000)],/Compile/),12);
});
test('thread clocks exclude paused compiler time',()=>{
  assert.equal(traceCost([{pid:1,tid:1,ts:0,dur:900000,tts:0,tdur:1000,ph:'X',name:'CompileScript'}],/Compile/),1);
});
test('before and after use the same release-checked project bytes',()=>{
  const index=JSON.parse(readFileSync(new URL('local/before/public/first-visit/index.json',import.meta.url)));
  assert.equal(index.maps.length,6);
  for(const map of index.maps) assert.deepEqual(readFileSync(new URL(`local/before/public/first-visit/${map.file}`,import.meta.url)),readFileSync(new URL(`local/after/public/first-visit/${map.file}`,import.meta.url)));
});
