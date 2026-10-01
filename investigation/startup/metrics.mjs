export function median(xs) { const sorted = [...xs].sort((a,b) => a-b); const n = sorted.length; return n % 2 ? sorted[n >> 1] : (sorted[n/2-1] + sorted[n/2])/2; }
export function summary(xs) { return { median: Math.round(median(xs)), worst: Math.round(Math.max(...xs)) }; }
// Nested V8 compile slices are a union per thread, not an inflated sum.
export function traceCost(events, pattern) {
  const threads = new Map();
  for (const e of events) if (e.ph === 'X' && e.dur > 0 && !/Waiting/.test(e.name) && pattern.test(e.name)) {
    // Thread clocks exclude scheduler pauses and streaming waits. Fallback is explicit
    // for synthetic test events; Chrome captures include tts/tdur for these slices.
    const lo=e.tts??e.ts,dur=e.tdur??e.dur;
    const key = `${e.pid}:${e.tid}`; const spans = threads.get(key) ?? []; spans.push([lo,lo+dur]); threads.set(key, spans);
  }
  let total = 0;
  for (const spans of threads.values()) {
    spans.sort((a,b) => a[0]-b[0]); let end = -Infinity;
    for (const [lo,hi] of spans) { total += Math.max(0,hi-Math.max(lo,end)); end = Math.max(end,hi); }
  }
  return total/1000;
}
