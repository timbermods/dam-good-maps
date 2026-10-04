import {spawn} from 'node:child_process';
import {resolve} from 'node:path';

const mode = process.argv[2] ?? 'before';
const seeds = (process.argv[3] ?? Array.from({length: 30}, (_, i) => i + 1).join(',')).split(',').map(Number);
const workers = Number(process.argv[4] ?? 4);
if (!['before', 'after'].includes(mode) || !Number.isInteger(workers) || workers < 1 || workers > 4
    || seeds.some(seed => !Number.isInteger(seed) || seed < 1 || seed > 30)) {
  throw Error('Usage: run.mjs before|after [comma-separated seeds 1–30] [workers 1–4]');
}
let next = 0;
await Promise.all(Array.from({length: workers}, async () => {
  while (next < seeds.length) {
    const seed = seeds[next++];
    await new Promise((done, reject) => {
      const child = spawn(process.execPath, [resolve(`investigation/delta-arms/local/${mode}.cjs`), mode, String(seed)], {
        windowsHide: true, stdio: 'inherit',
      });
      child.on('error', reject);
      child.on('exit', code => code === 0 ? done() : reject(Error(`${mode} ${seed} exited ${code}`)));
    });
  }
}));
