export function trace() {
  let stack = [], totals = {}, stages = [], attempts = [], lastStage = null, since = 0, previous = 0, started = 0;
  const enter = name => {
    const t = { name, at: performance.now(), child: 0 };
    stack.push(t);
    return t;
  };
  const leave = t => {
    const ms = performance.now() - t.at;
    if (stack.pop() !== t) throw new Error('trace stack');
    const row = totals[t.name] ??= { calls: 0, total: 0, self: 0 };
    row.calls++; row.total += ms; row.self += ms - t.child;
    if (stack.length) stack.at(-1).child += ms;
  };
  const stageEnd = () => {
    const now = performance.now();
    if (lastStage) stages.push({ ...lastStage, ms: now - since });
    since = now;
  };
  return {
    enter, leave,
    reset() { stack = []; totals = {}; stages = []; attempts = []; lastStage = null; started = since = previous = performance.now(); },
    progress(p) {
      if (p.kind === 'stage') { stageEnd(); lastStage = { attempt: p.attempt, stage: p.stage }; }
    },
    attempt(a, index) {
      stageEnd(); lastStage = null;
      const now = performance.now();
      attempts.push({ attempt: a.result.attempts, index, passed: a.passed, reason: a.result.info.stage, ms: now - previous, end: now - started, genomes: a.result.info.genomes, settles: a.result.info.settles, failures: a.result.report.checks.filter(c=>!c.ok).map(c=>c.id) });
      previous = now;
    },
    wasm(crate, exports) {
      return Object.fromEntries(Object.entries(exports).map(([name, value]) => [name, typeof value !== 'function' ? value : (...args) => {
        const t = enter(`wasm/${crate}:${name}`);
        try { return value(...args); } finally { leave(t); }
      }]));
    },
    finish() { stageEnd(); return { totals, stages, attempts }; },
  };
}
