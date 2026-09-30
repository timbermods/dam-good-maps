import assert from 'node:assert/strict';
import { Journal } from './architecture';
import { clone, type State } from './state';
const s:State={W:4,H:4,heights:new Uint8Array(16).fill(5),lava:new Uint32Array(16),columns:[],entities:[],fallen:[],rockLayers:[],retained:[],
  water:new Float64Array(16),contamination:new Float64Array(16),moisture:new Float64Array(16),soilContamination:new Float64Array(16)};
const id='00000000-0000-4000-8000-000000000001';
const tree={id,owner:'placed',template:'Pine',x:3,y:3,z:5,orientation:'Cw0' as const,flipped:false,components:{}};
const journal=new Journal(clone(s));journal.state.entities.push(tree);
for(let k=0;k<102;k++){
  const after=clone(journal.state);after.entities[0].components={Growable:{GrowthProgress:k/102}};
  journal.accept(k<50||k===101?'host':'guest',`props ${k}`,after,{op:'setEntityProps',params:{id,components:after.entities[0].components}});
}
assert.equal(journal.fences.keys.get('entity:'+id)?.seq,51,'older cross-player eviction cannot overwrite newer identity fence');
assert.equal(journal.entries.length,100);
const derived=new Journal(clone(s));const raised=clone(derived.state);raised.heights[0]=6;
derived.accept('host','Raise',raised,{op:'sculpt',params:{mode:'raise',cells:[[0,0,0]],amount:1}});
const placed=clone(derived.state);placed.entities.push(tree);
derived.accept('guest','Pine at far corner',placed,{op:'placeEntity',params:{id,template:'Pine',x:3,y:3,orientation:'Cw0'}});
const outcome=derived.undo('host',candidate=>{candidate.entities[0].components={Growable:{GrowthProgress:0.25}};return candidate;});
assert.equal(outcome.action,null,'derived resource change cannot bypass the later-peer tile guard');
assert.equal(derived.state.heights[0],6,'refused derived undo leaves the real map unchanged');
console.log('4 focused identity-fence and derived-resource safety assertions passed.');
