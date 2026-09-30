import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { root } from './adoption.mjs';
const dir = resolve(root, 'investigation/performance'), result = [];
for (const name of readdirSync(resolve(dir, 'local/build/before/assets')).filter(n => n.includes('.worker-') && n.endsWith('.js'))) {
  const hash = phase => createHash('sha256').update(readFileSync(resolve(dir, 'local/build', phase, 'assets', name))).digest('hex');
  const before = hash('before'), after = hash('after');
  if (before !== after) throw new Error(`Worker computation changed: ${name}`);
  result.push({ name, sha256: before, identical: true });
}
if (result.length !== 3) throw new Error('Expected generator, checks and start-check worker bundles');
writeFileSync(resolve(dir, 'worker-proof.json'), JSON.stringify({ note: 'Computation bundles are byte-identical; visual final state still requires scenario byte checks.', bundles: result }, null, 2) + '\n');
console.log('All three computation worker bundles are byte-identical.');
