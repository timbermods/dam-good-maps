#!/usr/bin/env node
// A tiny static server for the roadmap canvas (index.html opens from the file system too; this is for browsers that
// block file:// scripts and for the Claude preview). No dependencies.
//
//   node tools/roadmap-canvas/serve.mjs [--port 4811] [--extract]
//
// --extract runs extract.mjs first, so the page shows the documents as they are now.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const port = parseInt(args[args.indexOf('--port') + 1], 10) || 4811;
if (args.includes('--extract')) execFileSync(process.execPath, [path.join(here, 'extract.mjs')], { stdio: 'inherit' });

const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.md': 'text/markdown; charset=utf-8' };
http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  const file = path.join(here, url.pathname === '/' ? 'index.html' : path.normalize(url.pathname).replace(/^(\.\.[/\\])+/, ''));
  if (!file.startsWith(here) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('not found'); return; }
  res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
  fs.createReadStream(file).pipe(res);
}).listen(port, '127.0.0.1', () => console.log(`roadmap canvas at http://localhost:${port}/ (Ctrl+C to stop)`));
