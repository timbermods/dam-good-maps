import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const path = fileURLToPath(new URL('./local/demo.html', import.meta.url));
const port = Number(process.env.DAM_SKETCH_PORT ?? 8943);
createServer((req, res) => {
  if (req.url !== '/' && req.url !== '/demo.html') { res.writeHead(404); res.end(); return; }
  try {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(readFileSync(path));
  } catch {
    res.writeHead(404); res.end('Run node local/demo.cjs to generate the demonstration.');
  }
}).listen(port, '127.0.0.1', () => console.log('Dam sketch demo: http://127.0.0.1:' + port));
