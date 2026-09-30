import inspector from 'node:inspector';
import { resolve } from 'node:path';
import { api, LOCAL, json } from './common.mjs';
const a = api();
const session = new inspector.Session(); session.connect();
const post = (name, args = {}) => new Promise((resolve,reject) => session.post(name,args,(e,r)=>e?reject(e):resolve(r)));
const rows = [];
for (const size of [128,256]) for (const theme of ['riverValley','lakeBasin','islands']) {
  const g = a.generate(a.makeSpec({seed:1,theme,size:{x:size,y:size}}));
  const m = g.built.waterModel;
  const sim = new a.WaterSim(m, a.prefill(m));
  let counts = {substeps:0, unchangedWetOrder:0, wetTotal:0, activeTotal:0};
  const substep = sim.substep;
  sim.substep = function(...args) {
    const before = this.wet.slice(0,this.wetCount); substep.apply(this,args);
    counts.substeps++; counts.wetTotal += this.wetCount; counts.activeTotal += this.activeCount;
    if (before.length === this.wetCount && before.every((v,i)=>v===this.wet[i])) counts.unchangedWetOrder++;
  };
  sim.run(128); // characterize stable occupancy, separate from CPU profiling
  sim.substep = substep;
  await post('Profiler.enable'); await post('Profiler.start');
  const cpu0=process.cpuUsage(), t0=performance.now();
  const water=a.canonicalSettle(m);
  const ms=performance.now()-t0, cpu=process.cpuUsage(cpu0);
  const {profile}=await post('Profiler.stop');
  json(resolve(LOCAL, `profile-${theme}-${size}.cpuprofile`),profile);
  const byId=new Map(profile.nodes.map(n=>[n.id,n]));
  const samples={};
  for (const id of profile.samples??[]) {
    const n=byId.get(id), name=n.callFrame.functionName || '(anonymous)';
    samples[name]=(samples[name]??0)+1;
  }
  const hot=Object.entries(samples).sort((a,b)=>b[1]-a[1]).slice(0,15).map(([name,count])=>({name,count,share:count/profile.samples.length}));
  const row={theme,size,ms,cpuMs:(cpu.user+cpu.system)/1000,ticks:water.ticks,settled:water.settled,counts,hot};
  rows.push(row);json(resolve(LOCAL,'profile.json'),rows);console.log(JSON.stringify(row));
}
session.disconnect();
