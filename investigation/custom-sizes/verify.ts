// Untimed reproductions for the report; no generation/schema bypasses.
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { fixture } from './measure';
import { makeSpec } from '../../src/core/spec/mapspec';
import { encodeSpecFragment, decodeSpecFragment } from '../../src/core/spec/codec';
import { validateFeatures, checkSchema } from '../../src/core/spec/schema';
import opsSchema from '../../src/core/doc/ops.schema.json' with {type: 'json'};
import { fieldData } from '../../src/core/gen/generate';
import { GAME_VERSION, voxelsFromHeights, settledSimulationSingletons, storedOutflows, surfaceOf } from '../../src/core/format/world';
import { mapMetadata, readTimber, writeTimber } from '../../src/core/format/timber';
import { entityJson } from '../../src/core/format/entities';
import { parse, type JsonObject } from '../../src/core/format/json';

const evidence: unknown[] = [];
for (const [W, H] of [[512,512], [128,512], [64,512], [512,256]]) {
  const m = fixture(W,H), n = W*H, zeros = new Float64Array(n), out = new Float64Array(4*n);
  // Nonzero outflow at the far corner exercises padded indices beyond 65535.
  m.water.depth[n-1] = .65;
  out[4*(n-1)] = .125;
  const st = settledSimulationSingletons(W,H,{floor:m.heights,depth:m.water.depth,contamination:zeros,moisture:zeros,soilContamination:zeros,sat:new Uint8Array(n),out});
  const world = {gameVersion: GAME_VERSION,timestamp:'2026-10-05 12:00:00',sizeX:W,sizeY:H,layers:23,voxels:voxelsFromHeights(m.heights,W,H),singletons:st,entities:parse(JSON.stringify(m.entities.map(entityJson))) as JsonObject[]};
  const bytes = writeTimber({world,versionTxt:GAME_VERSION,metadata:mapMetadata(W,H,'Synthetic custom sizes study'),thumbnail:null,extraFiles:[]});
  const read = readTimber(bytes);
  assert.equal(read.world.sizeX,W); assert.equal(read.world.sizeY,H);
  assert.deepEqual(surfaceOf(read.world),m.heights);
  assert.equal(storedOutflows(read.world.singletons,W,H)![4*(n-1)],.125);
  const decoded = decodeSpecFragment(encodeSpecFragment(makeSpec({seed:1,size:{x:W,y:H}})))!;
  assert.deepEqual(decoded.spec.size,{x:128,y:128});
  const feature = {id:'start',kind:'start',origin:'generated',locked:false,params:{position:[W-1,H-1],orientation:'Cw0',benchRadius:6,benchLevel:9,player:0}};
  const featureErrors = validateFeatures([feature]); assert(featureErrors.length > 0);
  const coordErrors = checkSchema({...opsSchema,$ref:'#/$defs/coordinate'}, Math.max(W,H)-1);
  assert(coordErrors.length > 0);
  evidence.push({W,H,timberRoundTrip:true,bytes:bytes.length,shareProblems:decoded.problems,featureErrors,coordErrors});
}
const W = 128,H = 512, moist = new Uint8Array(W*H); moist[300*W+7]=1;
const field = {heights:new Uint8Array(W*H),contains:new Set<string>(),dry:{moist,poisoned:new Uint8Array(W*H)}};
assert.deepEqual(fieldData(field,W).dry!.moist,[[300,7,7]]);
assert.notDeepEqual(fieldData(field).dry!.moist,[[300,7,7]]);
evidence.push({latentDryMask:{actual:fieldData(field).dry!.moist,correct:fieldData(field,W).dry!.moist}});
writeFileSync('investigation/custom-sizes/local/verification.json',JSON.stringify(evidence,null,2)+'\n');
console.log('Four timber/voxel/outflow round trips passed; share/schema refusals and latent dry-mask mismatch reproduced.');
