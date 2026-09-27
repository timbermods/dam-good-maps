import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.mp3': 'audio/mpeg', '.md': 'text/plain' };
const files = new Set(['index.html', 'style.css', 'demo.js', 'palette.js', 'engine.js',
  'calibration.js', 'bank.json', 'checks.html', 'checks.js', 'SOUNDS.md', 'REPORT.md', 'INTEGRATION.md']);
const oldFiles = new Set(['engine.js', 'synth.js', 'worklet.js']);
export function createServer() {
  return http.createServer(async (req, res) => {
    try {
      if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405).end(); return; }
      const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      let name = pathname.slice(1) || 'index.html', path;
      if (name.startsWith('round-one/') && oldFiles.has(name.slice(10))) path = resolve(root, '../juice', name.slice(10));
      else if (files.has(name) || /^audio\/[a-z-]+\.mp3$/.test(name)) path = resolve(root, name);
      else { res.writeHead(404).end('Not found'); return; }
      const body = await readFile(path);
      res.writeHead(200, { 'Content-Type': `${types[extname(path)] || 'application/octet-stream'}`,
        'Content-Length': body.length, 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
      res.end(req.method === 'HEAD' ? undefined : body);
    } catch { res.writeHead(404).end('Not found'); }
  });
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = createServer();
  server.listen(0, '127.0.0.1', () => {
    console.log(`\nDam Good Maps · Juice / 02\nhttp://127.0.0.1:${server.address().port}/\n24 local CC0 recordings · 0.78 MiB · no install required\nCtrl+C to stop.\n`);
  });
}
