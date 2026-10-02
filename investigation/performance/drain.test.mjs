import {test} from 'node:test';
import assert from 'node:assert/strict';
import {protectDrain} from './drain.mjs';
const wait=()=>new Promise(resolve=>setTimeout(resolve,20));
test('intentional browser closure may reject before cleanup awaits the drain',async()=>{
  const unhandled=[];const listener=error=>unhandled.push(error);
  process.on('unhandledRejection',listener);
  try{
    const drain=protectDrain(Promise.reject(new Error('page closed')),()=>true,()=>assert.fail('intentional abort is not a new capture fault'));
    await wait();await drain;assert.deepEqual(unhandled,[]);
  }finally{process.off('unhandledRejection',listener)}
});
test('unexpected capture failure is preserved without an early unhandled rejection',async()=>{
  const failures=[],error=new Error('readback failed');
  const drain=protectDrain(Promise.reject(error),()=>false,e=>failures.push(e));
  await wait();await assert.rejects(drain,e=>e===error);assert.deepEqual(failures,[error]);
});
