// Type-check and test the adoption in its disposable source tree.
import { existsSync, symlinkSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const snap = resolve(process.argv[2]);
if (!snap.startsWith(resolve(here, 'local') + (process.platform === 'win32' ? '\\' : '/'))) throw Error('snapshot must be under this investigation/local');
const deps = resolve(here, 'local/deps/node_modules');
if (!existsSync(resolve(snap, 'node_modules'))) symlinkSync(deps, resolve(snap, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
for (const args of [
  [resolve(deps, 'typescript/bin/tsc'), '--noEmit', '-p', 'tsconfig.json'],
  [resolve(deps, 'vitest/vitest.mjs'), 'run', '--project', 'quick', '--maxWorkers=2', 'tests/unit/mineGround.test.ts', 'tests/unit/minePads.test.ts', 'tests/contract/minePair.test.ts', 'tests/contract/smallStarts.test.ts', 'tests/contract/lakeIsland.test.ts', 'tests/contract/firstLand.test.ts'],
]) {
  const r = spawnSync(process.execPath, args, { cwd: snap, stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status ?? 1);
}
