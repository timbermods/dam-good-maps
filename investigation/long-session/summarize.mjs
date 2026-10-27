import {readFileSync, writeFileSync} from 'node:fs';
const root = 'investigation/long-session';
const rows = readFileSync(root + '/local/hour/session.jsonl', 'utf8').trim().split('\n').map(JSON.parse);
const first = rows.findIndex(r => r.kind === 'sample' && r.label === 'baseline');
const end = rows.findIndex(r => r.kind === 'sample' && r.label === 'end');
const samples = rows.slice(first, end < 0 ? undefined : end + 1).filter(r => r.kind === 'sample').map(r=>structuredClone(r));
const supplemental=rows.filter(r=>r.kind==='worker-sample');
const beforeReconnect=rows.filter(r=>r.kind==='sample'&&r.workers?.length>=6&&r.liveWorkers>=6).at(-1);
const firstSupplement=supplemental[0];
const remap=new Map((firstSupplement?.workers||[]).map(w=>[w.id,beforeReconnect?.workers.find(old=>old.url===w.url&&old.wasm?.[0]?.bytes===w.wasm?.[0]?.bytes)?.id??w.id]));
for(const sample of samples){
 sample.workerSource='Playwright';
 if(sample.liveWorkers<6){
  const nearest=supplemental.reduce((best,r)=>!best||Math.abs(r.elapsedMs-sample.elapsedMs)<Math.abs(best.elapsedMs-sample.elapsedMs)?r:best,null);
  if(nearest&&Math.abs(nearest.elapsedMs-sample.elapsedMs)<=30000){
   sample.workers=nearest.workers.map(w=>({...w,id:remap.get(w.id)??w.id}));sample.liveWorkers=nearest.liveWorkers;
   sample.workerSource='CDP reconnect supplement';sample.workerOffsetSeconds=+(Math.abs(nearest.elapsedMs-sample.elapsedMs)/1000).toFixed(3);
  }else{sample.liveWorkers=null;sample.workers=[];sample.workerSource='measurement gap after reconnect';}
 }
}
if (first < 0 || !samples.length) throw new Error('No measured baseline');
const mb = n => Number((n / 1048576).toFixed(3));
const csv = lines => lines.map(xs => xs.map(v => '"' + String(v ?? '').replaceAll('"', '""') + '"').join(',')).join('\n') + '\n';
const ranges = xs => ({first: xs[0], last: xs.at(-1), min: Math.min(...xs), max: Math.max(...xs)});
const main = [['elapsed_seconds','phase','W','H','page_js_heap_MiB','chrome_performance_memory_used_MiB','geometries','three_textures','webgl_buffers','webgl_textures','programs','live_workers','history_steps','map_version','pending_terrain','water_mesh_jobs','DOM_nodes','JS_event_listeners','worker_measurement_source','worker_sample_offset_seconds']];
const worker = [['elapsed_seconds','phase','worker_id','worker_type','module','wasm_MiB','measurement_state']];
const wasms = {};
for (const s of samples) {
  const seconds = +(s.elapsedMs / 1000).toFixed(3);
  main.push([seconds,s.phase,s.map?.W,s.map?.H,mb(s.metrics.JSHeapUsedSize),mb(s.probe?.heap?.used || 0),s.three?.geometries,s.three?.textures,s.gpu?.Buffer,s.gpu?.Texture,s.three?.programs,s.liveWorkers,s.map?.history,s.map?.version,s.map?.pending,s.renderer?.mesherAsked,s.metrics.Nodes,s.metrics.JSEventListeners,s.workerSource,s.workerOffsetSeconds??0]);
  for (const w of s.workers) {
    const type = w.url.match(/\/([^/]*?)\.worker/)?.[1] || w.url;
    for (const m of w.wasm || []) {
      worker.push([seconds,s.phase,w.id,type,m.label,mb(m.bytes),'ok']);
      (wasms[`${w.id}:${type}:${m.label}`] ??= []).push({seconds, MiB: mb(m.bytes)});
    }
    if (!w.wasm?.length) worker.push([seconds,s.phase,w.id,type,'',w.wasm ? 0 : '',w.error ? 'terminated during sample' : w.missingProbe ? 'probe unavailable (optional worker)' : 'no exported Wasm memory']);
  }
}
const windows = [];
for (let start = 0; start < 3600; start += 600) {
  const ss = samples.filter(s => s.elapsedMs >= start * 1000 && s.elapsedMs < (start + 600) * 1000);
  if (!ss.length) continue;
  windows.push({startSeconds: start, endSeconds: start + 600, samples: ss.length,
    heapMiB: ranges(ss.map(s => mb(s.metrics.JSHeapUsedSize))),
    geometries: ranges(ss.map(s => s.three.geometries)), buffers: ranges(ss.map(s => s.gpu.Buffer)),
    liveWorkers: ranges(ss.filter(s=>s.liveWorkers!==null).map(s => s.liveWorkers))});
}
const summary = {environment: rows.find(r => r.kind === 'environment'), complete: end >= 0,
  samples: samples.length, missingWorkerSamples:samples.filter(s=>s.liveWorkers===null).length, elapsedMs: samples.at(-1)?.elapsedMs, counts: samples.at(-1)?.counts,
  heapMiB: ranges(samples.map(s => mb(s.metrics.JSHeapUsedSize))),
  liveWorkers: ranges(samples.filter(s=>s.liveWorkers!==null).map(s => s.liveWorkers)), gpu: {}, wasm: {}, windows,
  errors: rows.slice(0,end<0?undefined:end+1).filter(r => ['fatal','sample-error','pageerror'].includes(r.kind)).map(r=>({kind:r.kind,at:r.at,elapsedMs:r.elapsedMs,error:r.error.split('\n')[0]})),
  recoveries: rows.filter(r=>r.kind==='resume').map(r=>({at:r.at,elapsedMs:r.elapsedMs,reason:r.reason})),
  warnings: rows.slice(0,end<0?undefined:end+1).filter(r => r.kind === 'console')};
for (const name of ['geometries','textures','programs']) summary.gpu[name] = ranges(samples.map(s => s.three[name]));
summary.gpu.buffers = ranges(samples.map(s => s.gpu.Buffer));
for (const [key,xs] of Object.entries(wasms)) summary.wasm[key] = {...ranges(xs.map(x => x.MiB)),
  lastGrowthSeconds: xs.filter((x,i) => i && x.MiB > xs[i-1].MiB).at(-1)?.seconds || 0};
writeFileSync(root + '/measurements.csv', csv(main));
writeFileSync(root + '/worker-memory.csv', csv(worker));
writeFileSync(root + '/summary.json', JSON.stringify(summary,null,2) + '\n');
console.log(JSON.stringify({...summary, errors: summary.errors.map(x => x.error), warnings: summary.warnings.map(x => x.text)},null,2));
