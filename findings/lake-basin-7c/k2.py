p = 'src/core/land/levels.ts'
s = open(p, encoding='utf-8', newline='').read()
reps = [
    ("""  // (round 7c: Lake Basin above 128², its benches' faces of 2 and 3 levels, gullies as Highlands' are; its rim, 4 levels
  // or more, left standing whole)
  if ((tiers || ringed || g.basinWarp) && notchWalls(out, W, H, hash32(seed, "ways", g.variation), keepRims, !!stand || !!g.basinWarp, g.basinWarp ? BASIN_RIM : Infinity)) {
    mergeSmallRegions(out, W, H, 4);
    cleanPitsAndSpikes(out, W, H, null);
  }
""",
     """  // (round 7c: Lake Basin above 128², its benches' faces of 2 and 3 levels, gullies as Highlands' are; its rim, 4 levels
  // or more, a gully only every `BASIN_RIM_EVERY` tiles, so a rim stands whole for 60 tiles or more and the benches
  // behind it are reached)
  if ((tiers || ringed || g.basinWarp) && notchWalls(out, W, H, hash32(seed, "ways", g.variation), keepRims, !!stand || !!g.basinWarp, g.basinWarp ? BASIN_RIM : Infinity)) {
    mergeSmallRegions(out, W, H, 4);
    cleanPitsAndSpikes(out, W, H, null);
  }
  if (g.basinWarp && notchWalls(out, W, H, hash32(seed, "rim ways", g.variation), keepRims, true, Infinity, BASIN_RIM, BASIN_RIM_EVERY)) {
    mergeSmallRegions(out, W, H, 4);
    cleanPitsAndSpikes(out, W, H, null);
  }
"""),
    ("""/** Lake Basin above 128² (round 7c): a wall this many levels tall or more is its rim, never notched. */
const BASIN_RIM = 4;
""",
     """/** Lake Basin above 128² (round 7c): a wall this many levels tall or more is its rim, notched only every
 *  `BASIN_RIM_EVERY` tiles (96–144 apart, the first 48–72 from its end). */
const BASIN_RIM = 4;
const BASIN_RIM_EVERY = 120;
"""),
    ("""export function notchWalls(out: Uint8Array, W: number, H: number, seed: number, keep: Uint8Array | null = null, found = false, most = Infinity): boolean {""",
     """export function notchWalls(out: Uint8Array, W: number, H: number, seed: number, keep: Uint8Array | null = null, found = false, most = Infinity, least = 2, every = NOTCH_EVERY): boolean {"""),
    ("""      if (foot[i] >= 0 && out[i] - out[foot[i]] < most) wall[i] = 1;""",
     """      if (foot[i] >= 0 && out[i] - out[foot[i]] >= least && out[i] - out[foot[i]] < most) wall[i] = 1;"""),
    ("""    if (len >= 40) {
      const r = stream(seed, "notch", end);
      let mark = 20 + 15 * r.float();""",
     """    if (len >= 40) {
      const r = stream(seed, "notch", end);
      let mark = every === NOTCH_EVERY ? 20 + 15 * r.float() : every * (0.4 + 0.2 * r.float());"""),
    ("""        mark += NOTCH_EVERY * (0.8 + 0.4 * r.float());""",
     """        mark += every * (0.8 + 0.4 * r.float());"""),
]
for a, b in reps:
    assert s.count(a) == 1, a[:90]
    s = s.replace(a, b)
open(p, 'w', encoding='utf-8', newline='').write(s)
print('ok')
