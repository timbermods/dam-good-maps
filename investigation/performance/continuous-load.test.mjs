import {test} from 'node:test';
import assert from 'node:assert/strict';
import {quietSuffix,segment} from './continuous-load.mjs';
import {isQuiet,loadSpiked} from './coverage.mjs';
const quiet={metric:'unrelatedCpuPercent',requireOwnership:true,cpuPercentMax:25,durationMs:60000,maxSampleGapMs:30000};
const row=(t,cpu=10)=>({at:new Date(t).toISOString(),cpuPercent:90,unrelatedCpuPercent:cpu,ownershipComplete:true});
test('one qualifying prefix can accompany successive cases without a fresh minute',()=>{
 const prefix=Array.from({length:13},(_,i)=>row(i*5000));
 assert(isQuiet({quiet:true,samples:quietSuffix(prefix,quiet)},quiet));
 const stream=[...prefix,row(65000),row(70000),row(75000),row(80000)];
 assert(!loadSpiked(segment(stream,61000,69000),quiet));
 assert(!loadSpiked(segment(stream,71000,79000),quiet));
});
test('only the spike-containing run fails; requalification cannot borrow pre-discard time',()=>{
 const rows=[row(0),row(5000,40),row(10000),row(15000)];
 assert(loadSpiked(segment(rows,1000,6000),quiet));
 assert(!loadSpiked(segment(rows,11000,14000),quiet));
 const next=Array.from({length:13},(_,i)=>row(10000+i*5000));
 assert(!isQuiet({quiet:true,samples:quietSuffix(next,quiet,15000)},quiet));
 assert(isQuiet({quiet:true,samples:quietSuffix([...next,row(75000)],quiet,15000)},quiet));
});
