import { existsSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
process.chdir(fileURLToPath(new URL('.', import.meta.url)));
if (!existsSync('node_modules/vite')) {
  const install = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['ci'], { stdio: 'inherit', shell: process.platform === 'win32' });
  if (install.status !== 0) process.exit(install.status ?? 1);
}
const { createServer } = await import('vite');
const server = await createServer();
await server.listen();
const address = server.httpServer.address();
const url = `http://127.0.0.1:${address.port}`;
writeFileSync('.demo-url', url);
console.log(`\nVegetation comparison: ${url}\n`);
