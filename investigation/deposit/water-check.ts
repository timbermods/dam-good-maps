// Focused continuation regression: uses the four capped operations from the completed sweep.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { CASES, decode } from "./maps";
import { plan, settle, waterJob, type Settings, type Intent } from "./deposit";
import { startProblem } from "../../src/core/forces/objects";
import { snapshotMap } from "../../src/core/forces/force";
const failures=JSON.parse(readFileSync("checks/water-regressions.json","utf8")) as {case:string;s:Settings;intent:Intent;seed:number}[];
const result=[];
for(const f of failures) {
  const c=CASES.find(c=>c.id===f.case)!,m=decode(new Uint8Array(readFileSync(`maps/${c.map}.json.gz`)));
  const before=snapshotMap(m),p=plan(m,f.s,f.intent),q=plan(m,f.s,f.intent),start=performance.now(),r=settle(p);
  assert(r.settled||r.steady,"continuation really converged"); assert.equal(startProblem(p.map),null);
  settle(q); assert.deepEqual(p.map.water,q.map.water,"continued water deterministic"); assert.deepEqual(m,before,"input bytes untouched");
  const sliced=waterJob(q); let done; do { done=sliced.advance(16); }while(!done);
  assert.deepEqual(done.depth,p.map.water.depth,"worker slices have the same result");
  assert.deepEqual(done.contamination,p.map.water.contamination);
  result.push({case:f.case,seed:f.seed,ticks:r.ticks,settled:r.settled,steady:r.steady,ms:+(performance.now()-start).toFixed(1)});
}
writeFileSync("checks/water-continuation.json",JSON.stringify({initialPreviewCaps:failures.length,results:result},null,2)+"\n");console.log(result);
