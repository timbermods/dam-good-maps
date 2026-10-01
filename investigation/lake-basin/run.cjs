// Read-only product imports; use M9b's exact measures without changing its source.
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const deps = process.env.LAKE_DEPS || path.join(root, 'node_modules');
process.env.NODE_PATH = [deps, process.env.NODE_PATH].filter(Boolean).join(path.delimiter);
require('node:module').Module._initPaths();
const ts = require('typescript');
require.extensions['.ts'] = (mod, file) => mod._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true, resolveJsonModule: true }, fileName: file,
}).outputText, file);
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i < 0 ? d : process.argv[i + 1]; };
const mode = arg('mode', 'baseline');
const shape = arg('shape', mode === 'round2' ? './round2.ts' : './prototype.ts');
const out = path.resolve(arg('out', path.join(__dirname, 'local', mode)));
fs.mkdirSync(out, { recursive: true });
if (process.argv.includes('--analyze')) {
  require('./analyze.ts').analyze(out);
} else if (process.argv.includes('--check')) {
  require('./verify.ts').verify();
} else if (process.argv.includes('--worker')) {
  const gen = require(path.join(root, 'src/core/gen/generate.ts'));
  if(process.env.LAKE_TIMES) require('./timings.ts').install(process.env.LAKE_TIMES);
  if (process.argv.includes('--trace')) require('./trace.ts').install(out);
  if (mode !== 'baseline') require(shape).install(mode);
  const original = gen.generate;
  gen.generate = (spec, opts) => {
    const startCpu=process.cpuUsage();const phases={};
    const cpuMs=()=>{const c=process.cpuUsage(startCpu);return (c.user+c.system)/1000;};
    const r = original(spec, { ...opts,
      onLand:l=>{phases.landCpuMs??=cpuMs();if(process.env.LAKE_TIMES)require('./timings.ts').mark('onLand');opts?.onLand?.(l);},
      onProgress:p=>{if(p.stage==='objects')phases.waterCpuMs=cpuMs();opts?.onProgress?.(p);},
    });
    require('./capture.ts').capture(r, out, phases);
    return r;
  };
  require(path.join(root, 'investigation/m9b/measures.ts'));
} else {
  const sizes = arg('sizes', '96,128,256').split(',').map(Number);
  const seedRange = arg('seeds', '1-20').split('-').map(Number);
  const queue = sizes.flatMap(size => Array.from({length: (seedRange[1] || seedRange[0]) - seedRange[0] + 1}, (_, k) => [size, seedRange[0] + k]));
  const total = queue.length, jobs = Number(arg('jobs', '2'));
  const results = path.join(out, 'measures.jsonl');
  fs.writeFileSync(results, '');
  let active = 0, done = 0, errors = 0;
  const next = () => {
    while (active < jobs && queue.length) {
      const [size, seed] = queue.shift(); active++;
      const p = spawn(process.execPath, [__filename, '--worker', '--mode', mode, '--shape', shape, '--out', out, '--one', 'lakeBasin:' + seed, '--size', String(size)], { cwd: root, env: process.env, stdio: ['ignore', 'pipe', 'inherit'] });
      let buf = ''; p.stdout.on('data', b => buf += b);
      p.on('close', code => {
        const lines = buf.split('\n').filter(l => l.startsWith('{'));
        if (code || lines.length !== 1 || lines[0].includes('"error"')) errors++;
        for (const l of lines) fs.appendFileSync(results, l + '\n');
        active--; done++; console.log(`${mode}: ${done}/${total} (${size}/${seed}), errors=${errors}`);
        if (queue.length || active) next(); else process.exitCode = errors ? 1 : 0;
      });
    }
  }; next();
}
