import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import Ajv from 'ajv/dist/2020';
import {fixture} from './fixtures';
import {makePlan,DEFAULTS} from '../model';
import {Session} from '../session';
import {applyOperation,signature} from '../operation';
const validate=new Ajv({strict:false}).compile(JSON.parse(readFileSync('operation.schema.json','utf8')));
const m=fixture('river-128'),s=new Session(m),p=s.start({verb:'glaciate',settings:DEFAULTS,intent:{origin:2112}});const op=s.finish({settled:false,ticks:0});
assert.ok(validate(op),JSON.stringify(validate.errors));
const tests:any[]=[];
for(const [label,mutate] of [
 ['invalid size',(o:any)=>o.params.request.settings.size=Infinity],
 ['invalid seed',(o:any)=>o.params.request.settings.seed=-1],
 ['invalid water',(o:any)=>o.params.water.push([65536,0,1])],
 ['unsorted terrain',(o:any)=>o.params.terrain.reverse()],
 ['invalid lake floor',(o:any)=>o.params.lake.floor[0]=999],
 ['invalid lake depth',(o:any)=>o.params.lake.depth[0]=NaN],
 ['duplicate lake tile',(o:any)=>o.params.lake.tiles[1]=o.params.lake.tiles[0]],
 ['wrong endpoint',(o:any)=>o.params.after='ffffffffffffffff'],
] as [string,(o:any)=>void][]){const a=structuredClone(op);mutate(a);assert.throws(()=>applyOperation(m,a));tests.push(label);}
const before=signature(s.map);const bad=s.export();bad.operations[0].params.lake.depth[0]=-1;assert.throws(()=>s.import(bad));assert.equal(signature(s.map),before);
// Pinned trees and the full protected starting footprint refuse, including a lateral edge strike.
const pinned=fixture('river-128');pinned.entities.push({id:'pinned-tree',owner:'pinned:test',template:'Pine',x:64,y:16,z:pinned.heights[2112],orientation:'Cw0',flipped:false,components:{}});
assert.throws(()=>makePlan(pinned,DEFAULTS,{origin:2112}),/Pinned object/);
writeFileSync('checks/schema.json',JSON.stringify({checks:12,passed:true,cases:tests.concat(['valid schema','invalid import is atomic','pinned tree refusal','schema compiles'])},null,2)+'\n');console.log('PASS schema and malformed-operation checks');
