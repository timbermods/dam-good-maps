import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { build } from './local/runtime/node_modules/esbuild/lib/main.js';
import { chromium, firefox, webkit } from './local/runtime/node_modules/playwright/index.mjs';
import { adoptionPlugin, transform } from './transform.mjs';
import ts from './local/runtime/node_modules/typescript/lib/typescript.js';

const here = path.dirname(fileURLToPath(import.meta.url)), root = path.resolve(here, '../..');
const adopted = process.argv.includes('--adoption'), smoke = process.argv.includes('--smoke');
const onlyIndex = process.argv.indexOf('--only'), only = onlyIndex < 0 ? null : new RegExp(process.argv[onlyIndex + 1]);
const outIndex = process.argv.indexOf('--out'), outName = outIndex < 0 ? null : process.argv[outIndex + 1];
if (outName && !/^[a-z0-9-]+$/.test(outName)) throw Error('Output name must stay inside local/');
const dir = path.join(here, 'local', outName ?? ((adopted ? 'adoption' : 'baseline') + (only ? '-targeted' : '')));
await fs.mkdir(dir, { recursive: true });
const resume = process.argv.includes('--resume');
let previous = null, previousRows = {};
if (resume) {
  previous = JSON.parse(await fs.readFile(path.join(dir, 'summary.json'), 'utf8'));
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  if (previous.base !== head || previous.adopted !== adopted || previous.smoke !== smoke) throw Error('resume requires same source and suite mode');
  for (const name of ['chromium', 'firefox', 'webkit']) previousRows[name] = JSON.parse(await fs.readFile(path.join(dir, `${name}.json`), 'utf8'));
}
const workerPath = path.join(root, 'src/worker/session.ts');
let worker = await fs.readFile(workerPath, 'utf8');
if (adopted) worker = transform(worker, workerPath, '');
const workerAst = ts.createSourceFile(workerPath, worker, ts.ScriptTarget.Latest, true);
let stepsExpression;
function findSteps(node) {
  if (ts.isCallExpression(node) && node.expression.getText(workerAst) === 'forceParamsOf') {
    const record = node.arguments[2];
    if (ts.isObjectLiteralExpression(record)) for (const p of record.properties) if (ts.isPropertyAssignment(p) && p.name.getText(workerAst) === 'steps') stepsExpression = p.initializer.getText(workerAst);
  }
  ts.forEachChild(node, findSteps);
}
findSteps(workerAst);
if (!stepsExpression) throw Error('Cannot locate worker force record step policy');
await fs.writeFile(path.join(dir, 'record-policy.ts'), `export const recordSteps = (r: any) => (${stepsExpression});\n`);
await build({ entryPoints: [path.join(here, 'browser.ts')], outfile: path.join(dir, 'bundle.js'), bundle: true, platform: 'browser', format: 'esm', target: 'es2022', sourcemap: true, alias: { 'record-policy': path.join(dir, 'record-policy.ts'), fflate: path.join(here, 'local/runtime/node_modules/fflate/esm/browser.js') }, plugins: adopted ? [adoptionPlugin(root, here)] : [] });
const server = http.createServer(async (req, res) => {
  if (req.url === '/bundle.js') { res.setHeader('Content-Type', 'text/javascript; charset=utf-8'); res.end(await fs.readFile(path.join(dir, 'bundle.js'))); }
  else { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end('<!doctype html><meta charset="utf-8"><script type="module" src="/bundle.js"></script>'); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}`;
const browsers = [], results = {};
try {
  for (const [name, engine] of Object.entries({ chromium, firefox, webkit })) {
    const b = await engine.launch({ headless: true }); browsers.push(b);
    const p = await b.newPage(); p.setDefaultTimeout(900_000);
    p.on('pageerror', e => console.error(name, e));
    p.on('console', message => { if (message.text().startsWith('DETERMINISM_PROGRESS ')) console.log(name + ' ' + message.text()); });
    await p.goto(url); await p.waitForFunction(() => window.determinism);
    results[name] = { version: b.version(), userAgent: await p.evaluate(() => navigator.userAgent), page: p, rows: [], errors: [] };
  }
  let cases = await results.chromium.page.evaluate(smoke => window.determinism.cases(smoke), smoke);
  if (only) cases = cases.filter(c => only.test(c.id));
  const mismatches = [];
  for (const [index, c] of cases.entries()) {
    const cached = previous && !['mixed', 'session'].includes(c.kind) && !Object.values(previous.engines).some(e => e.errors.some(error => error.case === c.id)) && ['chromium', 'firefox', 'webkit'].every(name => previous.engines[name].version === results[name].version && previousRows[name].some(row => row.label === c.id || row.label.startsWith(c.id + '/')));
    if (cached) {
      for (const [name, r] of Object.entries(results)) r.rows.push(...previousRows[name].filter(row => row.label === c.id || row.label.startsWith(c.id + '/')));
      mismatches.push(...previous.mismatches.filter(m => m.case === c.id));
      continue;
    }
    const responses = await Promise.all(Object.entries(results).map(async ([name, r]) => {
      try {
        const rows = await r.page.evaluate(c => window.determinism.runCase(c), c); r.rows.push(...rows);
        if (rows.some(row => row.schedule && !row.schedule.recordEqual)) r.errors.push({ case: c.id, message: 'Wall-clock planning changes the persisted force record (final map matches)' });
        return { name, rows };
      }
      catch (e) { const error = { case: c.id, message: String(e) }; r.errors.push(error); return { name, error }; }
    }));
    const reference = responses[0];
    for (const response of responses.slice(1)) {
      if (!response.rows || !reference.rows) continue;
      if (response.rows.length !== reference.rows.length) throw Error('checkpoint count differs');
      for (let k = 0; k < reference.rows.length; k++) {
        const a = reference.rows[k], b = response.rows[k];
        if (a.hash !== b.hash) mismatches.push({ case: c.id, label: a.label, engines: ['chromium', response.name], components: Object.keys(a.components).filter(key => a.components[key] !== b.components[key]), hashes: [a.hash, b.hash] });
      }
    }
    if (mismatches.some(m => m.case === c.id)) {
      for (const [name, r] of Object.entries(results)) await fs.writeFile(path.join(dir, `${c.id.replaceAll('/', '_')}-${name}.json`), JSON.stringify(await r.page.evaluate(() => window.determinism.dump())));
    }
    if (index % 10 === 0 || responses.some(r => r.error) || mismatches.some(m => m.case === c.id)) console.log(`${index + 1}/${cases.length} ${c.id}: ${responses.map(r => r.error ? r.name + ' ERROR ' + r.error.message : r.name + ' ' + r.rows.length).join(', ')}; mismatches=${mismatches.length}`);
    await fs.writeFile(path.join(dir, 'progress.json'), JSON.stringify({ done: index + 1, total: cases.length, mismatches: mismatches.length, errors: Object.values(results).flatMap(r => r.errors) }));
  }
  const summary = { schema: 1, adopted, smoke, base: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(), platform: { os: os.platform(), release: os.release(), arch: os.arch(), cpu: os.cpus()[0].model, node: process.version }, playwright: '1.58.2', cases: cases.length, engines: Object.fromEntries(Object.entries(results).map(([name, r]) => [name, { version: r.version, userAgent: r.userAgent, checkpoints: r.rows.length, errors: r.errors }])), mismatches };
  for (const [name, r] of Object.entries(results)) await fs.writeFile(path.join(dir, `${name}.json`), JSON.stringify(r.rows));
  await fs.writeFile(path.join(dir, 'summary.json'), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify({ cases: summary.cases, checkpoints: Object.fromEntries(Object.entries(results).map(([n, r]) => [n, r.rows.length])), mismatches: mismatches.length, errors: Object.values(results).flatMap(r => r.errors) }));
  if (mismatches.length || Object.values(results).some(r => r.errors.length)) process.exitCode = 1;
} finally { await Promise.all(browsers.map(b => b.close())); server.close(); }
