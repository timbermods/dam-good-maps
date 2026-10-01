// Run after the final matrix. Exercise false-green cases using its real accepted rows.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const here=dirname(fileURLToPath(import.meta.url)),local=join(here,'local'),dist=join(local,'dist-round2-after'),file=join(local,'budget-test.json');
const data=JSON.parse(readFileSync(join(local,'round2-measured.json'))),rows=data.results.filter(r=>r.variant==='round2-after').map(({variant,mapId,selectedMapId,connection,cpu,visit,run,editable,firstFrame,checksStart,errors,correctness,marks,transferred})=>({variant,mapId,selectedMapId,connection,cpu,visit,run,editable,firstFrame,checksStart,errors,correctness,marks,transferred}));
mkdirSync(local,{recursive:true});
function gate(input){writeFileSync(file,JSON.stringify({results:input}));try{return {ok:true,out:execFileSync(process.execPath,[join(here,'gate.mjs'),'--round2','--dist',dist,'--results',file],{encoding:'utf8'})};}catch(e){return {ok:false,out:e.stdout.toString()};}}
test('complete real all-six matrix passes the explicit median/worst budgets',()=>assert.equal(gate(rows).ok,true));
test('other fast maps cannot hide one missing map/profile',()=>{const r=gate(rows.filter(r=>!(r.mapId==='islands-1'&&r.connection==='typical'&&r.cpu===4&&r.visit==='cold')));assert.equal(r.ok,false);assert.match(r.out,/Need >=5 repeats: islands-1\/typical\/4\/cold/);});
test('a single worst outlier fails even if the median is unchanged',()=>{const input=structuredClone(rows);input[0].editable=10000;const r=gate(input);assert.equal(r.ok,false);assert.match(r.out,/worst 10000/);});
test('duplicate repeats cannot manufacture a complete cell',()=>{const input=structuredClone(rows);input.push(input[0]);const r=gate(input);assert.equal(r.ok,false);assert.match(r.out,/Duplicate repeat/);});
test('wrong selection and dimensions fail',()=>{const input=structuredClone(rows);input[0].selectedMapId='wrong';input[0].correctness.width=256;const r=gate(input);assert.equal(r.ok,false);assert.match(r.out,/Wrong map selected/);assert.match(r.out,/Wrong map dimensions/);});
test('starting checks before the editable frame fails',()=>{const input=structuredClone(rows);input[0].checksStart=0;const r=gate(input);assert.equal(r.ok,false);assert.match(r.out,/Checks started before the editable frame/);});
test('missing edit/undo evidence cannot pass',()=>{const input=structuredClone(rows);input[0].correctness={landChanged:true};const r=gate(input);assert.equal(r.ok,false);assert.match(r.out,/Real edit\/undo failed/);});
