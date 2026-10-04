// River Valley-only source transformations. Fail if the pinned dev anchors change.
module.exports = (file, source) => {
  if (!file.replaceAll('\\','/').endsWith('/src/core/land/hydro.ts')) return source;
  source = source.replaceAll('\r\n','\n');
  const replace = (a,b) => { if (source.split(a).length !== 2) throw new Error('Missing/ambiguous adoption anchor: '+a); source=source.replace(a,b); };
  replace('const st = stamp(path, W, H, Math.ceil(width / 2 + g.hydro.floor * 1.5 + 3 + (natural ? width * 0.15 : 0)));', `// An intentional plugged lake keeps its impoundment; it is a distinct water feature.
    const valleyMain = g.theme === "riverValley" && !g.intentions.includes("plug-lake") && rid === featureId(seed, "river", "river/main");
    const st = stamp(path, W, H, Math.ceil(width / 2 + g.hydro.floor * 1.5 + 3 + (natural ? width * 0.15 : 0)));`);
  replace('const lk = hollow(ci, maxSill);', `// A flat valley's trunk stays below its upstream bed when it crosses a hollow.
        const lk = hollow(ci, valleyMain ? Math.min(maxSill, run + 1) : maxSill);`);
  replace('run = lakes[inLake].outletBed;', 'run = valleyMain ? Math.min(run, lakes[inLake].outletBed) : lakes[inLake].outletBed;');
  replace('return { rivers, water, lakes, falls, arms, flowTotal };', `// The trunk can drain a lake while later rivers are carved. River Valley keeps that
  // lake's closed core, rather than a broad spent shelf marked as standing water.
  // Compact ponds and oxbows keep their outline; intentional plugged lakes keep their storage.
  if (natural && g.theme === "riverValley" && !g.intentions.includes("plug-lake")) {
    const spill = drainage(h, W, H, { eight: false }).filled;
    let trimmed = false;
    for (const lk of lakes) {
      const shelf = lk.tiles.filter((i) => h[i] >= spill[i]);
      if (shelf.length <= 0.02 * N) continue;
      lk.tiles = lk.tiles.filter((i) => h[i] < spill[i]);
      if (lk.tiles.length) lk.outletBed = Math.min(lk.outletBed, lk.tiles.reduce((lo, i) => Math.min(lo, spill[i]), Infinity) - 1);
      trimmed = true;
    }
    if (trimmed) {
      for (let i = 0; i < N; i++) if (water[i] === 2) water[i] = 3;
      for (const lk of lakes) for (const i of lk.tiles) water[i] = 2;
      for (const m of exits.values()) carve(stamp(m.path, W, H, Math.ceil(m.width / 2 + 3)), m.prof, m.L, m.n, m.half, 0);
      for (let k = lakes.length - 1; k >= 0; k--) if (lakes[k].tiles.length < 6) lakes.splice(k, 1);
    }
  }
  return { rivers, water, lakes, falls, arms, flowTotal };`);
  return source;
};
