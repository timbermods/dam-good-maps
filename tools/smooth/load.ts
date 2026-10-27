// The machine-load rules (from the performance investigation's, PLAN §20 D380 and investigation/performance/INTEGRATION.md;
// tightened on Kyler's word, 2026-10-02, after a series ran beside Codex): measuring starts only after the outside
// CPU and the outside GPU were each at most 10% for 60 consecutive sampled seconds; a run whose timed part saw
// either above 10%, a sample that is missing, or a gap over 30 s is voided with its whole round (run.ts), which is
// measured again. 10%: a quiet PC here sits at 1-3% and one busy core is about 6%, while Codex, a game or a busy tab
// sits well above it; 25% let three or four busy cores through.
// "Outside" is everything except the runner, its sampler and the measured browser's process tree (load.ps1 does the
// accounting). Pure functions, tested in tests/unit/smooth.test.ts.

export interface LoadSample {
  /** When the sample was taken (ms since the epoch). */
  at: number;
  /** CPU of the processes outside the runner's tree, percent of the whole machine. */
  outside: number | null;
  /** CPU of the whole machine, percent. */
  total: number | null;
  /** The sampler found the runner's process (so its tree was excluded). */
  ownership: boolean;
  /** The busiest outside processes, for the record. */
  top?: { name: string; cpu: number }[];
  /** The 3D engines' use by outside processes (percent of one engine, summed); null or missing where Windows has
   *  no GPU counters (then the GPU is not judged). */
  gpu?: number | null;
  gpuTop?: { name: string; gpu: number }[];
}

export interface LoadRules {
  cpuMax: number;
  gpuMax: number;
  quietMs: number;
  maxGapMs: number;
  /** Stop the series after this long without (re)qualifying. */
  giveUpMs: number;
}

export const RULES: LoadRules = { cpuMax: 10, gpuMax: 10, quietMs: 60_000, maxGapMs: 30_000, giveUpMs: 15 * 60_000 };

export const sampleOk = (s: LoadSample, r: LoadRules = RULES): boolean =>
  s.ownership && s.outside !== null && s.outside >= 0 && s.outside <= r.cpuMax && (s.gpu === null || s.gpu === undefined || s.gpu <= r.gpuMax);

/** The newest stretch of good samples with no gap over the limit (any bad sample or gap restarts it). */
export function quietSuffix(rows: readonly LoadSample[], r: LoadRules = RULES): LoadSample[] {
  let suffix: LoadSample[] = [];
  for (const s of rows) {
    const prev = suffix[suffix.length - 1];
    if (prev && (s.at <= prev.at || s.at - prev.at > r.maxGapMs)) suffix = [];
    if (!sampleOk(s, r)) {
      suffix = [];
      continue;
    }
    suffix.push(s);
  }
  return suffix;
}

/** Qualified: the quiet stretch spans a full minute and ends now (the sampler is still reporting). */
export function isQualified(rows: readonly LoadSample[], now: number, r: LoadRules = RULES): boolean {
  const q = quietSuffix(rows, r);
  return q.length >= 2 && q[q.length - 1].at - q[0].at >= r.quietMs && now - q[q.length - 1].at <= r.maxGapMs;
}

export interface Triple {
  min: number;
  median: number;
  max: number;
}

export interface Busy {
  name: string;
  /** Its highest CPU in any sample (percent of the machine). */
  maxCpu: number;
  samples: number;
}

/** The outside CPU above which a sample is reported with its busiest processes (the "PC idle" line). */
export const BUSY_PCT = 5;

export interface RunLoad {
  valid: boolean;
  /** Why a run was discarded. */
  reason?: string;
  samples: number;
  outside: Triple | null;
  total: Triple | null;
  /** Outside GPU use (null: no counters). */
  gpu?: Triple | null;
  /** The busiest outside processes in the worst sample, when the run was discarded for load. */
  worst?: LoadSample["top"];
  /** Samples with outside CPU above 5%, and the outside processes that were busy in them. */
  over5: number;
  busy: Busy[];
}

/** The outside processes seen busy in samples where outside CPU was above BUSY_PCT, busiest first. */
export function busyProcesses(rows: readonly LoadSample[], pct: number = BUSY_PCT): Busy[] {
  const by = new Map<string, Busy>();
  for (const s of rows) {
    if ((s.outside ?? 0) <= pct) continue;
    for (const t of s.top ?? []) {
      const b = by.get(t.name) ?? { name: t.name, maxCpu: 0, samples: 0 };
      b.maxCpu = Math.max(b.maxCpu, t.cpu);
      b.samples++;
      by.set(t.name, b);
    }
  }
  return [...by.values()].sort((a, b) => b.maxCpu - a.maxCpu).slice(0, 6);
}

export function mergeBusy(lists: readonly (readonly Busy[])[]): Busy[] {
  const by = new Map<string, Busy>();
  for (const l of lists)
    for (const t of l) {
      const b = by.get(t.name) ?? { name: t.name, maxCpu: 0, samples: 0 };
      b.maxCpu = Math.max(b.maxCpu, t.maxCpu);
      b.samples += t.samples;
      by.set(t.name, b);
    }
  return [...by.values()].sort((a, b) => b.maxCpu - a.maxCpu).slice(0, 6);
}

/** The series' answer to "was the PC idle?", by the gate's own rule (Kyler, 2026-10-03: the line and the rule can't
 *  disagree): outside CPU and outside GPU at most RULES' 10% in every sample of the runs it kept. Samples above 5% are
 *  still counted and their busy processes named, as information. */
export function idleLine(loads: readonly { outside: Triple | null; gpu?: Triple | null; samples: number; over5: number; busy: Busy[] }[], r: LoadRules = RULES): { idle: boolean; text: string } {
  const withOut = loads.filter((l) => l.outside);
  if (!withOut.length) return { idle: false, text: "PC idle: unknown (no load samples)" };
  const min = Math.min(...withOut.map((l) => l.outside!.min));
  const max = Math.max(...withOut.map((l) => l.outside!.max));
  const meds = withOut.map((l) => l.outside!.median).sort((a, b) => a - b);
  const median = meds[Math.floor(meds.length / 2)];
  const gpus = loads.map((l) => l.gpu).filter((g): g is Triple => !!g);
  const gpuMax = gpus.length ? Math.max(...gpus.map((g) => g.max)) : null;
  const samples = loads.reduce((s, l) => s + l.samples, 0);
  const over5 = loads.reduce((s, l) => s + l.over5, 0);
  const idle = max <= r.cpuMax && (gpuMax === null || gpuMax <= r.gpuMax);
  const range = `outside CPU min/median/max ${min.toFixed(1)}/${median.toFixed(1)}/${max.toFixed(1)}%${gpuMax === null ? "" : `, outside GPU max ${gpuMax.toFixed(1)}%`}`;
  const rule = `the gate's rule: at most ${r.cpuMax}% CPU and ${r.gpuMax}% GPU`;
  if (over5 === 0) return { idle, text: `PC idle: ${idle ? "yes" : "NO"} (${range}; ${rule}; never above ${BUSY_PCT}%)` };
  const busy = mergeBusy(loads.map((l) => l.busy)).map((b) => `${b.name} ${b.maxCpu.toFixed(0)}%`).join(", ");
  return { idle, text: `PC idle: ${idle ? "yes" : "NO"} (${range}; ${rule}; above ${BUSY_PCT}% in ${over5} of ${samples} samples${busy ? "; busy: " + busy : ""})` };
}

const triple = (v: number[]): Triple | null => {
  if (!v.length) return null;
  const s = [...v].sort((a, b) => a - b);
  return { min: s[0], median: s[Math.floor(s.length / 2)], max: s[s.length - 1] };
};

/** The samples that cover [from, to]: those inside it, bracketed by the one at or before `from` and the first at or after `to`. */
export function segment(rows: readonly LoadSample[], from: number, to: number): LoadSample[] {
  let before: LoadSample | undefined;
  const inside: LoadSample[] = [];
  let after: LoadSample | undefined;
  for (const s of rows) {
    if (s.at <= from) before = s;
    else if (s.at < to) inside.push(s);
    else if (!after) after = s;
  }
  return [...(before ? [before] : []), ...inside, ...(after ? [after] : [])];
}

/** Whether a run's timed part [from, to] may be kept, and the machine load it saw. */
export function judgeRun(rows: readonly LoadSample[], from: number, to: number, r: LoadRules = RULES): RunLoad {
  const seg = segment(rows, from, to);
  const out = seg.map((s) => s.outside).filter((x): x is number => x !== null);
  const tot = seg.map((s) => s.total).filter((x): x is number => x !== null);
  const gpus = seg.map((s) => s.gpu).filter((x): x is number => typeof x === "number");
  const base = { samples: seg.length, outside: triple(out), total: triple(tot), gpu: triple(gpus), over5: out.filter((x) => x > BUSY_PCT).length, busy: busyProcesses(seg) };
  if (seg.length < 2 || seg[0].at > from || seg[seg.length - 1].at < to) return { ...base, valid: false, reason: "missing load samples" };
  for (let i = 1; i < seg.length; i++) if (seg[i].at - seg[i - 1].at > r.maxGapMs) return { ...base, valid: false, reason: "gap in load samples" };
  if (seg.some((s) => !s.ownership || s.outside === null || s.outside < 0)) return { ...base, valid: false, reason: "load sample without process accounting" };
  const spike = seg.filter((s) => (s.outside as number) > r.cpuMax).sort((a, b) => (b.outside as number) - (a.outside as number))[0];
  if (spike) return { ...base, valid: false, reason: `outside CPU ${(spike.outside as number).toFixed(0)}% > ${r.cpuMax}%`, worst: spike.top };
  const gpuSpike = seg.filter((s) => typeof s.gpu === "number" && s.gpu > r.gpuMax).sort((a, b) => (b.gpu as number) - (a.gpu as number))[0];
  if (gpuSpike) return { ...base, valid: false, reason: `outside GPU ${(gpuSpike.gpu as number).toFixed(0)}% > ${r.gpuMax}%`, worst: (gpuSpike.gpuTop ?? []).map((t) => ({ name: t.name, cpu: t.gpu })) };
  return { ...base, valid: true };
}
