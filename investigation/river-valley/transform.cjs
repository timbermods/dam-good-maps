// Exact, guarded source transformations: product files remain read-only.
module.exports = function transform(file, source, { shaping = true, shared = true } = {}) {
  const normalized = file.replaceAll('\\', '/');
  const replace = (from, to) => {
    if (!source.includes(from) || source.indexOf(from) !== source.lastIndexOf(from)) throw new Error('Adoption anchor missing/ambiguous: ' + from);
    source = source.replace(from, to);
  };
  if (normalized.endsWith('/src/core/land/hydro.ts')) {
    // Measurement support only. Fixed in feature/m9b; excluded from adoption.patch.
    if (shared) {
      replace('if (water[i] === 2 || protect?.[i] || mouthBank[i]) continue;', 'if ((water[i] === 2 && g.theme !== "riverValley") || protect?.[i] || mouthBank[i]) continue;');
      // Exact River Valley behavior of M9b's shared fix: keep lake membership and
      // its lower floor; lower only lake tiles inside the actual channel.
      replace('const r = half(st.s[i], L);\n      if (d < r)', `const r = half(st.s[i], L);
      if (water[i] === 2) {
        if (d < r && h[i] > b) h[i] = b;
        continue;
      }
      if (d < r)`);
    }
    if (!shaping) return source;
    replace('const N = W * H;\n  const natural = opts.meander !== false;', 'const N = W * H;\n  // River Valley has one default trunk; an explicit Rivers count stays the player\'s.\n  if (g.theme === "riverValley" && !g.hydro.exactInflows) g.hydro.inflows = 1;\n  const natural = opts.meander !== false;');
    replace('// a tangle: at most `maxHeads` (4 at 96², 5 at 128², 6 at 256²).', '// a tangle: at most `maxHeads`; River Valley keeps fewer tributaries with enough flow.');
    replace('const maxHeads = natural ? Math.floor(3.5 + 1.5 * Math.pow(areaK, 0.75)) : Infinity;', `// A few fed tributaries read better than many shallow fragments at large sizes.
  // Explicit Rivers counts remain player-owned; every other theme keeps its cap.
  const headCap = g.theme === "riverValley" && !g.hydro.exactInflows ? (side >= 256 ? 5 : 4) : Infinity;
  const maxHeads = natural ? Math.min(headCap, Math.floor(3.5 + 1.5 * Math.pow(areaK, 0.75))) : Infinity;`);
    replace('if (!added && !separateOne)', 'if (!added && !separateOne && g.theme !== "riverValley")');
    replace('if (main && rng.float() < g.hydro.split)', 'if (main && rng.float() < g.hydro.split && (g.theme !== "riverValley" || g.hydro.bigSplit || g.hydro.splitAtFall))');
    replace('if (main && "edge" in main.params.exit && rng.float() < g.hydro.delta)', 'if (main && "edge" in main.params.exit && rng.float() < g.hydro.delta && (g.theme !== "riverValley" || g.hydro.braided))');
  }
  if (shaping && normalized.endsWith('/src/core/land/genome.ts')) {
    replace('const p = PRIORS[theme];', `// Broaden River Valley's floors without changing Any's combined prior or its seed draws.
  const p = theme === "riverValley" ? { ...PRIORS[theme], floor: { lo: 12, hi: 16 } } : PRIORS[theme];`);
  }
  return source;
};
