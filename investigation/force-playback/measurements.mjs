import {readFile,writeFile} from 'node:fs/promises';
const local=new URL('./local/',import.meta.url);
const pct=(a,q)=>a.length ? [...a].sort((a,b)=>a-b)[Math.min(a.length-1,Math.floor(a.length*q))] : null;
const one=(a)=>a===null ? 'unavailable' : a.toFixed(2);
const rows=[];
for(const force of ['carve','craterize','erupt','quake','glaciate']) {
  const pair=await Promise.all(['before','after'].map(label=>readFile(new URL(`${label}-${force}.json`,local),'utf8').then(JSON.parse)));
  for(let k=0;k<2;k++) {
    const r=pair[k],shown=r.worker.filter(w=>w.planned&&w.shown>0);
    rows.push(`| ${force} | ${k ? 'after' : 'before'} | ${one(Math.max(...r.raf))} | ${one(pct(r.raf,.95))} | ${one(pct(shown.map(w=>w.workerMs),.95))} | ${one(pct(shown.map(w=>w.transferMs),.95))} | ${one(pct(r.main.renderNow,.95))} | ${one(Math.max(...r.main.updateEntities))} | ${one(pct(r.gpu,.95))} |`);
  }
}
const doc=`# Single-play observations

Measured on October 5, 2026 in headed installed Chrome, ANGLE/D3D11 on NVIDIA GeForce RTX 2070 SUPER, High, top-down, 1440×1000. Largest supported side on the audited dev is 256 (MAX_SIDE); five forces are exposed in the page. Seed 4242, Highlands, Normal, Fast; maximum Power and Size. Quake uses Slide. Carve is high-to-low; Glaciate is at high ground; other positions and gestures are in profile.mjs.

Each row is one interactive play, not a repeated benchmark. Wall-clock gathering changes the driver's remaining showing time, so frame counts differ. Carve's sampled gesture yielded 360 versus 357 shown steps; its readings are not identical-input replay measurements. The deterministic transport tests compare exact inputs and every shown frame separately. No speed thresholds were tested.

All times below are milliseconds. The report uses the worst requestAnimationFrame interval, including gathering/showing/keep, because typical intervals hide the occasional object-update hitch. p95 remains visible here so the largest-gap readings are not mistaken for typical frame times.

| Force | Run | Max frame gap | p95 frame gap | p95 shown-reply worker CPU | p95 transfer + queue | p95 render CPU | Peak object-update CPU | p95 GPU draw |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
${rows.join('\n')}

Worker CPU is synchronous forceAdvance through its reply construction, restricted here to planned, shown>0 replies. It still includes core playback work. The separate profiling field is added only to the ignored fixture; it is absent from adoption patches. Transfer + queue is elapsed from the worker's time-origin-adjusted send stamp to the page's message listener: it includes delivery/scheduling and deserialization, rather than isolating memcpy cost. GPU time uses EXT_disjoint_timer_query_webgl2 around the renderer's draw; the automatic quality timer is suppressed to avoid nested queries, and the High choice is fixed. Disjoint results are discarded.

render CPU includes flushTerrain, its terrain/water remeshing and drawing. Object updates normally arrive in a separate animation callback; their peak column includes setEntitiesInner and shadows. Inner CPU spans overlap outer spans and must not be summed. Worker, GPU and main-thread work also overlap.

## Waste and retained work

The baseline spends 58–250 ms per play regenerating object groups (setEntitiesInner), versus 14–19 ms terrain meshing and 21–40 ms synchronous shore meshing in these captures. Model cache adoption removes static procedural model construction and its typed-array allocations from subsequent updates. The batch key already distinguishes model, death, ruin layout and ivy; instances keep their own mutable attributes and GPU lifecycle. A full instance/forest update remains when the entity view changes.

Worker comparison height arrays now stay allocated once per force. Browser playback transfers packed changed rectangles, with a full snapshot fallback, instead of copying a full map twice per changed reply. The page applies them to its mirror and uses the existing queued terrain update. Existing code already coalesces unseen terrain replies against drawnLand, finds changed tiles and dependent chunks, uploads dirty texture rows and refills chunk geometry. These mechanisms stay intact.

waterMesher still clones full surface/ground arrays to each pool worker and meshing still allocates arrays. A persistent replica or cropped water protocol would need to preserve contamination blending, lower layers, fall dependencies and failure recovery. Ground-driven shore remeshing remains synchronous for exact same-frame shore geometry. Its measured cost was smaller than object updates. Force FX have reusable instance buffers but a quake's crack and a carve's mud can still allocate geometry. They were not the largest measured waste. Forces compute, the water kernel and Carve's water timing remain with their respective sessions, as requested.

The raw per-frame JSON, GPU diagnostics and fixture builds are under ignored local/. The corrected collector records heightPatch.byteLength; the original after captures used a values-field lookup, so their zero height-byte counts are invalid and no byte-saving percentage is claimed. Regeneration commands and approximate run time are in INTEGRATION.md. Shared-machine load and live gesture sampling limit causal conclusions from these single readings.
`;
await writeFile(new URL('./MEASUREMENTS.md',import.meta.url),doc);
