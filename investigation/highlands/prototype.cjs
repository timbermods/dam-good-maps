// Proposed source changes applied only in memory. Product files remain read-only.
const path = require('node:path');
const GENOME = path.resolve(__dirname, '../../src/core/land/genome.ts');
function once(source, anchor, replacement) {
  if (source.split(anchor).length !== 2) throw new Error(`Baseline changed: ${anchor.slice(0, 70)}`);
  return source.replace(anchor, replacement);
}
exports.transform = (file, source) => {
  if (path.resolve(file) !== GENOME) return source;
  source = once(source,
    'const PRIORS: Record<ThemeId, Prior> = { any: anyPrior(), ...P };',
    `const PRIORS: Record<ThemeId, Prior> = { any: anyPrior(), ...P };

// Small Highlands: rivers cut below benches and carry water over their steps.
// Kept outside P: Any's averaged prior and every other theme retain their existing draws.
function highlandsPrior(W: number, H: number): Prior {
  const p = P.highlands;
  const k = clamp((128 - Math.min(W, H)) / 32, 0, 1);
  if (k === 0) return p;
  const blend = (r: Range, lo: number, hi: number): Range => ({
    lo: r.lo * (1 - k) + lo * k, hi: r.hi * (1 - k) + hi * k,
  });
  return {
    ...p,
    flowMul: blend(p.flowMul, 1.8, 2.8),
    incise: blend(p.incise, 2.5, 4.5),
    floor: blend(p.floor, 1, 4),
  };
}`);
  source = once(source, '  const p = PRIORS[theme];', '  const p = theme === "highlands" ? highlandsPrior(W, H) : PRIORS[theme];');
  return source;
};
if (require.main === module) {
  const fs = require('node:fs');
  const source = fs.readFileSync(GENOME, 'utf8');
  const local = path.join(__dirname, 'local');
  fs.mkdirSync(local, { recursive: true });
  fs.writeFileSync(path.join(local, 'genome.before.ts'), source);
  fs.writeFileSync(path.join(local, 'genome.after.ts'), exports.transform(GENOME, source));
}
