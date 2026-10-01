import {test} from 'node:test';
import assert from 'node:assert/strict';
import {trialTasks,alreadyInTrial,runOutcome} from './trial-plan.mjs';
test('trial covers five paired repeats in both looks and counts only matching core work',()=>{
  const tasks=trialTasks();assert.equal(tasks.length,20);
  assert(tasks.every(t=>t.size===256&&t.browser==='edge'&&t.profile==='native'&&t.id==='craterize-fast'));
  for(const look of ['standard','high'])for(const phase of ['before','after'])assert.deepEqual(tasks.filter(t=>t.look===look&&t.phase===phase).map(t=>t.repeat),[1,2,3,4,5]);
  assert(tasks.every(alreadyInTrial));
  assert(!alreadyInTrial({...tasks[0],profile:'laptop'}));
  assert(!alreadyInTrial({...tasks[0],mode:'capture'}));
});
test('trial qualification retains measured hitches and stops on missing, failed or busy evidence',()=>{
  assert.equal(runOutcome(0,[{status:'complete',qualified:true,summary:{hitches:[{}]}}]),'complete');
  assert.equal(runOutcome(0,[{status:'complete',qualified:false}]),'error');
  assert.equal(runOutcome(0,[]),'error');
  assert.equal(runOutcome(2,[{status:'invalid-busy',qualified:false}]),'busy');
});
