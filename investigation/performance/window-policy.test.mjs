import { test } from 'node:test';
import assert from 'node:assert/strict';
import { phaseAt, minute, quietEvidence } from './window-policy.mjs';
test('late failed qualification falls back to shorter cases until the deadline', () => {
  const start = 0, end = 120 * minute;
  assert.equal(phaseAt(49 * minute, start, end), 'short');
  assert.equal(phaseAt(51 * minute, start, end), 'hour');
  assert.equal(phaseAt(56 * minute, start, end), 'short');
  assert.equal(phaseAt(119 * minute, start, end), 'short');
  assert.equal(phaseAt(end, start, end), 'finished');
  assert.equal(phaseAt(57 * minute, start, end, true), 'finished', 'no short edits follow a started hour');
  assert.equal(phaseAt(20 * minute, start, end, false, false), 'hour', 'completed short work allows the hour to start early');
});
test('five-minute evidence needs contiguous valid samples; busy samples and logging gaps reset it', () => {
  const rows = Array.from({length:61}, (_,i) => ({at:new Date(i*5000).toISOString(),cpuPercent:10}));
  assert.equal(quietEvidence(rows,0,400000).fiveMinutesObserved,true);
  rows[30].cpuPercent=16;
  assert.equal(quietEvidence(rows,0,400000).fiveMinutesObserved,false);
  rows[30].cpuPercent=10;
  assert.equal(quietEvidence(rows.filter((_,i)=>i<25||i>35),0,400000).fiveMinutesObserved,false);
  rows[30].cpuPercent=null;
  assert.equal(quietEvidence(rows,0,400000).fiveMinutesObserved,false);
});
