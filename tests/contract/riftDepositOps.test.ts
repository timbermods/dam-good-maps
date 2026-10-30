// Core/worker adoption contract, without any page or interface controls.
import { expect, test } from "vitest";
import { MapSession } from "../../src/core/doc/session";
import { decodeProject } from "../../src/core/doc/document";
import { makeSpec } from "../../src/core/spec/mapspec";
import { runGenerate } from "../../src/worker/api";
import * as ed from "../../src/worker/session";
import { RIFT_DEFAULTS } from "../../src/core/forces/rift";
import { DEPOSIT_DEFAULTS } from "../../src/core/forces/deposit";
const sum=(a:Uint8Array)=>a.reduce((s,v)=>s+v,0);
test("Rift and Deposit keep the exact final frame, undo and reopen; Deposit keeps its material",async()=>{
 // (Highlands 96² seed 22 since generator 0.10.6, D498, D148: on seed 21's new map a Deposit at Power 100 lost 4 of its
 // material where its fan ran out of room, a bug of Deposit's own that its fix pins with seed 21, issue #714)
 await runGenerate(makeSpec({seed:22,theme:"highlands",size:{x:96,y:96}}));ed.refine();
 for(const verb of ["rift","deposit"] as const)for(const power of [0,100]){
  const before=ed.terrainNow().heights.slice();
  const settings=verb==="rift"?{...RIFT_DEFAULTS,power,size:22}:{...DEPOSIT_DEFAULTS,power,size:40};
  const request={verb,settings,path:[{x:55,y:30},{x:78,y:54}],cut:null} as ed.ForceRequest;
  expect(ed.forceStart(request).errors).toEqual([]);let shown=before;
  for(let k=0;k<80;k++){const frame=ed.forceAdvance(2)!;if(frame.heights)shown=frame.heights.slice();if(frame.done)break;}
  expect(ed.forceStop().errors).toEqual([]);
  const after=ed.terrainNow().heights.slice();expect(after).toEqual(shown);expect(after).not.toEqual(before);
  if(verb==="deposit")expect(sum(after)).toBe(sum(before));
  const reopened=MapSession.open(decodeProject(ed.project().bytes));expect(reopened.built.heights).toEqual(after);
  ed.undo();expect(ed.terrainNow().heights).toEqual(before);
 }
},120000);
