import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve('investigation/page-hunt');
function change(file, before, after) {
  const source = readFileSync(file, 'utf8');
  if (!source.includes(before)) throw new Error(`Base changed: ${file}`);
  const target = join(root, 'overlay', file);
  mkdirSync(join(target, '..'), { recursive: true });
  writeFileSync(target, source.replace(before, after));
}
const app = readFileSync('src/ui/App.tsx', 'utf8');
let candidate = app.replace(
  '  const back = useRef<{ entry: YourMapEntry; bytes: Uint8Array } | null>(null);',
  '  const back = useRef<{ entry: YourMapEntry; bytes: Uint8Array } | null>(null);\n  const backReady = useRef<Promise<{ entry: YourMapEntry; bytes: Uint8Array }> | null>(null);\n  const cancelling = useRef(false);',
);
candidate = candidate.replace(
  '        const kept = await snapshot();',
  '        back.current = null;\n        backReady.current = snapshot().then((kept) => ({ entry: kept.entry, bytes: kept.project }));\n        const saved = await backReady.current;\n        const kept = { entry: saved.entry, project: saved.bytes };',
);
const start = candidate.indexOf('  async function cancelMaking() {');
const end = candidate.indexOf('\n  /** Another like this', start);
if (start < 0 || end < 0 || candidate === app) throw new Error('Cancellation base changed');
candidate = candidate.slice(0, start) + `  async function cancelMaking() {
    if (cancelling.current) return;
    cancelling.current = true;
    runId.current++;
    stopBackground();
    setMaking("back");
    setProgress(null);
    try {
      // Keep the old worker alive until its recovery project has arrived. Terminating it sooner
      // leaves the pending Comlink call unresolved and the mounted editor bound to a dead worker.
      const b = back.current ?? (backReady.current ? await backReady.current : null);
      if (!b) {
        setMaking(null);
        return;
      }
      const old = gen;
      gen = createGeneratorWorker();
      generator = gen.api;
      old.stop();
      back.current = null;
      backReady.current = null;
      enterEditor(await generator.openProject(b.bytes), { entry: b.entry }, undefined, true);
      setMaking(null);
    } catch (e) {
      setMaking({ failed: words(e) });
    } finally {
      cancelling.current = false;
      setBusy(false);
    }
  }
` + candidate.slice(end);
const target = join(root, 'overlay/src/ui/App.tsx');
mkdirSync(join(target, '..'), { recursive: true });
writeFileSync(target, candidate);
change('src/editor/save/useSave.ts', '    const p = await api.project();', '    const p = await enqueue(() => api.project());');
console.log('Prepared two page-owner changes without editing product files.');
