// A fresh checkout needs only Node/npm. All installation and output stays here.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
process.chdir(fileURLToPath(new URL('.', import.meta.url)));
if (!existsSync('node_modules/vite')) {
  const install = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['ci'], {
    stdio: 'inherit', shell: process.platform === 'win32',
  });
  if (install.status !== 0) process.exit(install.status ?? 1);
}
const { createServer } = await import('vite');
const server = await createServer();
await server.listen();
const url = server.resolvedUrls.local[0];
mkdirSync('local', { recursive: true });
writeFileSync('local/server.json', JSON.stringify({ url, pid: process.pid }));
console.log(`\nMap look 3 · Standard / High\n${url}\n`);
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { await server.close(); process.exit(0); });
