import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { snapshotMap, type FullForceMap } from "../../src/core/forces/force";
import { footprint, startProblem } from "../../src/core/forces/objects";
import { hash } from "../../src/core/forces/random";
import { CASES, decode } from "./maps";
import { DEFAULTS, plan, reveal, replay, settle, validate, type Settings, type Intent, type Plan } from "./deposit";
const digest = (m: FullForceMap) => {
  const h = createHash("sha256");
  for (const a of [m.heights, m.water.depth, m.water.contamination, m.lava]) h.update(Buffer.from(a.buffer, a.byteOffset, a.byteLength));
  h.update(JSON.stringify([m.W, m.H, m.maxHeight, m.entities, m.rockLayers, m.fallen])); return h.digest("hex");
};
const cases = CASES.map(c => ({ c, m: decode(new Uint8Array(readFileSync(`maps/${c.map}.json.gz`))) }));
const t0 = performance.now();
let count = 0, worstMs = 0, waterWorstMs = 0, arrivalChecks = 0, carriedStarts = 0, buried = 0, noops = 0, maxTicks = 0;
const settings: Settings[] = [];
for (const channels of ["auto", "few", "many"] as const)
  for (const power of [0, 1, 35, 100])
    for (const size of [null, 4, 22, 64])
      for (const floor of [1, 3, 12, 22]) settings.push({ ...DEFAULTS, channels, power, size, floor });
const waterFailures: unknown[] = [], startFailures: unknown[] = [];
for (const { c, m } of cases) {
  const original = digest(m);
  for (let k = 0; k < settings.length; k++) {
    const seed = CASES.indexOf(c) * 104729 + k + 1;
    const intent: Intent = k % 2 ? { click: { x: hash(seed, 1) * 127, y: hash(seed, 2) * 127 } } :
      { path: Array.from({ length: 8 }, (_, j) => ({ x: hash(seed, j + 10) * 127, y: hash(seed, j + 30) * 127 })) };
    const s = { ...settings[k], seed }, start = performance.now(), p = plan(m, s, intent);
    worstMs = Math.max(worstMs, performance.now() - start);
    let balance = 0;
    for (let i = 0; i < m.heights.length; i++) {
      assert(p.map.heights[i] >= 0 && p.map.heights[i] <= m.maxHeight, "physical bounds");
      assert(p.map.heights[i] >= Math.min(m.heights[i], s.floor), "shared Floor");
      balance += p.map.heights[i] - m.heights[i];
    }
    assert.equal(balance, 0, "material conserved independently"); assert.equal(p.stats.balance, 0);
    assert.equal(p.stats.deposited, p.stats.eroded); assert(p.stats.maximumCut <= 2);
    assert.equal(digest(m), original, "input unchanged");
    const second = plan(m, s, intent);
    assert.equal(digest(p.map), digest(second.map), "seeded determinism");
    assert.deepEqual(p.operation, second.operation); assert.deepEqual(p.arrival, second.arrival);
    assert.equal(digest(replay(m, p.operation)), digest(p.map), "literal replay");
    const undo = snapshotMap(m);
    for (const progress of [0, .2, .5, .8, 1]) {
      const shown = reveal(p, progress);
      assert.equal(digest(snapshotMap(undo)), original, "undo bytes at every stage");
      for (let i = 0; i < shown.heights.length; i++) {
        assert(shown.heights[i] >= Math.min(m.heights[i], s.floor) && shown.heights[i] <= m.maxHeight);
        if (p.arrival[i] > progress) assert.equal(shown.heights[i], m.heights[i], "land before arrival");
      }
      if (progress < 1) {
        assert.deepEqual(shown.water, m.water, "water unchanged before final land");
        const entities = new Map(shown.entities.map(e => [e.id, e]));
        for (const e of m.entities) if (footprint(m, e).every(i => p.arrival[i] > progress)) assert.deepEqual(entities.get(e.id), e, "object before arrival");
        arrivalChecks++;
      }
    }
    const finalEntities = new Map(p.map.entities.map(e => [e.id, e]));
    for (const old of m.entities) {
      const e = finalEntities.get(old.id);
      if (!e) { assert(!/Source|Seep|StartingLocation/.test(old.template)); continue; }
      assert.equal(e.orientation, old.orientation, "upright objects");
      if (e.template !== "StartingLocation") {
        const i = old.y * m.W + old.x;
        assert.equal(e.z - old.z, p.map.heights[i] - m.heights[i], "objects/sources ride ground");
        assert.equal(e.x, old.x); assert.equal(e.y, old.y);
      }
    }
    assert.equal(startProblem(p.map), null, "start on dry level ground before water");
    if (p.stats.startCarried) carriedStarts++;
    buried += p.stats.buried; if (!p.stats.changed) noops++;
    const waterStart = performance.now(), water = settle(p);
    waterWorstMs = Math.max(waterWorstMs, performance.now() - waterStart); maxTicks = Math.max(maxTicks, water.ticks);
    if (!water.settled && !water.steady) waterFailures.push({ case: c.id, seed, s, intent, ticks: water.ticks });
    if (startProblem(p.map)) startFailures.push({ case: c.id, seed, s, intent, problem: startProblem(p.map) });
    for (const d of p.map.water.depth) assert(Number.isFinite(d) && d >= 0);
    assert.equal(digest(snapshotMap(undo)), original, "undo after settling exact");
    count++;
  }
  console.log(c.id, count, "gestures checked; water failures", waterFailures.length, "start failures", startFailures.length);
}
function outletConnected(m: FullForceMap): boolean {
  const source = m.entities.find(e => e.template === "WaterSource" && (e.x === 0 || e.y === 0 || e.x === m.W-1 || e.y === m.H-1))!;
  const first = source.y * m.W + source.x, visited = new Set<number>([first]), queue = [first];
  for (let k = 0; k < queue.length; k++) {
    const i = queue[k], x = i % m.W, y = Math.floor(i / m.W);
    if ((x === 0 || y === 0 || x === m.W-1 || y === m.H-1) && Math.hypot(x-source.x,y-source.y) > 20) return true;
    for (const [xx,yy] of [[x-1,y],[x+1,y],[x,y-1],[x,y+1]]) {
      const j = yy * m.W + xx;
      if (xx < 0 || yy < 0 || xx >= m.W || yy >= m.H || visited.has(j) || m.water.depth[j] <= .05) continue;
      visited.add(j); queue.push(j);
    }
  }
  return false;
}
function summary(c: typeof CASES[number], m: FullForceMap, p: Plan) {
  const added = p.operation.tiles.filter(i => p.map.heights[i] > m.heights[i]);
  const gentle = added.filter(i => [i-1,i+1,i-m.W,i+m.W].filter(j=>j>=0 && j<m.heights.length).every(j => Math.abs(p.map.heights[j]-p.map.heights[i])<=1)).length;
  const newlyDry = added.filter(i => m.water.depth[i] > .1 && p.map.water.depth[i] <= .05).length;
  const wetAdded = added.filter(i => p.map.water.depth[i] > .05).length;
  const branchWet = p.branches.map(branch => branch.filter((point,k) => {
    if(k<branch.length*.25) return false;
    const x = Math.round(point.x), y = Math.round(point.y); return x>=0 && y>=0 && x<m.W && y<m.H && p.map.water.depth[y*m.W+x]>.05;
  }).length);
  let splitStations=0;
  for(let k=Math.ceil(p.branches[0].length*.25);k<p.branches[0].length;k++) {
    const ps=p.branches.map(b=>b[k]);
    const unique=new Set(ps.filter(q=>q.x>=0&&q.y>=0&&q.x<m.W&&q.y<m.H&&p.map.water.depth[Math.round(q.y)*m.W+Math.round(q.x)]>.05).map(q=>Math.round(q.y)*m.W+Math.round(q.x)));
    if(unique.size<2)continue;
    const a=ps[0],b=ps.at(-1)!;
    for(let j=1;j<20;j++) {
      const x=Math.round(a.x+(b.x-a.x)*j/20),y=Math.round(a.y+(b.y-a.y)*j/20),i=y*m.W+x;
      if(x>=0&&y>=0&&x<m.W&&y<m.H&&p.map.water.depth[i]<=.05&&p.map.heights[i]>m.heights[i]) {splitStations++;break;}
    }
  }
  return { case: c.id, ...p.stats, addedTiles: added.length, gentlePercent: +(100*gentle/Math.max(1,added.length)).toFixed(1), newlyDry, wetAdded, branchWet, splitStations, outlet: outletConnected(p.map) };
}
const examples = [];
for (const { c, m } of cases) {
  const s = { ...DEFAULTS, seed: 2, power: c.power, size: c.size }, p = plan(m,s,c.intent), q=plan(m,s,c.intent);
  const water = settle(p); settle(q); assert.equal(digest(p.map),digest(q.map),"deterministic settled water");
  assert(water.settled || water.steady); const info=summary(c,m,p);
  if(c.id==='dry') assert.equal(info.wetAdded,0,"dry fan stays dry");
  else { assert(info.outlet,"river reaches its outlet"); assert(info.branchWet.filter(v=>v>8).length>=2,"multiple wet distributaries beyond feeder"); assert(info.splitStations>5,"wet branches separated by new dry banks"); }
  if(c.id==='lake') assert(info.newlyDry>20,"lake fan builds emergent ground");
  examples.push({...info,waterTicks:water.ticks});
}
for (const invalid of [{power:NaN},{power:101},{floor:0},{floor:23},{size:2},{seed:-1},{channels:"nope"}]) assert.throws(()=>validate(cases[0].m,{...DEFAULTS,...invalid} as Settings,CASES[0].intent));
mkdirSync("checks",{recursive:true}); mkdirSync("local",{recursive:true});
writeFileSync("local/failures.json",JSON.stringify({waterFailures,startFailures},null,2));
const result={randomGestures:count,settingsPerCase:settings.length,deterministicPairs:count,undoSnapshots:count*6,arrivalSnapshots:arrivalChecks,carriedStarts,buried,noops,worstPlanMs:+worstMs.toFixed(1),waterWorstMs:+waterWorstMs.toFixed(1),maxWaterTicks:maxTicks,waterFailures:waterFailures.length,startFailures:startFailures.length,examples,totalSeconds:+((performance.now()-t0)/1000).toFixed(2)};
writeFileSync("checks/core.json",JSON.stringify(result,null,2)+"\n"); console.log(result);
assert.deepEqual(waterFailures,[],"every gesture's water converges"); assert.deepEqual(startFailures,[],"start stays valid after water");
