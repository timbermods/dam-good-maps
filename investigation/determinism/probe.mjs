import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { build } from './local/runtime/node_modules/esbuild/lib/main.js';
import { chromium, firefox, webkit } from './local/runtime/node_modules/playwright/index.mjs';
const here = path.dirname(fileURLToPath(import.meta.url));
await fs.mkdir(path.join(here, 'local'), { recursive: true });
const bundle = await build({ entryPoints: [path.join(here, 'probe.ts')], bundle: true, platform: 'browser', format: 'esm', write: false });
const server = http.createServer((req, res) => { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end('<!doctype html><script type="module">' + bundle.outputFiles[0].text + '</script>'); });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const all = {}, versions = {};
try {
  for (const [name, engine] of Object.entries({ chromium, firefox, webkit })) {
    const b = await engine.launch();
    try { const p = await b.newPage(); await p.goto(`http://127.0.0.1:${server.address().port}`); await p.waitForFunction(() => window.probe); all[name] = await p.evaluate(() => window.probe()); versions[name] = b.version(); }
    finally { await b.close(); }
  }
  const different = [], remaining = [];
  for (let k = 0; k < all.chromium.rows.length; k++) {
    const rs = Object.values(all).map(a => a.rows[k]);
    if (new Set(rs.map(r => r.native)).size > 1) different.push({ index: k, ...rs[0], nativeByEngine: Object.fromEntries(Object.keys(all).map(name => [name, all[name].rows[k].native])) });
    if (new Set(rs.map(r => r.portable)).size > 1) remaining.push(k);
  }
  const summary = { versions, samples: all.chromium.rows.length, nativeMismatches: different.length, portableMismatches: remaining.length, nativeByFunction: Object.fromEntries([...new Set(different.map(r => r.name))].map(n => [n, different.filter(r => r.name === n).length])), examples: different.slice(0, 8), numericalErrorAgainstNative: Object.fromEntries(Object.keys(all).map(n => [n, all[n].error])) };
  await fs.writeFile(path.join(here, 'local/math-probes.json'), JSON.stringify(all));
  await fs.writeFile(path.join(here, 'MATH-RESULTS.json'), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary));
  if (remaining.length) process.exitCode = 1;
} finally { server.close(); }
