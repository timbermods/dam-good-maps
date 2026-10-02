export const minute = 60000;
// Reserve qualification/setup time as well as the complete hour. If qualification misses its
// latest start, use the remaining window for short cases instead of abandoning the window.
export function phaseAt(now, start, end, hourAttempted = false, shortWorkRemaining = true) {
  if (now >= end) return 'finished';
  if (now < start) return 'waiting';
  if (hourAttempted) return now < end - 64 * minute ? 'hour' : 'finished';
  if (!shortWorkRemaining) return now < end - 64 * minute ? 'hour' : 'finished';
  if (now < end - 70 * minute) return 'short';
  if (now < end - 64 * minute) return 'hour';
  return 'short';
}

export function quietEvidence(rows, start, end, maxCpu = 15, maxGapMs = 15000) {
  const samples = rows.filter(r => Date.parse(r.at) >= start && Date.parse(r.at) < end);
  let since, previous, longest = { durationMs: 0 }, invalid = 0;
  for (const row of samples) {
    const at = Date.parse(row.at);
    if (!Number.isFinite(row.cpuPercent) || row.cpuPercent < 0 || row.cpuPercent > 100) { since = undefined; invalid++; continue; }
    if (previous !== undefined && (at <= previous || at - previous > maxGapMs)) since = undefined;
    if (row.cpuPercent > maxCpu) since = undefined;
    else {
      since ??= at;
      if (at - since > longest.durationMs) longest = { start: new Date(since).toISOString(), end: row.at, durationMs: at - since };
    }
    previous = at;
  }
  const values = samples.map(r => r.cpuPercent).filter(v => Number.isFinite(v) && v >= 0 && v <= 100).sort((a,b) => a-b);
  return { samples: samples.length, first: samples[0]?.at, last: samples.at(-1)?.at,
    cpu: { min: values[0] ?? null, median: values.length ? values[Math.floor(values.length / 2)] : null, max: values.at(-1) ?? null,
      atOrBelow15: values.filter(v => v <= maxCpu).length, invalid },
    longestQuiet: longest, fiveMinutesObserved: longest.durationMs >= 300000,
    trailingUnobservedMs: samples.length ? Math.max(0, end - Date.parse(samples.at(-1).at)) : end - start };
}
