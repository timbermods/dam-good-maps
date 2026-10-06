import { cp, mkdir, readFile, writeFile, symlink, unlink, lstat, rmdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = new URL('../../', import.meta.url);
const work = new URL('./local/work/', import.meta.url);
await mkdir(work, { recursive: true });
// Only these known generated files are removed; everything stays in this owned fixture.
for (const name of ['src/render3d/entityGeometry.ts', 'tests/unit/entityGeometry.test.ts', 'tests/unit/forcePlaybackTransport.test.ts']) {
  try { await unlink(new URL(name, work)); } catch(e) { if(e.code !== 'ENOENT') throw e; }
}
for (const name of ['src', 'tests', 'index.html', 'vite.config.ts', 'vitest.config.ts', 'playwright.config.ts', 'playwright.live.config.ts', 'tsconfig.json', 'package.json']) await cp(new URL(name, root), new URL(name, work), { recursive: true });
for (const name of ['node_modules', 'public', 'tools', 'real-places']) {
  try { await symlink(fileURLToPath(new URL(name, root)), fileURLToPath(new URL(name, work)), 'junction'); } catch (e) { if (e.code !== 'EEXIST') throw e; }
}
const investigations = new URL('investigation/', work);
// Retire the earlier fixture's junction itself, never its target; avoid a recursive local/work link.
try { if ((await lstat(investigations)).isSymbolicLink()) await rmdir(investigations); } catch(e) { if(e.code !== 'ENOENT') throw e; }
await mkdir(investigations, { recursive: true });
for (const name of ['carve', 'erupt', 'forces-core', 'glaciate']) {
  try { await symlink(fileURLToPath(new URL('investigation/' + name, root)), fileURLToPath(new URL(name, investigations)), 'junction'); } catch(e) { if(e.code !== 'EEXIST') throw e; }
}
if(process.argv.includes('--adopt')) for(const owner of ['renderer','page','worker']) {
  execFileSync('git', ['apply','--directory=investigation/force-playback/local/work',fileURLToPath(new URL(`./${owner}.patch`,import.meta.url))], {cwd:fileURLToPath(root),stdio:'inherit'});
}
// Profile exactly the same worker boundary in both builds. These fields never enter adoption patches.
const p = new URL('src/worker/generator.worker.ts', work);
let s = await readFile(p, 'utf8');
s = s.replace(/forceAdvance: \(steps: number\) => sendFrame\((ed.forceAdvance\(steps(?:, true)?\))\),/, (_, call) => `forceAdvance: (steps: number) => {
    const start = performance.now();
    const f = ${call};
    if (f) Object.assign(f, { playbackProfile: { workerMs: performance.now() - start, sentAt: performance.timeOrigin + performance.now() } });
    return sendFrame(f);
  },`);
if(process.argv.includes('--profile')) await writeFile(p, s);
const config = new URL('vite.config.ts', work);
await writeFile(config, (await readFile(config, 'utf8')).replace(/\s*places: fileURLToPath\([^\n]+\n/, '\n'));
console.log(fileURLToPath(work));
