import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { coreCases, configurations, requirements, isQuiet, loadSpiked } from './coverage.mjs';
const budget=JSON.parse(readFileSync(new URL('./budgets.json',import.meta.url)));
test('core covers both force speeds and looks with asymmetric repeat counts and one hour',()=>{
  assert.equal(coreCases.length,12);
  assert.equal(coreCases.filter(c=>c.kind==='force').length,10);
  const configs=configurations(budget);assert.equal(configs.length,6);
  assert(configs.every(c=>c.size===256));
  assert.equal(requirements(budget).length,72);
  assert.equal(requirements(budget).reduce((n,r)=>n+r.repeats,0),120);
  assert(configs.filter(c=>c.browser==='edge'&&c.profile==='native').every(c=>c.repeats===3));
  assert(configs.filter(c=>c.browser==='firefox'||c.profile==='laptop').every(c=>c.repeats===1));
  assert.equal(budget.longSession.required,1);
  assert.equal(requirements(budget,'full').length,320);
  assert.throws(()=>configurations(budget,'typo'));
});
test('qualification requires a full 60 seconds of valid samples; spikes and gaps fail',()=>{
  const quiet=budget.quiet;
  const samples=Array.from({length:13},(_,i)=>({at:new Date(i*5000).toISOString(),cpuPercent:24,unrelatedCpuPercent:10}));
  assert(isQuiet({quiet:true,samples},quiet));
  assert(!isQuiet({quiet:true,samples:samples.slice(1)},quiet));
  assert(!isQuiet({quiet:true,samples:samples.filter((_,i)=>i<3||i>10)},quiet));
  assert(loadSpiked(samples.filter((_,i)=>i<3||i>10),quiet));
  samples[6].cpuPercent=26;assert(!isQuiet({quiet:true,samples},quiet));assert(loadSpiked(samples,quiet));
  samples[6].cpuPercent=null;assert(!isQuiet({quiet:true,samples},quiet));
  assert(loadSpiked([],quiet));
});
