import { spawnSync } from 'node:child_process';
import { root } from './adoption.mjs';
const result = spawnSync(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', '--config', 'investigation/performance/vitest.config.ts'], { cwd: root, stdio: 'inherit' });
process.exit(result.status ?? 1);
