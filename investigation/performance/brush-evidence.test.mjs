import {test} from 'node:test';
import assert from 'node:assert/strict';
import {completeInterval} from './brush-evidence.mjs';
test('rejects legacy node stop time which cannot prove browser activation tail',()=>{
 assert.equal(completeInterval({from:1000,to:2000},{frames:[]}),false);
 assert.equal(completeInterval({from:1000,to:2000},{startedAtUnixMs:1001,endedAtUnixMs:2001}),false);
});
test('accepts explicit entire interval and rejects reversed or missing bounds',()=>{
 assert.equal(completeInterval({from:1000,to:2001},{startedAtUnixMs:1001,endedAtUnixMs:2001}),true);
 assert.equal(completeInterval({from:1000,to:2001},{startedAtUnixMs:2001,endedAtUnixMs:1001}),false);
 assert.equal(completeInterval({from:1002,to:2001},{startedAtUnixMs:1001,endedAtUnixMs:2001}),false);
});
