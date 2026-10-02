// Read-only capture around the unmodified M9b measures. No Timberborn launch.
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '../..');
const arg = (name, fallback) => process.argv.includes(`--${name}`) ? process.argv[process.argv.indexOf(`--${name}`) + 1] : fallback;
const label = arg('label', 'before');
const out = path.join(__dirname, 'local', label);
fs.mkdirSync(out, { recursive: true });
if (!process.argv.includes('--one') && !process.argv.includes('--entry')) {
  for (const size of arg('sizes', '96,128,256').split(',').map(Number)) {
    const fd = fs.openSync(path.join(out, `measures-${size}.jsonl`), 'w');
    const p = spawnSync(process.execPath, [__filename, '--label', label, '--size', String(size), '--one', Array.from({ length: 20 }, (_, i) => `canyon:${i + 1}`).join(',')], { cwd: root, stdio: ['ignore', fd, 'inherit'] });
    fs.closeSync(fd);
    if (p.status !== 0) process.exit(p.status || 1);
  }
  process.exit(0);
}
process.env.NODE_PATH = [path.join(__dirname, 'local/node_modules'), process.env.NODE_PATH].filter(Boolean).join(path.delimiter);
Module._initPaths();
const ts = require('typescript');
require.extensions['.ts'] = (mod, file) => {
  const compiled = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true, resolveJsonModule: true }, fileName: file });
  mod._compile(compiled.outputText, file);
};
const gen = require(path.join(root, 'src/core/gen/generate.ts'));
const original = gen.generate;
if (label === 'after') {
  const genome = require(path.join(root, 'src/core/land/genome.ts'));
  const lean = genome.leanGenome;
  const { shapeCanyon } = require('./prototype.ts');
  genome.leanGenome = (...args) => { lean(...args); shapeCanyon(args[0], args[1]); };
}
const { outcomesOf } = require(path.join(root, 'src/core/gen/outcomes.ts'));
const { shadeTiles } = require(path.join(root, 'src/core/render/shade.ts'));
const { encodePng } = require(path.join(root, 'tools/png.ts'));
gen.generate = (spec, opts = {}) => {
  let first = null;
  const r = original(spec, { ...opts, onLand(l) { if (!first) first = l.heights.slice(); opts.onLand?.(l); } });
  const b = r.built;
  const outcomes = outcomesOf(r);
  const details = { seed: spec.seed, size: b.W, outcomes, intentions: r.intentions, info: r.info, failed: r.report.checks.filter(c => !c.ok), checks: r.report.checks, firstHash: first && createHash('sha256').update(first).digest('hex'), finalHash: createHash('sha256').update(b.heights).digest('hex'), bytesHash: createHash('sha256').update(r.bytes).digest('hex'), start: b.start, rivers: r.features.filter(f => f.kind === 'river'), lakes: r.features.filter(f => f.kind === 'lake') };
  const stem = `${b.W}-${spec.seed}`;
  fs.writeFileSync(path.join(out, `${stem}.json`), JSON.stringify(details));
  // Full arrays are diagnostic evidence only, deliberately outside git.
  fs.writeFileSync(path.join(out, `${stem}-tiles.json`), JSON.stringify({ heights: Array.from(b.heights), first: first && Array.from(first), water: Array.from(b.water), contamination: Array.from(b.contamination) }));
  const rgb = shadeTiles(b.heights, b.W, b.H, b.water);
  const img = new Uint8Array(rgb.length);
  for (let y = 0; y < b.H; y++) for (let x = 0; x < b.W; x++) {
    const i = y * b.W + x, j = ((b.H - 1 - y) * b.W + x) * 3;
    img.set(rgb.subarray(i * 3, i * 3 + 3), j);
    if (b.water[i] > 0.05 && b.contamination[i] >= 0.05) img.set([150, 60, 170], j);
    if (b.start && Math.abs(x - b.start.x) <= 1 && Math.abs(y - b.start.y) <= 1) img.set([230, 20, 20], j);
  }
  fs.writeFileSync(path.join(out, `${stem}.png`), encodePng(img, b.W, b.H));
  console.error(`${label} ${stem}: ${r.report.passed ? 'absolute pass' : 'FAIL'}; ${outcomes.summary}; land ${r.timings.firstLook} ms`);
  return r;
};
require(path.resolve(root, arg('entry', 'investigation/m9b/measures.ts')));
