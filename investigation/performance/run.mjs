import { chromium, firefox } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, appendFileSync, mkdirSync, existsSync, readdirSync, unlinkSync } from 'node:fs';
import { resolve, extname, join } from 'node:path';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { root } from './adoption.mjs';
import { cases, forces, setup, act, idle, snapshot } from './scenarios.mjs';
import { summarize } from './metrics.mjs';
const dir = resolve(root, 'investigation/performance'), local = resolve(dir, 'local');
mkdirSync(local, { recursive: true });
const lock = resolve(local, 'runner.lock');
if (existsSync(lock)) {
  const previous = JSON.parse(readFileSync(lock));
  let alive = false;
  try { process.kill(previous.pid, 0); alive = true; } catch { }
  if (alive) throw new Error(`Harness ${previous.pid} is running. Browser runs must be serial.`);
  unlinkSync(lock);
}
writeFileSync(lock, JSON.stringify({ pid: process.pid, started: new Date().toISOString() }), { flag: 'wx' });
function releaseLock() {
  if (existsSync(lock) && JSON.parse(readFileSync(lock)).pid === process.pid) unlinkSync(lock);
}
process.on('exit', releaseLock);
const flags = Object.fromEntries(process.argv.slice(2).map(arg => { const [k, ...v] = arg.replace(/^--/, '').split('='); return [k, v.join('=') || true]; }));
const mode = flags.mode ?? 'measure', phase = flags.phase ?? 'before';
const browsers = String(flags.browsers ?? 'edge,firefox').split(','), profiles = String(flags.profiles ?? 'native,laptop').split(',');
const sizes = String(flags.sizes ?? '128,256').split(',').map(Number), looks = String(flags.looks ?? 'standard,high').split(',');
const repetitions = Number(flags.repeats ?? 3), hour = flags.hour === true;
const capture = mode === 'capture' || (mode === 'smoke' && flags['validate-capture'] === true);
if (!['before', 'after'].includes(phase) || !['measure', 'capture', 'smoke'].includes(mode) || !Number.isInteger(repetitions) || repetitions < (mode === 'smoke' ? 1 : 3)) throw new Error('Bad run mode/phase/repeats');
const budgets = JSON.parse(readFileSync(join(dir, 'budgets.json'), 'utf8'));
const stamp = new Date().toISOString().replaceAll(':', '-'), output = resolve(local, 'runs', `${stamp}-${phase}-${mode}`);
mkdirSync(output, { recursive: true });
const results = [];
function save() { writeFileSync(join(output, 'manifest.json'), JSON.stringify({ phase, mode, started: stamp, flags, repetitions, results }, null, 2)); }
function powershell(args) {
  return new Promise((ok, fail) => {
    const child = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', join(dir, 'load.ps1'), ...args], { windowsHide: true });
    let stdout = '', stderr = '';
    child.stdout.on('data', b => stdout += b); child.stderr.on('data', b => stderr += b);
    child.on('error', fail); child.on('exit', code => code === 0 ? ok(stdout) : fail(new Error(stderr || stdout)));
  });
}
async function load() { return JSON.parse(await powershell(['-Samples', '5', '-IntervalMs', '1000', '-ParentPid', String(process.pid),
  '-CpuMax', String(budgets.quiet.cpuPercentMax), '-GpuMax', String(budgets.quiet.gpuEnginePercentMax)])); }
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.mp3': 'audio/mpeg', '.png': 'image/png', '.svg': 'image/svg+xml' };
const build = resolve(local, 'build', phase);
const provenance = JSON.parse(readFileSync(resolve(build, 'provenance.json')));
const harnessDigest = createHash('sha256');
for (const file of ['probe.js', 'audio-worklet.js', 'scenarios.mjs', 'metrics.mjs', 'load.ps1', 'laptop-profile.ps1', 'run.mjs']) harnessDigest.update(file).update(readFileSync(resolve(dir, file)));
const harnessHash = harnessDigest.digest('hex');
const server = createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  const special = ['/investigation/performance/probe.js', '/investigation/performance/audio-worklet.js'].includes(pathname);
  const file = special ? join(dir, pathname.split('/').at(-1)) : resolve(build, '.' + (pathname === '/' ? '/index.html' : pathname));
  if (!file.startsWith(build) && !special) { res.writeHead(403).end(); return; }
  try { res.setHeader('Content-Type', mime[extname(file)] ?? 'application/octet-stream'); res.end(readFileSync(file)); }
  catch { res.writeHead(404).end(); }
});
await new Promise(ok => server.listen(0, '127.0.0.1', ok));
const url = `http://127.0.0.1:${server.address().port}`;
let activeBrowser, activeMonitor, stopping = false;
async function stopOwnRun() {
  stopping = true;
  activeMonitor?.kill();
  await activeBrowser?.close().catch(() => {});
}
process.once('SIGINT', stopOwnRun);
process.once('SIGTERM', stopOwnRun);
const deadlineTimer = flags.deadline ? setTimeout(stopOwnRun, Math.max(1, Number(flags.deadline) - Date.now())) : undefined;
deadlineTimer?.unref();
function firefoxPath() {
  if (flags['firefox-path']) return String(flags['firefox-path']);
  const bundled = resolve(local, 'browsers');
  if (existsSync(bundled)) {
    const dirs = readdirSync(bundled).filter(n => /^firefox-\d+$/.test(n)).sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]));
    if (dirs.length) return resolve(bundled, dirs[0], 'firefox/firefox.exe');
  }
  if (existsSync(firefox.executablePath())) return firefox.executablePath();
  const cache = resolve(process.env.LOCALAPPDATA, 'ms-playwright');
  const dirs = readdirSync(cache).filter(n => /^firefox-\d+$/.test(n)).sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]));
  return dirs.length ? resolve(cache, dirs[0], 'firefox/firefox.exe') : firefox.executablePath();
}
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
function captureHash(folder, audio, raw) {
  const digest = createHash('sha256');
  for (const file of [...readdirSync(folder).sort().map(n => join(folder, n)), audio, raw].filter(existsSync)) {
    digest.update(file.split(/[\\/]/).at(-1)); digest.update(readFileSync(file));
  }
  return digest.digest('hex');
}
let busy = false;
try {
  outer: for (const browserName of browsers) for (const profile of profiles) for (const size of sizes) for (const look of looks) {
    if (!['clean', 'standard', 'high'].includes(look) || (look === 'high' && !provenance.lookRef)) {
      results.push({ browser: browserName, profile, size, look, status: 'unsupported', reason: 'High renderer overlay missing or unknown look' }); save(); continue;
    }
    for (let repeat = 1; repeat <= repetitions; repeat++) {
      const chosen = flags.cases ? cases.filter(c => String(flags.cases).split(',').includes(c.id)) : cases;
      for (const c of chosen) {
        if (stopping) break outer;
        const name = `${browserName}-${profile}-${size}-${look}-${c.id}-${repeat}`;
        const item = { browser: browserName, profile, size, look, case: c.id, repeat, status: 'running', qualified: mode !== 'smoke', provenance, harnessHash };
        results.push(item); save();
        console.log(`${name}: ${mode}`);
        let browser, context, page, drainPromise, draining = false, monitor, throttleHelper, loadWatch, aborting = false;
        try {
          // Functional smoke can run headlessly while agents share the desktop. Measurements and
          // evidence captures always use an interactive compositor and retain hardware checks.
          const headless = mode === 'smoke' && !flags['validate-capture'];
          item.headless = headless;
          if (profile === 'laptop') {
            const lease = join(output, `${name}-cpu-profile.json`);
            throttleHelper = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', join(dir, 'laptop-profile.ps1'), '-RunnerPid', String(process.pid), '-Output', lease], { windowsHide: true, stdio: 'ignore' });
            const deadline = Date.now() + 30000;
            while (!existsSync(lease) && Date.now() < deadline) await new Promise(r => setTimeout(r, 200));
            if (!existsSync(lease)) throw new Error('CPU profile handshake timed out');
            item.cpuProfile = JSON.parse(readFileSync(lease));
            if (!item.cpuProfile.ready) throw new Error(item.cpuProfile.error);
            item.throttle = item.cpuProfile.description;
          } else item.throttle = 'none';
          browser = await (browserName === 'edge' ? chromium.launch({ channel: 'msedge', headless }) : firefox.launch({ executablePath: firefoxPath(), headless }));
          activeBrowser = browser;
          context = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
          await context.addInitScript(() => {
            let seed = 4242;
            Math.random = () => ((seed = (1664525 * seed + 1013904223) >>> 0) / 2 ** 32);
          });
          page = await context.newPage(); page.setDefaultTimeout(180000);
          item.version = browser.version();
          const spots = await setup(page, url, size, look);
          // Generation, shader warm-up, decode and setup finish before the quiet gate.
          if (mode !== 'smoke') {
            item.load = await load();
            writeFileSync(join(output, `${name}-load.json`), JSON.stringify(item.load, null, 2));
            if (!item.load.quiet) {
              item.status = 'blocked-busy'; item.qualified = false; busy = true; save();
              console.log('Quiet gate refused measurement; no frame statistics collected.'); break outer;
            }
          }
          item.device = await page.evaluate(capture => window.performanceHarness.begin({ capture }), capture);
          if (mode !== 'smoke') monitor = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', join(dir, 'load.ps1'), '-Samples', '10000', '-IntervalMs', '1000', '-ParentPid', String(process.pid), '-Streaming', '-Output', join(output, `${name}-load-during.jsonl`)], { windowsHide: true, stdio: 'ignore' });
          activeMonitor = monitor;
          if (mode !== 'smoke') loadWatch = setInterval(async () => {
            const file = join(output, `${name}-load-during.jsonl`);
            if (aborting || !existsSync(file)) return;
            const lines = readFileSync(file, 'utf8').trim().split('\n').filter(Boolean);
            let sample; try { sample = JSON.parse(lines.at(-1)); } catch { return; }
            if (sample.cpuPercent <= budgets.quiet.cpuPercentMax && sample.unrelatedCpuPercent <= budgets.quiet.cpuPercentMax) return;
            aborting = true; busy = true; item.qualified = false; item.status = 'invalid-busy'; item.abortLoad = sample; save();
            const raw = await page.evaluate(() => window.performanceHarness.end()).catch(() => null);
            if (raw) writeFileSync(join(output, `${name}-aborted-raw.json`), JSON.stringify(raw));
            console.log('CPU load rose; discarding this attempt and releasing the browser.');
            await browser.close().catch(() => {});
          }, 1000);
          draining = true;
          const captures = resolve(output, `${name}-frames`);
          if (capture) {
            mkdirSync(captures, { recursive: true });
            drainPromise = (async () => {
              while (draining) {
                const frames = await page.evaluate(() => window.performanceHarness.drainImages());
                for (const f of frames) {
                  writeFileSync(join(captures, `${String(f.id).padStart(6, '0')}.png`), Buffer.from(f.png.split(',')[1], 'base64'));
                  writeFileSync(join(captures, `${String(f.id).padStart(6, '0')}.json`), JSON.stringify({ id: f.id, at: f.at }));
                }
                const audio = await page.evaluate(() => window.performanceHarness.drainAudio());
                if (audio.length) appendFileSync(join(output, `${name}-audio.jsonl`), audio.map(a => JSON.stringify(a)).join('\n') + '\n');
                if (draining) await new Promise(ok => setTimeout(ok, 400));
              }
            })();
          }
          const initial = await snapshot(page);
          await act(page, c, spots, 4242 + repeat); await idle(page);
          const final = await snapshot(page);
          if (['force', 'brush', 'select', 'orbit'].includes(c.kind) && hash(initial.worker) === hash(final.worker)) throw new Error(`Scenario ${c.id} changed no final bytes; refusing a no-op pass`);
          item.snapshots = { initial: hash(initial), final: hash(final) };
          writeFileSync(join(output, `${name}-final.json`), JSON.stringify(final));
          // History controls are exercised after each action, including selection and abuse.
          await page.keyboard.press('Control+z'); await idle(page, { afterHistory: true });
          const undo = await snapshot(page);
          await page.keyboard.press('Control+y'); await idle(page, { afterHistory: true });
          const redo = await snapshot(page);
          writeFileSync(join(output, `${name}-undo.json`), JSON.stringify(undo));
          writeFileSync(join(output, `${name}-redo.json`), JSON.stringify(redo));
          item.snapshots.undo = hash(undo); item.snapshots.redo = hash(redo);
          item.redoExact = hash(final.worker) === hash(redo.worker) && hash(final.displayed) === hash(redo.displayed);
          if (hour) {
            if (mode === 'capture') throw new Error('One-hour captures are separate; use measure for bounded event streaming');
            const baseView = await page.evaluate(() => window.dgm3d.renderer.getView());
            const restore = async () => {
              let count = await page.evaluate(() => window.dgmEditor.info().history.filter(h => h.applied).length);
              while (count > 0) {
                await page.keyboard.press('Control+z'); await idle(page, { afterHistory: true });
                const next = await page.evaluate(() => window.dgmEditor.info().history.filter(h => h.applied).length);
                if (next >= count) throw new Error('Long-session undo did not restore its controlled fixture');
                count = next;
              }
              await page.evaluate(view => { window.dgm3d.renderer.setView(view); window.dgm3d.renderer.setMode('top'); }, baseView);
            };
            await restore();
            const reference = async () => {
              await page.evaluate(() => window.performanceHarness.drainEvents());
              await act(page, cases.find(c => c.id === 'brush-large'), spots); await idle(page);
              await restore();
              return summarize(await page.evaluate(() => window.performanceHarness.drainEvents()), budgets);
            };
            const firstReference = await reference();
            const started = Date.now(), windows = [];
            let lastDrain = Date.now();
            while (Date.now() - started < budgets.longSession.durationMs) {
              const next = cases[windows.length % cases.length];
              const start = performance.now(); await act(page, next, spots, 4242 + windows.length); await idle(page);
              await restore();
              windows.push({ case: next.id, start, end: performance.now() });
              if (Date.now() - lastDrain >= 60000) {
                const chunk = await page.evaluate(() => window.performanceHarness.drainEvents());
                appendFileSync(join(output, `${name}-hour.jsonl`), JSON.stringify(chunk) + '\n');
                const summary = summarize(chunk, budgets);
                item.longWindows ??= []; item.longWindows.push({ start: lastDrain, end: Date.now(), summary });
                lastDrain = Date.now();
              }
            }
            item.longSession = { elapsed: Date.now() - started, windows };
            item.longReference = { first: firstReference, last: await reference() };
          }
          const raw = await page.evaluate(() => window.performanceHarness.end());
          await page.waitForTimeout(100);
          if (capture) {
            const audio = await page.evaluate(() => window.performanceHarness.drainAudio());
            if (audio.length) appendFileSync(join(output, `${name}-audio.jsonl`), audio.map(a => JSON.stringify(a)).join('\n') + '\n');
          }
          draining = false; if (drainPromise) await drainPromise;
          if (capture) {
            for (const f of await page.evaluate(() => window.performanceHarness.drainImages())) {
              writeFileSync(join(captures, `${String(f.id).padStart(6, '0')}.png`), Buffer.from(f.png.split(',')[1], 'base64'));
              writeFileSync(join(captures, `${String(f.id).padStart(6, '0')}.json`), JSON.stringify({ id: f.id, at: f.at }));
            }
          }
          // A second gate catches unrelated work that started during the run. Invalid runs remain
          // raw evidence but are excluded by gate.mjs. Nothing stops other agents' processes.
          if (mode !== 'smoke') {
            item.loadAfter = await load();
            if (!item.loadAfter.quiet) { item.qualified = false; item.status = 'invalid-busy'; }
            monitor.kill(); monitor = undefined;
            const duringPath = join(output, `${name}-load-during.jsonl`);
            item.loadDuring = existsSync(duringPath) ? readFileSync(duringPath, 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line)) : [];
            if (!item.loadDuring.length || item.loadDuring.some(s => s.cpuPercent > budgets.quiet.cpuPercentMax || s.unrelatedCpuPercent > budgets.quiet.cpuPercentMax)) { item.qualified = false; item.status = 'invalid-busy'; busy = true; }
          }
          writeFileSync(join(output, `${name}-raw.json`), JSON.stringify(raw));
          if (capture) item.captureHash = captureHash(captures, join(output, `${name}-audio.jsonl`), join(output, `${name}-raw.json`));
          item.summary = mode === 'smoke' ? { errors: raw.errors, findings: raw.findings, renderedFrames: raw.rendered.length } : summarize(raw, budgets);
          item.status = item.status === 'invalid-busy' ? item.status : 'complete';
          item.qualified &&= !item.device.software;
          item.capture = capture ? captures : undefined;
          console.log(`${name}: ${item.status}; redo bytes ${item.redoExact ? 'equal' : 'DIFFERENT'}`);
        } catch (error) {
          item.status = item.status === 'invalid-busy' ? item.status : 'error'; item.qualified = false; item.error = String(error.stack ?? error);
          if (page) {
            const raw = await page.evaluate(() => window.performanceHarness?.end()).catch(() => null);
            if (raw) {
              writeFileSync(join(output, `${name}-raw.json`), JSON.stringify(raw));
              item.summary = mode === 'smoke' ? { errors: raw.errors, findings: raw.findings, renderedFrames: raw.rendered.length } : summarize(raw, budgets);
            }
            writeFileSync(join(output, `${name}-page.txt`), await page.locator('body').innerText().catch(() => 'unavailable'));
            await page.screenshot({ path: join(output, `${name}-error.png`) }).catch(() => {});
          }
          console.error(item.error);
        } finally {
          clearInterval(loadWatch);
          monitor?.kill();
          draining = false;
          if (drainPromise) { await drainPromise.catch(() => {}); }
          await browser?.close(); save();
          if (throttleHelper) {
            writeFileSync(join(output, `${name}-cpu-profile.json.stop`), 'restore');
            await new Promise(ok => throttleHelper.exitCode !== null ? ok() : throttleHelper.once('exit', ok));
          }
          activeBrowser = activeMonitor = undefined;
        }
        if (busy) break outer;
      }
    }
  }
} finally { server.close(); save(); releaseLock(); }
console.log(`Evidence: ${output}`);
process.exitCode = busy || results.some(r => r.status !== 'complete') ? 2 : 0;
