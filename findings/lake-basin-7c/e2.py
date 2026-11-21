p='src/core/land/levels.ts'
s=open(p,encoding='utf-8',newline='').read()
a="export function notchWalls(out: Uint8Array, W: number, H: number, seed: number, keep: Uint8Array | null = null, found = false): boolean {"
assert s.count(a)==1
s=s.replace(a,"export function notchWalls(out: Uint8Array, W: number, H: number, seed: number, keep: Uint8Array | null = null, found = false, most = Infinity): boolean {")
a="      if (foot[i] >= 0) wall[i] = 1;\n"
assert s.count(a)==1
s=s.replace(a,"      if (foot[i] >= 0 && out[i] - out[foot[i]] < most) wall[i] = 1;\n")
a="""  if ((tiers || ringed) && notchWalls(out, W, H, hash32(seed, "ways", g.variation), keepRims, !!stand)) {"""
assert s.count(a)==1
s=s.replace(a,"""  // (round 7c: Lake Basin above 128², its benches' faces of 2 and 3 levels, gullies as Highlands' are; its rim, 4 levels
  // or more, left standing whole)
  if ((tiers || ringed || g.basinWarp) && notchWalls(out, W, H, hash32(seed, "ways", g.variation), keepRims, !!stand || !!g.basinWarp, g.basinWarp ? BASIN_RIM : Infinity)) {""")
open(p,'w',encoding='utf-8',newline='').write(s)
p='src/core/gen/generate.ts'
s=open(p,encoding='utf-8',newline='').read()
a="  const ringSlopes = Math.min(W, H) > 128 && !UPLANDS_BASE_PATH.has(g.theme);"
assert s.count(a)==1
s=s.replace(a,"  const ringSlopes = Math.min(W, H) > 128 && (!UPLANDS_BASE_PATH.has(g.theme) || !!g.basinWarp);")
open(p,'w',encoding='utf-8',newline='').write(s)
