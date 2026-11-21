import re
p = 'src/core/gen/generate.ts'
s = open(p, encoding='utf-8', newline='').read()

# 1. the __mk trace machinery
s = re.sub(r"  const __snap = h\.slice\(\);[^\n]*\n", "", s)
s = re.sub(r"[ ]*__mk\('[a-zA-Z]+'\);\n", "", s)
s = s.replace("  if (!g.seaLayout) { lowerShelves(h, W, H, hy.water, hash32(seed, \"shelves\", attempt)); __mk('shelves'); }\n",
              "  if (!g.seaLayout) lowerShelves(h, W, H, hy.water, hash32(seed, \"shelves\", attempt));\n")
assert "__mk" not in s and "__snap" not in s

# 2. the sill restore and the lake ring (the old plan's patches)
reps = [
    ("""  // (Lake Basin above 128², round 7c: the ground round a planned lake, `BASIN_LAKE_RING` tiles, is its sill: a sliver of
  // it merged into the land below, no ramp and no widened way out takes it under the lake's level, which drained the
  // lake three levels, Lake Basin 256² seed 3)
  const sills = g.basinWarp ? sillFloors(hy, W, H, BASIN_LAKE_RING) : null;
  const lakeRing = sills ? Uint8Array.from(sills, (v) => (v ? 1 : 0)) : null;
  const preMerge = sills ? h.slice() : null;
  mergeSmallRegions(h, W, H, 4, keep);
  if (sills) for (let i = 0; i < N; i++) if (h[i] < sills[i] && preMerge![i] >= sills[i]) h[i] = sills[i];
""", """  mergeSmallRegions(h, W, H, 4, keep);
"""),
    ("  const ramps = naturalRamps(h, W, H, keep, lakeRing ?? new Uint8Array(N), g, seed, attempt);\n",
     "  const ramps = naturalRamps(h, W, H, keep, new Uint8Array(N), g, seed, attempt);\n"),
    ("    if (lakeRing) for (let i = 0; i < N; i++) if (lakeRing[i]) heads[i] = 1;\n", ""),
]
for a, b in reps:
    assert s.count(a) == 1, a[:80]
    s = s.replace(a, b)
i0 = s.index("/** Lake Basin above 128²: the ring of dry ground round a planned lake")
i1 = s.index("\n}\n", s.index("function sillFloors(")) + 3
s = s[:i0] + s[i1:]

# 3. the spill-level lake plan
a = "  return { h, hy, keep, ramps, blocked };\n}\n"
assert s.count(a) == 1
s = s.replace(a, """  // (Lake Basin above 128², round 7c: its lakes planned again on the finished land, each at the level its hollow spills at
  // and as far as that water reaches: the land's edits after the hydrology, its channels carved, its small regions
  // merged, its ramps and ways out, left lower saddles than the hydrology's, and the lake it planned drained to them)
  if (g.basinWarp) lakesAtSpill(h, W, H, hy, keep);
""" + a)
a = "/** Lake Basin above 128²: how far its badwater keeps from the plan's start"
assert s.count(a) == 1
s = s.replace(a, """/** Lake Basin above 128² (round 7c): each lake the hydrology planned, planned again on the finished land at the level its
 *  hollow spills at (its lowest saddle, the land filled from the map's edges) and over the ground that water stands on
 *  joined to it: smaller where the land holds less, and joined to a channel that runs past it with no bank between, at
 *  the lower level. The tiles it leaves are dry land (`keep` let go); a lake the land holds no water for is none. */
function lakesAtSpill(h: Uint8Array, W: number, H: number, hy: Hydro, keep: Uint8Array): void {
  const N = W * H;
  const filled = drainage(h, W, H, { eight: false }).filled;
  const taken = new Uint8Array(N);
  const lakes: Hydro["lakes"] = [];
  for (const lk of hy.lakes) {
    const q: number[] = [];
    for (const i of lk.tiles)
      if (!taken[i] && filled[i] > h[i]) {
        taken[i] = 1;
        q.push(i);
      }
    for (let k = 0; k < q.length; k++) {
      const c = q[k];
      const x = c % W;
      const y = (c - x) / W;
      for (const n of [x > 0 ? c - 1 : -1, x < W - 1 ? c + 1 : -1, y > 0 ? c - W : -1, y < H - 1 ? c + W : -1]) {
        if (n < 0 || taken[n] || !(filled[n] > h[n])) continue;
        taken[n] = 1;
        q.push(n);
      }
    }
    if (!q.length) continue;
    lakes.push({ ...lk, tiles: q, outletBed: Math.round(filled[q[0]]) - 1 });
  }
  for (let i = 0; i < N; i++)
    if (hy.water[i] === 2 && !taken[i]) {
      hy.water[i] = 0;
      keep[i] = 0;
    }
  // (a channel the lake's water stands over stays the river's)
  for (const lk of lakes)
    for (const i of lk.tiles)
      if (hy.water[i] !== 1) {
        hy.water[i] = 2;
        keep[i] = 1;
      }
  hy.lakes = lakes;
}

""" + a)
open(p, 'w', encoding='utf-8', newline='').write(s)
print('ok')
