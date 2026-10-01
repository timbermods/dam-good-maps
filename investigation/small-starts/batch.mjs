import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
const snap = resolve(process.argv[2]);
const out = resolve(process.argv[3]);
for (const size of [96, 128, 256]) {
  const code = await new Promise((done, reject) => {
    const p = spawn(process.execPath, [resolve(snap, 'investigation/probe/run.cjs'), '../m9b/measures.ts', '--seeds', '1-40', '--size', String(size), '--jobs', '6', '--out', `${out}-${size}.jsonl`], { cwd: snap, stdio: 'inherit' });
    p.on('error', reject); p.on('exit', done);
  });
  if (code) process.exit(code);
}
