import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
process.chdir(fileURLToPath(new URL('.', import.meta.url)));
if (!existsSync('node_modules/vite')) {
  const r = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['ci'], { stdio: 'inherit', shell: process.platform === 'win32' });
  if (r.status) process.exit(r.status);
}
const { createServer } = await import('vite');
const server = await createServer();
await server.listen();
server.printUrls();
