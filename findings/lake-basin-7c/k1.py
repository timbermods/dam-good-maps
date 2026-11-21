p = 'src/core/land/lakeBasin.ts'
s = open(p, encoding='utf-8', newline='').read()
cuts = [
    ("""  // (round 7: the lake's hollow as deep as a lake, so the land keeps the levels over it)
  const deep = found ? Number((globalThis as any).process?.env?.LB_DEEP ?? 0.5) : 1;
  for (const p of hollows) p.height *= deep;
  g.parts.push(...hollows);""",
     """  // (the lake's hollow at its full depth above 128² as well, round 7c: at half of it the lake sat on the floor's flat,
  // and the courses across and along it cut that floor below the lake, which drained)
  g.parts.push(...hollows);"""),
    ("""    height: -rng.range(3, 4) * (found ? Math.max(deep, 0.6) : 1), turn, extra: 0, soft: 0 });""",
     """    height: -rng.range(3, 4), turn, extra: 0, soft: 0 });"""),
    ("""  const lin = Number((globalThis as any).process?.env?.LB_LIN ?? 16);""", """  const lin = 16;"""),
    ("""sideLin: two ? lin * 0.7 : 0, ...((globalThis as any).process?.env?.LB_LIP ? { lip: Number((globalThis as any).process.env.LB_LIP) } : {}) };""",
     """sideLin: two ? lin * 0.7 : 0, lip: BASIN_LIP };"""),
    ("""  g.base = Number((globalThis as any).process?.env?.LB_BASE ?? 3);""", """  g.base = 3;"""),
    ("""    esc.height = r.range(5, 7) * Number((globalThis as any).process?.env?.LB_RIMH ?? 1);""", """    esc.height = r.range(5, 7);"""),
    ("""    esc.soft = (globalThis as any).process?.env?.LB_RIMS ? Number((globalThis as any).process.env.LB_RIMS) : side * 0.035;""",
     """    esc.soft = side * 0.035;"""),
]
for a, b in cuts:
    assert s.count(a) == 1, a[:80]
    s = s.replace(a, b)
a = "function sidedBasin("
i = s.index(a)
j = s.rindex("/**", 0, i)
s = s[:j] + """/** The lip on the basin's outlet side, in levels under the rise behind the lake (round 7c): the land past the lake's
 *  outlet stands as high as the rise behind it, less this, so the lake is held at its full depth on that side too. */
const BASIN_LIP = 2;

""" + s[j:]
open(p, 'w', encoding='utf-8', newline='').write(s)
print('ok')
