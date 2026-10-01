// Add small diagnostic fields to the disposable measure tool, without changing src/.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(process.argv[2]);
if (!root.startsWith(resolve(here, 'local') + sep)) throw Error('snapshot must be under investigation/local');
const file = resolve(root, 'investigation/m9b/measures.ts');
let m = readFileSync(file, 'utf8');
if (m.includes('hiddenMineAttempts')) throw Error('snapshot already instrumented');
m = 'import { createHash } from "node:crypto";\n' + m;
m = m.replace('  const r = generate(spec, {', `  const hiddenMineAttempts: number[] = [];
  const r = generate(spec, {
    onAttempt: ({attempt, result}) => {
      if (result.timings.firstLook < 0 && result.info.start && result.report.checks.some(c => c.id === "resources.mine_site" && !c.ok)) hiddenMineAttempts.push(attempt);
    },`);
m = m.replace('  return m;', '  (m as any).hiddenMineAttempts = hiddenMineAttempts;\n  (m as any).bytesHash = createHash("sha256").update(r.bytes).digest("hex");\n  return m;');
// Six maps per worker amortizes TypeScript startup; the generator supports repeated calls.
m = m.replace('const m = queue.shift()!;', 'const m = queue.splice(0, 6).join(",");');
writeFileSync(file, m);
