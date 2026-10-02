export function median(a) { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; }
export function percentile(a, p) { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.ceil(s.length * p) - 1)] : null; }
export function repeatedStats(rows) {
  const metric=fn=>{const values=rows.map(fn);return values.length&&values.every(Number.isFinite)?{median:median(values),worst:Math.max(...values)}:{median:null,worst:null}};
  return {runs:rows.length,repeats:rows.map(r=>r.repeat),p99Ms:metric(r=>r.summary?.p99),
    maxFrameMs:metric(r=>r.summary?.max),hitches:metric(r=>r.summary?.hitches?.length),
    longTasks:metric(r=>r.summary?.longTasks?.length),geometryCandidates:metric(r=>r.summary?.glitches?.length)};
}
export function summarize(raw, budgets) {
  const frames = raw.frames.filter(f => !f.instrumentation), hitches = [];
  for (let i = 0; i < frames.length; i++) {
    const f = frames[i], w = budgets.frame.neighborWindow;
    const neighbors = frames.slice(Math.max(0, i - w), i).concat(frames.slice(i + 1, i + 1 + w)).map(x => x.dt);
    const center = median(neighbors);
    if (f.dt > budgets.frame.absoluteHitchMs || (center !== null && f.dt > center * budgets.frame.neighborMultiplier)) {
      const from = f.at - f.dt;
      hitches.push({ ...f, neighborMedian: center, sources: raw.calls.filter(c => c.end >= from && c.start <= f.at).map(c => ({ name: c.name, duration: c.end - c.start, args: c.args })),
        unattributed: true, attribution: 'unattributed; overlapping method spans are context, not proven causes' });
    }
  }
  const first = raw.rendered[0], last = raw.rendered.at(-1);
  return { frames: frames.length, rendered: raw.rendered.length, p50: median(frames.map(f => f.dt)), p99: percentile(frames.map(f => f.dt), 0.99), max: frames.length ? Math.max(...frames.map(f => f.dt)) : null,
    hitches, longTasks: raw.tasks.filter(t => !t.instrumentation), glitches: raw.errors, findings: raw.findings ?? [], discontinuities: raw.discontinuities,
    instrumentation: { pauses: raw.pauses ?? [], frames: raw.frames.filter(f => f.instrumentation), tasks: raw.tasks.filter(t => t.instrumentation) },
    memory: { first, last }, slowCalls: raw.calls.filter(c => c.end - c.start > 8).sort((a, b) => (b.end - b.start) - (a.end - a.start)) };
}
