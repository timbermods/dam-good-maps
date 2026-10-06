import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
const root = resolve(import.meta.dirname, '../..');
const path = 'src/core/gen/generate.ts';
let source = readFileSync(resolve(root, path), 'utf8').replaceAll('\r\n', '\n');
function change(before, after) {
  if (!source.includes(before)) throw new Error('Base changed; port and verify again: ' + before.slice(0,90));
  source = source.replace(before, after);
}
change('buildMap, SettleCache, type BuildResult', 'buildMap, rebuild as rebuildMap, SettleCache, type BuildResult');
change('  const build = (features: readonly Feature[], stop:', '  // Every build keeps its own field snapshot. The incremental pipeline checks terrain,\n  // slopes, water, soil barriers and resource inputs before reusing any prior work.\n  // Scope it to this attempt; speculative builds are valid cache inputs too.\n  let previousBuild: BuildResult | null = null;\n  const build = (features: readonly Feature[], stop:');
change('    const b = buildMap({ W, H, seed, features, field: fieldOf() }, { settleCache: cache, fieldCache, ...(stop === "resources" ? { stopBeforeResources: true } : stop === "water" ? { stopBeforeWater: true } : {}) });',
  '    const input = { W, H, seed, features, field: fieldOf() };\n    const options = { settleCache: cache, fieldCache, ...(stop === "resources" ? { stopBeforeResources: true } : stop === "water" ? { stopBeforeWater: true } : {}) };\n    const b = previousBuild ? rebuildMap(previousBuild, input, options) : buildMap(input, options);\n    previousBuild = b;\n    // Generation has no editor dirty-region consumer. Keep its full-build result shape.\n    b.dirty = null;');
const overlay = resolve(import.meta.dirname, 'candidate', path);
mkdirSync(dirname(overlay), { recursive: true });
writeFileSync(overlay, source);
const rel = 'investigation/gen-speed-3/candidate/' + path;
const diff = spawnSync('git', ['diff', '--no-index', '--', path, rel], { cwd: root, encoding: 'utf8', windowsHide: true });
if (diff.status !== 1) throw new Error(diff.stderr || 'No candidate difference');
writeFileSync(resolve(import.meta.dirname, 'adoption.patch'), diff.stdout.replaceAll('b/' + rel, 'b/' + path));
console.log('Prepared incremental-build overlay and adoption.patch; product files untouched.');
