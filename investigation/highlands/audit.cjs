const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const dir = path.join(__dirname, 'local');
fs.mkdirSync(dir, { recursive: true });
const arg = (name, fallback) => process.argv.includes('--'+name) ? process.argv[process.argv.indexOf('--'+name)+1] : fallback;
const sizes = process.argv.includes('--smoke') ? [96] : arg('sizes', '96,128,256').split(',').map(Number);
const count = process.argv.includes('--smoke') ? 1 : Number(arg('count', '20'));
const prototype = process.argv.includes('--prototype');
const phase = prototype ? 'after' : 'before';
for (const size of sizes) for (let seed = 1; seed <= count; seed++) {
  const file = path.join(dir, phase, `${size}-${seed}.measure.json`);
  if (fs.existsSync(file)) continue;
  const args = [path.join(__dirname, 'worker.cjs'), '--one', `highlands:${seed}`, '--size', String(size)];
  if (prototype) args.push('--prototype');
  const p = spawnSync(process.execPath, args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  if (p.status !== 0) throw new Error(p.stderr || String(p.error) || `worker exited ${p.status}`);
  const line = p.stdout.split('\n').find(l => l.startsWith('{'));
  if (!line) throw new Error(`No measure: ${p.stdout} ${p.stderr}`);
  const m = JSON.parse(line);
  if (m.error) throw new Error(m.error);
  fs.writeFileSync(file, JSON.stringify(m));
  console.log(`${size} seed ${seed}: ${m.outcomes?.summary || m.failedChecks.join(', ')}; checks ${m.ok}; land ${m.ms.firstLook}ms; map ${m.ms.final}ms`);
}
