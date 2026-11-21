p = 'src/core/gen/generate.ts'
s = open(p, encoding='utf-8', newline='').read()
a = "  const hy = planHydro(land.E, h, g, seed, W, H, attempt, land.joinsOff ? { joins: false } : {});\n"
assert s.count(a) == 1
s = s.replace(a, a + "  const __snap = h.slice(); const __low: Map<number, string> = (globalThis as any).__LOW = new Map(); const __mk = (st: string) => { if (!(globalThis as any).process?.env?.DGM_TR) return; for (let i = 0; i < N; i++) if (h[i] < __snap[i]) __low.set(i, (__low.get(i) ?? '') + st + (__snap[i] - h[i]) + ' '); __snap.set(h); };\n")
anchors = [
    ("  relaxEdges(h, W, H, mouthBanks(hy, W, H), beside);\n", "relax"),
    ("  const ramps = naturalRamps(h, W, H, keep, new Uint8Array(N), g, seed, attempt);\n", "ramps"),
    ("  carveOutlets(h, W, H, channels, hash32(seed, \"outlets\", attempt), Math.max(3, Math.min(9, Math.round(0.35 * hy.flowTotal)) | 1), 300, 120, null, beside);\n", "outlets"),
    ("    carveOutlets(h, W, H, channels, hash32(seed, \"outlets-small\", attempt), 3, 4, 60, wet, beside);\n", "outletsSmall"),
    ("    widenOutlets(h, W, H, heads, hash32(seed, \"widen\", attempt), hy.flowTotal * (W <= 128 ? 2 : 1), hy.lakes.map((l) => l.tiles), 2500, !!g.seaLayout);\n", "widen"),
    ("  for (let i = 0; i < N; i++) if (h[i] < BED_FLOOR) h[i] = BED_FLOOR;\n", "floor"),
    ("  if (!g.seaLayout) lowerShelves(h, W, H, hy.water, hash32(seed, \"shelves\", attempt));\n", "shelves"),
]
for a, name in anchors:
    assert s.count(a) == 1, name
    ind = a[:len(a) - len(a.lstrip())]
    s = s.replace(a, a + ind + f"__mk('{name}');\n")
# report at the exit
a = "console.error(`[tr]   carved exit: ${e >= 0 ? HYDRO_DBG.at.get(e) : ''}"
assert s.count(a) == 1
s = s.replace(a, "console.error(`[tr]   lowered exit: ${e >= 0 ? (globalThis as any).__LOW?.get(e) : ''} | path: ${path.slice(Math.max(0, ex - 1), ex + 3).map((c) => (globalThis as any).__LOW?.get(c) ?? '-').join(' / ')}`); " + a)
open(p, 'w', encoding='utf-8', newline='').write(s)
print('ok')
