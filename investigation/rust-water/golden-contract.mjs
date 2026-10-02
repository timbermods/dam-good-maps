// Execute the product's existing pinned digests without modifying its test or expected bytes.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {ROOT,LOCAL,deps,api,json,hash} from './common.mjs';
const source=readFileSync(resolve(ROOT,'tests/unit/water-speedups.test.ts'),'utf8');
const prefix=source.slice(0,source.indexOf('describe("the water simulation')).replace(/^import .*;\r?\n/gm,'');
const js=(await deps('esbuild').transform(prefix,{loader:'ts',target:'es2022'})).code;
const construct=new Function('WaterSim','canonicalSettle','createHash','readFileSync','gunzipSync','strFromU8',js+';return {golden,model,digest,FIXTURES,GAME_FIXTURES,GRIDS,GAME_GRIDS,gridRun};');
const a=api('rust');assert.ok(await a.installRustWater(readFileSync(resolve(LOCAL,'water.wasm'))));
const {gunzipSync,strFromU8}=deps('fflate');
const {golden,model,digest,FIXTURES,GAME_FIXTURES,GRIDS,GAME_GRIDS,gridRun}=construct(a.WaterSim,a.canonicalSettle,createHash,p=>readFileSync(resolve(ROOT,p)),gunzipSync,strFromU8);
let checks=0;for(const rules of ['port','game']){const pinned=rules==='port'?FIXTURES:GAME_FIXTURES;
for(const f of golden.fixtures){const sim=new a.WaterSim(model(f),undefined,{rules});sim.run(975);const c=a.canonicalSettle(model(f),{rules});assert.equal(digest(sim.D,sim.C,sim.out,sim.saturation(),c.depth,c.contamination,c.sat,c.out),pinned[f.name],rules+'/'+f.name);sim.dispose();checks++;}
for(const[W,H,pinned]of rules==='port'?GRIDS:GAME_GRIDS){const s=gridRun(W,H,rules);assert.equal(digest(s.D,s.C,s.Dold,s.out,s.saturation()),pinned,rules+'/'+W+'x'+H);s.dispose();checks++;}}
json('golden-contract.json',{status:'pass',checks,source:hash(source)});console.log('Existing product golden digests PASS',checks);
